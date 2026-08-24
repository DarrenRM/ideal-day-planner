import { getD1 } from "../../../db";
import { parseActivityRecord } from "../../activity-record-model";
import { recurringStepRepresentsParentActivity } from "../../activity-cadence-guard";
import { compactRecurringTitle, recurringCadenceLabel, recurringStepScheduleStatus, type RecurringCadence } from "../../recurring-step-schedule";
import { isLocalDate, parseSchedulePattern, previewPattern } from "../../schedule-model";
import { apiFailure, requestIdentity, safeId } from "../agent-store";
import { readSchedulePatterns } from "../schedule-store";

async function routineFor(userId: string) {
  return getD1().prepare(`
    SELECT id, schedule_revision AS revision
    FROM routine_templates WHERE user_id = ? ORDER BY created_at LIMIT 1
  `).bind(userId).first<{ id: string; revision: number }>();
}

type RecurringStepRow = {
  id: string;
  activityId: string;
  activityTitle: string;
  activityClientKey: string;
  recordKey: string;
  subjectKey: string | null;
  recordType: string;
  title: string;
  scope: string;
  scopeDate: string | null;
  version: number;
  payloadJson: string;
  updatedAt: string;
};

async function readNestedScheduledSteps(userId: string, routineId: string, fromDate: string) {
  const rows = await getD1().prepare(`
    SELECT record.id, record.activity_id AS activityId, activity.title AS activityTitle,
           activity.client_key AS activityClientKey, record.record_key AS recordKey,
           record.subject_key AS subjectKey, record.record_type AS recordType, record.title,
           record.scope, record.scope_date AS scopeDate, record.version,
           record.payload_json AS payloadJson, record.updated_at AS updatedAt
    FROM activity_records record
    JOIN activities activity ON activity.id = record.activity_id
    WHERE record.user_id = ? AND activity.user_id = ? AND record.record_type = 'recurring_step'
      AND record.archived_at IS NULL
      AND record.scope IN ('activity', 'variant')
      AND EXISTS (
        SELECT 1
        FROM schedule_pattern_steps step
        JOIN schedule_patterns pattern ON pattern.id = step.pattern_id
        WHERE step.activity_id = record.activity_id
          AND pattern.user_id = ? AND pattern.routine_id = ? AND pattern.archived_at IS NULL
      )
    ORDER BY activity.title COLLATE NOCASE, record.created_at, record.id
    LIMIT 200
  `).bind(userId, userId, userId, routineId).all<RecurringStepRow>();

  return rows.results.flatMap((row) => {
    const record = parseActivityRecord(row);
    if (!record || record.type !== "recurring_step") return [];
    if (recurringStepRepresentsParentActivity(record, { title: row.activityTitle, clientKey: row.activityClientKey })) return [];
    const data = record.data as {
      anchorDate?: string;
      cadence?: RecurringCadence;
      completedDates?: string[];
    };
    const cadence = recurringCadenceLabel(data.cadence);
    const status = recurringStepScheduleStatus(data, fromDate);
    return [{
      id: record.id,
      activityId: row.activityId,
      activityTitle: row.activityTitle,
      title: compactRecurringTitle(record.title, cadence),
      cadence,
      completedThisCycle: status.completedThisCycle,
      dueToday: status.dueToday,
      nextDue: status.nextDue,
    }];
  });
}

export async function GET(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to manage your schedule." }, { status: 401 });
  try {
    const routine = await routineFor(userId);
    if (!routine) return Response.json({ error: "Your routine is not ready yet." }, { status: 409 });
    const fromDate = new URL(request.url).searchParams.get("from") ?? "";
    const previewFrom = isLocalDate(fromDate) ? fromDate : new Date().toISOString().slice(0, 10);
    const [patterns, nestedScheduledSteps] = await Promise.all([
      readSchedulePatterns(userId, routine.id, { includeArchived: true }),
      readNestedScheduledSteps(userId, routine.id, previewFrom),
    ]);
    return Response.json({
      revision: routine.revision,
      nestedScheduledSteps,
      patterns: patterns.map(({ pattern, state, archivedAt }) => ({
        ...pattern,
        state,
        archived: Boolean(archivedAt),
        preview: archivedAt ? [] : previewPattern(pattern, previewFrom, 6, state).map((entry) => ({
          date: entry.triggerDate,
          activityId: entry.step.activityId,
          activityVariantId: entry.step.activityVariantId,
          durationMinutes: entry.step.durationMinutes,
          displayLabelOverride: entry.step.displayLabelOverride,
        })),
      })),
    });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to manage your schedule." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const mode = payload.mode;
    const baseRevision = typeof payload.baseRevision === "number" && Number.isInteger(payload.baseRevision) ? payload.baseRevision : null;
    const routine = await routineFor(userId);
    if (!routine || baseRevision === null) return Response.json({ error: "A schedule revision is required." }, { status: 400 });
    if (routine.revision !== baseRevision) return Response.json({ error: "Your schedule changed elsewhere. Reload the latest version before saving.", code: "stale_revision" }, { status: 409 });
    const db = getD1();

    if (mode === "archive") {
      const patternId = typeof payload.patternId === "string" ? payload.patternId.slice(0, 200) : "";
      const expectedRevision = typeof payload.expectedRevision === "number" && Number.isInteger(payload.expectedRevision) ? payload.expectedRevision : null;
      if (!patternId || expectedRevision === null) return Response.json({ error: "A pattern and revision are required." }, { status: 400 });
      const result = await db.prepare(`
        UPDATE schedule_patterns SET archived_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND routine_id = ? AND revision = ? AND archived_at IS NULL
      `).bind(patternId, userId, routine.id, expectedRevision).run();
      if (!result.meta.changes) return Response.json({ error: "That schedule changed elsewhere.", code: "stale_revision" }, { status: 409 });
      await db.prepare(`UPDATE routine_templates SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(routine.id).run();
      return Response.json({ archived: true, revision: routine.revision + 1 });
    }

    if (mode === "restore") {
      const patternId = typeof payload.patternId === "string" ? payload.patternId.slice(0, 200) : "";
      const expectedRevision = typeof payload.expectedRevision === "number" && Number.isInteger(payload.expectedRevision) ? payload.expectedRevision : null;
      if (!patternId || expectedRevision === null) return Response.json({ error: "A pattern and revision are required." }, { status: 400 });
      const result = await db.prepare(`
        UPDATE schedule_patterns SET archived_at = NULL, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND routine_id = ? AND revision = ? AND archived_at IS NOT NULL
      `).bind(patternId, userId, routine.id, expectedRevision).run();
      if (!result.meta.changes) return Response.json({ error: "That schedule changed elsewhere.", code: "stale_revision" }, { status: 409 });
      await db.prepare(`UPDATE routine_templates SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(routine.id).run();
      return Response.json({ restored: true, revision: routine.revision + 1 });
    }

    const pattern = parseSchedulePattern(payload.pattern);
    if (!pattern) return Response.json({ error: "That schedule pattern is not valid." }, { status: 400 });
    const ownedActivities = await db.prepare(`
      SELECT id FROM activities WHERE user_id = ?
    `).bind(userId).all<{ id: string }>();
    const activityIds = new Set(ownedActivities.results.map((activity) => activity.id));
    const variants = await db.prepare(`
      SELECT id, activity_id AS activityId FROM activity_variants WHERE user_id = ? AND archived_at IS NULL
    `).bind(userId).all<{ id: string; activityId: string }>();
    const variantActivities = new Map(variants.results.map((variant) => [variant.id, variant.activityId]));
    if (!pattern.steps.every((step) => activityIds.has(step.activityId) && (!step.activityVariantId || variantActivities.get(step.activityVariantId) === step.activityId))) {
      return Response.json({ error: "A schedule step references an unavailable activity or variant." }, { status: 400 });
    }
    const existing = await db.prepare(`SELECT revision FROM schedule_patterns WHERE id = ? AND user_id = ? AND routine_id = ?`)
      .bind(pattern.id, userId, routine.id).first<{ revision: number }>();
    if (mode === "update" && (!existing || existing.revision !== pattern.revision)) {
      return Response.json({ error: "That schedule changed elsewhere.", code: "stale_revision" }, { status: 409 });
    }
    if (mode === "create" && existing) return Response.json({ error: "A schedule with that ID already exists." }, { status: 409 });
    const clientKey = typeof payload.clientKey === "string" && payload.clientKey.trim() ? payload.clientKey.trim().slice(0, 160) : `pattern-${crypto.randomUUID()}`;
    const statements = mode === "update"
      ? [
          db.prepare(`
            UPDATE schedule_patterns
            SET name = ?, position = ?, cadence_json = ?, advancement_json = ?, anchor_date = ?,
                initial_step_position = ?, effective_date = ?, end_date = ?, revision = revision + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ? AND routine_id = ? AND revision = ?
          `).bind(
            pattern.name, pattern.position, JSON.stringify(pattern.cadence), JSON.stringify(pattern.advancement),
            pattern.anchorDate, pattern.initialStepPosition, pattern.effectiveDate, pattern.endDate,
            pattern.id, userId, routine.id, pattern.revision,
          ),
          db.prepare("DELETE FROM schedule_pattern_steps WHERE pattern_id = ?").bind(pattern.id),
        ]
      : [db.prepare(`
          INSERT INTO schedule_patterns
            (id, user_id, routine_id, client_key, name, position, cadence_json,
             advancement_json, anchor_date, initial_step_position, effective_date, end_date, revision)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).bind(
          pattern.id, userId, routine.id, clientKey, pattern.name, pattern.position,
          JSON.stringify(pattern.cadence), JSON.stringify(pattern.advancement), pattern.anchorDate,
          pattern.initialStepPosition, pattern.effectiveDate, pattern.endDate,
        )];
    statements.push(
      ...pattern.steps.map((step) => db.prepare(`
        INSERT INTO schedule_pattern_steps
          (id, pattern_id, activity_id, activity_variant_id, position, duration_minutes, display_label_override, plan_role)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(step.id, pattern.id, step.activityId, step.activityVariantId, step.position, step.durationMinutes, step.displayLabelOverride, step.planRole)),
      db.prepare(`UPDATE routine_templates SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(routine.id),
      db.prepare(`
        INSERT INTO schedule_action_events
          (id, user_id, action_type, action_json, source, actor, idempotency_key)
        VALUES (?, ?, ?, ?, 'user', ?, ?)
      `).bind(
        `schedule-event:${safeId(userId)}:${crypto.randomUUID()}`, userId,
        mode === "update" ? "update_pattern" : "create_pattern", JSON.stringify(pattern),
        userId, `manual-pattern:${pattern.id}:${pattern.revision}:${routine.revision}`,
      ),
    );
    await db.batch(statements);
    return Response.json({ saved: true, patternId: pattern.id, revision: routine.revision + 1, patternRevision: mode === "update" ? pattern.revision + 1 : 1 });
  } catch (error) {
    return apiFailure(error);
  }
}
