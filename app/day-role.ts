export const PLAN_ROLES = ["essential", "extra"] as const;
export type PlanRole = typeof PLAN_ROLES[number];

export const ACTIVITY_ORIGINS = ["starter", "user", "luna", "imported"] as const;
export type ActivityOrigin = typeof ACTIVITY_ORIGINS[number];

export const GO_FURTHER_PREVIEW_LIMIT = 3;

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
};

export function isActiveDayItem(item: DayRoleItem) {
  return normalizePlanRole(item.planRole) === "essential"
    || Boolean(item.activatedAt || item.completedAt || item.skippedAt);
}

export function partitionDayItems<T extends DayRoleItem>(items: T[]) {
  const active: T[] = [];
  const availableExtras: T[] = [];
  for (const item of items) {
    if (isActiveDayItem(item)) active.push(item);
    else availableExtras.push(item);
  }
  return { active, availableExtras };
}
