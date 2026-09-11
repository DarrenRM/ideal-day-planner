import type { getD1 } from "../../db";

export async function removeStaleIntervalDayItems(
  db: ReturnType<typeof getD1>,
  input: { planId: string; date: string; patternIds: string[] },
) {
  if (!input.patternIds.length) return;

  await db.prepare(`
    DELETE FROM daily_plan_items
    WHERE daily_plan_id = ?
      AND schedule_pattern_id IN (${input.patternIds.map(() => "?").join(", ")})
      AND completed_at IS NULL AND skipped_at IS NULL AND removed_at IS NULL
      AND revision = 1
      AND (
        (source_date = ? AND activated_at IS NULL AND moved_from_daily_plan_item_id IS NULL)
        OR (
          source_date < ?
          AND occurrence_key = 'carry:' || schedule_pattern_id || ':' || source_date
          AND moved_from_daily_plan_item_id IS NOT NULL
        )
      )
  `).bind(input.planId, ...input.patternIds, input.date, input.date).run();
}
