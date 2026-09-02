import { getD1 } from "../../../db";
import { activityMessageJobStatements } from "../activity-message-jobs";
import { apiFailure, ensureAgentSchema, requestIdentity, safeId } from "../agent-store";
import { parseStoredClarificationOptions } from "../../conversation-clarification-model";

type ClarificationRow = {
  id: string;
  conversationId: string;
  activityId: string | null;
  activityVariantId: string | null;
  scopeType: "activity" | "global";
  activityTitle: string | null;
  optionsJson: string;
  status: "pending" | "answered";
  selectedOptionId: string | null;
};

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to answer Luna." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const clarificationId = typeof payload.clarificationId === "string" ? payload.clarificationId.trim().slice(0, 240) : "";
    const optionId = typeof payload.optionId === "string" ? payload.optionId.trim().slice(0, 64) : "";
    if (!clarificationId || !optionId) return Response.json({ error: "Choose one of Luna's options." }, { status: 400 });

    await ensureAgentSchema();
    const db = getD1();
    const clarification = await db.prepare(`
      SELECT clarification.id, clarification.conversation_id AS conversationId,
             clarification.activity_id AS activityId, clarification.activity_variant_id AS activityVariantId,
             conversation.scope_type AS scopeType, activity.title AS activityTitle,
             clarification.options_json AS optionsJson, clarification.status,
             clarification.selected_option_id AS selectedOptionId
      FROM conversation_clarifications clarification
      JOIN conversations conversation ON conversation.id = clarification.conversation_id
      LEFT JOIN activities activity ON activity.id = clarification.activity_id
      WHERE clarification.id = ? AND clarification.user_id = ?
      LIMIT 1
    `).bind(clarificationId, userId).first<ClarificationRow>();
    if (!clarification) return Response.json({ error: "That question is no longer available." }, { status: 404 });
    if (clarification.status === "answered") {
      if (clarification.selectedOptionId === optionId) return Response.json({ answered: true, repeated: true });
      return Response.json({ error: "That question has already been answered." }, { status: 409 });
    }

    const option = parseStoredClarificationOptions(clarification.optionsJson).find((candidate) => candidate.id === optionId);
    if (!option) return Response.json({ error: "That answer is not available." }, { status: 400 });
    const stable = safeId(clarification.id);
    const messageId = `message:${safeId(userId)}:clarification:${stable}`;
    const statements = [
      db.prepare(`
        INSERT OR IGNORE INTO conversation_messages (id, conversation_id, role, body, source)
        VALUES (?, ?, 'user', ?, 'clarification')
      `).bind(messageId, clarification.conversationId, option.response),
      db.prepare(`
        UPDATE conversation_clarifications
        SET status = 'answered', selected_option_id = ?, response_message_id = ?,
            answered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND status = 'pending'
      `).bind(option.id, messageId, clarification.id, userId),
    ];

    if (clarification.scopeType === "global") {
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO agent_jobs
          (id, user_id, scope_type, activity_id, activity_variant_id, conversation_id, kind, idempotency_key, source_message_id)
        VALUES (?, ?, 'global', ?, ?, ?, 'global_message', ?, ?)
      `).bind(
        `agent-job:${safeId(userId)}:global-clarification:${stable}`,
        userId,
        clarification.activityId,
        clarification.activityVariantId,
        clarification.conversationId,
        `global-clarification:${clarification.id}`,
        messageId,
      ));
    } else {
      if (!clarification.activityId || !clarification.activityTitle) {
        return Response.json({ error: "The activity for that question is no longer available." }, { status: 409 });
      }
      statements.push(...activityMessageJobStatements({
        userId,
        activityId: clarification.activityId,
        activityVariantId: clarification.activityVariantId,
        conversationId: clarification.conversationId,
        sourceMessageId: messageId,
        clientMessageId: `clarification-${stable}`,
        body: option.response,
        activityTitle: clarification.activityTitle,
      }));
    }
    await db.batch(statements);
    return Response.json({ answered: true, messageId }, { status: 202 });
  } catch (error) {
    return apiFailure(error);
  }
}
