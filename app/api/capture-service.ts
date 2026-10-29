import { getD1 } from "../../db";
import { validateRecordActions, type ActivityRecord } from "../activity-record-model";
import { normalizeCaptureLabel, parseCaptureAction, type CaptureAction, type CaptureAttention, type PendingCapture } from "../capture-model";
import { addLocalDays, localDateInTimeZone } from "../schedule-model";
import { userTimeZone } from "./user-time-zone";
import { persistRecordActions, persistWorkspaceActions, readActivityRecords, safeId } from "./agent-store";
import { applyOccurrenceAction } from "./schedule-actions";

type CaptureSource = {
  conversationId?: string | null;
  sourceMessageId?: string | null;
  sourceAgentJobId?: string | null;
  localDate?: string | null;
};

type CaptureRow = {
  id: string;
  label: string;
  detail: string;
  urgency: PendingCapture["urgency"];
  status: PendingCapture["status"];
  timing: PendingCapture["timing"];
  scheduledDate: string | null;
  activityId: string | null;
  activityClientKey: string | null;
  activityTitle: string | null;
  destinationHint: string;
  linkedRecordKey: string | null;
  linkedItemId: string | null;
  createdAt: string;
  updatedAt: string;
};

function urgencyRank(value: string) {
  return ({ "": 0, later: 1, this_week: 2, soon: 3, now: 4 } as Record<string, number>)[value] ?? 0;
}

function captureId(userId: string, action: CaptureAction) {
  return `capture:${safeId(userId)}:${safeId(action.idempotencyKey)}`;
}

async function destinationActivity(userId: string, activityId: string | null) {
  if (!activityId) return null;
  return getD1().prepare(`
    SELECT id, client_key AS clientKey, title
    FROM activities
    WHERE user_id = ? AND (id = ? OR client_key = ?)
    LIMIT 1
  `).bind(userId, activityId, activityId).first<{ id: string; clientKey: string; title: string }>();
}

function itemListRecord(records: ActivityRecord[]) {
  return records.find((record) => record.type === "item_list" && record.scope === "activity") ?? null;
}

async function fileCapture(userId: string, capture: CaptureRow, activity: { id: string; title: string }, source: CaptureSource) {
  const records = await readActivityRecords(activity.id);
  const existingRecord = itemListRecord(records);
  const recordKey = existingRecord?.key ?? "open-items";
  const items = Array.isArray(existingRecord?.data.items) ? structuredClone(existingRecord.data.items) as Array<Record<string, unknown>> : [];
  const normalized = normalizeCaptureLabel(capture.label);
  const matching = items.find((item) => typeof item.label === "string" && normalizeCaptureLabel(item.label) === normalized);
  const itemId = typeof matching?.id === "string" ? matching.id : `item-${crypto.randomUUID()}`;
  const nextItem = {
    ...(matching ?? {}),
    id: itemId,
    label: capture.label,
    detail: capture.detail || (typeof matching?.detail === "string" ? matching.detail : ""),
    completed: false,
    urgency: urgencyRank(capture.urgency) >= urgencyRank(typeof matching?.urgency === "string" ? matching.urgency : "")
      ? capture.urgency
      : matching?.urgency,
    source: typeof matching?.source === "string" && matching.source ? matching.source : "Luna",
  };
  const data = { items: matching ? items.map((item) => item === matching ? nextItem : item) : [...items, nextItem] };
  const actions = validateRecordActions([{ op: "upsert", record: {
    key: recordKey,
    type: "item_list",
    title: existingRecord?.title ?? `${activity.title} list`,
    scope: "activity",
    data,
  } }]);
  if (actions.length !== 1) throw new Error("The captured item did not pass record validation.");
  await persistRecordActions({
    userId,
    activityId: activity.id,
    actionId: capture.id,
    actions,
    sourceMessageId: source.sourceMessageId,
    sourceAgentJobId: source.sourceAgentJobId,
  });
  await persistWorkspaceActions({
    userId,
    activityId: activity.id,
    agentJobId: `${capture.id}:workspace`,
    actions: [{
      op: "upsert",
      component: { id: recordKey, type: "item_list", title: existingRecord?.title ?? `${activity.title} list`, recordKey, presentation: "default" },
    }],
  });
  await getD1().prepare(`
    UPDATE captured_intents
    SET status = 'filed', destination_activity_id = ?, linked_record_key = ?, linked_item_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(activity.id, recordKey, itemId, capture.id, userId).run();
  return { recordKey, itemId };
}

async function scheduleCapture(userId: string, capture: CaptureRow, date: string) {
  if (!capture.activityId) throw new Error("Choose where this item belongs before scheduling it.");
  await applyOccurrenceAction(userId, {
    type: "activate_activity_for_date",
    activityId: capture.activityId,
    date,
    idempotencyKey: `capture-date:${safeId(capture.id).slice(-145)}:${date}`,
  }, {
    source: "luna",
    actor: "Luna",
    conversationId: null,
    sourceMessageId: null,
    sourceAgentJobId: null,
  });
  await getD1().prepare(`
    UPDATE captured_intents
    SET timing_status = 'scheduled', scheduled_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(date, capture.id, userId).run();
}

async function readCaptureRow(userId: string, id: string) {
  return getD1().prepare(`
    SELECT capture.id, capture.label, capture.detail, capture.urgency, capture.status,
           capture.timing_status AS timing, capture.scheduled_date AS scheduledDate,
           capture.destination_activity_id AS activityId,
           activity.client_key AS activityClientKey, activity.title AS activityTitle,
           capture.destination_hint AS destinationHint,
           capture.linked_record_key AS linkedRecordKey, capture.linked_item_id AS linkedItemId,
           capture.created_at AS createdAt, capture.updated_at AS updatedAt
    FROM captured_intents capture
    LEFT JOIN activities activity ON activity.id = capture.destination_activity_id
    WHERE capture.user_id = ? AND capture.id = ? AND capture.dismissed_at IS NULL AND capture.resolved_at IS NULL
    LIMIT 1
  `).bind(userId, id).first<CaptureRow>();
}

export async function applyCaptureAction(userId: string, rawAction: unknown, source: CaptureSource) {
  const action = parseCaptureAction(rawAction);
  if (!action) throw new Error("That captured item is not valid.");
  const activity = await destinationActivity(userId, action.activityId);
  if (action.activityId && !activity) throw new Error("That destination activity was not found.");
  const normalizedLabel = normalizeCaptureLabel(action.label);
  const pendingMatch = activity ? await getD1().prepare(`
    SELECT id FROM captured_intents
    WHERE user_id = ? AND conversation_id IS ? AND normalized_label = ?
      AND status = 'pending_destination' AND dismissed_at IS NULL AND resolved_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).bind(userId, source.conversationId ?? null, normalizedLabel).first<{ id: string }>() : null;
  const id = pendingMatch?.id ?? captureId(userId, action);
  if (pendingMatch) {
    await getD1().prepare(`
      UPDATE captured_intents
      SET destination_activity_id = ?, label = ?, detail = ?, urgency = ?, destination_hint = ?,
          status = 'filed', timing_status = ?, source_message_id = ?, source_agent_job_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(
      activity!.id, action.label, action.detail, action.urgency, action.destinationHint,
      action.timing, source.sourceMessageId ?? null, source.sourceAgentJobId ?? null, id, userId,
    ).run();
  } else {
    await getD1().prepare(`
      INSERT OR IGNORE INTO captured_intents
        (id, user_id, conversation_id, source_message_id, source_agent_job_id,
         destination_activity_id, capture_kind, label, normalized_label, detail,
         urgency, destination_hint, status, timing_status, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, 'open_item', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, userId, source.conversationId ?? null, source.sourceMessageId ?? null,
      source.sourceAgentJobId ?? null, activity?.id ?? null, action.label,
      normalizedLabel, action.detail, action.urgency, action.destinationHint,
      activity ? "filed" : "pending_destination", action.timing, action.idempotencyKey,
    ).run();
  }
  let capture = await readCaptureRow(userId, id);
  if (!capture) throw new Error("The captured item could not be saved.");
  if (activity && (!capture.linkedRecordKey || !capture.linkedItemId)) {
    await fileCapture(userId, capture, activity, source);
    capture = await readCaptureRow(userId, id);
  }
  if (!capture) throw new Error("The captured item could not be refreshed.");
  if (action.timing === "today" || action.timing === "tomorrow") {
    const localDate = source.localDate && /^\d{4}-\d{2}-\d{2}$/.test(source.localDate)
      ? source.localDate
      : localDateInTimeZone(new Date(), await userTimeZone(userId));
    const date = action.timing === "today" ? localDate : addLocalDays(localDate, 1);
    await scheduleCapture(userId, capture, date);
  }
  return readCaptureRow(userId, id);
}

export async function updateCaptureTiming(userId: string, id: string, timing: "today" | "tomorrow" | "later", localDate: string) {
  const capture = await readCaptureRow(userId, id);
  if (!capture) throw new Error("That saved item is no longer available.");
  if (timing === "later") {
    await getD1().prepare(`
      UPDATE captured_intents SET timing_status = 'later', scheduled_date = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(id, userId).run();
  } else {
    await scheduleCapture(userId, capture, timing === "today" ? localDate : addLocalDays(localDate, 1));
  }
  return readCaptureRow(userId, id);
}

export async function readPendingCaptures(userId: string, conversationId?: string | null): Promise<PendingCapture[]> {
  const rows = await getD1().prepare(`
    SELECT capture.id, capture.label, capture.detail, capture.urgency, capture.status,
           capture.timing_status AS timing, capture.scheduled_date AS scheduledDate,
           capture.destination_activity_id AS activityId,
           activity.client_key AS activityClientKey, activity.title AS activityTitle,
           capture.destination_hint AS destinationHint,
           capture.created_at AS createdAt, capture.updated_at AS updatedAt
    FROM captured_intents capture
    LEFT JOIN activities activity ON activity.id = capture.destination_activity_id
    WHERE capture.user_id = ? AND capture.dismissed_at IS NULL AND capture.resolved_at IS NULL
      AND capture.timing_status IN ('unspecified', 'today', 'tomorrow')
      ${conversationId ? "AND capture.conversation_id = ?" : ""}
    ORDER BY capture.created_at DESC, capture.id DESC
    LIMIT 30
  `).bind(...(conversationId ? [userId, conversationId] : [userId])).all<PendingCapture>();
  return rows.results;
}

export async function readCaptureAttention(userId: string): Promise<CaptureAttention[]> {
  const rows = await getD1().prepare(`
    SELECT capture.id AS captureId, capture.destination_activity_id AS activityId,
           activity.client_key AS activityClientKey, activity.title AS activityTitle,
           capture.label, capture.detail, capture.urgency, capture.created_at AS createdAt,
           capture.linked_item_id AS linkedItemId, record.payload_json AS payloadJson
    FROM captured_intents capture
    JOIN activities activity ON activity.id = capture.destination_activity_id AND activity.user_id = capture.user_id
    JOIN activity_records record ON record.user_id = capture.user_id
      AND record.activity_id = capture.destination_activity_id
      AND record.record_key = capture.linked_record_key
      AND record.archived_at IS NULL
    WHERE capture.user_id = ? AND capture.status = 'filed'
      AND capture.dismissed_at IS NULL AND capture.resolved_at IS NULL
    ORDER BY capture.created_at DESC, capture.id DESC
    LIMIT 80
  `).bind(userId).all<CaptureAttention & { linkedItemId: string; payloadJson: string }>();
  return rows.results.flatMap((row) => {
    try {
      const data = JSON.parse(row.payloadJson) as { items?: Array<{ id?: string; completed?: boolean }> };
      const item = data.items?.find((candidate) => candidate.id === row.linkedItemId);
      return item && item.completed !== true ? [{
        captureId: row.captureId,
        activityId: row.activityId,
        activityClientKey: row.activityClientKey,
        activityTitle: row.activityTitle,
        label: row.label,
        detail: row.detail,
        urgency: row.urgency,
        createdAt: row.createdAt,
      }] : [];
    } catch { return []; }
  });
}

export async function captureRevision(userId: string) {
  const row = await getD1().prepare(`
    SELECT MAX(updated_at) AS revision FROM captured_intents WHERE user_id = ?
  `).bind(userId).first<{ revision: string | null }>();
  return row?.revision ?? null;
}
