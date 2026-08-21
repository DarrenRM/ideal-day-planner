import { getD1 } from "../../../db";
import { apiFailure, ensureAgentSchema, ensureGlobalConversation, readGlobalConversationState, requestIdentity, safeId } from "../agent-store";

export async function GET(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to talk with Luna." }, { status: 401 });
  try {
    await ensureAgentSchema();
    const conversationId = await ensureGlobalConversation(userId);
    return Response.json({ conversationId, ...await readGlobalConversationState(conversationId, userId) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to talk with Luna." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const body = typeof payload.body === "string" ? payload.body.trim().slice(0, 4000) : "";
    const clientMessageId = typeof payload.messageId === "string" ? payload.messageId.trim().slice(0, 160) : "";
    if (!body || !clientMessageId) return Response.json({ error: "A message and message ID are required." }, { status: 400 });
    await ensureAgentSchema();
    const conversationId = await ensureGlobalConversation(userId);
    const messageId = `message:${safeId(userId)}:global:${safeId(clientMessageId)}`;
    const jobId = `agent-job:${safeId(userId)}:global:${safeId(clientMessageId)}`;
    await getD1().batch([
      getD1().prepare(`
        INSERT OR IGNORE INTO conversation_messages (id, conversation_id, role, body, source)
        VALUES (?, ?, 'user', ?, 'user')
      `).bind(messageId, conversationId, body),
      getD1().prepare(`
        INSERT OR IGNORE INTO agent_jobs
          (id, user_id, scope_type, activity_id, conversation_id, kind, idempotency_key, source_message_id)
        VALUES (?, ?, 'global', NULL, ?, 'global_message', ?, ?)
      `).bind(jobId, userId, conversationId, `global-message:${messageId}`, messageId),
    ]);
    return Response.json({ conversationId, ...await readGlobalConversationState(conversationId, userId) }, { status: 202 });
  } catch (error) {
    return apiFailure(error);
  }
}
