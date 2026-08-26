export const ACTIVITY_LIBRARY_VERSION = "activity-library-v1";

export const ACTIVITY_CHOICE_SETS = {
  movement: {
    label: "Movement preference",
    prompt: "Which kind of movement would you rather begin with?",
    choices: [
      { key: "bodyweight-strength-workout", title: "Bodyweight strength workout", category: "Training", durationMinutes: 25, recipe: "Strength session", components: ["workout", "strength_session"] },
      { key: "yoga-session", title: "Yoga session", category: "Training", durationMinutes: 20, recipe: "Body routine", components: ["protocol", "goal"] },
      { key: "mobility-routine", title: "Mobility routine", category: "Training", durationMinutes: 10, recipe: "Body routine", components: ["protocol", "goal"] },
    ],
  },
  focus: {
    label: "Focus preference",
    prompt: "What kind of focused time would feel most useful?",
    choices: [
      { key: "deep-work-session", title: "Deep work session", category: "Creativity", durationMinutes: 30, recipe: "Focus/creative session", components: ["goal", "item_list"] },
      { key: "creative-project-time", title: "Creative project time", category: "Creativity", durationMinutes: 30, recipe: "Focus/creative session", components: ["goal", "item_list"] },
      { key: "planning-session", title: "Planning session", category: "Creativity", durationMinutes: 15, recipe: "Focus/creative session", components: ["goal", "checklist"] },
    ],
  },
  meditation: {
    label: "Meditation preference",
    prompt: "Which quiet practice sounds most approachable?",
    choices: [
      { key: "guided-meditation", title: "Guided meditation", category: "Recharge", durationMinutes: 10, recipe: "Simple timed practice", components: ["protocol", "countdown"] },
      { key: "breathing-practice", title: "Breathing practice", category: "Recharge", durationMinutes: 5, recipe: "Simple timed practice", components: ["protocol", "countdown"] },
      { key: "body-scan", title: "Body scan", category: "Recharge", durationMinutes: 10, recipe: "Simple timed practice", components: ["protocol", "countdown"] },
    ],
  },
  bedtime: {
    label: "Evening preference",
    prompt: "What kind of evening close would help most?",
    choices: [
      { key: "bed-routine", title: "Bed routine", category: "Care", durationMinutes: 15, recipe: "Preparation workflow", components: ["checklist", "protocol"] },
      { key: "screen-free-wind-down", title: "Screen-free wind-down", category: "Recharge", durationMinutes: 20, recipe: "Simple timed practice", components: ["protocol", "goal"] },
      { key: "prepare-for-tomorrow", title: "Prepare for tomorrow", category: "Logistics", durationMinutes: 10, recipe: "Preparation workflow", components: ["checklist"] },
    ],
  },
  creativity: {
    label: "Creative preference",
    prompt: "Which creative practice would you actually look forward to?",
    choices: [
      { key: "writing-practice", title: "Writing practice", category: "Creativity", durationMinutes: 20, recipe: "Focus/creative session", components: ["goal", "history"] },
      { key: "drawing-practice", title: "Drawing practice", category: "Creativity", durationMinutes: 20, recipe: "Focus/creative session", components: ["goal", "history"] },
      { key: "music-practice", title: "Music practice", category: "Creativity", durationMinutes: 20, recipe: "Focus/creative session", components: ["goal", "history"] },
    ],
  },
};

export const ACTIVITY_LIBRARY = [
  {
    key: "morning-walk", title: "Morning walk", aliases: ["Walk in sun", "Sun walk", "Outdoor walk"], category: "Light", durationMinutes: 20,
    outcome: "Begin the day with light movement and outdoor light.", immediatelyActionable: true, recipe: "Measured session",
    components: { starting: ["session_log"], optional: ["goal", "resources"] },
    setup: { mode: "ready", guidance: "The action is already specific. Ask only when the person wants a route, pace, distance, or heart-rate target." },
    onboarding: { priorities: ["energy", "strength", "calm"], rhythms: ["morning", "movement", "flexible"], choiceSet: null },
  },
  {
    key: "strength-session", title: "Bodyweight strength workout", aliases: ["Strength workout", "Bodyweight workout", "Strength session"], category: "Training", durationMinutes: 25,
    outcome: "Build strength with a concrete workout that can grow over time.", immediatelyActionable: true, recipe: "Strength session",
    components: { starting: ["workout", "strength_session"], optional: ["equipment", "protocol"] },
    setup: { mode: "guided", guidance: "Learn the available equipment, current ability, and preferred workout shape before prescribing a durable plan." },
    onboarding: { priorities: ["strength", "energy"], rhythms: ["movement", "flexible"], choiceSet: "movement" },
  },
  {
    key: "focus-block", title: "Deep work session", aliases: ["Focus block", "Focused work", "Deep work"], category: "Creativity", durationMinutes: 30,
    outcome: "Protect a defined block for the work that matters most.", immediatelyActionable: true, recipe: "Focus/creative session",
    components: { starting: ["goal", "item_list"], optional: ["resources", "history", "timer"] },
    setup: { mode: "guided", guidance: "Ask what project or outcome the session serves; add a timer only when the person wants time to define the practice." },
    onboarding: { priorities: ["focus", "creativity"], rhythms: ["morning", "midday", "flexible"], choiceSet: "focus" },
  },
  {
    key: "bed-routine", title: "Bed routine", aliases: ["Bedtime routine", "Evening routine", "Night routine"], category: "Care", durationMinutes: 15,
    outcome: "Create a repeatable close to the day that makes sleep easier.", immediatelyActionable: true, recipe: "Preparation workflow",
    components: { starting: ["checklist", "protocol"], optional: ["product", "adherence", "recurring_step", "resources"] },
    setup: { mode: "guided", guidance: "Learn the actual steps, products, and devices. Named items become subject-owned product/device records rather than generic checklist text." },
    onboarding: { priorities: ["sleep", "calm", "self-care"], rhythms: ["evening", "flexible"], choiceSet: "bedtime" },
  },
  {
    key: "ten-minute-meditation", title: "Guided meditation", aliases: ["Meditation", "Ten-minute meditation", "Mindfulness"], category: "Recharge", durationMinutes: 10,
    outcome: "Make a small pocket of quiet for calm, focus, or recovery.", immediatelyActionable: true, recipe: "Simple timed practice",
    components: { starting: ["protocol", "countdown"], optional: ["resources", "adherence"] },
    setup: { mode: "ready", guidance: "The practice can begin immediately; ask for a preferred guide, technique, or source only when it would improve the session." },
    onboarding: { priorities: ["calm", "focus", "sleep"], rhythms: ["morning", "midday", "evening", "flexible"], choiceSet: "meditation" },
  },
  {
    key: "breakfast", title: "Breakfast", aliases: ["Morning meal"], category: "Fuel", durationMinutes: 15,
    outcome: "Start with a deliberate meal instead of letting the morning run away.", immediatelyActionable: true, recipe: "Meal, shake, or food-prep routine",
    components: { starting: ["meal_log"], optional: ["resources"] },
    setup: { mode: "ready", guidance: "Keep the workspace quiet until the person supplies a meal, recipe, or tracking need; do not invent nutrition details." },
    onboarding: { priorities: ["nourishment", "energy", "self-care"], rhythms: ["morning", "flexible"], choiceSet: null },
  },
  {
    key: "lunch-away-from-screen", title: "Lunch away from the screen", aliases: ["Lunch break", "Intentional lunch"], category: "Fuel", durationMinutes: 20,
    outcome: "Turn lunch into a real pause that restores energy and attention.", immediatelyActionable: true, recipe: "Meal, shake, or food-prep routine",
    components: { starting: ["meal_log"], optional: ["goal", "resources"] },
    setup: { mode: "ready", guidance: "The behavior is specific enough to begin. Record food details only when the person asks for them or supplies them." },
    onboarding: { priorities: ["nourishment", "energy", "calm"], rhythms: ["midday", "flexible"], choiceSet: null },
  },
  {
    key: "skin-routine", title: "Skin routine", aliases: ["Skin care", "Skincare routine"], category: "Care", durationMinutes: 5,
    outcome: "Make personal care consistent without turning it into a complicated project.", immediatelyActionable: true, recipe: "Product/device care",
    components: { starting: ["product", "protocol"], optional: ["adherence", "recurring_step", "resources"] },
    setup: { mode: "guided", guidance: "Ask which products are actually used and when. Each named product owns its protocol, cadence, sources, and history." },
    onboarding: { priorities: ["self-care", "calm"], rhythms: ["morning", "evening", "flexible"], choiceSet: null },
  },
  {
    key: "ten-minute-tidy", title: "Quick tidy", aliases: ["10-minute tidy", "Tidy reset", "Room reset"], category: "Logistics", durationMinutes: 10,
    outcome: "Reduce visual friction with one small, finishable reset.", immediatelyActionable: true, recipe: "Preparation workflow",
    components: { starting: ["checklist"], optional: ["countdown", "history"] },
    setup: { mode: "ready", guidance: "Begin with a concise reusable checklist only when the person names the spaces or reset steps that matter." },
    onboarding: { priorities: ["home", "calm", "focus"], rhythms: ["midday", "evening", "flexible"], choiceSet: null },
  },
  {
    key: "creative-practice", title: "Creative practice", aliases: ["Creative time", "Art practice"], category: "Creativity", durationMinutes: 25,
    outcome: "Make regular room to create instead of waiting for inspiration.", immediatelyActionable: true, recipe: "Focus/creative session",
    components: { starting: ["goal", "history"], optional: ["item_list", "resources", "timer"] },
    setup: { mode: "guided", guidance: "Ask which medium the person wants to practice. The concrete choice should replace the generic activity title." },
    onboarding: { priorities: ["creativity", "focus", "calm"], rhythms: ["morning", "midday", "evening", "flexible"], choiceSet: "creativity" },
  },
  {
    key: "check-in-with-someone", title: "Check in with someone", aliases: ["Reach out", "Call someone", "Connection check-in"], category: "Spirit", durationMinutes: 10,
    outcome: "Protect a small moment for a relationship that matters.", immediatelyActionable: true, recipe: "Connection practice",
    components: { starting: ["history"], optional: ["item_list", "goal"] },
    setup: { mode: "ready", guidance: "Keep the action simple. Ask who or how only when the person wants a reusable list or a specific relationship goal." },
    onboarding: { priorities: ["connection", "calm"], rhythms: ["midday", "evening", "flexible"], choiceSet: null },
  },
  {
    key: "afternoon-stretch", title: "Afternoon stretch", aliases: ["Stretch break", "Afternoon mobility", "Stretch / yoga"], category: "Training", durationMinutes: 10,
    outcome: "Break up the day with a short mobility reset.", immediatelyActionable: true, recipe: "Body routine",
    components: { starting: ["protocol", "goal"], optional: ["history", "timer"] },
    setup: { mode: "ready", guidance: "The reset can begin without setup; ask about target areas, limitations, or a preferred sequence before creating a durable protocol." },
    onboarding: { priorities: ["energy", "strength", "calm"], rhythms: ["midday", "movement", "flexible"], choiceSet: null },
  },
];

function normalizedTitle(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function activityLibraryEntryFor(title = "") {
  const normalized = normalizedTitle(title);
  if (!normalized) return null;
  return ACTIVITY_LIBRARY.find((entry) => [entry.title, ...entry.aliases].some((candidate) => normalizedTitle(candidate) === normalized)) ?? null;
}

export function activityChoiceSet(key) {
  return key && Object.prototype.hasOwnProperty.call(ACTIVITY_CHOICE_SETS, key) ? ACTIVITY_CHOICE_SETS[key] : null;
}

export function activityLibraryInstructions() {
  const entries = ACTIVITY_LIBRARY.map((entry) => {
    const choiceSet = activityChoiceSet(entry.onboarding.choiceSet);
    const choices = choiceSet ? ` Choice set: ${choiceSet.choices.map((choice) => choice.title).join(" | ")}.` : "";
    return `- ${entry.title} (${entry.key}): ${entry.category}, ${entry.durationMinutes} minutes; priorities ${entry.onboarding.priorities.join(", ")}; rhythms ${entry.onboarding.rhythms.join(", ")}; recipe ${entry.recipe}.${choices}`;
  }).join("\n");
  return `Core activity library (${ACTIVITY_LIBRARY_VERSION}). Prefer these canonical templates during onboarding and use their concrete titles, category, duration, and choice set. A clearly stated personal need may justify an activity outside this set, but never replace a concrete library action with a vague outcome label.\n${entries}`;
}
