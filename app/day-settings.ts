export type DaySettings = {
  dayTimelineEnabled: boolean;
  pullForwardAfterEarlyCompletion: boolean;
};

export const DEFAULT_DAY_SETTINGS: DaySettings = {
  dayTimelineEnabled: false,
  pullForwardAfterEarlyCompletion: false,
};

export type DayModePolicy = {
  timelineEnabled: boolean;
  showStartGate: boolean;
  showClockState: boolean;
  showDurationControls: boolean;
  showMinuteSummaries: boolean;
};

export function dayModePolicy(settings: DaySettings): DayModePolicy {
  const timelineEnabled = settings.dayTimelineEnabled;
  return {
    timelineEnabled,
    showStartGate: timelineEnabled,
    showClockState: timelineEnabled,
    showDurationControls: timelineEnabled,
    showMinuteSummaries: timelineEnabled,
  };
}

export function normalizeDaySettings(value: unknown): DaySettings {
  if (!value || typeof value !== "object") return DEFAULT_DAY_SETTINGS;
  const source = value as Record<string, unknown>;
  return {
    dayTimelineEnabled: source.dayTimelineEnabled === true || source.dayTimelineEnabled === 1,
    pullForwardAfterEarlyCompletion: source.pullForwardAfterEarlyCompletion === true || source.pullForwardAfterEarlyCompletion === 1,
  };
}
