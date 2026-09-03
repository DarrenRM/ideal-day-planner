import type { getD1 } from "../../db";

// A structured answer resumes the worker that asked, not freeform chat routing.
// Keep the answer, its audit message, and exactly one continuation atomic.
export async function saveClarificationAnswer(db: ReturnType<typeof getD1>, input: {
  userId: string; clarificationId: string; optionId: string; optionLabel: string; optionDetail: string;
  messageId: string; jobId: string; conversationId: string;
  activityId: string | null; activityVariantId: string | null;
  scopeType: "activity" | "global";
}) {
  const global = input.scopeType === "global";
  await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO conversation_messages (id, conversation_id, role, body, source)
      SELECT ?, ?, 'user', ?, 'clarification'
      FROM conversation_clarifications WHERE id = ? AND user_id = ? AND status = 'pending'
    `).bind(input.messageId, input.conversationId,
      `Selected option: ${input.optionLabel}${input.optionDetail ? `\n${input.optionDetail}` : ""}`,
      input.clarificationId, input.userId),
    db.prepare(`
      UPDATE conversation_clarifications
      SET status = 'answered', selected_option_id = ?, response_message_id = ?,
          answered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `).bind(input.optionId, input.messageId, input.clarificationId, input.userId),
    db.prepare(`
      INSERT OR IGNORE INTO agent_jobs
        (id, user_id, scope_type, activity_id, activity_variant_id, conversation_id,
         kind, idempotency_key, source_message_id, delegation_instruction)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM conversation_clarifications
      WHERE id = ? AND user_id = ? AND status = 'answered' AND selected_option_id = ?
    `).bind(
      input.jobId, input.userId, input.scopeType, input.activityId, input.activityVariantId,
      input.conversationId, global ? "global_refresh" : "workspace_refresh",
      `clarification:${input.clarificationId}`, input.messageId,
      global ? JSON.stringify({ kind: "durable_work", outcomes: ["Resolve the answered clarification using the original question and the user's selected response."] }) : null,
      input.clarificationId, input.userId, input.optionId,
    ),
  ]);
  const saved = await db.prepare(`
    SELECT selected_option_id AS selectedOptionId FROM conversation_clarifications
    WHERE id = ? AND user_id = ?
  `).bind(input.clarificationId, input.userId).first<{ selectedOptionId: string | null }>();
  return saved?.selectedOptionId === input.optionId;
}

export async function readAnsweredClarification(db: ReturnType<typeof getD1>, userId: string, sourceMessageId: string | null) {
  if (!sourceMessageId) return null;
  return db.prepare(`
    SELECT clarification.question,
           json_extract(option.value, '$.label') AS selectedLabel,
           COALESCE(json_extract(option.value, '$.detail'), '') AS selectedDetail
    FROM conversation_clarifications clarification
    JOIN json_each(clarification.options_json) option ON json_extract(option.value, '$.id') = clarification.selected_option_id
    WHERE clarification.user_id = ? AND clarification.response_message_id = ?
      AND clarification.status = 'answered'
    LIMIT 1
  `).bind(userId, sourceMessageId).first<{ question: string; selectedLabel: string; selectedDetail: string }>();
}
