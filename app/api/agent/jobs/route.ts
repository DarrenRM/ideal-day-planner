import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import {
  apiFailure,
  completeActivitySetup,
  ensureAgentSchema,
  isLocalBridgeRequest,
  markActivitySetupAnswered,
  persistRecordActions,
  persistWorkspaceActions,
  readActivityRecords,
  readActivityWorkspace,
  readConversationMessages,
  safeId,
} from "../../agent-store";
import { hasUsefulActivityRecordData, validateRecordActions, type ActivityRecordContent } from "../../../activity-record-model";
import { hasUsefulRoutineComponent, validateWorkspaceActions } from "../../../workspace-model";

const HERMES_RUNTIME = "hermes-activity-blueprint-v2";

function messageRequestsResearch(value: string | null | undefined) {
  return /https?:\/\/\S+|www\.\S+|look\s*up|research|verify|check\s+(?:the|its|these|those|spec)|web\s+(?:access|search)|specification|manufacturer/i.test(value || "");
}

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
  let claimedJob: { id: string; leaseToken: string } | null = null;

  try {
    await ensureAgentSchema();
    const db = getD1();
    await db.prepare(`
      INSERT INTO agent_workers (id, runtime, last_seen_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        runtime = excluded.runtime, last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `).bind(workerId, HERMES_RUNTIME).run();
    await db.prepare(`
      INSERT OR IGNORE INTO agent_jobs
        (id, user_id, activity_id, conversation_id, kind, idempotency_key, source_message_id)
      SELECT 'agent-job:workspace-recovery:' || source.id,
             source.user_id, source.activity_id, source.conversation_id,
             'workspace_refresh', 'workspace-recovery:' || source.id, source.source_message_id
      FROM agent_jobs source
      JOIN conversation_messages message ON message.id = source.source_message_id
      WHERE source.kind = 'user_message'
        AND source.status = 'succeeded'
        AND source.created_at >= datetime('now', '-30 days')
        AND (
          instr(lower(message.body), 'http://') > 0
          OR instr(lower(message.body), 'https://') > 0
          OR instr(lower(message.body), 'www.') > 0
          OR instr(lower(message.body), 'look up') > 0
          OR instr(lower(message.body), 'research') > 0
          OR instr(lower(message.body), 'verify') > 0
          OR instr(lower(message.body), 'manufacturer') > 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM agent_jobs followup
          WHERE followup.kind = 'workspace_refresh'
            AND followup.source_message_id = source.source_message_id
        )
      ORDER BY source.created_at DESC
      LIMIT 10
    `).run();
    const candidate = await db.prepare(`
      SELECT id, user_id AS userId, activity_id AS activityId, conversation_id AS conversationId,
             kind, source_message_id AS sourceMessageId, attempts
      FROM agent_jobs
      WHERE status = 'queued'
         OR (status = 'retryable_failure' AND updated_at < datetime('now', '-1 minute'))
         OR (status IN ('leased', 'running') AND lease_expires_at < CURRENT_TIMESTAMP)
      ORDER BY CASE kind WHEN 'user_message' THEN 0 ELSE 1 END, created_at ASC, rowid ASC
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
        status = 'queued'
        OR (status = 'retryable_failure' AND updated_at < datetime('now', '-1 minute'))
        OR (status IN ('leased', 'running') AND lease_expires_at < CURRENT_TIMESTAMP)
      )
    `).bind(leaseToken, workerId, candidate.id).run();
    if (!(leased.meta.changes ?? 0)) return new Response(null, { status: 204 });
    claimedJob = { id: candidate.id, leaseToken };

    const activity = await db.prepare(`
      SELECT client_key AS clientKey, title, category
      FROM activities
      WHERE id = ? AND user_id = ?
    `).bind(candidate.activityId, candidate.userId).first<{ clientKey: string; title: string; category: string }>();
    const schedule = await db.prepare(`
      SELECT dpi.duration, dp.plan_date AS planDate,
             COALESCE(s.day_timeline_enabled, 0) AS dayTimelineEnabled
      FROM daily_plan_items dpi
      JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
      LEFT JOIN settings s ON s.user_id = dp.user_id
      WHERE dpi.activity_id = ? AND dp.user_id = ? AND dpi.removed_at IS NULL
      ORDER BY dp.plan_date DESC
      LIMIT 1
    `).bind(candidate.activityId, candidate.userId).first<{ duration: number; planDate: string; dayTimelineEnabled: number }>();
    const binding = await db.prepare(`
      SELECT runtime_session_id AS runtimeSessionId
      FROM agent_session_bindings
      WHERE conversation_id = ? AND runtime = ?
    `).bind(candidate.conversationId, HERMES_RUNTIME).first<{ runtimeSessionId: string }>();
    const visit = await db.prepare(`
      SELECT context_json AS contextJson
      FROM activity_visits
      WHERE activity_id = ? AND user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(candidate.activityId, candidate.userId).first<{ contextJson: string | null }>();
    let activityContext = null;
    try { activityContext = visit?.contextJson ? JSON.parse(visit.contextJson) : null; } catch { activityContext = null; }
    const messages = await readConversationMessages(candidate.conversationId);
    const workspace = await readActivityWorkspace(candidate.activityId);
    const records = await readActivityRecords(candidate.activityId, schedule?.planDate ?? null);
    const runs = await db.prepare(`
      SELECT plan_date AS planDate, status, allotted_duration_seconds AS allottedDurationSeconds,
             planned_duration_seconds AS plannedDurationSeconds, actual_elapsed_seconds AS actualElapsedSeconds,
             timer_mode AS timerMode, started_at AS startedAt, completed_at AS completedAt, details_json AS detailsJson
      FROM activity_runs WHERE activity_id = ? AND user_id = ?
      ORDER BY plan_date DESC LIMIT 20
    `).bind(candidate.activityId, candidate.userId).all();
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
        schedule: schedule ? {
          planDate: schedule.planDate,
          timelineEnabled: Boolean(schedule.dayTimelineEnabled),
          duration: schedule.dayTimelineEnabled ? schedule.duration : null,
        } : null,
        activityContext,
        workspace,
        records,
        recentRuns: runs.results,
        recentMessages: messages.slice(-30),
        sourceMessage,
      },
    });
  } catch (error) {
    if (claimedJob) {
      try {
        await getD1().prepare(`
          UPDATE agent_jobs
          SET status = CASE WHEN attempts >= 5 THEN 'retryable_failure' ELSE 'queued' END,
              lease_token = NULL, lease_owner = NULL, lease_expires_at = NULL,
              error = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND lease_token = ?
        `).bind(error instanceof Error ? error.message.slice(0, 1000) : "Job context assembly failed.", claimedJob.id, claimedJob.leaseToken).run();
      } catch (releaseError) {
        console.error("Could not release an incomplete agent lease.", releaseError);
      }
    }
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
    const db = getD1();
    if (mode === "heartbeat") {
      const workerId = typeof payload.workerId === "string" ? payload.workerId.trim().slice(0, 120) : "";
      if (!workerId) return Response.json({ error: "A worker is required." }, { status: 400 });
      const heartbeatJobId = typeof payload.jobId === "string" ? payload.jobId : "";
      const heartbeatLeaseToken = typeof payload.leaseToken === "string" ? payload.leaseToken : "";
      const statements = [db.prepare(`
          INSERT INTO agent_workers (id, runtime, last_seen_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            runtime = excluded.runtime, last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        `).bind(workerId, HERMES_RUNTIME)];
      if (heartbeatJobId && heartbeatLeaseToken) {
        statements.push(db.prepare(`
          UPDATE agent_jobs
          SET lease_expires_at = datetime('now', '+3 minutes'), updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND lease_token = ? AND lease_owner = ? AND status = 'running'
        `).bind(heartbeatJobId, heartbeatLeaseToken, workerId));
      }
      await db.batch(statements);
      return Response.json({ online: true });
    }
    const jobId = typeof payload.jobId === "string" ? payload.jobId : "";
    const leaseToken = typeof payload.leaseToken === "string" ? payload.leaseToken : "";
    if (!jobId || !leaseToken) return Response.json({ error: "A job and lease token are required." }, { status: 400 });
    const job = await db.prepare(`
      SELECT id, user_id AS userId, activity_id AS activityId, conversation_id AS conversationId,
             kind, attempts, source_message_id AS sourceMessageId
      FROM agent_jobs WHERE id = ? AND lease_token = ? AND status = 'running'
    `).bind(jobId, leaseToken).first<{
      id: string;
      userId: string;
      activityId: string;
      conversationId: string;
      kind: LeasedJob["kind"];
      attempts: number;
      sourceMessageId: string | null;
    }>();
    if (!job) return Response.json({ error: "The job lease is no longer active." }, { status: 409 });

    if (mode === "progress") {
      const progressTitle = typeof payload.title === "string" ? payload.title.trim().slice(0, 120) : "";
      const progressDetail = typeof payload.detail === "string" ? payload.detail.trim().slice(0, 240) : "";
      if (!progressTitle || !progressDetail) return Response.json({ error: "Progress needs a title and detail." }, { status: 400 });
      await db.prepare(`
        UPDATE agent_jobs
        SET progress_title = ?, progress_detail = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND lease_token = ? AND status = 'running'
      `).bind(progressTitle, progressDetail, jobId, leaseToken).run();
      return Response.json({ updated: true });
    }

    if (mode === "complete") {
      const suppliedResponse = typeof payload.response === "string" ? payload.response.trim().slice(0, 8000) : "";
      const response = suppliedResponse;
      const sourceMessage = job.sourceMessageId
        ? await db.prepare("SELECT body FROM conversation_messages WHERE id = ? AND conversation_id = ?")
          .bind(job.sourceMessageId, job.conversationId).first<{ body: string }>()
        : null;
      const workspaceFollowup = job.kind === "user_message"
        && (payload.workspaceFollowup === true || messageRequestsResearch(sourceMessage?.body));
      const usesReplyFirstProtocol = job.kind === "user_message" && typeof payload.workspaceFollowup === "boolean";
      const runtimeSessionId = typeof payload.runtimeSessionId === "string" ? payload.runtimeSessionId.trim().slice(0, 240) : "";
      if (!runtimeSessionId) return Response.json({ error: "A runtime session is required." }, { status: 400 });
      const schedule = await db.prepare(`
        SELECT dpi.duration, dp.plan_date AS planDate, a.title AS activityTitle,
               COALESCE(s.day_timeline_enabled, 0) AS dayTimelineEnabled
        FROM daily_plan_items dpi
        JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
        JOIN activities a ON a.id = dpi.activity_id
        LEFT JOIN settings s ON s.user_id = dp.user_id
        WHERE dpi.activity_id = ? AND dp.user_id = ? AND dpi.removed_at IS NULL
        ORDER BY dp.plan_date DESC
        LIMIT 1
      `).bind(job.activityId, job.userId).first<{ duration: number; planDate: string; activityTitle: string; dayTimelineEnabled: number }>();
      const timelineEnabled = Boolean(schedule?.dayTimelineEnabled);
      const plannedDurationMinutes = timelineEnabled ? schedule?.duration : undefined;
      const workspaceActions = validateWorkspaceActions(usesReplyFirstProtocol ? [] : payload.workspaceActions, Math.max(60, (schedule?.duration ?? 5) * 60));
      const recordActions = validateRecordActions(usesReplyFirstProtocol ? [] : payload.recordActions, schedule?.planDate ?? null).filter((action) => (
        action.op === "remove" || hasUsefulActivityRecordData(action.record, {
          activityTitle: schedule?.activityTitle,
          plannedDurationMinutes,
        })
      ));
      const existingRecords = await readActivityRecords(job.activityId, schedule?.planDate ?? null);
      const availableRecords = new Map<string, ActivityRecordContent>(existingRecords.map((record) => [record.key, record]));
      for (const action of recordActions) {
        if (action.op === "remove") availableRecords.delete(action.recordKey);
        else availableRecords.set(action.record.key, action.record);
      }
      const safeWorkspaceActions = workspaceActions.filter((action) => {
        if (action.op === "remove") return true;
        const component = action.component;
        if (component.type === "timer") return true;
        if (component.type === "countdown") return timelineEnabled || component.durationSource === "fixed";
        if (component.type === "routine") return hasUsefulRoutineComponent(component);
        const record = availableRecords.get(component.recordKey);
        return record?.type === component.type && hasUsefulActivityRecordData(record, {
          activityTitle: schedule?.activityTitle,
          plannedDurationMinutes,
        });
      });
      if (job.kind === "user_message" && !response && !workspaceFollowup && !safeWorkspaceActions.length && !recordActions.length) {
        return Response.json({ error: "A user message requires a Luna response or a workspace follow-up." }, { status: 400 });
      }
      await persistRecordActions({
        userId: job.userId,
        activityId: job.activityId,
        actionId: jobId,
        actions: recordActions,
        sourceMessageId: job.kind === "user_message" || job.kind === "workspace_refresh" ? job.sourceMessageId : null,
        sourceAgentJobId: jobId,
      });
      const workspace = await persistWorkspaceActions({
        userId: job.userId,
        activityId: job.activityId,
        agentJobId: jobId,
        actions: safeWorkspaceActions,
      });
      const hasUsefulWorkspaceContent = workspace.document.components.some((component) => {
        if (component.type === "timer" || component.type === "countdown") return true;
        if (component.type === "routine") return hasUsefulRoutineComponent(component);
        const record = availableRecords.get(component.recordKey);
        return Boolean(record && hasUsefulActivityRecordData(record, {
          activityTitle: schedule?.activityTitle,
          plannedDurationMinutes,
        }));
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
      if (workspaceFollowup) {
        const followupJobId = `agent-job:${safeId(job.userId)}:workspace:${safeId(job.id)}`;
        statements.push(db.prepare(`
          INSERT OR IGNORE INTO agent_jobs
            (id, user_id, activity_id, conversation_id, kind, idempotency_key, source_message_id)
          VALUES (?, ?, ?, ?, 'workspace_refresh', ?, ?)
        `).bind(followupJobId, job.userId, job.activityId, job.conversationId, `workspace-refresh:${job.id}`, job.sourceMessageId));
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
              lease_expires_at = NULL, error = NULL, progress_title = NULL,
              progress_detail = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND lease_token = ?
        `).bind(jobId, leaseToken),
      );
      await db.batch(statements);
      if (job.kind === "activity_setup") {
        await completeActivitySetup({
          activityId: job.activityId,
          messageId,
          hasUsefulWorkspaceContent,
        });
      } else if ((job.kind === "user_message" || job.kind === "workspace_refresh") && hasUsefulWorkspaceContent) {
        await markActivitySetupAnswered(job.activityId);
      }
      return Response.json({ completed: true, messageId, workspaceFollowup, workspace, recordActionsApplied: recordActions.length });
    }

    if (mode === "failure") {
      const error = typeof payload.error === "string" ? payload.error.trim().slice(0, 1000) : "Agent processing failed.";
      const nextStatus = job.attempts >= 5 ? "retryable_failure" : "queued";
      await db.prepare(`
        UPDATE agent_jobs
        SET status = ?, lease_token = NULL, lease_owner = NULL, lease_expires_at = NULL,
            error = ?, progress_title = NULL, progress_detail = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND lease_token = ?
      `).bind(nextStatus, error, jobId, leaseToken).run();
      return Response.json({ completed: false, status: nextStatus });
    }

    return Response.json({ error: "Unsupported job operation." }, { status: 400 });
  } catch (error) {
    return apiFailure(error);
  }
}
