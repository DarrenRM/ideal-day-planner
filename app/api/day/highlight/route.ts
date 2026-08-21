import { getD1 } from "../../../../db";
import { apiFailure, ensureAgentSchema, requestIdentity } from "../../agent-store";

function requestedDate(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export async function GET(request: Request) {
  const userId = requestIdentity(request);
  const date = requestedDate(request);
  if (!userId) return Response.json({ error: "Sign in to see today’s highlights." }, { status: 401 });
  if (!date) return Response.json({ error: "A valid local date is required." }, { status: 400 });

  try {
    await ensureAgentSchema();
    const highlight = await getD1().prepare(`
      SELECT highlight_status AS status, highlight_body AS body,
             highlight_kind AS kind, highlight_revision AS revision
      FROM daily_plans
      WHERE user_id = ? AND plan_date = ?
      LIMIT 1
    `).bind(userId, date).first<{ status: string; body: string | null; kind: string | null; revision: number }>();
    return Response.json({ highlight: highlight ?? { status: "idle", body: null, kind: null, revision: 0 } });
  } catch (error) {
    return apiFailure(error);
  }
}
