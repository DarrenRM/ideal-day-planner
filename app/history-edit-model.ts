import { validateRecordActions, type ActivityRecordType } from "./activity-record-model.ts";
import { validHistoryDate } from "./track-record-model.ts";

export type Json = Record<string, unknown>;
export const obj = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
export const rows = (value: unknown): Json[] => Array.isArray(value) ? value.map(obj) : [];
export const str = (value: unknown) => typeof value === "string" ? value : "";
export const historyTypes = ["daily_selection", "meal_log", "session_log", "strength_session", "recurring_step", "adherence", "session_choice", "activity_event"];
export const entryField = (type: string) => type === "strength_session" ? "sessions" : type === "session_choice" ? "selections" : type === "recurring_step" ? "completedDates" : "entries";
export function preserveCorrectedDates(type: string, current: Json, incoming: Json, dates: string[]): Json {
  const field = entryField(type), protectedDates = new Set(dates);
  if (type === "recurring_step") return { ...incoming, completedDates: [...new Set([...(Array.isArray(incoming.completedDates) ? incoming.completedDates.filter((date) => !protectedDates.has(String(date))) : []), ...(Array.isArray(current.completedDates) ? current.completedDates.filter((date) => protectedDates.has(String(date))) : [])])].sort() };
  return { ...incoming, [field]: [...rows(incoming[field]).filter((entry) => !protectedDates.has(str(entry.date))), ...rows(current[field]).filter((entry) => protectedDates.has(str(entry.date)))].sort((a, b) => str(a.date).localeCompare(str(b.date))) };
}
export type HistoryRecord = { id: string; key: string; activityId: string; title: string; type: string; version: number; variantId: string | null; archived: boolean; subjectKey: string | null; data: Json };
export type RecordCorrection = { id: string; version: number; entries: Json[] };
export type StatusCorrection = { id: string; revision: number; status: "completed" | "skipped" | "unmarked" };
export type HistoryCorrection = { actionId: string; date: string; activityId: string; records: RecordCorrection[]; statuses: StatusCorrection[]; undoOf?: string; backfill?: boolean };

export function datedEntries(type: string, data: Json, date: string): Json[] {
  if (type === "recurring_step") return Array.isArray(data.completedDates) && data.completedDates.includes(date) ? [{ id: date, date, completed: true }] : [];
  return rows(data[entryField(type)]).filter((entry) => entry.date === date);
}

export function historyRecordSummary(record: HistoryRecord, date: string) {
  const entries = datedEntries(record.type, record.data, date);
  if (!entries.length) return "";
  if (record.type === "daily_selection") {
    const entry = entries[0], ids = Array.isArray(entry.itemIds) ? entry.itemIds : [];
    if (!ids.length) return "None used";
    const items = [...new Map([...rows(record.data.items), ...rows(entry.itemSnapshots)].map((item) => [item.id, item])).values()];
    const modes = items.filter((item) => ids.includes(item.id) && item.parentItemId);
    const products = ids.length - modes.length;
    return [products ? `${products} ${record.data.kind === "routine" ? "product" : "supplement"}${products === 1 ? "" : "s"}` : "", ...modes.map((item) => `${str(item.label)} ×${obj(entry.counts)[str(item.id)] ?? 1}`)].filter(Boolean).join(" · ");
  }
  if (record.type === "meal_log") return entries.map((entry) => str(entry.title)).join(" · ");
  if (record.type === "strength_session") return entries.map((entry) => {
    const count = rows(entry.exercises).reduce((sum, exercise) => sum + rows(exercise.sets).length, 0);
    return `${str(entry.workoutTitle) || "Workout"} · ${count} ${count === 1 ? "set" : "sets"}`;
  }).join(" · ");
  return "";
}

// Validate only the edited date. Never round-trip the rest of a lifetime's
// history through the bounded agent-input validator.
export function correctDatedRecord(record: HistoryRecord, date: string, entries: Json[]): Json {
  if (!validHistoryDate(date) || !historyTypes.includes(record.type) || entries.length > 50) throw new Error("Invalid history correction.");
  if (entries.some((entry) => entry.date !== date || !str(entry.id)) || new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error("Every entry must keep a unique identity and the selected date.");
  const field = entryField(record.type);
  const data = record.data;
  if (record.type === "recurring_step") {
    if (entries.length > 1) throw new Error("Choose one use state for this day.");
    return { ...data, completedDates: [...new Set([...(Array.isArray(data.completedDates) ? data.completedDates.filter((value) => value !== date) : []), ...(entries[0]?.completed ? [date] : [])])].sort() };
  }
  let validated: Json[];
  if (record.type === "daily_selection") {
    if (entries.length > 1) throw new Error("This routine has one selection per day.");
    const old = datedEntries(record.type, data, date)[0];
    const roster = new Map([...rows(data.items), ...rows(old?.itemSnapshots)].map((item) => [item.id, item]));
    validated = entries.map((entry) => {
      if (!Array.isArray(entry.itemIds) || entry.itemIds.length > 100 || entry.itemIds.some((id) => !roster.has(id))) throw new Error("A selected item is no longer available. Reload this day.");
      const ids = [...new Set(entry.itemIds)];
      const counts: Record<string, number> = {};
      for (const id of ids) {
        const count = obj(entry.counts)[String(id)] ?? 1;
        if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 9 || (!roster.get(id)?.allowMultiple && count !== 1)) throw new Error("Choose a valid recorded count.");
        if (Number(count) > 1) counts[String(id)] = Number(count);
      }
      const snapshotIds = new Set([...ids, ...ids.map((id) => roster.get(id)?.parentItemId).filter(Boolean)]);
      return { id: entry.id, date, itemIds: ids, counts, recorded: true, itemSnapshots: [...snapshotIds].map((id) => roster.get(id)).filter(Boolean) };
    });
  } else {
    if (record.type === "meal_log" && entries.some((entry) => !str(entry.title).trim() || rows(entry.ingredients).some((item) => !str(item.label).trim()))) throw new Error("Give each meal and ingredient a name.");
    if (record.type === "strength_session" && entries.some((entry) => rows(entry.exercises).some((exercise) => rows(exercise.sets).some((set) => typeof set.reps !== "number" || !Number.isInteger(set.reps) || set.reps < 0 || set.reps > 1000 || (set.rir !== null && set.rir !== undefined && (typeof set.rir !== "number" || !Number.isFinite(set.rir) || set.rir < 0 || set.rir > 10)))))) throw new Error("Check the reps and reps in reserve for each set.");
    const actions = validateRecordActions([{ op: "upsert", record: { key: record.key, type: record.type as ActivityRecordType, title: record.title, data: { ...data, [field]: entries } } }], date);
    const action = actions[0];
    if (!action || action.op !== "upsert") throw new Error("Check the recorded values.");
    validated = rows(action.record.data[field]);
    // Clearing the final measured value is an explicit empty record, not a deletion.
    if (record.type === "session_log") validated = entries.map((entry) => validated.find((value) => value.id === entry.id) ?? (rows(entry.values).length === 0 && !str(entry.note) ? { ...entry, values: [], note: "" } : {}));
    if (validated.length !== entries.length || validated.some((entry, index) => entry.id !== entries[index].id)) throw new Error("Some recorded values are invalid; nothing was saved.");
    validated = validated.map((entry) => ({ ...datedEntries(record.type, data, date).find((old) => old.id === entry.id), ...entry }));
  }
  const original = rows(data[field]);
  const oldIds = new Set(original.filter((entry) => entry.date !== date).map((entry) => entry.id));
  if (validated.some((entry) => oldIds.has(entry.id))) throw new Error("That entry belongs to another date.");
  return { ...data, [field]: [...original.filter((entry) => entry.date !== date), ...validated].sort((a, b) => str(a.date).localeCompare(str(b.date))) };
}
