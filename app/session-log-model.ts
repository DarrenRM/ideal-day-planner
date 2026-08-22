export const SESSION_LOG_FIELD_KINDS = [
  "duration",
  "distance",
  "effort",
  "heart_rate",
  "setting",
  "result",
] as const;

export type SessionLogFieldKind = typeof SESSION_LOG_FIELD_KINDS[number];

export type SessionLogField = {
  id: string;
  label: string;
  unit?: string;
  input: "number" | "text";
  kind: SessionLogFieldKind;
  optionIds?: string[];
};

export type SessionLogEntry = {
  id: string;
  date: string;
  optionId: string;
  values: Array<{ field: string; value: string }>;
  note?: string;
  createdAt?: string;
};

export type SessionChoiceData = {
  options?: Array<{ id: string; label: string; detail?: string }>;
  selections?: Array<{ date: string; optionId: string }>;
  activeSelection?: { optionId: string; startDate: string; endDate: string; reason?: string };
};

export type SessionLogData = {
  choiceRecordKey?: string;
  defaultOption?: { id: string; label: string };
  fields?: SessionLogField[];
  entries?: SessionLogEntry[];
};

export function selectedSessionOptionId(data: SessionChoiceData, date: string) {
  const exact = data.selections?.find((entry) => entry.date === date)?.optionId;
  const planned = data.activeSelection && data.activeSelection.startDate <= date && date <= data.activeSelection.endDate
    ? data.activeSelection.optionId
    : undefined;
  return exact ?? planned;
}

export function sessionFieldsForOption(data: SessionLogData, optionId: string) {
  return (data.fields ?? []).filter((field) => !field.optionIds?.length || field.optionIds.includes(optionId));
}

export function sessionEntryValues(entry?: SessionLogEntry | null) {
  return Object.fromEntries((entry?.values ?? []).map((pair) => [pair.field, pair.value]));
}

export function sessionFieldValue(entry: SessionLogEntry | undefined, field: SessionLogField | undefined) {
  if (!entry || !field) return "";
  return entry.values.find((pair) => pair.field === field.id)?.value ?? "";
}

export function numericSessionValue(entry: SessionLogEntry, field: SessionLogField | undefined) {
  const value = Number(sessionFieldValue(entry, field));
  return Number.isFinite(value) ? value : null;
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftedDateKey(value: string, days: number) {
  const date = parseDate(value) ?? new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function sessionWeekDays(referenceDate: string) {
  const reference = parseDate(referenceDate) ?? new Date();
  const mondayOffset = (reference.getDay() + 6) % 7;
  const monday = new Date(reference);
  monday.setDate(reference.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);
    return {
      date: dateKey(date),
      label: date.toLocaleDateString(undefined, { weekday: "narrow" }),
    };
  });
}

export function summarizeSessionLog(data: SessionLogData, optionId: string, referenceDate: string) {
  const fields = sessionFieldsForOption(data, optionId);
  const durationField = fields.find((field) => field.kind === "duration");
  const distanceField = fields.find((field) => field.kind === "distance");
  const effortField = fields.find((field) => field.kind === "effort");
  const entries = (data.entries ?? [])
    .filter((entry) => entry.optionId === optionId)
    .sort((left, right) => `${left.date}:${left.createdAt ?? left.id}`.localeCompare(`${right.date}:${right.createdAt ?? right.id}`));
  const weekDays = sessionWeekDays(referenceDate);
  const weekDateSet = new Set(weekDays.map((day) => day.date));
  const weekEntries = entries.filter((entry) => weekDateSet.has(entry.date));
  const priorEntries = entries.filter((entry) => entry.date < referenceDate);
  const latestPrior = priorEntries.at(-1) ?? null;
  const totalDuration = weekEntries.reduce((sum, entry) => sum + (numericSessionValue(entry, durationField) ?? 0), 0);
  const distanceValues = weekEntries.flatMap((entry) => {
    const value = numericSessionValue(entry, distanceField);
    return value === null ? [] : [value];
  });
  const effortValues = weekEntries.flatMap((entry) => {
    const value = numericSessionValue(entry, effortField);
    return value === null ? [] : [value];
  });
  const byDay = new Map<string, number>();
  for (const entry of weekEntries) {
    byDay.set(entry.date, (byDay.get(entry.date) ?? 0) + (numericSessionValue(entry, durationField) ?? 1));
  }
  const recentWeeks = Array.from({ length: 4 }, (_, index) => {
    const weekOffset = index - 3;
    const days = sessionWeekDays(shiftedDateKey(referenceDate, weekOffset * 7));
    const dates = new Set(days.map((day) => day.date));
    const week = entries.filter((entry) => dates.has(entry.date));
    const duration = week.reduce((sum, entry) => sum + (numericSessionValue(entry, durationField) ?? 0), 0);
    return {
      startDate: days[0].date,
      endDate: days.at(-1)?.date ?? days[0].date,
      sessions: week.length,
      duration,
    };
  });

  return {
    entries,
    latestPrior,
    weekEntries,
    weekDays: weekDays.map((day) => ({ ...day, value: byDay.get(day.date) ?? 0 })),
    totalDuration,
    totalDistance: distanceValues.length ? distanceValues.reduce((sum, value) => sum + value, 0) : null,
    averageEffort: effortValues.length ? effortValues.reduce((sum, value) => sum + value, 0) / effortValues.length : null,
    recentWeeks,
    durationField,
    distanceField,
    effortField,
  };
}

function field(id: string, label: string, kind: SessionLogFieldKind, input: "number" | "text", unit = "", optionIds?: string[]): SessionLogField {
  return { id, label, kind, input, ...(unit ? { unit } : {}), ...(optionIds?.length ? { optionIds } : {}) };
}

function optionKey(optionId: string, suffix: string) {
  return `${optionId}-${suffix}`.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function measuredSessionFields(options: Array<{ id: string; label: string }>): SessionLogField[] {
  const result: SessionLogField[] = [
    field("duration", "Duration", "duration", "number", "min"),
    field("effort", "Effort", "effort", "number", "/10"),
  ];
  for (const option of options) {
    const value = option.label.toLowerCase();
    const only = [option.id];
    if (/row|ski.?erg/.test(value)) {
      result.push(
        field(optionKey(option.id, "distance"), "Distance", "distance", "number", "m", only),
        field(optionKey(option.id, "split"), "Average split", "result", "text", "/500m", only),
        field(optionKey(option.id, "stroke-rate"), "Stroke rate", "setting", "number", "spm", only),
        field(optionKey(option.id, "damper"), "Damper", "setting", "number", "", only),
      );
    } else if (/stair|stepmill/.test(value)) {
      result.push(
        field(optionKey(option.id, "floors"), "Floors", "result", "number", "", only),
        field(optionKey(option.id, "level"), "Level", "setting", "number", "", only),
      );
    } else if (/bike|cycle|spin/.test(value)) {
      result.push(
        field(optionKey(option.id, "distance"), "Distance", "distance", "number", "mi", only),
        field(optionKey(option.id, "resistance"), "Resistance", "setting", "number", "", only),
        field(optionKey(option.id, "watts"), "Average power", "result", "number", "W", only),
      );
    } else if (/treadmill|walk|run|hike|ruck/.test(value)) {
      result.push(
        field(optionKey(option.id, "distance"), "Distance", "distance", "number", "mi", only),
        field(optionKey(option.id, "speed"), "Speed", "setting", "number", "mph", only),
        field(optionKey(option.id, "incline"), "Incline", "setting", "number", "%", only),
      );
    } else if (/elliptical/.test(value)) {
      result.push(
        field(optionKey(option.id, "distance"), "Distance", "distance", "number", "mi", only),
        field(optionKey(option.id, "level"), "Level", "setting", "number", "", only),
        field(optionKey(option.id, "incline"), "Incline", "setting", "number", "%", only),
      );
    } else if (/swim/.test(value)) {
      result.push(
        field(optionKey(option.id, "distance"), "Distance", "distance", "number", "yd", only),
        field(optionKey(option.id, "laps"), "Laps", "result", "number", "", only),
      );
    } else {
      result.push(field(optionKey(option.id, "result"), "Result", "result", "text", "", only));
    }
  }
  return result.slice(0, 30);
}
