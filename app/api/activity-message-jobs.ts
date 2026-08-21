import { getD1 } from "../../db";
import { safeId } from "./agent-store";
import { messageHasScheduleIntent } from "../schedule-intent";

export function activityMessageJobStatements(input: {
  userId: string;
  activityId: string;
  activityVariantId?: string | null;
  conversationId: string;
  sourceMessageId: string;
  clientMessageId: string;
  body: string;
}) {
  const db = getD1();
  const base = safeId(input.clientMessageId);
  const statements = [db.prepare(`
    INSERT OR IGNORE INTO agent_jobs
      (id, user_id, scope_type, activity_id, activity_variant_id, conversation_id, kind, idempotency_key, source_message_id)
    VALUES (?, ?, 'activity', ?, ?, ?, 'user_message', ?, ?)
  `).bind(
    `agent-job:${safeId(input.userId)}:message:${base}`,
    input.userId,
    input.activityId,
    input.activityVariantId ?? null,
    input.conversationId,
    `user-message:${input.sourceMessageId}`,
    input.sourceMessageId,
  )];

  if (messageHasScheduleIntent(input.body)) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO agent_jobs
        (id, user_id, scope_type, activity_id, activity_variant_id, conversation_id, kind, idempotency_key, source_message_id)
      VALUES (?, ?, 'global', ?, ?, ?, 'global_message', ?, ?)
    `).bind(
      `agent-job:${safeId(input.userId)}:schedule:${base}`,
      input.userId,
      input.activityId,
      input.activityVariantId ?? null,
      input.conversationId,
      `schedule-message:${input.sourceMessageId}`,
      input.sourceMessageId,
    ));
  }
  return statements;
}
