export type HistoryCounts = { planned: number; completed: number; skipped: number };
export type HistoryDay = HistoryCounts & { date: string; known: boolean; entries: number };
export type HistoryActivity = HistoryCounts & { id: string; title: string; category: string; lastCompletedDate: string | null };
export type TrackRecord = {
  start: string; end: string; today: string;
  days: HistoryDay[]; activities: HistoryActivity[]; totals: HistoryCounts;
  firstSavedDate: string | null;
};
export type HistoryOccurrence = {
  id: string; activityId: string; title: string; variantName: string | null;
  category: string; completedAt: string | null; skippedAt: string | null;
  plannedMinutes: number; actualSeconds: number | null;
};
export type HistoryEntry = {
  id: string; activityId: string; activityTitle: string; date: string;
  title: string; kind: string; lines: string[];
};
export type HistoryDetail = { date: string; known: boolean; occurrences: HistoryOccurrence[]; entries: HistoryEntry[] };

export function validHistoryDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function shiftHistoryDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function historyDates(start: string, end: string) {
  if (!validHistoryDate(start) || !validHistoryDate(end) || start > end) return [];
  const length = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1;
  if (length > 366) return [];
  return Array.from({ length }, (_, index) => shiftHistoryDate(start, index));
}

export function historyPeriod(date: string, mode: "month" | "year") {
  const year = Number(date.slice(0, 4));
  const month = mode === "year" ? 12 : Number(date.slice(5, 7));
  return {
    start: mode === "year" ? `${year}-01-01` : `${date.slice(0, 7)}-01`,
    end: new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10),
  };
}

export function historyDayState(day: HistoryDay) {
  if (!day.known) return "unknown";
  if (!day.planned) return "unscheduled";
  if (!day.completed) return "zero";
  if (day.completed === day.planned) return "complete";
  return day.completed / day.planned >= 0.5 ? "mostly" : "some";
}

export function historyDayLabel(day: HistoryDay, today: string) {
  const date = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`));
  const status = !day.known ? "No saved day" : !day.planned ? "Nothing scheduled" : `${day.completed} of ${day.planned} completed, ${day.skipped} skipped`;
  return `${date}: ${status}${day.entries ? `, ${day.entries} recorded entries` : ""}${day.date === today ? ", today is in progress" : ""}`;
}

/** Bounded, explicit date interpretation for the same history supplied to Luna. */
export function historyRangeForMessage(message: string, today: string) {
  const text = message.toLowerCase();
  const dates = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]).filter(validHistoryDate);
  let range = { start: shiftHistoryDate(today, -27), end: today };
  let interpretation = "Last 28 days (default; ask for exact dates if the requested period is not represented)";
  if (dates.length) {
    range = { start: dates[0], end: dates[1] ?? dates[0] };
    interpretation = "Explicit dates in the message";
  } else if (/\byesterday\b/.test(text)) {
    range = { start: shiftHistoryDate(today, -1), end: shiftHistoryDate(today, -1) };
    interpretation = "Yesterday";
  } else if (/\b(last|this) year\b/.test(text)) {
    const year = Number(today.slice(0, 4)) - (/\blast year\b/.test(text) ? 1 : 0);
    range = historyPeriod(`${year}-01-01`, "year");
    interpretation = /\blast year\b/.test(text) ? "Last calendar year" : "This calendar year";
  } else if (/\b(last|this) month\b/.test(text)) {
    const date = /\blast month\b/.test(text) ? shiftHistoryDate(`${today.slice(0, 7)}-01`, -1) : today;
    range = historyPeriod(date, "month");
    interpretation = /\blast month\b/.test(text) ? "Last calendar month" : "This calendar month";
  } else if (/\b(last|this) week\b/.test(text)) {
    const monday = shiftHistoryDate(today, -(new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7);
    range = /\blast week\b/.test(text) ? { start: shiftHistoryDate(monday, -7), end: shiftHistoryDate(monday, -1) } : { start: monday, end: today };
    interpretation = "Calendar week beginning Monday";
  } else {
    const rolling = /\b(?:last|past)\s+(\d{1,3})\s+days\b/.exec(text);
    const monthMatch = /\b(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(20\d{2}))?\b/.exec(text);
    const month = monthMatch?.[1] === "may" && /^may (?:i|we|you)\b/.test(text.trim()) ? null : monthMatch;
    if (rolling) {
      const days = Math.max(1, Math.min(366, Number(rolling[1])));
      range = { start: shiftHistoryDate(today, 1 - days), end: today };
      interpretation = `Last ${days} days${Number(rolling[1]) > 366 ? " (limited to one year)" : ""}`;
    } else if (month) {
      const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
      range = historyPeriod(`${month[2] ?? today.slice(0, 4)}-${String(months.indexOf(month[1]) + 1).padStart(2, "0")}-01`, "month");
      interpretation = "Named calendar month; current year when no year supplied";
    }
  }
  range.end = range.end > today ? today : range.end;
  if (!historyDates(range.start, range.end).length) return { start: shiftHistoryDate(today, -27), end: today, interpretation: "Requested dates unavailable or outside a single year; last 28 days supplied instead. State this limitation." };
  return { ...range, interpretation };
}
