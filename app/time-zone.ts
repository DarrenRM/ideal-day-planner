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

// The zone this browser reports, or null when it cannot tell.
export function detectedTimeZone(): string | null {
  try {
    return canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return null;
  }
}

export function browserTimeZone() {
  return detectedTimeZone() ?? FALLBACK_TIME_ZONE;
}

// Query suffix that reports the browser's zone. Left off when the browser
// cannot tell, so a correct stored zone is never replaced by the fallback.
export function timeZoneQuery() {
  const timeZone = detectedTimeZone();
  return timeZone ? `&timeZone=${encodeURIComponent(timeZone)}` : "";
}
