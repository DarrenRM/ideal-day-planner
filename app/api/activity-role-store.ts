import type { getD1 } from "../../db";

export type RoleOccurrence = { id: string; schedulePatternStepId: string | null };

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
