import { getD1 } from "../../../db";
import { saveClarificationAnswer } from "../clarification-answer-store";
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
             COALESCE(source_job.scope_type, CASE WHEN clarification.activity_id IS NULL THEN 'global' ELSE 'activity' END) AS scopeType,
             activity.title AS activityTitle,
             clarification.options_json AS optionsJson, clarification.status,
             clarification.selected_option_id AS selectedOptionId
      FROM conversation_clarifications clarification
      JOIN conversations conversation ON conversation.id = clarification.conversation_id
      LEFT JOIN activities activity ON activity.id = clarification.activity_id AND activity.user_id = clarification.user_id
      LEFT JOIN agent_jobs source_job ON source_job.id = clarification.source_agent_job_id AND source_job.user_id = clarification.user_id
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
    if (clarification.scopeType === "activity" && (!clarification.activityId || !clarification.activityTitle)) {
      return Response.json({ error: "The activity for that question is no longer available." }, { status: 409 });
    }
    const saved = await saveClarificationAnswer(db, {
      userId,
      clarificationId: clarification.id,
      optionId: option.id,
      optionLabel: option.label,
      optionDetail: option.detail,
      messageId,
      jobId: `agent-job:${safeId(userId)}:clarification:${stable}`,
      conversationId: clarification.conversationId,
      activityId: clarification.activityId,
      activityVariantId: clarification.activityVariantId,
      scopeType: clarification.scopeType,
    });
    if (!saved) return Response.json({ error: "That question has already been answered." }, { status: 409 });
    return Response.json({ answered: true, messageId }, { status: 202 });
  } catch (error) {
    return apiFailure(error);
  }
}
