import { effectiveCompletedSubjects } from "../completion-evidence.ts";
import { correctDatedRecord, datedEntries, entryField, historyTypes, obj, rows, str, type HistoryCorrection, type HistoryRecord, type Json } from "../history-edit-model.ts";

type Statement = { bind(...values: (string | number | null)[]): Statement; all<T>(): Promise<{ results: T[] }>; first<T>(): Promise<T | null> };
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> };
type RecordRow = { id: string; key: string; activityId: string; title: string; type: string; version: number; variantId: string | null; archived: string | null; subjectKey: string | null; payload: string };
const columns = "id, record_key AS key, activity_id AS activityId, title, record_type AS type, version, activity_variant_id AS variantId, archived_at AS archived, subject_key AS subjectKey, payload_json AS payload";
const fromRow = (row: RecordRow): HistoryRecord => ({ ...row, archived: Boolean(row.archived), data: obj(JSON.parse(row.payload)) });

async function withSelectionEvidence(db: Database, record: HistoryRecord, date: string): Promise<HistoryRecord> {
  if (record.type !== "daily_selection" || !datedEntries(record.type, record.data, date).some((entry) => !Array.isArray(entry.itemSnapshots))) return record;
  const revision = await db.prepare(`SELECT payload_json AS payload FROM activity_record_revisions rv WHERE rv.record_id = ? AND json_valid(rv.payload_json)
    AND EXISTS(SELECT 1 FROM json_each(rv.payload_json, '$.entries') e WHERE json_extract(e.value, '$.date') = ?) ORDER BY revision_number LIMIT 1`).bind(record.id, date).first<{ payload: string }>();
  if (!revision) return record;
  const items = rows(obj(JSON.parse(revision.payload)).items);
  return { ...record, data: { ...record.data, entries: rows(record.data.entries).map((entry) => {
    if (entry.date !== date || Array.isArray(entry.itemSnapshots)) return entry;
    const ids = Array.isArray(entry.itemIds) ? entry.itemIds : [];
    return { ...entry, itemSnapshots: items.filter((item) => ids.includes(item.id) || items.some((child) => ids.includes(child.id) && child.parentItemId === item.id)) };
  }) } };
}

export async function readHistoryRecords(db: Database, userId: string, activityId: string, date: string) {
  const result = await db.prepare(`SELECT ${columns} FROM activity_records WHERE user_id = ? AND activity_id = ?
    AND (scope <> 'day' OR scope_date = ?) ORDER BY title, id`)
    .bind(userId, activityId, date).all<RecordRow>();
  const occurrences = await db.prepare(`SELECT dpi.activity_variant_id AS variantId, ar.details_json AS details FROM daily_plan_items dpi JOIN daily_plans dp ON dp.id = dpi.daily_plan_id LEFT JOIN activity_runs ar ON ar.daily_plan_item_id = dpi.id AND ar.user_id = dp.user_id WHERE dp.user_id = ? AND dp.plan_date = ? AND dpi.activity_id = ?`).bind(userId, date, activityId).all<{ variantId: string | null; details: string | null }>();
  const records = result.results.map(fromRow).filter((record) => historyTypes.includes(record.type) && (!record.archived || datedEntries(record.type, record.data, date).length) && (!record.variantId || datedEntries(record.type, record.data, date).length || occurrences.results.some((occurrence) => occurrence.variantId === record.variantId)));
  return Promise.all(records.map(async (record) => {
    const used = new Set(occurrences.results.filter((occurrence) => !record.variantId || occurrence.variantId === record.variantId).flatMap((occurrence) => effectiveCompletedSubjects(obj(JSON.parse(occurrence.details || "{}")))));
    const data = { ...record.data, [entryField(record.type)]: record.type === "recurring_step" ? (datedEntries(record.type, record.data, date).length ? [date] : []) : datedEntries(record.type, record.data, date) };
    if (record.subjectKey && used.has(record.subjectKey) && !datedEntries(record.type, data, date).length) {
      if (record.type === "recurring_step") data.completedDates = [date];
      if (record.type === "adherence") data.entries = [{ id: `use-${date}`, date, completed: true, note: "Recorded with activity completion" }];
    }
    return withSelectionEvidence(db, { ...record, data }, date);
  }));
}

export class HistoryConflict extends Error {}

export async function saveHistoryCorrection(db: Database, userId: string, input: HistoryCorrection) {
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(input.actionId) || !Array.isArray(input.records) || !Array.isArray(input.statuses) || input.records.length > 30 || input.statuses.length > 30 || (!input.records.length && !input.statuses.length && !input.backfill)) throw new Error("Invalid correction.");
  const eventId = `history:${userId}:${input.actionId}`;
  const prior = await db.prepare("SELECT action_json AS payload FROM schedule_action_events WHERE id = ? AND user_id = ?").bind(eventId, userId).first<{ payload: string }>();
  if (prior) {
    const receipt = JSON.parse(prior.payload);
    if (JSON.stringify(receipt.request) !== JSON.stringify(input)) throw new HistoryConflict("This correction ID was already used. Reload this day.");
    return receipt.result;
  }
  let undoReceipt: { backfilledOccurrenceId?: string | null; occurrences: Array<{ id: string; completedAt: string | null; skippedAt: string | null; runStatus: string | null }>; changedRuns: Array<{ id: string; before: string | null; after: string | null }> } | null = null;
  if (input.undoOf) {
    const source = await db.prepare("SELECT action_json AS payload FROM schedule_action_events WHERE id = ? AND user_id = ?").bind(`history:${userId}:${input.undoOf}`, userId).first<{ payload: string }>();
    const receipt = source ? JSON.parse(source.payload) : null;
    if (!receipt || JSON.stringify(receipt.result.undo) !== JSON.stringify(input)) throw new HistoryConflict("This Undo is no longer available. Reload the day.");
    undoReceipt = receipt;
  }
  if (new Set(input.records.map((r) => r.id)).size !== input.records.length || new Set(input.statuses.map((r) => r.id)).size !== input.statuses.length) throw new Error("Duplicate correction targets.");
  const all = await db.prepare(`SELECT ${columns} FROM activity_records WHERE user_id = ? AND activity_id = ?`).bind(userId, input.activityId).all<RecordRow>();
  const records = all.results.map(fromRow);
  const updates = new Map<string, { record: HistoryRecord; data: Json }>();
  const guards: Array<{ sql: string; args: (string | number | null)[] }> = [];
  const inverse: HistoryCorrection = { ...input, actionId: crypto.randomUUID(), records: [], statuses: [], undoOf: input.actionId };
  delete inverse.backfill;
  for (const edit of input.records) {
    const current = records.find((record) => record.id === edit.id);
    if (!current || current.archived || current.version !== edit.version) throw new HistoryConflict("This information changed. Reload the day before saving.");
    const record = await withSelectionEvidence(db, current, input.date);
    const allowed = await db.prepare(`SELECT id FROM activity_records WHERE id = ? AND (scope <> 'day' OR scope_date = ?) AND (activity_variant_id IS NULL OR ? = 1 OR activity_variant_id IN (SELECT dpi.activity_variant_id FROM daily_plan_items dpi JOIN daily_plans dp ON dp.id = dpi.daily_plan_id WHERE dp.user_id = ? AND dp.plan_date = ? AND dpi.activity_id = ?))`).bind(record.id, input.date, datedEntries(record.type, record.data, input.date).length ? 1 : 0, userId, input.date, input.activityId).first();
    if (!allowed) throw new Error("That record is not part of this dated activity.");
    updates.set(record.id, { record, data: correctDatedRecord(record, input.date, edit.entries) });
  }
  // A selection and its product-owned cadence are one atomic correction.
  for (const { record, data } of [...updates.values()]) {
    if (record.type !== "daily_selection") continue;
    const selected = new Set(datedEntries(record.type, data, input.date).flatMap((entry) => Array.isArray(entry.itemIds) ? entry.itemIds : []));
    const items = rows(data.items);
    for (const item of items) {
      if (!item.cadenceRecordKey) continue;
      const cadence = records.find((candidate) => candidate.key === item.cadenceRecordKey && candidate.type === "recurring_step" && candidate.variantId === record.variantId);
      if (!cadence || cadence.archived) continue;
      const used = selected.has(item.id) || items.some((child) => child.parentItemId === item.id && selected.has(child.id));
      const next = correctDatedRecord(cadence, input.date, used ? [{ id: input.date, date: input.date, completed: true }] : []);
      if (JSON.stringify(next) !== JSON.stringify(cadence.data)) updates.set(cadence.id, { record: cadence, data: next });
    }
  }
  const statements: ReturnType<Database["prepare"]>[] = [];
  let backfilledOccurrenceId: string | null = null;
  if (input.backfill) {
    if (input.statuses.length || input.undoOf) throw new Error("Record one dated activity at a time.");
    const activity = await db.prepare("SELECT id, client_key AS clientKey, title, category, icon, color FROM activities WHERE id = ? AND user_id = ?").bind(input.activityId, userId).first<{ id: string; clientKey: string; title: string; category: string; icon: string; color: string }>();
    if (!activity) throw new Error("Activity not found.");
    guards.push({ sql: "NOT EXISTS(SELECT 1 FROM daily_plan_items dpi JOIN daily_plans dp ON dp.id = dpi.daily_plan_id WHERE dp.user_id = ? AND dp.plan_date = ? AND dpi.activity_id = ? AND dpi.removed_at IS NULL AND (dpi.plan_role = 'essential' OR dpi.activated_at IS NOT NULL OR dpi.completed_at IS NOT NULL OR dpi.skipped_at IS NOT NULL))", args: [userId, input.date, input.activityId] });
    const planId = `plan:${encodeURIComponent(userId).replaceAll("%", "_")}:${input.date}`;
    backfilledOccurrenceId = `history-occurrence:${userId}:${input.actionId}`;
    statements.push(db.prepare("INSERT OR IGNORE INTO daily_plans (id, user_id, plan_date) VALUES (?, ?, ?)").bind(planId, userId, input.date));
    statements.push(db.prepare(`INSERT INTO daily_plan_items (id, daily_plan_id, activity_id, client_key, occurrence_key, title, category, icon, color, position, duration, plan_role, activated_at, completed_at, source_date)
      SELECT ?, dp.id, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM daily_plan_items WHERE daily_plan_id = dp.id), 0), 0, 'extra', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ? FROM daily_plans dp WHERE dp.user_id = ? AND dp.plan_date = ?`).bind(backfilledOccurrenceId, input.activityId, activity.clientKey, `history:${input.actionId}`, activity.title, activity.category, activity.icon, activity.color, input.date, userId, input.date));
    inverse.statuses.push({ id: backfilledOccurrenceId, revision: 1, status: "unmarked" });
  }
  for (const { record, data } of updates.values()) {
    guards.push({ sql: "EXISTS(SELECT 1 FROM activity_records WHERE id = ? AND user_id = ? AND activity_id = ? AND version = ? AND archived_at IS NULL)", args: [record.id, userId, input.activityId, record.version] });
    inverse.records.push({ id: record.id, version: record.version + 1, entries: datedEntries(record.type, record.data, input.date) });
    const payload = JSON.stringify(data);
    statements.push(db.prepare("UPDATE activity_records SET payload_json = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(payload, record.id, userId));
    statements.push(db.prepare("INSERT INTO activity_record_revisions (id, record_id, revision_number, title, payload_json) VALUES (?, ?, ?, ?, ?)").bind(`${eventId}:${record.id}`, record.id, record.version + 1, record.title, payload));
  }
  const occurrences = await db.prepare(`SELECT dpi.id, dpi.revision, dpi.activity_variant_id AS variantId, dpi.completed_at AS completedAt, dpi.skipped_at AS skippedAt,
    ar.id AS runId, ar.details_json AS details, ar.status AS runStatus
    FROM daily_plan_items dpi JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
    LEFT JOIN activity_runs ar ON ar.daily_plan_item_id = dpi.id AND ar.user_id = dp.user_id
    WHERE dp.user_id = ? AND dp.plan_date = ? AND dpi.activity_id = ? AND dpi.removed_at IS NULL`).bind(userId, input.date, input.activityId)
    .all<{ id: string; revision: number; variantId: string | null; completedAt: string | null; skippedAt: string | null; runId: string | null; details: string | null; runStatus: string | null }>();
  for (const edit of input.statuses) {
    const occurrence = occurrences.results.find((value) => value.id === edit.id);
    if (!occurrence || occurrence.revision !== edit.revision) throw new HistoryConflict("This activity changed. Reload the day before saving.");
    if (!["completed", "skipped", "unmarked"].includes(edit.status)) throw new Error("Choose a valid completion state.");
    guards.push({ sql: "EXISTS(SELECT 1 FROM daily_plan_items WHERE id = ? AND revision = ? AND removed_at IS NULL)", args: [edit.id, edit.revision] });
    inverse.statuses.push({ id: edit.id, revision: edit.revision + 1, status: occurrence.completedAt ? "completed" : occurrence.skippedAt ? "skipped" : "unmarked" });
    const restore = undoReceipt?.occurrences.find((value) => value.id === edit.id);
    if (undoReceipt?.backfilledOccurrenceId === edit.id) statements.push(db.prepare("UPDATE daily_plan_items SET removed_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(edit.id));
    else if (restore) statements.push(db.prepare("UPDATE daily_plan_items SET completed_at = ?, skipped_at = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(restore.completedAt, restore.skippedAt, edit.id));
    else statements.push(db.prepare(`UPDATE daily_plan_items SET completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END,
      skipped_at = CASE WHEN ? = 'skipped' THEN COALESCE(skipped_at, CURRENT_TIMESTAMP) ELSE NULL END, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(edit.status, edit.status, edit.id));
    // Do not manufacture a run, duration, product use, or schedule advancement.
    if (occurrence.runId) statements.push(db.prepare("UPDATE activity_runs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(restore?.runStatus ?? (edit.status === "unmarked" ? "reopened" : edit.status), occurrence.runId, userId));
  }
  const changedRuns: Array<{ id: string; before: string | null; after: string | null }> = [];
  for (const occurrence of occurrences.results) {
    if (!occurrence.runId) continue;
    const details = obj(JSON.parse(occurrence.details || "{}"));
    const before = effectiveCompletedSubjects(details);
    const effective = new Set(before);
    for (const { record, data } of updates.values()) {
      if (record.variantId && record.variantId !== occurrence.variantId) continue;
      if (record.type === "daily_selection") {
        const items = rows(data.items);
        const selected = new Set(datedEntries(record.type, data, input.date).flatMap((entry) => Array.isArray(entry.itemIds) ? entry.itemIds : []));
        for (const item of items) if (item.subjectKey) effective.delete(str(item.subjectKey));
        for (const item of items) if (item.subjectKey && selected.has(item.id)) effective.add(str(item.subjectKey));
      } else if (record.subjectKey && ["recurring_step", "adherence"].includes(record.type)) {
        const used = datedEntries(record.type, data, input.date).some((entry) => entry.completed !== false);
        if (used) effective.add(record.subjectKey); else effective.delete(record.subjectKey);
      }
    }
    const restore = undoReceipt?.changedRuns?.find((value) => value.id === occurrence.runId);
    if (restore && occurrence.details !== restore.after) throw new HistoryConflict("The product-use evidence changed. Reload before undoing.");
    if (!restore && JSON.stringify([...effective].sort()) === JSON.stringify([...before].sort())) continue;
    guards.push({ sql: "EXISTS(SELECT 1 FROM activity_runs WHERE id = ? AND details_json IS ? AND status IS ?)", args: [occurrence.runId, occurrence.details, occurrence.runStatus] });
    const nextDetails = restore ? restore.before : JSON.stringify({ ...details, correctedSubjectKeys: [...effective], historyCorrectionId: input.actionId });
    changedRuns.push({ id: occurrence.runId, before: occurrence.details, after: nextDetails });
    statements.push(db.prepare("UPDATE activity_runs SET details_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(nextDetails, occurrence.runId, userId));
  }
  const result = { saved: true, undo: inverse };
  // D1 batch is transactional. A stale target deliberately fails before any write.
  const guard = db.prepare(`SELECT CASE WHEN ${guards.map((guard) => guard.sql).join(" AND ") || "0"} THEN 1 ELSE json('history_conflict') END`).bind(...guards.flatMap((guard) => guard.args));
  try {
    await db.batch([guard, ...statements, db.prepare("INSERT INTO schedule_action_events (id, user_id, action_type, action_json, source, actor, idempotency_key) VALUES (?, ?, 'correct_history', ?, 'user', ?, ?)").bind(eventId, userId, JSON.stringify({ request: input, result, before: [...updates.values()].map(({ record }) => ({ id: record.id, version: record.version, entries: datedEntries(record.type, record.data, input.date) })), occurrences: occurrences.results, changedRuns, backfilledOccurrenceId }), userId, `history:${input.actionId}`)]);
  } catch (error) {
    const saved = await db.prepare("SELECT action_json AS payload FROM schedule_action_events WHERE id = ? AND user_id = ?").bind(eventId, userId).first<{ payload: string }>();
    if (saved) { const receipt = JSON.parse(saved.payload); if (JSON.stringify(receipt.request) === JSON.stringify(input)) return receipt.result; }
    if (/malformed JSON|history_conflict|UNIQUE constraint/i.test(String(error))) throw new HistoryConflict("This day changed while you were editing. Reload it before saving.");
    throw error;
  }
  return result;
}
