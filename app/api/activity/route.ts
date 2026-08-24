import { getD1 } from "../../../db";
import {
  apiFailure,
  ensureAgentSchema,
  ensureConversation,
  findActivity,
  markConversationArtifactViewed,
  queueDueFollowUps,
  readConversationState,
  retryFailedConversationJob,
  updateActivityFollowUp,
  requestIdentity,
  safeId,
} from "../agent-store";
import { activityMessageJobStatements } from "../activity-message-jobs";

function clientActivityKey(request: Request) {
  const value = new URL(request.url).searchParams.get("activityId")?.trim() ?? "";
  return value.slice(0, 160);
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function occurrenceContext(userId: string, occurrenceId: unknown, date: string | null, activityId: string) {
  const id = typeof occurrenceId === "string" ? occurrenceId.trim().slice(0, 240) : "";
  if (!id || !date) return null;
  return getD1().prepare(`
    SELECT dpi.id AS occurrenceId, dpi.activity_variant_id AS activityVariantId,
           dpi.variant_name_snapshot AS variantName,
           dpi.display_label_override AS displayLabel, dpi.duration,
           dpi.schedule_pattern_id AS schedulePatternId,
           dpi.schedule_pattern_step_id AS schedulePatternStepId,
           dp.plan_date AS planDate
    FROM daily_plan_items dpi
    JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
    WHERE dpi.id = ? AND dpi.activity_id = ? AND dp.user_id = ? AND dp.plan_date = ?
    LIMIT 1
  `).bind(id, activityId, userId, date).first<{
    occurrenceId: string;
    activityVariantId: string | null;
    variantName: string | null;
    displayLabel: string | null;
    duration: number;
    schedulePatternId: string | null;
    schedulePatternStepId: string | null;
    planDate: string;
  }>();
}

function safeActivityContext(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const steps = Array.isArray(source.steps)
    ? source.steps.filter((step): step is string => typeof step === "string").slice(0, 12).map((step) => step.slice(0, 300))
    : [];
  const facts = Array.isArray(source.facts)
    ? source.facts.flatMap((fact) => {
        if (!fact || typeof fact !== "object") return [];
        const entry = fact as Record<string, unknown>;
        if (typeof entry.label !== "string" || typeof entry.value !== "string") return [];
        return [{ label: entry.label.slice(0, 100), value: entry.value.slice(0, 300) }];
      }).slice(0, 20)
    : [];
  const openLoop = typeof source.openLoop === "string" ? source.openLoop.slice(0, 500) : "";
  return steps.length || facts.length || openLoop ? { steps, facts, openLoop } : null;
}

export async function GET(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to load this conversation." }, { status: 401 });
  const clientKey = clientActivityKey(request);
  const date = validDate(new URL(request.url).searchParams.get("date"));
  const occurrenceId = new URL(request.url).searchParams.get("occurrenceId");
  if (!clientKey) return Response.json({ error: "An activity is required." }, { status: 400 });

  try {
    await ensureAgentSchema();
    const activity = await findActivity(userId, clientKey);
    if (!activity) return Response.json({ error: "Activity not found." }, { status: 404 });
    const occurrence = await occurrenceContext(userId, occurrenceId, date, activity.id);
    const conversationId = await ensureConversation(userId, activity);
    return Response.json({ conversationId, occurrence, ...await readConversationState(conversationId, date, occurrence?.activityVariantId) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to use Luna." }, { status: 401 });

  try {
    const payload = await request.json() as Record<string, unknown>;
    const mode = payload.mode;
    const clientKey = typeof payload.activityId === "string" ? payload.activityId.trim().slice(0, 160) : "";
    if (!clientKey) return Response.json({ error: "An activity is required." }, { status: 400 });
    await ensureAgentSchema();
    const activity = await findActivity(userId, clientKey);
    if (!activity) return Response.json({ error: "Activity not found." }, { status: 404 });
    const conversationId = await ensureConversation(userId, activity);
    const db = getD1();
    const requestDate = validDate(payload.date);
    const occurrence = await occurrenceContext(userId, payload.occurrenceId, requestDate, activity.id);

    if (mode === "view_artifact") {
      const artifactId = typeof payload.artifactId === "string" ? payload.artifactId.trim().slice(0, 240) : "";
      if (!artifactId || !await markConversationArtifactViewed({ userId, conversationId, activityId: activity.id, artifactId })) {
        return Response.json({ error: "That update could not be found." }, { status: 404 });
      }
      return Response.json({ viewed: true });
    }

    if (mode === "open") {
      const clientVisitId = typeof payload.visitId === "string" ? payload.visitId.trim().slice(0, 160) : "";
      const date = requestDate;
      const activityContext = safeActivityContext(payload.activityContext);
      if (!clientVisitId || !date) return Response.json({ error: "A visit ID and local date are required." }, { status: 400 });
      const visitId = `visit:${safeId(userId)}:${safeId(clientVisitId)}`;
      await db.prepare(`
        INSERT OR IGNORE INTO activity_visits
          (id, user_id, activity_id, conversation_id, client_visit_id, context_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(visitId, userId, activity.id, conversationId, clientVisitId, JSON.stringify({ occurrence, activityContext })).run();
      await queueDueFollowUps(userId, date, activity.id);
      return Response.json({ conversationId, visitId, occurrence, ...await readConversationState(conversationId, date, occurrence?.activityVariantId) }, { status: 202 });
    }

    if (mode === "retry_job") {
      const jobId = typeof payload.jobId === "string" ? payload.jobId.trim().slice(0, 240) : "";
      if (!jobId || !await retryFailedConversationJob(userId, conversationId, jobId)) {
        return Response.json({ error: "That update is no longer available to retry." }, { status: 409 });
      }
      return Response.json({ conversationId, occurrence, ...await readConversationState(conversationId, requestDate, occurrence?.activityVariantId) }, { status: 202 });
    }

    if (mode === "follow_up") {
      const followUpId = typeof payload.followUpId === "string" ? payload.followUpId.trim().slice(0, 240) : "";
      const operation = payload.operation === "reschedule" ? "reschedule" : payload.operation === "dismiss" ? "dismiss" : null;
      if (!followUpId || !operation) return Response.json({ error: "Choose a follow-up action." }, { status: 400 });
      await updateActivityFollowUp({
        userId,
        activityId: activity.id,
        followUpId,
        operation,
        dueDate: validDate(payload.dueDate),
      });
      return Response.json({ conversationId, occurrence, ...await readConversationState(conversationId, requestDate, occurrence?.activityVariantId) });
    }

    if (mode === "message") {
      const body = typeof payload.body === "string" ? payload.body.trim().slice(0, 4000) : "";
      const clientMessageId = typeof payload.messageId === "string" ? payload.messageId.trim().slice(0, 160) : "";
      const date = requestDate;
      if (!body || !clientMessageId) return Response.json({ error: "A message and message ID are required." }, { status: 400 });
      const messageId = `message:${safeId(userId)}:${safeId(clientMessageId)}`;
      await db.batch([
        db.prepare(`
          INSERT OR IGNORE INTO conversation_messages
            (id, conversation_id, role, body, source)
          VALUES (?, ?, 'user', ?, 'user')
        `).bind(messageId, conversationId, body),
        ...activityMessageJobStatements({
          userId, activityId: activity.id, activityVariantId: occurrence?.activityVariantId,
          conversationId, sourceMessageId: messageId, clientMessageId, body, activityTitle: activity.title,
        }),
      ]);
      return Response.json({ conversationId, occurrence, ...await readConversationState(conversationId, date, occurrence?.activityVariantId) }, { status: 202 });
    }

    return Response.json({ error: "Unsupported activity operation." }, { status: 400 });
  } catch (error) {
    return apiFailure(error);
  }
}
