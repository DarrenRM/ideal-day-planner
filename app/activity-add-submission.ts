export type ActivityAddPayload = {
  title: string;
  category: string;
  duration: number;
  icon: string;
  color: string;
  date: string;
  schedule: { kind: string; weekdays?: number[]; intervalWeeks?: number; every?: number; anchorDate?: string };
  scheduleChoice?: string;
  includeToday: boolean;
  planRole: string;
  origin: string;
  setupRequest: string;
};

type CreatedActivity = { id: string; title: string };

// One submitted intent, even across uncertain POST responses or a failed GET.
// Keep the immutable payload until success; a retry must not become another Add.
export function createActivityAddSubmission(fetcher: typeof fetch = (...args) => fetch(...args), key = () => `custom-${crypto.randomUUID()}`) {
  let pending: (ActivityAddPayload & { clientKey: string }) | null = null;
  let activity: CreatedActivity | null = null;
  let busy = false;
  return {
    get busy() { return busy; },
    get pending() { return pending !== null; },
    get saved() { return activity !== null; },
    async submit(payload: ActivityAddPayload) {
      if (busy) return null;
      busy = true;
      try {
        pending ??= { ...structuredClone(payload), clientKey: key() };
        if (!activity) {
          const response = await fetcher("/api/activities", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending),
          });
          const result = await response.json() as { activity?: CreatedActivity; error?: string };
          if (!response.ok) {
            // Validation/auth failures happen before any write. Other failures
            // may have committed and must retain the original request identity.
            if (response.status === 400 || response.status === 401) pending = null;
            throw new Error(result.error || "The save could not be confirmed. Retry safely below.");
          }
          if (!result.activity?.id) throw new Error("The save could not be confirmed. Retry safely below.");
          activity = result.activity;
        }
        // A retry after midnight still saves the original intent, but refreshes
        // the day the person is now viewing.
        const response = await fetcher(`/api/day?date=${payload.date}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Your activity is saved, but today's list could not refresh. Retry to reload it.");
        const day = await response.json() as { items: unknown };
        if (!Array.isArray(day.items)) throw new Error("Your activity is saved, but today's list could not refresh. Retry to reload it.");
        return { activity, day, payload: pending! };
      } finally {
        busy = false;
      }
    },
  };
}

export function activityAddScheduleSummary(kind: string, includeToday: boolean, every: number, weekdays: number[]) {
  const start = includeToday ? "Starting today" : "Starting tomorrow";
  if (kind === "none") return includeToday
    ? "Today only. This activity will not appear automatically tomorrow."
    : "Saved without a schedule. It will not appear in your daily list until you schedule or add it to a day.";
  if (kind === "sequence") return `${includeToday ? "Included today." : "Not included today."} Repeating starts only after you save the sequence in the next step.`;
  if (kind === "luna") return `${includeToday ? "Included today." : "Not included today."} No repeat is set yet; Luna will help arrange it in chat.`;
  if (kind === "weekdays") return `${start}, on ${[...weekdays].sort().map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ")}. Only selected weekdays appear.`;
  if (kind === "interval_days") return includeToday ? `Starting today, every ${every} days.` : `Every ${every} days from today. Today is excluded; the first occurrence is in ${every} days.`;
  return `${start}, every day.`;
}
