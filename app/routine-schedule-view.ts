import type { SchedulePattern } from "./schedule-model";

export type RoutinePatternView = SchedulePattern & { archived?: boolean };

export function isSimpleDailyPattern(pattern: RoutinePatternView) {
  return !pattern.archived && pattern.steps.length === 1 && pattern.cadence.kind === "daily";
}

export function isRotationPattern(pattern: RoutinePatternView) {
  return pattern.steps.length > 1;
}

export function groupRoutinePatterns(patterns: RoutinePatternView[]) {
  const active = patterns.filter((pattern) => !pattern.archived);
  const daily = active.filter(isSimpleDailyPattern);
  const custom = active.filter((pattern) => !isSimpleDailyPattern(pattern));
  const paused = patterns.filter((pattern) => pattern.archived);
  const activityCount = new Set(active.flatMap((pattern) => pattern.steps.map((step) => step.activityId))).size;
  return {
    active,
    daily,
    custom,
    paused,
    activityCount,
    customCount: custom.filter((pattern) => !isRotationPattern(pattern)).length,
    rotationCount: custom.filter(isRotationPattern).length,
  };
}

