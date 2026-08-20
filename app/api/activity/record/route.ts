import { applyUserRecordMutation, apiFailure, ensureAgentSchema, findActivity, requestIdentity } from "../../agent-store";

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to update this activity." }, { status: 401 });

  try {
    const payload = await request.json() as Record<string, unknown>;
    const activityKey = typeof payload.activityId === "string" ? payload.activityId.trim().slice(0, 160) : "";
    const recordKey = typeof payload.recordKey === "string" ? payload.recordKey.trim().slice(0, 80) : "";
    const operation = typeof payload.operation === "string" ? payload.operation.trim().slice(0, 80) : "";
    const actionId = typeof payload.actionId === "string" ? payload.actionId.trim().slice(0, 160) : "";
    const date = validDate(payload.date);
    const actionPayload = payload.payload && typeof payload.payload === "object" && !Array.isArray(payload.payload)
      ? payload.payload as Record<string, unknown>
      : {};
    if (!activityKey || !recordKey || !operation || !actionId) {
      return Response.json({ error: "The activity action is incomplete." }, { status: 400 });
    }
    await ensureAgentSchema();
    const activity = await findActivity(userId, activityKey);
    if (!activity) return Response.json({ error: "Activity not found." }, { status: 404 });
    const records = await applyUserRecordMutation({
      userId,
      activityId: activity.id,
      recordKey,
      operation,
      actionId,
      payload: actionPayload,
      planDate: date,
    });
    return Response.json({ records });
  } catch (error) {
    return apiFailure(error);
  }
}
