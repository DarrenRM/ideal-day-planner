import { getD1 } from "../../../db";
import { apiFailure, requestIdentity } from "../agent-store";
import { localDateInTimeZone } from "../../schedule-model";
import { historyDates, validHistoryDate } from "../../track-record-model";
import { readHistoryDetail, readTrackRecord } from "../track-record-store";

export async function GET(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to view your track record." }, { status: 401 });
  try {
    const db = getD1();
    const params = new URL(request.url).searchParams;
    const setting = await db.prepare("SELECT time_zone AS timeZone FROM settings WHERE user_id = ?").bind(userId).first<{ timeZone: string }>();
    const today = localDateInTimeZone(new Date(), setting?.timeZone || "America/Phoenix");
    const activityId = params.get("activityId") || null;
    if (activityId && !await db.prepare("SELECT id FROM activities WHERE id = ? AND user_id = ?").bind(activityId, userId).first()) {
      return Response.json({ error: "Activity not found." }, { status: 404 });
    }
    const headers = { "Cache-Control": "private, no-store" };
    const date = params.get("date");
    if (date !== null) {
      if (!validHistoryDate(date) || date > today) return Response.json({ error: "Choose today or a past date." }, { status: 400 });
      return Response.json(await readHistoryDetail(db, userId, date, activityId), { headers });
    }
    const start = params.get("start") || `${today.slice(0, 7)}-01`;
    const requestedEnd = params.get("end") || today;
    if (!historyDates(start, requestedEnd).length || start > today) return Response.json({ error: "Choose a date range of up to one year starting today or earlier." }, { status: 400 });
    const end = requestedEnd > today ? today : requestedEnd;
    const [overview, activityOptions] = await Promise.all([
      readTrackRecord(db, userId, { start, end, activityId }, today),
      db.prepare("SELECT id, title, category FROM activities WHERE user_id = ? ORDER BY title").bind(userId).all<{ id: string; title: string; category: string }>(),
    ]);
    return Response.json({ ...overview, activityOptions: activityOptions.results }, { headers });
  } catch (error) { return apiFailure(error); }
}
