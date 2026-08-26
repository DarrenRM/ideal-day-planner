import { addLocalDays, isLocalDate } from "./schedule-model.ts";
import { ACTIVITY_LIBRARY, activityChoiceSet, activityLibraryEntryFor } from "../bridge/activity-library.mjs";

export const ONBOARDING_CAPACITIES = ["gentle", "balanced", "push"] as const;
export type OnboardingCapacity = typeof ONBOARDING_CAPACITIES[number];

export const ONBOARDING_PRIORITIES = ["energy", "strength", "focus", "sleep", "calm", "nourishment", "self-care", "home", "creativity", "connection"] as const;
export type OnboardingPriority = typeof ONBOARDING_PRIORITIES[number];
export const ONBOARDING_FRICTIONS = ["low-energy", "unpredictable", "starting", "too-many", "evenings", "forgetting", "physical-limits", "none"] as const;
export type OnboardingFriction = typeof ONBOARDING_FRICTIONS[number];
export const ONBOARDING_RHYTHMS = ["morning", "midday", "evening", "movement", "flexible"] as const;
export type OnboardingRhythm = typeof ONBOARDING_RHYTHMS[number];
export const ONBOARDING_CATEGORIES = ["Light", "Recharge", "Training", "Fuel", "Care", "Logistics", "Creativity", "Spirit"] as const;
export type OnboardingCategory = typeof ONBOARDING_CATEGORIES[number];

export type OnboardingAnswers = { version: 2; priorities: OnboardingPriority[]; frictions: OnboardingFriction[]; rhythms: OnboardingRhythm[]; capacity: OnboardingCapacity | null; note: string };
export type OnboardingActivityChoice = { key: string; title: string; category: OnboardingCategory; durationMinutes: number };
export type OnboardingActivityCandidate = { key: string; title: string; category: OnboardingCategory; durationMinutes: number; reason: string; selected: boolean; immediatelyActionable: boolean; choiceKey?: string; choices?: OnboardingActivityChoice[] };
export type OnboardingProposal = { summary: string; activities: OnboardingActivityCandidate[]; calibration: { afterDays: number; note: string } };
export type OnboardingStage = "welcome" | "priorities" | "friction" | "rhythm" | "coaching" | "preparing" | "proposal" | "active" | "error";

const SAFE_KEY = /^[a-z0-9][a-z0-9-]{0,59}$/;
const TARGET_SELECTIONS: Record<OnboardingCapacity, number> = { gentle: 3, balanced: 4, push: 5 };
const PRIORITY_LABELS: Record<OnboardingPriority, string> = { energy: "more energy", strength: "strength and movement", focus: "focused work", sleep: "better sleep", calm: "calm and recovery", nourishment: "nourishment", "self-care": "self-care", home: "home and order", creativity: "creativity", connection: "connection" };
const RHYTHM_LABELS: Record<OnboardingRhythm, string> = { morning: "a morning anchor", midday: "a midday reset", evening: "an evening wind-down", movement: "movement somewhere in the day", flexible: "a flexible day" };

function recordValue(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function boundedText(value: unknown, maximum: number, allowEmpty = false) { if (typeof value !== "string") return null; const result = value.trim().replace(/\s+/g, " "); if (!result && allowEmpty) return ""; return result && result.length <= maximum ? result : null; }
function boundedInteger(value: unknown, minimum: number, maximum: number) { return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum ? value : null; }
function enumArray<T extends string>(value: unknown, allowed: readonly T[], maximum: number): T[] | null { if (!Array.isArray(value) || value.length > maximum) return null; const result = [...new Set(value.filter((item): item is T => allowed.includes(item as T)))]; return result.length === value.length ? result : null; }
function cleanActivityTitle(value: string) {
  const cleaned = value.replace(/^\d+\s*(?:-|–|—)?\s*minute\s+/i, "").trim();
  return cleaned.replace(/^[a-z]/, (letter) => letter.toLocaleUpperCase());
}

function choiceSetChoices(key: string | null | undefined): OnboardingActivityChoice[] | undefined {
  const set = activityChoiceSet(key);
  return set?.choices.map((choice) => ({
    key: choice.key,
    title: choice.title,
    category: choice.category as OnboardingCategory,
    durationMinutes: choice.durationMinutes,
  }));
}

function inferredCategory(title: string, fallback: OnboardingCategory): OnboardingCategory {
  const normalized = title.toLocaleLowerCase();
  if (/walk/.test(normalized)) return "Light";
  if (/strength|workout|yoga|mobility|stretch/.test(normalized)) return "Training";
  if (/meditat|breath|body scan|wind-down/.test(normalized)) return "Recharge";
  if (/focus|deep work|creative|writing|drawing|music|planning session/.test(normalized)) return "Creativity";
  if (/breakfast|lunch|dinner|meal/.test(normalized)) return "Fuel";
  if (/bed routine|skin|hair/.test(normalized)) return "Care";
  if (/tidy|prepare for tomorrow/.test(normalized)) return "Logistics";
  return fallback;
}

function defaultChoicesFor(title: string): OnboardingActivityChoice[] | undefined {
  const normalized = title.toLocaleLowerCase();
  const libraryEntry = activityLibraryEntryFor(title);
  if (libraryEntry) return choiceSetChoices(libraryEntry.onboarding.choiceSet);
  if (/strength|workout|yoga|mobility/.test(normalized)) return choiceSetChoices("movement");
  if (/focus block|focused work|deep work/.test(normalized)) return choiceSetChoices("focus");
  if (/meditat|breath|body scan/.test(normalized)) return choiceSetChoices("meditation");
  if (/bed|sleep|evening routine/.test(normalized)) return choiceSetChoices("bedtime");
  if (/creative practice/.test(normalized)) return choiceSetChoices("creativity");
  return undefined;
}

function parseActivityChoices(value: unknown): OnboardingActivityChoice[] | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const choices: OnboardingActivityChoice[] = []; const seen = new Set<string>();
  for (const candidate of value) {
    const item = recordValue(candidate); if (!item) return undefined;
    const key = boundedText(item.key, 60); const rawTitle = boundedText(item.title, 60); const title = rawTitle ? cleanActivityTitle(rawTitle) : null;
    const category = ONBOARDING_CATEGORIES.includes(item.category as OnboardingCategory) ? item.category as OnboardingCategory : null;
    const durationMinutes = boundedInteger(item.durationMinutes, 5, 480);
    if (!key || !SAFE_KEY.test(key) || !title || !category || durationMinutes === null || seen.has(key)) return undefined;
    seen.add(key); choices.push({ key, title, category: inferredCategory(title, category), durationMinutes });
  }
  return choices;
}

export function emptyOnboardingAnswers(): OnboardingAnswers { return { version: 2, priorities: [], frictions: [], rhythms: [], capacity: null, note: "" }; }
export function parseOnboardingCapacity(value: unknown): OnboardingCapacity | null { return ONBOARDING_CAPACITIES.includes(value as OnboardingCapacity) ? value as OnboardingCapacity : null; }

export function parseOnboardingAnswers(value: unknown): OnboardingAnswers | null {
  const source = recordValue(value);
  if (!source || source.version !== 2) return null;
  const priorities = enumArray(source.priorities, ONBOARDING_PRIORITIES, 3);
  const frictions = enumArray(source.frictions, ONBOARDING_FRICTIONS, 2);
  const rhythms = enumArray(source.rhythms, ONBOARDING_RHYTHMS, 2);
  const capacity = source.capacity === null || source.capacity === undefined ? null : parseOnboardingCapacity(source.capacity);
  const note = boundedText(source.note ?? "", 280, true);
  if (!priorities || !frictions || !rhythms || note === null) return null;
  if (frictions.includes("none") && frictions.length > 1) return null;
  return { version: 2, priorities, frictions, rhythms, capacity, note };
}

export function onboardingAnswersSummary(answers: OnboardingAnswers) {
  const priorities = answers.priorities.map((item) => PRIORITY_LABELS[item]).join(", ");
  const rhythms = answers.rhythms.map((item) => RHYTHM_LABELS[item]).join(", ");
  const friction = answers.frictions.length && !answers.frictions.includes("none") ? ` Friction to account for: ${answers.frictions.join(", ")}.` : "";
  const note = answers.note ? ` In their words: ${answers.note}` : "";
  return `Priorities: ${priorities || "not chosen"}. Preferred rhythm: ${rhythms || "not chosen"}.${friction}${note}`;
}

export function parseOnboardingProposal(value: unknown, capacity: OnboardingCapacity): OnboardingProposal | null {
  const source = recordValue(value);
  if (!source || !Array.isArray(source.activities)) return null;
  const summary = boundedText(source.summary, 240);
  const calibrationSource = recordValue(source.calibration);
  const afterDays = boundedInteger(calibrationSource?.afterDays, 3, 7);
  const calibrationNote = boundedText(calibrationSource?.note, 240);
  if (!summary || afterDays === null || !calibrationNote || !TARGET_SELECTIONS[capacity]) return null;
  const activities: OnboardingActivityCandidate[] = [];
  const seenKeys = new Set<string>(); const seenTitles = new Set<string>();
  for (const candidate of source.activities) {
    const item = recordValue(candidate); if (!item) return null;
    const key = boundedText(item.key, 60); const boundedTitle = boundedText(item.title, 60); const rawTitle = boundedTitle ? cleanActivityTitle(boundedTitle) : null;
    const rawCategory = ONBOARDING_CATEGORIES.includes(item.category as OnboardingCategory) ? item.category as OnboardingCategory : null;
    const durationMinutes = boundedInteger(item.durationMinutes, 5, 480); const reason = boundedText(item.reason, 180);
    if (!key || !SAFE_KEY.test(key) || !rawTitle || !rawCategory || durationMinutes === null || !reason || typeof item.selected !== "boolean" || typeof item.immediatelyActionable !== "boolean") return null;
    const normalizedTitle = /^focus block$/i.test(rawTitle) ? "Deep work session" : rawTitle;
    const normalizedCategory = inferredCategory(normalizedTitle, rawCategory);
    const choices = parseActivityChoices(item.choices) || defaultChoicesFor(normalizedTitle);
    const requestedChoiceKey = boundedText(item.choiceKey, 60, true) || "";
    const chosen = choices?.find((choice) => choice.key === requestedChoiceKey)
      || choices?.find((choice) => choice.title.toLocaleLowerCase() === normalizedTitle.toLocaleLowerCase())
      || choices?.[0];
    const title = chosen?.title || normalizedTitle; const category = chosen?.category || normalizedCategory; const finalDuration = chosen?.durationMinutes || durationMinutes;
    const titleKey = title.toLocaleLowerCase(); if (seenKeys.has(key) || seenTitles.has(titleKey)) return null;
    seenKeys.add(key); seenTitles.add(titleKey);
    activities.push({ key, title, category, durationMinutes: finalDuration, reason, selected: item.selected, immediatelyActionable: item.immediatelyActionable, ...(choices && chosen ? { choiceKey: chosen.key, choices } : {}) });
  }
  if (activities.length < 6 || activities.length > 8) return null;
  const selected = activities.filter((activity) => activity.selected);
  if (selected.length < 3 || selected.length > 6 || !selected.some((activity) => activity.immediatelyActionable)) return null;
  return { summary, activities, calibration: { afterDays, note: calibrationNote } };
}

export function onboardingReviewDate(startDate: string, proposal: OnboardingProposal) { if (!isLocalDate(startDate)) throw new Error("A valid onboarding date is required."); return addLocalDays(startDate, proposal.calibration.afterDays); }

type CatalogCandidate = Omit<OnboardingActivityCandidate, "selected" | "reason" | "choiceKey" | "choices"> & { priorities: OnboardingPriority[]; rhythms: OnboardingRhythm[] };
const CANDIDATE_CATALOG: CatalogCandidate[] = ACTIVITY_LIBRARY.map((candidate) => ({
  key: candidate.key,
  title: candidate.title,
  category: candidate.category as OnboardingCategory,
  durationMinutes: candidate.durationMinutes,
  immediatelyActionable: candidate.immediatelyActionable,
  priorities: [...candidate.onboarding.priorities] as OnboardingPriority[],
  rhythms: [...candidate.onboarding.rhythms] as OnboardingRhythm[],
}));

export function deterministicOnboardingProposal(answers: OnboardingAnswers): OnboardingProposal {
  if (!answers.capacity || !answers.priorities.length || !answers.rhythms.length) throw new Error("Complete onboarding answers are required.");
  const lowEffort = answers.frictions.some((item) => ["low-energy", "starting", "physical-limits"].includes(item));
  const scored = CANDIDATE_CATALOG.map((candidate, index) => ({ candidate, index, score: candidate.priorities.filter((item) => answers.priorities.includes(item)).length * 4 + candidate.rhythms.filter((item) => answers.rhythms.includes(item)).length * 2 })).sort((a, b) => b.score - a.score || a.index - b.index);
  const target = TARGET_SELECTIONS[answers.capacity];
  const activities = scored.slice(0, 7).map(({ candidate }, index): OnboardingActivityCandidate => {
    const matchedPriority = candidate.priorities.find((item) => answers.priorities.includes(item)); const matchedRhythm = candidate.rhythms.find((item) => answers.rhythms.includes(item));
    const durationMinutes = lowEffort ? Math.max(5, Math.min(candidate.durationMinutes, 20)) : candidate.durationMinutes;
    const reason = matchedPriority ? `Supports ${PRIORITY_LABELS[matchedPriority]} with a concrete ${durationMinutes}-minute action.` : `Fits ${matchedRhythm ? RHYTHM_LABELS[matchedRhythm] : "the flexible rhythm you chose"} without complicated setup.`;
    const choices = defaultChoicesFor(candidate.title); const chosen = choices?.find((choice) => choice.title === candidate.title) || choices?.[0];
    return { key: candidate.key, title: chosen?.title || candidate.title, category: chosen?.category || candidate.category, durationMinutes: chosen?.durationMinutes || durationMinutes, reason, selected: index < target, immediatelyActionable: candidate.immediatelyActionable, ...(choices && chosen ? { choiceKey: chosen.key, choices } : {}) };
  });
  const namedPriorities = answers.priorities.map((item) => PRIORITY_LABELS[item]).join(", ");
  return { summary: `A concrete starting set shaped around ${namedPriorities}, with the friction you named kept in view.`, activities, calibration: { afterDays: 3, note: "After three days, Luna can help you adjust the set based on what actually fit." } };
}
