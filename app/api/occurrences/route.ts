import { apiFailure, requestIdentity } from "../agent-store";
import { applyOccurrenceAction } from "../schedule-actions";

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to change your day." }, { status: 401 });
  try {
    const payload = await request.json() as { action?: unknown; actions?: unknown };
    if (Array.isArray(payload.actions)) {
      if (!payload.actions.length || payload.actions.length > 200) return Response.json({ error: "A bounded list of day changes is required." }, { status: 400 });
      const results = [];
      for (const action of payload.actions) results.push(await applyOccurrenceAction(userId, action, { source: "user", actor: userId }));
      return Response.json({ results });
    }
    const result = await applyOccurrenceAction(userId, payload.action, { source: "user", actor: userId });
    return Response.json(result);
  } catch (error) {
    return apiFailure(error);
  }
}
