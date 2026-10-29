import { getD1 } from "../../../db";
import { apiFailure, requestIdentity } from "../agent-store";
import { localDateInTimeZone } from "../../schedule-model";
import { resolveTimeZone } from "../../time-zone";
import { historyDates, validHistoryDate } from "../../track-record-model";
import { projectHistoryEntry, readHistoryDetail, readTrackRecord } from "../track-record-store";
import { HistoryConflict, readHistoryRecords, saveHistoryCorrection } from "../history-correction-store";
import type { HistoryCorrection } from "../../history-edit-model";
import { datedEntries } from "../../history-edit-model";

export async function GET(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to view your track record." }, { status: 401 });
  try {
    const db = getD1();
    const params = new URL(request.url).searchParams;
    const setting = await db.prepare("SELECT time_zone AS timeZone FROM settings WHERE user_id = ?").bind(userId).first<{ timeZone: string }>();
    const today = localDateInTimeZone(new Date(), resolveTimeZone(setting?.timeZone));
    const activityKey = params.get("activityId") || null;
    const activity = activityKey ? await db.prepare("SELECT id FROM activities WHERE (id = ? OR client_key = ?) AND user_id = ?").bind(activityKey, activityKey, userId).first<{ id: string }>() : null;
    const activityId = activity?.id ?? null;
    if (activityKey && !activity) {
      return Response.json({ error: "Activity not found." }, { status: 404 });
    }
    const headers = { "Cache-Control": "private, no-store" };
    const date = params.get("date");
    if (date !== null) {
      if (!validHistoryDate(date) || date > today) return Response.json({ error: "Choose today or a past date." }, { status: 400 });
      const detail = await readHistoryDetail(db, userId, date, activityId);
      const records = activityId ? await readHistoryRecords(db, userId, activityId, date) : [];
      const correction = await db.prepare("SELECT MAX(created_at) AS at FROM schedule_action_events WHERE user_id = ? AND action_type = 'correct_history' AND json_extract(action_json, '$.request.date') = ? AND (? IS NULL OR json_extract(action_json, '$.request.activityId') = ?)").bind(userId, date, activityId, activityId).first<{ at: string | null }>();
      const entries = activityId ? records.flatMap((record) => datedEntries(record.type, record.data, date).map((entry) => projectHistoryEntry({ recordId: record.id, activityId, activityTitle: detail.occurrences[0]?.title || "Activity", title: record.title, type: record.type, payload: JSON.stringify(record.data), entry: JSON.stringify(entry), date }))) : detail.entries;
      const retained = activityId ? detail.entries.filter((entry) => !records.some((record) => entry.id.startsWith(`${record.id}:`))) : [];
      return Response.json({ ...detail, entries: [...entries, ...retained], activityId, records, correctedAt: correction?.at ?? null }, { headers });
    }
    const start = params.get("start") || `${today.slice(0, 7)}-01`;
    const requestedEnd = params.get("end") || today;
    if (!historyDates(start, requestedEnd).length || start > today) return Response.json({ error: "Choose a date range of up to one year starting today or earlier." }, { status: 400 });
    const end = requestedEnd > today ? today : requestedEnd;
    const [overview, activityOptions] = await Promise.all([
      readTrackRecord(db, userId, { start, end, activityId }, today),
      db.prepare("SELECT id, title, category FROM activities WHERE user_id = ? ORDER BY title").bind(userId).all<{ id: string; title: string; category: string }>(),
    ]);
    return Response.json({ ...overview, activityId, activityOptions: activityOptions.results }, { headers });
  } catch (error) { return apiFailure(error); }
}

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to correct your history." }, { status: 401 });
  try {
    const input = await request.json() as HistoryCorrection;
    const db = getD1();
    const setting = await db.prepare("SELECT time_zone AS timeZone FROM settings WHERE user_id = ?").bind(userId).first<{ timeZone: string }>();
    const today = localDateInTimeZone(new Date(), resolveTimeZone(setting?.timeZone));
    if (!validHistoryDate(input.date) || input.date > today) return Response.json({ error: "Choose today or a past date." }, { status: 400 });
    if (!await db.prepare("SELECT id FROM activities WHERE id = ? AND user_id = ?").bind(input.activityId, userId).first()) return Response.json({ error: "Activity not found." }, { status: 404 });
    return Response.json(await saveHistoryCorrection(db, userId, input), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof HistoryConflict) return Response.json({ error: error.message }, { status: 409 });
    return apiFailure(error);
  }
}
