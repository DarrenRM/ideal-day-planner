import { getD1 } from "../../../db";
import { apiFailure, ensureAgentSchema, ensureGlobalConversation, markConversationArtifactViewed, readGlobalConversationState, requestIdentity, safeId } from "../agent-store";
import { captureRevision, readPendingCaptures } from "../capture-service";

async function summary(conversationId: string, userId: string) {
  const db = getD1();
  const [unread, onlineWorker] = await Promise.all([
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM conversation_messages message
      JOIN conversations conversation ON conversation.id = message.conversation_id
      WHERE message.conversation_id = ? AND conversation.user_id = ? AND message.role = 'luna'
        AND (conversation.last_read_at IS NULL OR message.created_at > conversation.last_read_at)
    `).bind(conversationId, userId).first<{ count: number }>(),
    db.prepare(`SELECT id FROM agent_workers WHERE last_seen_at >= datetime('now', '-20 seconds') LIMIT 1`).first(),
  ]);
  const captures = await readPendingCaptures(userId, conversationId);
  return {
    unreadCount: unread?.count ?? 0,
    pendingDecisionCount: captures.filter((capture) => capture.status === "filed" && capture.timing === "unspecified").length,
    captureRevision: await captureRevision(userId),
    agentOnline: Boolean(onlineWorker),
  };
}

async function state(conversationId: string, userId: string) {
  return {
    conversationId,
    ...await readGlobalConversationState(conversationId, userId),
    captures: await readPendingCaptures(userId, conversationId),
    ...await summary(conversationId, userId),
  };
}

export async function GET(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to talk with Luna." }, { status: 401 });
  try {
    await ensureAgentSchema();
    const conversationId = await ensureGlobalConversation(userId);
    if (new URL(request.url).searchParams.get("summary") === "1") return Response.json(await summary(conversationId, userId));
    return Response.json(await state(conversationId, userId));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to talk with Luna." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    await ensureAgentSchema();
    const conversationId = await ensureGlobalConversation(userId);
    if (payload.mode === "mark-read") {
      await getD1().prepare(`
        UPDATE conversations SET last_read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND scope_type = 'global'
      `).bind(conversationId, userId).run();
      return Response.json(await state(conversationId, userId));
    }
    if (payload.mode === "view-artifact") {
      const artifactId = typeof payload.artifactId === "string" ? payload.artifactId.trim().slice(0, 1024) : "";
      const activityId = typeof payload.activityId === "string" ? payload.activityId.trim().slice(0, 240) : "";
      if (!artifactId || !activityId) return Response.json({ error: "That update could not be opened." }, { status: 400 });
      const viewed = await markConversationArtifactViewed({ userId, conversationId, activityId, artifactId });
      if (!viewed) return Response.json({ error: "That update could not be found." }, { status: 404 });
      return Response.json(await state(conversationId, userId));
    }
    const body = typeof payload.body === "string" ? payload.body.trim().slice(0, 4000) : "";
    const clientMessageId = typeof payload.messageId === "string" ? payload.messageId.trim().slice(0, 160) : "";
    if (!body || !clientMessageId) return Response.json({ error: "A message and message ID are required." }, { status: 400 });
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
    return Response.json(await state(conversationId, userId), { status: 202 });
  } catch (error) {
    return apiFailure(error);
  }
}
