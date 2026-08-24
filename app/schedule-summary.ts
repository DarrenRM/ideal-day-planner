type ScheduleVisibilityInput = {
  advancementKind: "calendar" | "completion";
  cadenceKind: "daily" | "weekdays" | "interval_days";
  endDate: string | null;
  stepCount: number;
};

function localDateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function nextLocalDate(value: string) {
  const date = localDateValue(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + 1);
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

export function shouldShowActivitySchedule(input: ScheduleVisibilityInput) {
  return input.cadenceKind !== "daily"
    || input.stepCount > 1
    || Boolean(input.endDate)
    || input.advancementKind !== "calendar";
}

export function formatScheduleOccurrenceDate(date: string, referenceDate: string) {
  if (date === referenceDate) return "Today";
  if (date === nextLocalDate(referenceDate)) return "Tomorrow";
  const occurrence = localDateValue(date);
  const reference = localDateValue(referenceDate);
  if (!occurrence || !reference) return date;
  const daysAway = Math.round((occurrence.getTime() - reference.getTime()) / 86_400_000);
  return new Intl.DateTimeFormat("en-US", daysAway > 1 && daysAway <= 7
    ? { weekday: "long", timeZone: "UTC" }
    : { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(occurrence);
}

export function scheduleOccurrenceDetail(occurrenceTitle: string, activityTitle: string) {
  const normalizedOccurrence = occurrenceTitle.trim().toLocaleLowerCase();
  const normalizedActivity = activityTitle.trim().toLocaleLowerCase();
  return normalizedOccurrence && normalizedOccurrence !== normalizedActivity ? occurrenceTitle.trim() : null;
}
