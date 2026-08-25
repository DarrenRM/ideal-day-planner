import { addLocalDays, isLocalDate } from "./schedule-model.ts";

export const ONBOARDING_CAPACITIES = ["gentle", "balanced", "push"] as const;
export type OnboardingCapacity = typeof ONBOARDING_CAPACITIES[number];

export const ONBOARDING_CATEGORIES = ["Light", "Recharge", "Training", "Fuel", "Care", "Logistics", "Creativity", "Spirit"] as const;
export type OnboardingCategory = typeof ONBOARDING_CATEGORIES[number];

export type OnboardingActivityCandidate = {
  key: string;
  title: string;
  category: OnboardingCategory;
  durationMinutes: number;
  planRole: "essential" | "extra";
  reason: string;
  immediatelyActionable: boolean;
};

export type OnboardingFutureCandidate = {
  title: string;
  reason: string;
};

export type OnboardingProposal = {
  summary: string;
  activities: OnboardingActivityCandidate[];
  futureCandidates: OnboardingFutureCandidate[];
  calibration: {
    afterDays: number;
    note: string;
  };
};

export type OnboardingStage = "welcome" | "goals" | "capacity" | "preparing" | "proposal" | "active" | "error";

const SAFE_KEY = /^[a-z0-9][a-z0-9-]{0,59}$/;
const CAPACITY_ESSENTIAL_RANGE: Record<OnboardingCapacity, [number, number]> = {
  gentle: [3, 4],
  balanced: [4, 5],
  push: [5, 6],
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const result = value.trim().replace(/\s+/g, " ");
  return result && result.length <= maximum ? result : null;
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
}

export function parseOnboardingCapacity(value: unknown): OnboardingCapacity | null {
  return ONBOARDING_CAPACITIES.includes(value as OnboardingCapacity) ? value as OnboardingCapacity : null;
}

export function parseOnboardingProposal(value: unknown, capacity: OnboardingCapacity): OnboardingProposal | null {
  const source = recordValue(value);
  if (!source || !Array.isArray(source.activities) || !Array.isArray(source.futureCandidates)) return null;
  const summary = boundedText(source.summary, 240);
  const calibrationSource = recordValue(source.calibration);
  const afterDays = boundedInteger(calibrationSource?.afterDays, 3, 7);
  const calibrationNote = boundedText(calibrationSource?.note, 240);
  if (!summary || afterDays === null || !calibrationNote) return null;

  const activities: OnboardingActivityCandidate[] = [];
  const seenKeys = new Set<string>();
  const seenTitles = new Set<string>();
  for (const candidate of source.activities.slice(0, 8)) {
    const item = recordValue(candidate);
    if (!item) return null;
    const key = boundedText(item.key, 60);
    const title = boundedText(item.title, 60);
    const category = ONBOARDING_CATEGORIES.includes(item.category as OnboardingCategory) ? item.category as OnboardingCategory : null;
    const durationMinutes = boundedInteger(item.durationMinutes, 5, 180);
    const planRole = item.planRole === "essential" || item.planRole === "extra" ? item.planRole : null;
    const reason = boundedText(item.reason, 180);
    if (!key || !SAFE_KEY.test(key) || !title || !category || durationMinutes === null || !planRole || !reason || typeof item.immediatelyActionable !== "boolean") return null;
    const normalizedTitle = title.toLocaleLowerCase();
    if (seenKeys.has(key) || seenTitles.has(normalizedTitle)) return null;
    seenKeys.add(key);
    seenTitles.add(normalizedTitle);
    activities.push({ key, title, category, durationMinutes, planRole, reason, immediatelyActionable: item.immediatelyActionable });
  }

  const [minimumEssentials, maximumEssentials] = CAPACITY_ESSENTIAL_RANGE[capacity];
  const essentials = activities.filter((activity) => activity.planRole === "essential");
  if (essentials.length < minimumEssentials || essentials.length > maximumEssentials || !essentials.some((activity) => activity.immediatelyActionable)) return null;
  if (activities.length < essentials.length || activities.length > essentials.length + 2) return null;

  const futureCandidates: OnboardingFutureCandidate[] = [];
  for (const candidate of source.futureCandidates.slice(0, 3)) {
    const item = recordValue(candidate);
    const title = boundedText(item?.title, 60);
    const reason = boundedText(item?.reason, 180);
    if (!title || !reason || seenTitles.has(title.toLocaleLowerCase())) return null;
    futureCandidates.push({ title, reason });
  }

  return { summary, activities, futureCandidates, calibration: { afterDays, note: calibrationNote } };
}

export function onboardingReviewDate(startDate: string, proposal: OnboardingProposal) {
  if (!isLocalDate(startDate)) throw new Error("A valid onboarding date is required.");
  return addLocalDays(startDate, proposal.calibration.afterDays);
}

export function deterministicOnboardingProposal(goals: string, capacity: OnboardingCapacity): OnboardingProposal {
  const normalized = goals.toLocaleLowerCase();
  const pool: OnboardingActivityCandidate[] = [];
  const add = (candidate: OnboardingActivityCandidate) => {
    if (!pool.some((item) => item.key === candidate.key)) pool.push(candidate);
  };

  if (/calm|stress|anx|morning|ground/.test(normalized)) add({ key: "quiet-start", title: "Quiet start", category: "Recharge", durationMinutes: 10, planRole: "essential", reason: "Creates a small protected transition into the day.", immediatelyActionable: true });
  if (/health|fit|move|walk|energy|exercise/.test(normalized)) add({ key: "daily-walk", title: "Daily walk", category: "Light", durationMinutes: 20, planRole: "essential", reason: "Adds approachable movement and outdoor time.", immediatelyActionable: true });
  if (/work|focus|project|create|progress/.test(normalized)) add({ key: "focus-block", title: "Focus block", category: "Creativity", durationMinutes: 30, planRole: "essential", reason: "Protects visible progress on the work that matters.", immediatelyActionable: true });
  if (/sleep|night|evening|rest/.test(normalized)) add({ key: "evening-wind-down", title: "Evening wind-down", category: "Care", durationMinutes: 15, planRole: "essential", reason: "Makes the end of the day calmer and more repeatable.", immediatelyActionable: true });
  if (/eat|food|meal|nutrition|fuel/.test(normalized)) add({ key: "intentional-meal", title: "Intentional meal", category: "Fuel", durationMinutes: 25, planRole: "essential", reason: "Creates one reliable point of nourishment without over-planning food.", immediatelyActionable: true });

  const defaults: OnboardingActivityCandidate[] = [
    { key: "morning-reset", title: "Morning reset", category: "Care", durationMinutes: 10, planRole: "essential", reason: "Starts the day with one manageable act of self-care.", immediatelyActionable: true },
    { key: "move-your-body", title: "Move your body", category: "Training", durationMinutes: 15, planRole: "essential", reason: "Builds a flexible movement commitment that can become more specific later.", immediatelyActionable: true },
    { key: "important-progress", title: "Important progress", category: "Creativity", durationMinutes: 25, planRole: "essential", reason: "Keeps one meaningful goal from being crowded out.", immediatelyActionable: true },
    { key: "prepare-for-tomorrow", title: "Prepare for tomorrow", category: "Logistics", durationMinutes: 10, planRole: "essential", reason: "Closes one open loop before the next day begins.", immediatelyActionable: true },
    { key: "evening-reset", title: "Evening reset", category: "Recharge", durationMinutes: 10, planRole: "essential", reason: "Adds a gentle release point at the end of the day.", immediatelyActionable: true },
    { key: "extra-outdoor-time", title: "Extra outdoor time", category: "Light", durationMinutes: 20, planRole: "extra", reason: "A stretch goal for days when there is more energy.", immediatelyActionable: true },
  ];
  defaults.forEach(add);

  const desiredEssentials = capacity === "gentle" ? 3 : capacity === "balanced" ? 4 : 5;
  const essentials = pool.filter((item) => item.planRole === "essential").slice(0, desiredEssentials);
  const extra = capacity === "gentle" ? [] : [pool.find((item) => item.planRole === "extra") ?? defaults.at(-1)!];
  return {
    summary: "A practical starting day that protects what matters without trying to solve everything at once.",
    activities: [...essentials, ...extra],
    futureCandidates: [
      { title: "A more specific movement plan", reason: "Worth shaping after the first few days show what fits." },
      { title: "A stronger evening routine", reason: "Can grow from what actually helps you wind down." },
    ],
    calibration: { afterDays: 3, note: "After three days, Luna will help you decide what to add, remove, or make more specific." },
  };
}
