import type { getD1 } from "../../db";

export type RoleOccurrence = { id: string; schedulePatternStepId: string | null };

export async function persistActivityRole(db: ReturnType<typeof getD1>, input: {
  userId: string;
  routineId: string;
  occurrence: RoleOccurrence;
  planRole: "essential" | "extra";
}) {
  const { userId, routineId, occurrence, planRole } = input;
  const eventNonce = crypto.randomUUID();
  const statements = [db.prepare(`
    UPDATE daily_plan_items
    SET plan_role = ?, activated_at = NULL,
        deactivated_at = CASE WHEN ? = 'extra' THEN CURRENT_TIMESTAMP ELSE NULL END,
        revision = revision + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(planRole, planRole, occurrence.id)];
  if (occurrence.schedulePatternStepId) {
    statements.push(
      db.prepare(`UPDATE schedule_pattern_steps SET plan_role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(planRole, occurrence.schedulePatternStepId),
      db.prepare(`
        UPDATE daily_plan_items
        SET plan_role = ?, activated_at = NULL,
            deactivated_at = CASE WHEN ? = 'essential' THEN NULL ELSE deactivated_at END,
            revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE schedule_pattern_step_id = ? AND completed_at IS NULL AND skipped_at IS NULL
      `).bind(planRole, planRole, occurrence.schedulePatternStepId),
    );
  }
  const eventKey = `set-plan-role:${occurrence.id}:${planRole}:${eventNonce}`;
  statements.push(
    db.prepare(`UPDATE routine_templates SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(routineId),
    db.prepare(`
      INSERT INTO schedule_action_events
        (id, user_id, action_type, action_json, source, actor, idempotency_key)
      VALUES (?, ?, 'set_plan_role', ?, 'user', ?, ?)
    `).bind(
      `schedule-event:${eventNonce}`,
      userId,
      JSON.stringify({ occurrenceId: occurrence.id, schedulePatternStepId: occurrence.schedulePatternStepId, planRole }),
      userId,
      eventKey,
    ),
  );
  await db.batch(statements);
}

// A tab can remain open while day resolution replaces an occurrence row. Prefer
// the current dated occurrence, then fall back to the supplied row id for older
// clients. Variant matching prevents one activity's alternate session from
// changing another when both appear on the same day.
export async function findRoleOccurrence(db: ReturnType<typeof getD1>, input: {
  userId: string;
  occurrenceId: string;
  occurrenceKey: string;
  activityId: string;
  activityVariantId: string;
  date: string;
}) {
  const { userId, occurrenceId, occurrenceKey, activityId, activityVariantId, date } = input;
  return db.prepare(`
    SELECT dpi.id, dpi.schedule_pattern_step_id AS schedulePatternStepId
    FROM daily_plan_items dpi
    JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
    JOIN activities a ON a.id = dpi.activity_id
    WHERE dp.user_id = ? AND (
      (? <> '' AND ? <> '' AND dp.plan_date = ? AND dpi.occurrence_key = ? AND dpi.removed_at IS NULL)
      OR (? <> '' AND ? <> '' AND dp.plan_date = ?
          AND (a.client_key = ? OR a.id = ?)
          AND (? = '' OR COALESCE(dpi.activity_variant_id, '') = ?)
          AND dpi.removed_at IS NULL)
      OR dpi.id = ?
    )
    ORDER BY CASE
      WHEN ? <> '' AND dp.plan_date = ? AND dpi.occurrence_key = ? THEN 0
      WHEN ? <> '' AND dp.plan_date = ? AND (a.client_key = ? OR a.id = ?) THEN 1
      WHEN dpi.id = ? THEN 2
      ELSE 3
    END, dpi.position, dpi.created_at, dpi.id
    LIMIT 1
  `).bind(
    userId,
    date, occurrenceKey, date, occurrenceKey,
    date, activityId, date, activityId, activityId, activityVariantId, activityVariantId,
    occurrenceId,
    date, date, occurrenceKey,
    date, date, activityId, activityId,
    occurrenceId,
  ).first<RoleOccurrence>();
}
