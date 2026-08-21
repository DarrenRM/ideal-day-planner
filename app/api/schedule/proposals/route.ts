import { getD1 } from "../../../../db";
import { apiFailure, ensureGlobalConversation, readGlobalConversationState, requestIdentity, safeId } from "../../agent-store";
import { applyScheduleProposal } from "../../schedule-proposal-service";

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to manage Luna's schedule proposals." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const proposalId = typeof payload.proposalId === "string" ? payload.proposalId.trim().slice(0, 240) : "";
    const mode = payload.mode;
    if (!proposalId || !["confirm", "dismiss", "revise"].includes(String(mode))) {
      return Response.json({ error: "A proposal and supported action are required." }, { status: 400 });
    }
    if (mode === "confirm") {
      const result = await applyScheduleProposal(userId, proposalId);
      if ("error" in result) return Response.json({ error: result.error, code: "code" in result ? result.code : undefined }, { status: result.status });
      return Response.json(result);
    }
    const db = getD1();
    const proposal = await db.prepare("SELECT id, status, conversation_id AS conversationId FROM schedule_proposals WHERE id = ? AND user_id = ?")
      .bind(proposalId, userId).first<{ id: string; status: string; conversationId: string }>();
    if (!proposal) return Response.json({ error: "That proposal is no longer available." }, { status: 404 });
    if (mode === "dismiss") {
      await db.batch([
        db.prepare("UPDATE schedule_proposals SET status = 'dismissed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND status IN ('draft', 'awaiting_clarification', 'ready')")
          .bind(proposalId, userId),
        db.prepare(`
          INSERT OR IGNORE INTO schedule_action_events
            (id, user_id, conversation_id, action_type, action_json, source, actor, idempotency_key)
          VALUES (?, ?, ?, 'dismiss_proposal', ?, 'user', ?, ?)
        `).bind(`schedule-event:${safeId(userId)}:dismiss:${safeId(proposalId)}`, userId, proposal.conversationId, JSON.stringify({ proposalId }), userId, `dismiss-proposal:${proposalId}`),
      ]);
      return Response.json({ dismissed: true });
    }
    const revision = typeof payload.body === "string" ? payload.body.trim().slice(0, 3000) : "";
    if (!revision) return Response.json({ error: "Tell Luna what you want changed." }, { status: 400 });
    const conversationId = await ensureGlobalConversation(userId);
    const nonce = crypto.randomUUID();
    const messageId = `message:${safeId(userId)}:global:revise:${safeId(nonce)}`;
    const jobId = `agent-job:${safeId(userId)}:global:revise:${safeId(nonce)}`;
    await db.batch([
      db.prepare("UPDATE schedule_proposals SET status = 'dismissed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND status IN ('draft', 'awaiting_clarification', 'ready')").bind(proposalId, userId),
      db.prepare("INSERT INTO conversation_messages (id, conversation_id, role, body, source) VALUES (?, ?, 'user', ?, 'user')")
        .bind(messageId, conversationId, `Please revise proposal ${proposalId}: ${revision}`),
      db.prepare(`
        INSERT INTO agent_jobs
          (id, user_id, scope_type, activity_id, conversation_id, kind, idempotency_key, source_message_id)
        VALUES (?, ?, 'global', NULL, ?, 'global_message', ?, ?)
      `).bind(jobId, userId, conversationId, `revise-proposal:${proposalId}:${nonce}`, messageId),
    ]);
    return Response.json({ revising: true, conversationId, ...await readGlobalConversationState(conversationId, userId) }, { status: 202 });
  } catch (error) {
    return apiFailure(error);
  }
}
