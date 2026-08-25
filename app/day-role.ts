export const PLAN_ROLES = ["essential", "extra"] as const;
export type PlanRole = typeof PLAN_ROLES[number];

export const ACTIVITY_ORIGINS = ["starter", "user", "luna", "imported"] as const;
export type ActivityOrigin = typeof ACTIVITY_ORIGINS[number];

export const GO_FURTHER_PREVIEW_LIMIT = 3;
export const KEEP_GOING_WINDOW_DAYS = 3;

export function normalizePlanRole(value: unknown): PlanRole {
  return value === "extra" ? "extra" : "essential";
}

export function normalizeActivityOrigin(value: unknown): ActivityOrigin {
  return ACTIVITY_ORIGINS.includes(value as ActivityOrigin) ? value as ActivityOrigin : "user";
}

export type DayRoleItem = {
  planRole?: PlanRole;
  activatedAt?: string | null;
  completedAt?: string | null;
  skippedAt?: string | null;
  previousEligibleDate?: string | null;
  previousCompletedAt?: string | null;
  previousActivatedAt?: string | null;
  previousPlanRole?: PlanRole | null;
};

export function isActiveDayItem(item: DayRoleItem) {
  return normalizePlanRole(item.planRole) === "essential"
    || Boolean(item.activatedAt || item.completedAt || item.skippedAt)
    || isKeepGoingCandidate(item);
}

export function partitionDayItems<T extends DayRoleItem>(items: T[]) {
  const active: T[] = [];
  const keepGoing: T[] = [];
  const availableExtras: T[] = [];
  for (const item of items) {
    if (normalizePlanRole(item.planRole) === "extra" && isKeepGoingCandidate(item)) keepGoing.push(item);
    else if (isActiveDayItem(item)) active.push(item);
    else availableExtras.push(item);
  }
  return { active: [...active, ...keepGoing], keepGoing, availableExtras };
}

export function dayProgressCounts(items: DayRoleItem[]) {
  const selected = items.filter((item) => isActiveDayItem(item) && !item.skippedAt);
  const essentials = selected.filter((item) => normalizePlanRole(item.planRole) === "essential");
  return {
    selectedTotal: selected.length,
    selectedCompleted: selected.filter((item) => Boolean(item.completedAt)).length,
    essentialTotal: essentials.length,
    essentialCompleted: essentials.filter((item) => Boolean(item.completedAt)).length,
  };
}

export function isKeepGoingCandidate(item: DayRoleItem) {
  return normalizePlanRole(item.planRole) === "extra"
    && item.previousPlanRole === "extra"
    && Boolean(item.previousEligibleDate && item.previousActivatedAt && item.previousCompletedAt);
}
