export type DayNavigationState = {
  todayDateKey: string;
  viewDate: string;
};

export function reconcileLocalDay(state: DayNavigationState, observedDateKey: string): DayNavigationState {
  if (observedDateKey === state.todayDateKey) return state;
  return {
    todayDateKey: observedDateKey,
    viewDate: state.viewDate === state.todayDateKey ? observedDateKey : state.viewDate,
  };
}

export function millisecondsUntilNextLocalDay(now: Date) {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 0, 0);
  return Math.max(250, nextDay.getTime() - now.getTime() + 100);
}
