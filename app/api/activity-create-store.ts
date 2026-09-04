import type { getD1 } from "../../db";

type Database = ReturnType<typeof getD1>;
type Statement = ReturnType<Database["prepare"]>;
type CreationReceipt = { requestJson: string; completedAt: string | null };

export class ActivityCreationConflict extends Error {}

// All definition, schedule, and setup writes commit together. Resolving today's
// dated occurrence can be resumed independently after a lost response.
export async function createActivityOnce(db: Database, input: {
  userId: string;
  activityId: string;
  requestJson: string;
  statements: Statement[];
  resolveOccurrence: () => Promise<unknown>;
}) {
  const read = () => db.prepare(`
    SELECT request_json AS requestJson, completed_at AS completedAt
    FROM activity_creation_requests WHERE activity_id = ? AND user_id = ?
  `).bind(input.activityId, input.userId).first<CreationReceipt>();
  let receipt = await read();
  if (!receipt) {
    try {
      await db.batch([
        ...input.statements,
        db.prepare(`
          INSERT INTO activity_creation_requests (activity_id, user_id, request_json)
          VALUES (?, ?, ?)
        `).bind(input.activityId, input.userId, input.requestJson),
      ]);
    } catch (error) {
      // A concurrent request or an uncertain batch response may have committed.
      // Never infer success merely from an activity with the same name or ID.
      receipt = await read();
      if (!receipt) throw error;
    }
  }
  if (receipt && receipt.requestJson !== input.requestJson) {
    throw new ActivityCreationConflict("This Add request was already saved with different details. Reload before editing the activity.");
  }
  if (receipt?.completedAt) return;
  await input.resolveOccurrence();
  await db.prepare(`
    UPDATE activity_creation_requests SET completed_at = CURRENT_TIMESTAMP
    WHERE activity_id = ? AND user_id = ? AND completed_at IS NULL
  `).bind(input.activityId, input.userId).run();
}
