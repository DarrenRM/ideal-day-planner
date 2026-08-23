import { getD1 } from "../../../db";
import { localDateInTimeZone } from "../../schedule-model";
import { apiFailure, ensureAgentSchema, requestIdentity } from "../agent-store";
import { updateCaptureTiming } from "../capture-service";

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to update that item." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const captureId = typeof payload.captureId === "string" ? payload.captureId.trim().slice(0, 240) : "";
    const timing = payload.timing === "today" || payload.timing === "tomorrow" || payload.timing === "later" ? payload.timing : null;
    if (!captureId || !timing) return Response.json({ error: "Choose when you want to handle this." }, { status: 400 });
    await ensureAgentSchema();
    const setting = await getD1().prepare("SELECT time_zone AS timeZone FROM settings WHERE user_id = ?")
      .bind(userId).first<{ timeZone: string | null }>();
    const localDate = localDateInTimeZone(new Date(), setting?.timeZone || "America/Phoenix");
    const capture = await updateCaptureTiming(userId, captureId, timing, localDate);
    return Response.json({ capture });
  } catch (error) {
    return apiFailure(error);
  }
}
