import { getD1 } from "../../../db";
import {
  apiFailure,
  ensureAgentSchema,
  ensureConversation,
  findActivity,
  queueActivitySetup,
  readConversationState,
  requestIdentity,
  safeId,
} from "../agent-store";

function clientActivityKey(request: Request) {
  const value = new URL(request.url).searchParams.get("activityId")?.trim() ?? "";
  return value.slice(0, 160);
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
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
  if (!clientKey) return Response.json({ error: "An activity is required." }, { status: 400 });

  try {
    await ensureAgentSchema();
    const activity = await findActivity(userId, clientKey);
    if (!activity) return Response.json({ error: "Activity not found." }, { status: 404 });
    const conversationId = await ensureConversation(userId, activity);
    return Response.json({ conversationId, ...await readConversationState(conversationId, date) });
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

    if (mode === "open") {
      const clientVisitId = typeof payload.visitId === "string" ? payload.visitId.trim().slice(0, 160) : "";
      const date = validDate(payload.date);
      const activityContext = safeActivityContext(payload.activityContext);
      if (!clientVisitId || !date) return Response.json({ error: "A visit ID and local date are required." }, { status: 400 });
      const visitId = `visit:${safeId(userId)}:${safeId(clientVisitId)}`;
      await db.prepare(`
        INSERT OR IGNORE INTO activity_visits
          (id, user_id, activity_id, conversation_id, client_visit_id, context_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(visitId, userId, activity.id, conversationId, clientVisitId, activityContext ? JSON.stringify(activityContext) : null).run();
      await queueActivitySetup(userId, activity);
      return Response.json({ conversationId, visitId, ...await readConversationState(conversationId, date) }, { status: 202 });
    }

    if (mode === "message") {
      const body = typeof payload.body === "string" ? payload.body.trim().slice(0, 4000) : "";
      const clientMessageId = typeof payload.messageId === "string" ? payload.messageId.trim().slice(0, 160) : "";
      const date = validDate(payload.date);
      if (!body || !clientMessageId) return Response.json({ error: "A message and message ID are required." }, { status: 400 });
      const messageId = `message:${safeId(userId)}:${safeId(clientMessageId)}`;
      const idempotencyKey = `user-message:${messageId}`;
      const jobId = `agent-job:${safeId(userId)}:message:${safeId(clientMessageId)}`;
      await db.batch([
        db.prepare(`
          INSERT OR IGNORE INTO conversation_messages
            (id, conversation_id, role, body, source)
          VALUES (?, ?, 'user', ?, 'user')
        `).bind(messageId, conversationId, body),
        db.prepare(`
          INSERT OR IGNORE INTO agent_jobs
            (id, user_id, activity_id, conversation_id, kind, idempotency_key, source_message_id)
          VALUES (?, ?, ?, ?, 'user_message', ?, ?)
        `).bind(jobId, userId, activity.id, conversationId, idempotencyKey, messageId),
      ]);
      return Response.json({ conversationId, ...await readConversationState(conversationId, date) }, { status: 202 });
    }

    return Response.json({ error: "Unsupported activity operation." }, { status: 400 });
  } catch (error) {
    return apiFailure(error);
  }
}
