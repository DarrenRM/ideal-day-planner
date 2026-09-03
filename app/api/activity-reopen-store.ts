import type { getD1 } from "../../db";

// Undo the occurrence's completion, not the choices or usage recorded within it.
export async function reopenActivityOccurrence(db: ReturnType<typeof getD1>, input: { userId: string; occurrenceId: string; runId: string }) {
  await db.batch([
    db.prepare(`UPDATE daily_plan_items SET completed_at = NULL, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND daily_plan_id IN (SELECT id FROM daily_plans WHERE user_id = ?)`)
      .bind(input.occurrenceId, input.userId),
    db.prepare("UPDATE activity_runs SET status = 'reopened', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .bind(input.runId, input.userId),
  ]);
}
