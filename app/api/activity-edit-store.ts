import type { getD1 } from "../../db";

// Rename the definition and its current/future snapshots together. Historical
// names and occurrence-specific scheduling, labels, and completion stay intact.
export async function updateActivityDetails(db: ReturnType<typeof getD1>, input: {
  userId: string;
  clientKey: string;
  title: string;
  category: string;
  color: string;
  date: string;
}) {
  const { userId, clientKey, title, category, color, date } = input;
  const [activity] = await db.batch([
    db.prepare(`
      UPDATE activities
      SET title = ?, category = ?, color = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND client_key = ?
    `).bind(title, category, color, userId, clientKey),
    db.prepare(`
      UPDATE daily_plan_items
      SET title = ?, category = ?, color = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE activity_id IN (SELECT id FROM activities WHERE user_id = ? AND client_key = ?)
        AND daily_plan_id IN (SELECT id FROM daily_plans WHERE user_id = ? AND plan_date >= ?)
    `).bind(title, category, color, userId, clientKey, userId, date),
  ]);
  return Boolean(activity.meta.changes);
}
