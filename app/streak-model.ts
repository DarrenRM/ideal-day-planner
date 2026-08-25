import { recurringDateIsDue, type RecurringCadence } from "./recurring-step-schedule.ts";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function previousDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function normalizedCompletionDates(values: string[]) {
  return [...new Set(values.filter((value) => DATE_KEY.test(value)))].sort();
}

export function dailyCompletionStreak(completedDates: string[], today: string) {
  const completed = new Set(normalizedCompletionDates(completedDates));
  const completedToday = completed.has(today);
  let cursor = completedToday ? today : previousDateKey(today);
  let count = 0;
  while (completed.has(cursor) && count < 365) {
    count += 1;
    cursor = previousDateKey(cursor);
  }
  return { count, completedToday };
}

export function recurringCompletionStreak(input: {
  anchorDate?: string;
  cadence?: RecurringCadence;
  completedDates: string[];
  today: string;
}) {
  if (!input.anchorDate || !input.cadence || !DATE_KEY.test(input.anchorDate) || !DATE_KEY.test(input.today)) {
    return { count: 0, completedToday: false };
  }
  const completionDates = normalizedCompletionDates(input.completedDates).filter((date) => date <= input.today);
  const completedToday = completionDates.includes(input.today);
  const dueDates: string[] = [];
  let cursor = input.anchorDate;
  for (let offset = 0; offset <= 365 && cursor <= input.today; offset += 1) {
    if (recurringDateIsDue(input.anchorDate, input.cadence, cursor)) dueDates.push(cursor);
    const next = new Date(`${cursor}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  let count = 0;
  for (let index = dueDates.length - 1; index >= 0; index -= 1) {
    const cycleStart = dueDates[index];
    const cycleEnd = dueDates[index + 1] ?? "9999-12-31";
    if (!completionDates.some((date) => date >= cycleStart && date < cycleEnd)) break;
    count += 1;
  }
  return { count, completedToday };
}

export function streakSteps(count: number) {
  const first = count >= 7 ? count - 5 : 1;
  return Array.from({ length: 7 }, (_, index) => first + index);
}
