import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import {
  apiFailure,
  completeActivitySetup,
  ensureAgentSchema,
  isLocalBridgeRequest,
  markActivitySetupAnswered,
  persistWorkspaceActions,
  readActivityWorkspace,
  readConversationMessages,
  safeId,
} from "../../agent-store";
import { validateWorkspaceActions } from "../../../workspace-model";

const HERMES_RUNTIME = "hermes-activity-blueprint-v2";

type LeasedJob = {
  id: string;
  userId: string;
  activityId: string;
  conversationId: string;
  kind: "activity_opened" | "activity_setup" | "user_message" | "workspace_refresh";
  sourceMessageId: string | null;
  attempts: number;
};

async function tokensMatch(expected: string, supplied: string) {
  const encoder = new TextEncoder();
  const [expectedHash, suppliedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
  ]);
  const left = new Uint8Array(expectedHash);
  const right = new Uint8Array(suppliedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function bridgeOnly(request: Request) {
  const browserOrigin = request.headers.get("origin");
  if (browserOrigin) return Response.json({ error: "Agent bridge authentication failed." }, { status: 403 });
  if (isLocalBridgeRequest(request)) return null;

  const expected = ((env as typeof env & { IDEAL_DAY_BRIDGE_TOKEN?: string }).IDEAL_DAY_BRIDGE_TOKEN || "").trim();
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return expected && supplied && await tokensMatch(expected, supplied)
    ? null
    : Response.json({ error: "Agent bridge authentication failed." }, { status: 403 });
}

export async function GET(request: Request) {
  const denied = await bridgeOnly(request);
  if (denied) return denied;
  const workerId = new URL(request.url).searchParams.get("workerId")?.trim().slice(0, 120) || "ideal-day-local-bridge";

  try {
    await ensureAgentSchema();
    const db = getD1();
    await db.prepare(`
      INSERT INTO agent_workers (id, runtime, last_seen_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        runtime = excluded.runtime, last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `).bind(workerId, HERMES_RUNTIME).run();
    const candidate = await db.prepare(`
      SELECT id, user_id AS userId, activity_id AS activityId, conversation_id AS conversationId,
             kind, source_message_id AS sourceMessageId, attempts
      FROM agent_jobs
      WHERE status = 'queued'
         OR (status IN ('leased', 'running') AND lease_expires_at < CURRENT_TIMESTAMP)
      ORDER BY created_at ASC, rowid ASC
      LIMIT 1
    `).first<LeasedJob>();
    if (!candidate) return new Response(null, { status: 204 });

    const leaseToken = crypto.randomUUID();
    const leased = await db.prepare(`
      UPDATE agent_jobs
      SET status = 'leased', lease_token = ?, lease_owner = ?, leased_at = CURRENT_TIMESTAMP,
          lease_expires_at = datetime('now', '+3 minutes'), attempts = attempts + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND (
        status = 'queued' OR (status IN ('leased', 'running') AND lease_expires_at < CURRENT_TIMESTAMP)
      )
    `).bind(leaseToken, workerId, candidate.id).run();
    if (!(leased.meta.changes ?? 0)) return new Response(null, { status: 204 });

    const activity = await db.prepare(`
      SELECT client_key AS clientKey, title, category
      FROM activities
      WHERE id = ? AND user_id = ?
    `).bind(candidate.activityId, candidate.userId).first<{ clientKey: string; title: string; category: string }>();
    const schedule = await db.prepare(`
      SELECT dpi.duration, dp.plan_date AS planDate
      FROM daily_plan_items dpi
      JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
      WHERE dpi.activity_id = ? AND dp.user_id = ? AND dpi.removed_at IS NULL
      ORDER BY dp.plan_date DESC
      LIMIT 1
    `).bind(candidate.activityId, candidate.userId).first<{ duration: number; planDate: string }>();
    const binding = await db.prepare(`
      SELECT runtime_session_id AS runtimeSessionId
      FROM agent_session_bindings
      WHERE conversation_id = ? AND runtime = ?
    `).bind(candidate.conversationId, HERMES_RUNTIME).first<{ runtimeSessionId: string }>();
    const visit = await db.prepare(`
      SELECT context_json AS contextJson
      FROM activity_visits
      WHERE activity_id = ? AND user_id = ?
      ORDER BY opened_at DESC
      LIMIT 1
    `).bind(candidate.activityId, candidate.userId).first<{ contextJson: string | null }>();
    let activityContext = null;
    try { activityContext = visit?.contextJson ? JSON.parse(visit.contextJson) : null; } catch { activityContext = null; }
    const messages = await readConversationMessages(candidate.conversationId);
    const workspace = await readActivityWorkspace(candidate.activityId);
    const sourceMessage = candidate.sourceMessageId
      ? messages.find((message) => message.id === candidate.sourceMessageId) ?? null
      : null;

    await db.prepare("UPDATE agent_jobs SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_token = ?")
      .bind(candidate.id, leaseToken).run();

    return Response.json({
      job: { ...candidate, leaseToken, attempts: candidate.attempts + 1 },
      runtimeSessionId: binding?.runtimeSessionId ?? null,
      context: {
        activity,
        schedule: schedule ?? null,
        activityContext,
        workspace,
        recentMessages: messages.slice(-30),
        sourceMessage,
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  const denied = await bridgeOnly(request);
  if (denied) return denied;

  try {
    await ensureAgentSchema();
    const payload = await request.json() as Record<string, unknown>;
    const mode = payload.mode;
    const jobId = typeof payload.jobId === "string" ? payload.jobId : "";
    const leaseToken = typeof payload.leaseToken === "string" ? payload.leaseToken : "";
    if (!jobId || !leaseToken) return Response.json({ error: "A job and lease token are required." }, { status: 400 });
    const db = getD1();
    const job = await db.prepare(`
      SELECT id, user_id AS userId, activity_id AS activityId, conversation_id AS conversationId,
             kind, attempts
      FROM agent_jobs WHERE id = ? AND lease_token = ? AND status = 'running'
    `).bind(jobId, leaseToken).first<{
      id: string;
      userId: string;
      activityId: string;
      conversationId: string;
      kind: LeasedJob["kind"];
      attempts: number;
    }>();
    if (!job) return Response.json({ error: "The job lease is no longer active." }, { status: 409 });

    if (mode === "complete") {
      const response = typeof payload.response === "string" ? payload.response.trim().slice(0, 8000) : "";
      const runtimeSessionId = typeof payload.runtimeSessionId === "string" ? payload.runtimeSessionId.trim().slice(0, 240) : "";
      if (!runtimeSessionId) return Response.json({ error: "A runtime session is required." }, { status: 400 });
      const schedule = await db.prepare(`
        SELECT dpi.duration
        FROM daily_plan_items dpi
        JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
        WHERE dpi.activity_id = ? AND dp.user_id = ? AND dpi.removed_at IS NULL
        ORDER BY dp.plan_date DESC
        LIMIT 1
      `).bind(job.activityId, job.userId).first<{ duration: number }>();
      const workspaceActions = validateWorkspaceActions(payload.workspaceActions, Math.max(60, (schedule?.duration ?? 5) * 60));
      if (job.kind === "user_message" && !response && !workspaceActions.length) {
        return Response.json({ error: "A user message requires either a Luna response or a workspace change." }, { status: 400 });
      }
      const workspace = await persistWorkspaceActions({
        userId: job.userId,
        activityId: job.activityId,
        agentJobId: jobId,
        actions: workspaceActions,
      });
      const messageId = response ? `agent-message:${safeId(jobId)}` : null;
      const bindingId = `agent-binding:${safeId(job.conversationId)}:${safeId(HERMES_RUNTIME)}`;
      const statements = [];
      if (response && messageId) {
        statements.push(db.prepare(`
          INSERT OR IGNORE INTO conversation_messages
            (id, conversation_id, role, body, source, agent_job_id)
          VALUES (?, ?, 'luna', ?, 'agent', ?)
        `).bind(messageId, job.conversationId, response, jobId));
      }
      statements.push(
        db.prepare(`
          INSERT INTO agent_session_bindings
            (id, conversation_id, runtime, runtime_session_id)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(conversation_id, runtime) DO UPDATE SET
            runtime_session_id = excluded.runtime_session_id,
            updated_at = CURRENT_TIMESTAMP
        `).bind(bindingId, job.conversationId, HERMES_RUNTIME, runtimeSessionId),
        db.prepare(`
          UPDATE agent_jobs
          SET status = 'succeeded', lease_token = NULL, lease_owner = NULL,
              lease_expires_at = NULL, error = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND lease_token = ?
        `).bind(jobId, leaseToken),
      );
      await db.batch(statements);
      if (job.kind === "activity_setup") {
        await completeActivitySetup({
          activityId: job.activityId,
          messageId,
          hasWorkspaceActions: workspaceActions.length > 0,
        });
      } else if (job.kind === "user_message" && workspaceActions.length) {
        await markActivitySetupAnswered(job.activityId);
      }
      return Response.json({ completed: true, messageId, workspace });
    }

    if (mode === "failure") {
      const error = typeof payload.error === "string" ? payload.error.trim().slice(0, 1000) : "Agent processing failed.";
      const nextStatus = job.attempts >= 5 ? "retryable_failure" : "queued";
      await db.prepare(`
        UPDATE agent_jobs
        SET status = ?, lease_token = NULL, lease_owner = NULL, lease_expires_at = NULL,
            error = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND lease_token = ?
      `).bind(nextStatus, error, jobId, leaseToken).run();
      return Response.json({ completed: false, status: nextStatus });
    }

    return Response.json({ error: "Unsupported job operation." }, { status: 400 });
  } catch (error) {
    return apiFailure(error);
  }
}
