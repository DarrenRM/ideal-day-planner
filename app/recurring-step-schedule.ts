export type RecurringCadence =
  | { kind: "weekly"; every?: number }
  | { kind: "interval_days"; every?: number }
  | { kind: "weekdays"; weekdays?: number[] };

export type RecurringStepScheduleData = {
  anchorDate?: string;
  cadence?: RecurringCadence;
  completedDates?: string[];
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function dateFromKey(value: string) {
  if (!DATE_KEY.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = dateFromKey(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

export function recurringDateIsDue(anchorDate: string | undefined, cadence: RecurringCadence | undefined, date: string) {
  const start = anchorDate ? dateFromKey(anchorDate) : null;
  const target = dateFromKey(date);
  if (!start || !target || !cadence) return false;

  const days = Math.floor((target.getTime() - start.getTime()) / DAY_MS);
  if (days < 0) return false;
  if (cadence.kind === "weekly") return days % (7 * Math.max(1, cadence.every ?? 1)) === 0;
  if (cadence.kind === "interval_days") return days % Math.max(1, cadence.every ?? 1) === 0;
  return (cadence.weekdays ?? []).includes(target.getUTCDay());
}

export function nextRecurringDate(anchorDate: string | undefined, cadence: RecurringCadence | undefined, afterDate: string) {
  if (!anchorDate || !cadence || !dateFromKey(afterDate)) return null;
  // Validated cadence intervals top out at 365 days, so one full year is enough
  // to find the next occurrence while keeping malformed input safely bounded.
  for (let offset = 1; offset <= 366; offset += 1) {
    const candidate = addDays(afterDate, offset);
    if (candidate && recurringDateIsDue(anchorDate, cadence, candidate)) return candidate;
  }
  return null;
}

function previousRecurringDate(anchorDate: string | undefined, cadence: RecurringCadence | undefined, onOrBeforeDate: string) {
  if (!anchorDate || !cadence || !dateFromKey(onOrBeforeDate)) return null;
  for (let offset = 0; offset <= 366; offset += 1) {
    const candidate = addDays(onOrBeforeDate, -offset);
    if (candidate && recurringDateIsDue(anchorDate, cadence, candidate)) return candidate;
  }
  return null;
}

export function recurringStepScheduleStatus(data: RecurringStepScheduleData, today: string) {
  const completedDates = [...new Set(data.completedDates ?? [])]
    .filter((date) => DATE_KEY.test(date) && date <= today)
    .sort();
  const lastCompleted = completedDates.at(-1) ?? null;
  const completedToday = lastCompleted === today;
  const previousDue = previousRecurringDate(data.anchorDate, data.cadence, today);
  const completedThisCycle = Boolean(previousDue && completedDates.some((date) => date >= previousDue && date <= today));
  const dueToday = !completedThisCycle && recurringDateIsDue(data.anchorDate, data.cadence, today);

  return {
    completedToday,
    completedThisCycle,
    dueToday,
    lastCompleted,
    nextDue: dueToday ? today : nextRecurringDate(data.anchorDate, data.cadence, today),
  };
}

export function recurringCadenceLabel(cadence: RecurringCadence | undefined) {
  if (cadence?.kind === "weekly") return cadence.every === 1 || cadence.every === undefined ? "Weekly" : `Every ${cadence.every} weeks`;
  if (cadence?.kind === "interval_days") return cadence.every === 1 ? "Daily" : `Every ${cadence.every ?? 1} days`;
  return "Selected days";
}

export function compactRecurringTitle(title: string, cadenceLabel: string) {
  const normalized = title.trim();
  const prefixes = [cadenceLabel, "Weekly", "Daily", "Monthly", "Selected days"];
  const matchingPrefix = prefixes.find((prefix) => normalized.toLocaleLowerCase().startsWith(`${prefix.toLocaleLowerCase()} `));
  return matchingPrefix ? normalized.slice(matchingPrefix.length).trim() || normalized : normalized;
}
