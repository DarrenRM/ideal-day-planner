// Each person's IANA time zone lives in settings.time_zone. The browser reports
// its zone when it loads today, and work that runs without a browser (agent
// jobs, backfills) reads the stored value.
export const FALLBACK_TIME_ZONE = "UTC";

export function canonicalTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function resolveTimeZone(value: unknown) {
  return canonicalTimeZone(value) ?? FALLBACK_TIME_ZONE;
}

export function browserTimeZone() {
  try {
    return resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}
