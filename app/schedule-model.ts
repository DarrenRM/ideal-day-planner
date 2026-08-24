export const MAX_PATTERN_STEPS = 64;
export const MAX_PATTERN_NAME_LENGTH = 80;
export const MAX_VARIANT_NAME_LENGTH = 60;
export const MAX_ACTIVITY_DURATION_MINUTES = 480;
export const MAX_OCCURRENCE_ID_LENGTH = 512;

export type DailyCadence = { kind: "daily" };
export type WeekdayCadence = { kind: "weekdays"; weekdays: number[]; intervalWeeks: number };
export type IntervalDaysCadence = { kind: "interval_days"; every: number; anchorDate: string };
export type ScheduleCadence = DailyCadence | WeekdayCadence | IntervalDaysCadence;

export type CalendarAdvancement = { kind: "calendar" };
export type CompletionAdvancement = { kind: "completion"; advanceOnSkip: boolean };
export type AdvancementPolicy = CalendarAdvancement | CompletionAdvancement;

export type ScheduleStep = {
  id: string;
  activityId: string;
  activityVariantId: string | null;
  position: number;
  durationMinutes: number;
  displayLabelOverride: string | null;
  planRole: "essential" | "extra";
};

export type SchedulePattern = {
  id: string;
  name: string;
  position: number;
  cadence: ScheduleCadence;
  advancement: AdvancementPolicy;
  anchorDate: string;
  initialStepPosition: number;
  effectiveDate: string;
  endDate: string | null;
  revision: number;
  steps: ScheduleStep[];
};

export type PatternState = {
  currentStepPosition: number;
};

export type ResolvedPatternStep = {
  patternId: string;
  patternRevision: number;
  triggerDate: string;
  occurrenceKey: string;
  step: ScheduleStep;
};

export type OccurrenceAction =
  | { type: "move_within_day"; occurrenceId: string; position: number; idempotencyKey: string }
  | { type: "move_to_date"; occurrenceId: string; date: string; position?: number; idempotencyKey: string }
  | { type: "set_duration"; occurrenceId: string; durationMinutes: number; idempotencyKey: string }
  | { type: "set_activity"; occurrenceId: string; activityId: string; activityVariantId?: string | null; idempotencyKey: string }
  | { type: "set_variant"; occurrenceId: string; activityVariantId: string | null; idempotencyKey: string }
  | { type: "set_label"; occurrenceId: string; displayLabel: string | null; idempotencyKey: string }
  | { type: "set_status"; occurrenceId: string; status: "planned" | "completed" | "skipped" | "removed"; idempotencyKey: string }
  | { type: "activate_extra"; occurrenceId: string; idempotencyKey: string }
  | { type: "activate_activity_for_date"; activityId: string; date: string; idempotencyKey: string }
  | { type: "add_occurrence"; activityId: string; date: string; position?: number; activityVariantId?: string | null; durationMinutes?: number; planRole?: "essential" | "extra"; idempotencyKey: string };

export type ScheduleProposalAction =
  | { type: "create_activity"; clientKey: string; title: string; category: string; durationMinutes: number }
  | { type: "create_variant"; activityId: string; clientKey: string; name: string; description?: string; defaultDurationMinutes?: number }
  | { type: "update_variant"; variantId: string; name?: string; description?: string | null; defaultDurationMinutes?: number | null; position?: number }
  | { type: "archive_variant"; variantId: string }
  | { type: "add_occurrence"; activityId: string; date: string; activityVariantId?: string | null; durationMinutes: number; position?: number }
  | { type: "create_pattern"; clientKey: string; pattern: Omit<SchedulePattern, "id" | "revision"> }
  | { type: "replace_pattern"; patternId: string; expectedRevision: number; pattern: Omit<SchedulePattern, "id" | "revision"> }
  | { type: "archive_pattern"; patternId: string; expectedRevision: number };

export type ScheduleProposalDocument = {
  baseRevision: number;
  effectiveDate: string;
  summary: string;
  impact: {
    todayChanges: number;
    futurePatternChanges: number;
  };
  actions: ScheduleProposalAction[];
};

export type DirectScheduleAction = {
  type: "set_pattern_cadence";
  baseRevision: number;
  activityId: string;
  patternId: string;
  expectedRevision: number;
  cadence: ScheduleCadence;
  effectiveDate: string;
  summary: string;
};

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:._~-]{0,199}$/;
const SAFE_OCCURRENCE_ID = /^[A-Za-z0-9][A-Za-z0-9:._~-]{0,511}$/;
const ACTIVITY_CATEGORIES = new Set(["Light", "Recharge", "Training", "Fuel", "Care", "Logistics", "Creativity", "Spirit"]);

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= maximum ? result : null;
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
}

export function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = LOCAL_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function localDateParts(value: string) {
  if (!isLocalDate(value)) throw new Error(`Invalid local date: ${value}`);
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function localDateSerial(value: string) {
  const { year, month, day } = localDateParts(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function compareLocalDates(left: string, right: string) {
  return localDateSerial(left) - localDateSerial(right);
}

export function addLocalDays(value: string, amount: number) {
  if (!Number.isInteger(amount)) throw new Error("A whole number of days is required.");
  const { year, month, day } = localDateParts(value);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

export function weekdayForLocalDate(value: string) {
  const { year, month, day } = localDateParts(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function localDateInTimeZone(instant: Date | string | number, timeZone: string) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error("A valid instant is required.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseCadence(value: unknown): ScheduleCadence | null {
  const source = recordValue(value);
  if (!source) return null;
  if (source.kind === "daily") return { kind: "daily" };
  if (source.kind === "interval_days") {
    const every = boundedInteger(source.every, 1, 365);
    if (!every || !isLocalDate(source.anchorDate)) return null;
    return { kind: "interval_days", every, anchorDate: source.anchorDate };
  }
  if (source.kind === "weekdays") {
    if (!Array.isArray(source.weekdays)) return null;
    const weekdays = [...new Set(source.weekdays.map((day) => boundedInteger(day, 0, 6)))];
    if (weekdays.includes(null) || weekdays.length === 0) return null;
    const intervalWeeks = source.intervalWeeks === undefined ? 1 : boundedInteger(source.intervalWeeks, 1, 52);
    if (!intervalWeeks) return null;
    return { kind: "weekdays", weekdays: (weekdays as number[]).sort((a, b) => a - b), intervalWeeks };
  }
  return null;
}

export function parseAdvancement(value: unknown): AdvancementPolicy | null {
  const source = recordValue(value);
  if (!source) return null;
  if (source.kind === "calendar") return { kind: "calendar" };
  if (source.kind === "completion" && typeof source.advanceOnSkip === "boolean") {
    return { kind: "completion", advanceOnSkip: source.advanceOnSkip };
  }
  return null;
}

export function parseScheduleStep(value: unknown): ScheduleStep | null {
  const source = recordValue(value);
  if (!source) return null;
  const id = boundedText(source.id, 200);
  const activityId = boundedText(source.activityId, 200);
  const activityVariantId = source.activityVariantId === null || source.activityVariantId === undefined
    ? null
    : boundedText(source.activityVariantId, 200);
  const position = boundedInteger(source.position, 0, MAX_PATTERN_STEPS - 1);
  const durationMinutes = boundedInteger(source.durationMinutes, 5, MAX_ACTIVITY_DURATION_MINUTES);
  const displayLabelOverride = source.displayLabelOverride === null || source.displayLabelOverride === undefined
    ? null
    : boundedText(source.displayLabelOverride, MAX_VARIANT_NAME_LENGTH);
  const planRole = source.planRole === "extra" ? "extra" : "essential";
  if (!id || !activityId || activityVariantId === null && source.activityVariantId !== null && source.activityVariantId !== undefined || position === null || durationMinutes === null) return null;
  if (!SAFE_ID.test(id) || !SAFE_ID.test(activityId) || activityVariantId && !SAFE_ID.test(activityVariantId)) return null;
  if (source.displayLabelOverride !== null && source.displayLabelOverride !== undefined && !displayLabelOverride) return null;
  return { id, activityId, activityVariantId, position, durationMinutes, displayLabelOverride, planRole };
}

export function parseSchedulePattern(value: unknown): SchedulePattern | null {
  const source = recordValue(value);
  if (!source || !Array.isArray(source.steps) || source.steps.length < 1 || source.steps.length > MAX_PATTERN_STEPS) return null;
  const id = boundedText(source.id, 200);
  const name = boundedText(source.name, MAX_PATTERN_NAME_LENGTH);
  const position = boundedInteger(source.position, 0, 999);
  const cadence = parseCadence(source.cadence);
  const advancement = parseAdvancement(source.advancement);
  const anchorDate = isLocalDate(source.anchorDate) ? source.anchorDate : null;
  const effectiveDate = isLocalDate(source.effectiveDate) ? source.effectiveDate : null;
  const endDate = source.endDate === null || source.endDate === undefined ? null : isLocalDate(source.endDate) ? source.endDate : null;
  const initialStepPosition = boundedInteger(source.initialStepPosition, 0, source.steps.length - 1);
  const revision = boundedInteger(source.revision, 1, Number.MAX_SAFE_INTEGER);
  const steps = source.steps.map(parseScheduleStep);
  if (!id || !SAFE_ID.test(id) || !name || position === null || !cadence || !advancement || !anchorDate || !effectiveDate || initialStepPosition === null || revision === null || steps.includes(null)) return null;
  if (source.endDate !== null && source.endDate !== undefined && !endDate) return null;
  if (endDate && compareLocalDates(endDate, effectiveDate) < 0) return null;
  const parsedSteps = steps as ScheduleStep[];
  const positions = new Set(parsedSteps.map((step) => step.position));
  if (positions.size !== parsedSteps.length || !parsedSteps.every((step, index) => positions.has(index))) return null;
  return { id, name, position, cadence, advancement, anchorDate, initialStepPosition, effectiveDate, endDate, revision, steps: [...parsedSteps].sort((a, b) => a.position - b.position) };
}

function weeksSince(anchorDate: string, date: string) {
  const anchorWeekStart = addLocalDays(anchorDate, -weekdayForLocalDate(anchorDate));
  const dateWeekStart = addLocalDays(date, -weekdayForLocalDate(date));
  return Math.floor((localDateSerial(dateWeekStart) - localDateSerial(anchorWeekStart)) / 7);
}

export function cadenceTriggers(cadence: ScheduleCadence, date: string, effectiveDate: string, endDate: string | null = null) {
  if (!isLocalDate(date) || !isLocalDate(effectiveDate) || endDate && !isLocalDate(endDate)) return false;
  if (compareLocalDates(date, effectiveDate) < 0 || endDate && compareLocalDates(date, endDate) > 0) return false;
  if (cadence.kind === "daily") return true;
  if (cadence.kind === "interval_days") {
    const difference = localDateSerial(date) - localDateSerial(cadence.anchorDate);
    return difference >= 0 && difference % cadence.every === 0;
  }
  if (!cadence.weekdays.includes(weekdayForLocalDate(date))) return false;
  const weekOffset = weeksSince(effectiveDate, date);
  return weekOffset >= 0 && weekOffset % cadence.intervalWeeks === 0;
}

export function triggerOrdinal(cadence: ScheduleCadence, anchorDate: string, date: string, endDate: string | null = null) {
  if (compareLocalDates(date, anchorDate) < 0) return 0;
  const boundedDate = endDate && compareLocalDates(date, endDate) > 0 ? endDate : date;
  const startSerial = localDateSerial(anchorDate);
  const endSerial = localDateSerial(boundedDate);
  if (endSerial < startSerial) return 0;
  if (cadence.kind === "daily") return endSerial - startSerial + 1;
  if (cadence.kind === "interval_days") {
    const cadenceAnchor = localDateSerial(cadence.anchorDate);
    const firstEligible = Math.max(startSerial, cadenceAnchor);
    const remainder = ((firstEligible - cadenceAnchor) % cadence.every + cadence.every) % cadence.every;
    const firstTrigger = firstEligible + (remainder ? cadence.every - remainder : 0);
    return firstTrigger > endSerial ? 0 : Math.floor((endSerial - firstTrigger) / cadence.every) + 1;
  }
  const periodDays = cadence.intervalWeeks * 7;
  const anchorWeekStart = startSerial - weekdayForLocalDate(anchorDate);
  return cadence.weekdays.reduce((count, weekday) => {
    let firstTrigger = anchorWeekStart + weekday;
    if (firstTrigger < startSerial) firstTrigger += periodDays;
    return count + (firstTrigger > endSerial ? 0 : Math.floor((endSerial - firstTrigger) / periodDays) + 1);
  }, 0);
}

export function occurrenceKey(patternId: string, date: string) {
  if (!SAFE_ID.test(patternId) || !isLocalDate(date)) throw new Error("A valid pattern and date are required.");
  return `pattern:${patternId}:${date}`;
}

export function resolvePattern(pattern: SchedulePattern, date: string, state: PatternState | null = null): ResolvedPatternStep | null {
  if (!cadenceTriggers(pattern.cadence, date, pattern.effectiveDate, pattern.endDate)) return null;
  let stepPosition: number;
  if (pattern.advancement.kind === "completion") {
    stepPosition = state?.currentStepPosition ?? pattern.initialStepPosition;
  } else {
    const anchor = compareLocalDates(pattern.anchorDate, pattern.effectiveDate) < 0 ? pattern.effectiveDate : pattern.anchorDate;
    const ordinal = triggerOrdinal(pattern.cadence, anchor, date, pattern.endDate);
    if (ordinal < 1) return null;
    stepPosition = (pattern.initialStepPosition + ordinal - 1) % pattern.steps.length;
  }
  const step = pattern.steps.find((candidate) => candidate.position === stepPosition);
  if (!step) return null;
  return {
    patternId: pattern.id,
    patternRevision: pattern.revision,
    triggerDate: date,
    occurrenceKey: occurrenceKey(pattern.id, date),
    step,
  };
}

export function nextCompletionStep(pattern: SchedulePattern, state: PatternState | null, outcome: "completed" | "skipped") {
  if (pattern.advancement.kind !== "completion") return null;
  const current = state?.currentStepPosition ?? pattern.initialStepPosition;
  const shouldAdvance = outcome === "completed" || pattern.advancement.advanceOnSkip;
  return shouldAdvance ? (current + 1) % pattern.steps.length : current;
}

export function previewPattern(pattern: SchedulePattern, fromDate: string, count = 6, state: PatternState | null = null) {
  if (!isLocalDate(fromDate) || !Number.isInteger(count) || count < 1 || count > 32) return [];
  const results: ResolvedPatternStep[] = [];
  for (let cursor = fromDate, guard = 0; results.length < count && guard < 3660; cursor = addLocalDays(cursor, 1), guard += 1) {
    const resolved = resolvePattern(pattern, cursor, state);
    if (resolved) results.push(resolved);
    if (pattern.endDate && compareLocalDates(cursor, pattern.endDate) >= 0) break;
  }
  return results;
}

export function parseOccurrenceAction(value: unknown): OccurrenceAction | null {
  const source = recordValue(value);
  if (!source) return null;
  const idempotencyKey = boundedText(source.idempotencyKey, 200);
  if (!idempotencyKey || !SAFE_ID.test(idempotencyKey)) return null;
  if (source.type === "activate_activity_for_date") {
    const activityId = boundedText(source.activityId, 200);
    return activityId && SAFE_ID.test(activityId) && isLocalDate(source.date)
      ? { type: "activate_activity_for_date", activityId, date: source.date, idempotencyKey }
      : null;
  }
  if (source.type === "add_occurrence") {
    const activityId = boundedText(source.activityId, 200);
    const position = source.position === undefined ? undefined : boundedInteger(source.position, 0, 999);
    const durationMinutes = source.durationMinutes === undefined ? undefined : boundedInteger(source.durationMinutes, 5, MAX_ACTIVITY_DURATION_MINUTES);
    const activityVariantId = source.activityVariantId === undefined || source.activityVariantId === null ? null : boundedText(source.activityVariantId, 200);
    if (!activityId || !SAFE_ID.test(activityId) || !isLocalDate(source.date) || position === null || durationMinutes === null || activityVariantId === null && source.activityVariantId !== undefined && source.activityVariantId !== null) return null;
    const planRole = source.planRole === "extra" ? "extra" : "essential";
    return { type: "add_occurrence", activityId, date: source.date, ...(position === undefined ? {} : { position }), ...(activityVariantId ? { activityVariantId } : {}), ...(durationMinutes === undefined ? {} : { durationMinutes }), planRole, idempotencyKey };
  }
  const occurrenceId = boundedText(source.occurrenceId, MAX_OCCURRENCE_ID_LENGTH);
  if (!occurrenceId || !SAFE_OCCURRENCE_ID.test(occurrenceId)) return null;
  if (source.type === "move_within_day") {
    const position = boundedInteger(source.position, 0, 999);
    return position === null ? null : { type: "move_within_day", occurrenceId, position, idempotencyKey };
  }
  if (source.type === "move_to_date") {
    const position = source.position === undefined ? undefined : boundedInteger(source.position, 0, 999);
    if (!isLocalDate(source.date) || position === null) return null;
    return { type: "move_to_date", occurrenceId, date: source.date, ...(position === undefined ? {} : { position }), idempotencyKey };
  }
  if (source.type === "set_duration") {
    const durationMinutes = boundedInteger(source.durationMinutes, 5, MAX_ACTIVITY_DURATION_MINUTES);
    return durationMinutes === null ? null : { type: "set_duration", occurrenceId, durationMinutes, idempotencyKey };
  }
  if (source.type === "set_activity") {
    const activityId = boundedText(source.activityId, 200);
    const activityVariantId = source.activityVariantId === undefined || source.activityVariantId === null
      ? null
      : boundedText(source.activityVariantId, 200);
    if (!activityId || !SAFE_ID.test(activityId) || source.activityVariantId !== undefined && source.activityVariantId !== null && (!activityVariantId || !SAFE_ID.test(activityVariantId))) return null;
    return { type: "set_activity", occurrenceId, activityId, ...(source.activityVariantId === undefined ? {} : { activityVariantId }), idempotencyKey };
  }
  if (source.type === "set_variant") {
    const activityVariantId = source.activityVariantId === null ? null : boundedText(source.activityVariantId, 200);
    if (source.activityVariantId !== null && (!activityVariantId || !SAFE_ID.test(activityVariantId))) return null;
    return { type: "set_variant", occurrenceId, activityVariantId, idempotencyKey };
  }
  if (source.type === "set_label") {
    const displayLabel = source.displayLabel === null ? null : boundedText(source.displayLabel, MAX_VARIANT_NAME_LENGTH);
    if (source.displayLabel !== null && !displayLabel) return null;
    return { type: "set_label", occurrenceId, displayLabel, idempotencyKey };
  }
  if (source.type === "set_status" && ["planned", "completed", "skipped", "removed"].includes(String(source.status))) {
    return { type: "set_status", occurrenceId, status: source.status as "planned" | "completed" | "skipped" | "removed", idempotencyKey };
  }
  if (source.type === "activate_extra") return { type: "activate_extra", occurrenceId, idempotencyKey };
  return null;
}

function parseProposalPattern(value: unknown) {
  const source = recordValue(value);
  if (!source) return null;
  const parsed = parseSchedulePattern({ ...source, id: "proposal-pattern", revision: 1 });
  if (!parsed) return null;
  return {
    name: parsed.name,
    position: parsed.position,
    anchorDate: parsed.anchorDate,
    initialStepPosition: parsed.initialStepPosition,
    effectiveDate: parsed.effectiveDate,
    endDate: parsed.endDate,
    cadence: parsed.cadence,
    advancement: parsed.advancement,
    steps: parsed.steps,
  };
}

export function parseScheduleProposalAction(value: unknown): ScheduleProposalAction | null {
  const source = recordValue(value);
  if (!source) return null;
  if (source.type === "create_activity") {
    const clientKey = boundedText(source.clientKey, 200);
    const title = boundedText(source.title, 60);
    const category = boundedText(source.category, 40);
    const durationMinutes = boundedInteger(source.durationMinutes, 5, MAX_ACTIVITY_DURATION_MINUTES);
    return clientKey && SAFE_ID.test(clientKey) && title && category && ACTIVITY_CATEGORIES.has(category) && durationMinutes !== null
      ? { type: "create_activity", clientKey, title, category, durationMinutes }
      : null;
  }
  if (source.type === "create_variant") {
    const activityId = boundedText(source.activityId, 200);
    const clientKey = boundedText(source.clientKey, 200);
    const name = boundedText(source.name, MAX_VARIANT_NAME_LENGTH);
    const description = source.description === undefined ? undefined : boundedText(source.description, 240);
    const defaultDurationMinutes = source.defaultDurationMinutes === undefined
      ? undefined
      : boundedInteger(source.defaultDurationMinutes, 5, MAX_ACTIVITY_DURATION_MINUTES);
    if (!activityId || !SAFE_ID.test(activityId) || !clientKey || !SAFE_ID.test(clientKey) || !name || description === null || defaultDurationMinutes === null) return null;
    return { type: "create_variant", activityId, clientKey, name, ...(description ? { description } : {}), ...(defaultDurationMinutes === undefined ? {} : { defaultDurationMinutes }) };
  }
  if (source.type === "archive_variant") {
    const variantId = boundedText(source.variantId, 200);
    return variantId && SAFE_ID.test(variantId) ? { type: "archive_variant", variantId } : null;
  }
  if (source.type === "add_occurrence") {
    const activityId = boundedText(source.activityId, 200);
    const activityVariantId = source.activityVariantId === undefined || source.activityVariantId === null ? null : boundedText(source.activityVariantId, 200);
    const durationMinutes = boundedInteger(source.durationMinutes, 5, MAX_ACTIVITY_DURATION_MINUTES);
    const position = source.position === undefined ? undefined : boundedInteger(source.position, 0, 999);
    if (!activityId || !SAFE_ID.test(activityId) || !isLocalDate(source.date) || durationMinutes === null || position === null || source.activityVariantId !== undefined && source.activityVariantId !== null && (!activityVariantId || !SAFE_ID.test(activityVariantId))) return null;
    return { type: "add_occurrence", activityId, date: source.date, ...(source.activityVariantId === undefined ? {} : { activityVariantId }), durationMinutes, ...(position === undefined ? {} : { position }) };
  }
  if (source.type === "update_variant") {
    const variantId = boundedText(source.variantId, 200);
    const name = source.name === undefined ? undefined : boundedText(source.name, MAX_VARIANT_NAME_LENGTH);
    const description = source.description === undefined ? undefined : source.description === null ? null : boundedText(source.description, 240);
    const defaultDurationMinutes = source.defaultDurationMinutes === undefined
      ? undefined
      : source.defaultDurationMinutes === null
        ? null
        : boundedInteger(source.defaultDurationMinutes, 5, MAX_ACTIVITY_DURATION_MINUTES);
    const position = source.position === undefined ? undefined : boundedInteger(source.position, 0, 999);
    const hasUpdate = name !== undefined || description !== undefined || defaultDurationMinutes !== undefined || position !== undefined;
    if (!variantId || !SAFE_ID.test(variantId) || !hasUpdate || name === null || description === null && source.description !== null || defaultDurationMinutes === null && source.defaultDurationMinutes !== null || position === null) return null;
    return { type: "update_variant", variantId, ...(name ? { name } : {}), ...(description !== undefined ? { description } : {}), ...(defaultDurationMinutes !== undefined ? { defaultDurationMinutes } : {}), ...(position !== undefined ? { position } : {}) };
  }
  if (source.type === "create_pattern") {
    const clientKey = boundedText(source.clientKey, 200);
    const pattern = parseProposalPattern(source.pattern);
    return clientKey && SAFE_ID.test(clientKey) && pattern ? { type: "create_pattern", clientKey, pattern } : null;
  }
  if (source.type === "replace_pattern") {
    const patternId = boundedText(source.patternId, 200);
    const expectedRevision = boundedInteger(source.expectedRevision, 1, Number.MAX_SAFE_INTEGER);
    const pattern = parseProposalPattern(source.pattern);
    return patternId && SAFE_ID.test(patternId) && expectedRevision !== null && pattern
      ? { type: "replace_pattern", patternId, expectedRevision, pattern }
      : null;
  }
  if (source.type === "archive_pattern") {
    const patternId = boundedText(source.patternId, 200);
    const expectedRevision = boundedInteger(source.expectedRevision, 1, Number.MAX_SAFE_INTEGER);
    return patternId && SAFE_ID.test(patternId) && expectedRevision !== null
      ? { type: "archive_pattern", patternId, expectedRevision }
      : null;
  }
  return null;
}

export function parseScheduleProposal(value: unknown): ScheduleProposalDocument | null {
  const source = recordValue(value);
  const impact = source ? recordValue(source.impact) : null;
  if (!source || !impact || !Array.isArray(source.actions) || source.actions.length < 1 || source.actions.length > 64) return null;
  const baseRevision = boundedInteger(source.baseRevision, 1, Number.MAX_SAFE_INTEGER);
  const effectiveDate = isLocalDate(source.effectiveDate) ? source.effectiveDate : null;
  const summary = boundedText(source.summary, 500);
  const todayChanges = boundedInteger(impact.todayChanges, 0, 200);
  const futurePatternChanges = boundedInteger(impact.futurePatternChanges, 0, 64);
  const actions = source.actions.map(parseScheduleProposalAction);
  if (baseRevision === null || !effectiveDate || !summary || todayChanges === null || futurePatternChanges === null || actions.includes(null)) return null;
  return {
    baseRevision,
    effectiveDate,
    summary,
    impact: { todayChanges, futurePatternChanges },
    actions: actions as ScheduleProposalAction[],
  };
}

export function parseDirectScheduleAction(value: unknown): DirectScheduleAction | null {
  const source = recordValue(value);
  if (!source || source.type !== "set_pattern_cadence") return null;
  const baseRevision = boundedInteger(source.baseRevision, 1, Number.MAX_SAFE_INTEGER);
  const activityId = boundedText(source.activityId, 200);
  const patternId = boundedText(source.patternId, 200);
  const expectedRevision = boundedInteger(source.expectedRevision, 1, Number.MAX_SAFE_INTEGER);
  const cadence = parseCadence(source.cadence);
  const effectiveDate = isLocalDate(source.effectiveDate) ? source.effectiveDate : null;
  const summary = boundedText(source.summary, 240);
  if (
    baseRevision === null
    || !activityId || !SAFE_ID.test(activityId)
    || !patternId || !SAFE_ID.test(patternId)
    || expectedRevision === null
    || !cadence
    || !effectiveDate
    || !summary
  ) return null;
  return {
    type: "set_pattern_cadence",
    baseRevision,
    activityId,
    patternId,
    expectedRevision,
    cadence,
    effectiveDate,
    summary,
  };
}
