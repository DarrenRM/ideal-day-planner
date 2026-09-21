import { historyDates, historyRangeForMessage, type HistoryActivity, type HistoryCounts, type HistoryDay, type HistoryDetail, type HistoryEntry, type HistoryOccurrence, type TrackRecord } from "../track-record-model.ts";

type HistoryDatabase = { prepare(sql: string): { bind(...values: (string | number | null)[]): { all<T>(): Promise<{ results: T[] }>; first<T>(): Promise<T | null> } } };
type Range = { start: string; end: string; activityId?: string | null };

// Dated activation is persisted by the resolver, including Keep it going.
// Never re-run that resolver or read current patterns to reconstruct history.
const selected = "dpi.removed_at IS NULL AND (dpi.plan_role = 'essential' OR dpi.activated_at IS NOT NULL OR dpi.completed_at IS NOT NULL OR dpi.skipped_at IS NOT NULL)";
const counts = `COUNT(dpi.id) AS planned,
  SUM(CASE WHEN dpi.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN dpi.skipped_at IS NOT NULL AND dpi.completed_at IS NULL THEN 1 ELSE 0 END) AS skipped`;
const recordEntries = `FROM activity_records r JOIN activities a ON a.id = r.activity_id AND a.user_id = r.user_id
  JOIN json_each(CASE WHEN json_valid(r.payload_json) THEN r.payload_json ELSE '{}' END,
    CASE r.record_type WHEN 'strength_session' THEN '$.sessions' WHEN 'recurring_step' THEN '$.completedDates' WHEN 'session_choice' THEN '$.selections' ELSE '$.entries' END) e
  WHERE r.user_id = ? AND (? IS NULL OR r.activity_id = ? OR EXISTS (
    SELECT 1 FROM record_relations rr WHERE rr.record_id = r.id AND rr.user_id = r.user_id AND rr.activity_id = ? AND rr.relation_type = 'history'
      AND (CASE WHEN r.record_type = 'recurring_step' THEN e.value ELSE json_extract(e.value, '$.date') END) <= date(rr.created_at)))
    AND r.record_type IN ('session_log', 'strength_session', 'daily_selection', 'meal_log', 'recurring_step', 'activity_event', 'adherence', 'session_choice')`;
const entryDate = "CASE WHEN r.record_type = 'recurring_step' THEN e.value ELSE json_extract(e.value, '$.date') END";
function args(userId: string, range: Range) { return [userId, range.activityId ?? null, range.activityId ?? null, range.start, range.end]; }
function entryArgs(userId: string, range: Range) { return [userId, range.activityId ?? null, range.activityId ?? null, range.activityId ?? null, range.start, range.end]; }
function normalizeCounts(row?: Partial<HistoryCounts>): HistoryCounts {
  return { planned: Number(row?.planned ?? 0), completed: Number(row?.completed ?? 0), skipped: Number(row?.skipped ?? 0) };
}

export async function readTrackRecord(db: HistoryDatabase, userId: string, range: Range, today: string): Promise<TrackRecord> {
  if (!historyDates(range.start, range.end).length || range.end > today) throw new Error("Choose a date range of up to one year ending today or earlier.");
  const [days, activities, entryDays, first] = await Promise.all([
    db.prepare(`SELECT dp.plan_date AS date, ${counts}
      FROM daily_plans dp LEFT JOIN daily_plan_items dpi ON dpi.daily_plan_id = dp.id AND ${selected}
        AND (? IS NULL OR dpi.activity_id = ?)
      WHERE dp.user_id = ? AND dp.plan_date BETWEEN ? AND ?
      GROUP BY dp.plan_date ORDER BY dp.plan_date`).bind(range.activityId ?? null, range.activityId ?? null, userId, range.start, range.end).all<HistoryDay>(),
    db.prepare(`SELECT dpi.activity_id AS id, a.title, a.category, ${counts},
        MAX(CASE WHEN dpi.completed_at IS NOT NULL THEN dp.plan_date END) AS lastCompletedDate
      FROM daily_plans dp JOIN daily_plan_items dpi ON dpi.daily_plan_id = dp.id AND ${selected}
      JOIN activities a ON a.id = dpi.activity_id AND a.user_id = dp.user_id
      WHERE dp.user_id = ? AND (? IS NULL OR dpi.activity_id = ?) AND dp.plan_date BETWEEN ? AND ?
      GROUP BY dpi.activity_id ORDER BY a.title`).bind(...args(userId, range)).all<HistoryActivity>(),
    db.prepare(`SELECT ${entryDate} AS date, COUNT(*) AS entries ${recordEntries}
      AND ${entryDate} BETWEEN ? AND ? GROUP BY 1`).bind(...entryArgs(userId, range)).all<{ date: string; entries: number }>(),
    db.prepare("SELECT MIN(plan_date) AS date FROM daily_plans WHERE user_id = ?").bind(userId).first<{ date: string | null }>(),
  ]);
  const saved = new Map(days.results.map((day) => [day.date, day]));
  const entries = new Map(entryDays.results.map((day) => [day.date, day.entries]));
  const calendar = historyDates(range.start, range.end).map((date) => ({ date, known: saved.has(date), entries: entries.get(date) ?? 0, ...normalizeCounts(saved.get(date)) }));
  const totals = calendar.reduce((sum, day) => ({ planned: sum.planned + day.planned, completed: sum.completed + day.completed, skipped: sum.skipped + day.skipped }), normalizeCounts());
  return { start: range.start, end: range.end, today, days: calendar, activities: activities.results.map((activity) => ({ ...activity, ...normalizeCounts(activity) })), totals, firstSavedDate: first?.date ?? null };
}

type EntryRow = { recordId: string; activityId: string; activityTitle: string; title: string; type: string; payload: string; entry: string; date: string };
type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const objects = (value: unknown): JsonObject[] => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";

export function projectHistoryEntry(row: EntryRow): HistoryEntry {
  const data = object(JSON.parse(row.payload));
  const entry = row.type === "recurring_step" ? {} : object(JSON.parse(row.entry));
  let title = row.title;
  let lines: string[] = [];
  if (row.type === "strength_session") {
    title = text(entry.workoutTitle) || title;
    lines = objects(entry.exercises).flatMap((exercise) => objects(exercise.sets).map((set) => `${text(exercise.name)} · Set ${text(set.ordinal)}: ${text(set.reps)} reps${set.load ? ` × ${text(set.load)}` : ""}${set.type && set.type !== "working" ? ` (${text(set.type)})` : ""}${set.rir != null ? ` · ${text(set.rir)} reps in reserve` : ""}`));
    if (entry.note) lines.push(text(entry.note));
  } else if (row.type === "daily_selection") {
    const ids = Array.isArray(entry.itemIds) ? entry.itemIds : [];
    const items = [...objects(entry.itemSnapshots), ...objects(data.items)];
    lines = ids.map((id) => {
      const item = items.find((candidate) => candidate.id === id);
      const parent = item?.parentItemId ? items.find((candidate) => candidate.id === item.parentItemId) : null;
      const count = object(entry.counts)[text(id)];
      return `${parent ? `${text(parent.label)} — ` : ""}${text(item?.label) || "Recorded item"}${count ? ` × ${text(count)}` : ""}`;
    });
    if (!ids.length && entry.recorded === true) lines = ["No selections recorded for this day"];
  } else if (row.type === "session_log") {
    const option = object(data.defaultOption);
    if (option.id === entry.optionId && option.label) title = text(option.label);
    lines = objects(entry.values).map((pair) => {
      const field = objects(data.fields).find((candidate) => candidate.id === pair.field);
      return `${text(field?.label) || "Recorded value"}: ${text(pair.value)}${field?.unit ? ` ${text(field.unit)}` : ""}`;
    });
    if (entry.note) lines.push(text(entry.note));
  } else if (row.type === "meal_log") {
    title = text(entry.title) || title;
    lines = [text(entry.detail), entry.quantity ? `Quantity: ${text(entry.quantity)}` : "", entry.servings ? `Servings: ${text(entry.servings)}` : "", entry.storage ? `Storage: ${text(entry.storage)}` : "", ...objects(entry.ingredients).map((ingredient) => `${text(ingredient.label)}${ingredient.amount ? ` · ${text(ingredient.amount)}` : ""}`)].filter(Boolean);
  } else if (row.type === "adherence") {
    lines = [entry.completed ? "Recorded use" : "Not used", text(entry.note)].filter(Boolean);
  } else if (row.type === "session_choice") {
    lines = [text(objects(data.options).find((option) => option.id === entry.optionId)?.label) || "Recorded option"];
  } else if (row.type === "recurring_step") {
    title = text(data.label) || title;
    lines = ["Recorded use"];
  } else {
    title = text(entry.label) || title;
    lines = [text(entry.detail), text(entry.note)].filter(Boolean);
  }
  return { id: `${row.recordId}:${text(entry.id) || row.date}`, activityId: row.activityId, activityTitle: row.activityTitle, date: row.date, title, kind: row.type, lines };
}

export async function readHistoryEntries(db: HistoryDatabase, userId: string, range: Range, limit = 2000) {
  const rows = await db.prepare(`SELECT r.id AS recordId, r.activity_id AS activityId, a.title AS activityTitle,
    r.title, r.record_type AS type,
    json_object('fields', json_extract(r.payload_json, '$.fields'), 'items', json_extract(r.payload_json, '$.items'),
      'label', json_extract(r.payload_json, '$.label'), 'options', json_extract(r.payload_json, '$.options'), 'defaultOption', json_extract(r.payload_json, '$.defaultOption')) AS payload,
    e.value AS entry, ${entryDate} AS date
    ${recordEntries} AND ${entryDate} BETWEEN ? AND ? ORDER BY date DESC, r.id, e.key LIMIT ?`)
    .bind(...entryArgs(userId, range), limit + 1).all<EntryRow>();
  return { entries: rows.results.slice(0, limit).map(projectHistoryEntry), hasMore: rows.results.length > limit };
}

export async function readHistoryDetail(db: HistoryDatabase, userId: string, date: string, activityId?: string | null): Promise<HistoryDetail & { hasMoreEntries: boolean }> {
  const [plan, occurrences, logs] = await Promise.all([
    db.prepare("SELECT id FROM daily_plans WHERE user_id = ? AND plan_date = ?").bind(userId, date).first<{ id: string }>(),
    db.prepare(`SELECT dpi.id, dpi.revision, dpi.activity_id AS activityId,
      COALESCE(NULLIF(dpi.display_label_override, ''), dpi.title) AS title,
      dpi.variant_name_snapshot AS variantName, dpi.category, dpi.completed_at AS completedAt, dpi.skipped_at AS skippedAt,
      dpi.duration AS plannedMinutes, ar.actual_elapsed_seconds AS actualSeconds
      FROM daily_plans dp JOIN daily_plan_items dpi ON dpi.daily_plan_id = dp.id AND ${selected}
      LEFT JOIN activity_runs ar ON ar.daily_plan_item_id = dpi.id AND ar.user_id = dp.user_id
      WHERE dp.user_id = ? AND dp.plan_date = ? AND (? IS NULL OR dpi.activity_id = ?)
      ORDER BY dpi.position, dpi.id`).bind(userId, date, activityId ?? null, activityId ?? null).all<HistoryOccurrence>(),
    readHistoryEntries(db, userId, { start: date, end: date, activityId }),
  ]);
  return { date, known: Boolean(plan), occurrences: occurrences.results, entries: logs.entries, hasMoreEntries: logs.hasMore };
}

export async function readAgentTrackRecord(db: HistoryDatabase, userId: string, today: string, message: string, activityId?: string | null) {
  const range = historyRangeForMessage(message, today);
  const overview = await readTrackRecord(db, userId, { ...range, activityId }, today);
  const logs = await readHistoryEntries(db, userId, { ...range, activityId }, 12);
  return {
    start: overview.start, end: overview.end, interpretation: range.interpretation,
    scope: activityId || "all owned activities", totals: overview.totals,
    knownDays: overview.days.filter((day) => day.known).length, missingDays: overview.days.filter((day) => !day.known).length,
    activities: overview.activities,
    days: overview.days.filter((day) => day.known || day.entries),
    recentEntries: logs.entries, moreEntriesAvailable: logs.hasMore,
    rules: "Saved occurrences only; no reconstruction from current schedules. Missing days are unknown, not failures. Skips stay in the denominator. Unchosen extras are excluded. Completion does not imply every product was used or a measured result. Entry excerpts are bounded and cannot establish absence, totals, personal bests or causal effects. Counts include today in progress. Use the stated date range, and disclose unsupported date interpretations. The Track record UI shows these same saved facts.",
  };
}
