import assert from "node:assert/strict";
import test from "node:test";
import { hasMeaningfulProductNotes, hasUsefulActivityRecordData, validateRecordActions } from "../app/activity-record-model.ts";
import { validateWorkspaceActions } from "../app/workspace-model.ts";

const record = (type, title, data) => ({ type, title, data });

test("rejects hollow domain records", () => {
  assert.equal(hasUsefulActivityRecordData(record("checklist", "Shower routine", { items: [] })), false);
  assert.equal(hasUsefulActivityRecordData(record("daily_selection", "Supplements", { items: [], entries: [] })), false);
  assert.equal(hasUsefulActivityRecordData(record("meal_log", "Meals", { recipes: [], entries: [] })), false);
  assert.equal(hasUsefulActivityRecordData(record("workout", "Lift workout", { focus: "Lifting session", exercises: [] })), false);
  assert.equal(hasUsefulActivityRecordData(record("protocol", "Routine", { summary: "", steps: [] })), false);
  assert.equal(hasUsefulActivityRecordData(record("protocol", "Routine", { summary: "Routine details not yet specified.", steps: [] })), false);
  assert.equal(hasUsefulActivityRecordData(record("attention", "Details needed", { body: "Confirm the product before creating a routine.", actions: [] })), false);
  assert.equal(hasUsefulActivityRecordData(record("resources", "Helpful links", { entries: [] })), false);
  assert.equal(hasUsefulActivityRecordData(record("metric", "Weight", { label: "Weight", current: null, target: null, entries: [] })), false);
  assert.equal(hasUsefulActivityRecordData(record("session_log", "Cardio session", { fields: [], entries: [] })), false);
  assert.equal(hasUsefulActivityRecordData(record("strength_session", "Lift sessions", { workoutRecordKey: "" })), false);
});

test("omits relationship-only product notes instead of rendering a hollow About section", () => {
  assert.equal(hasMeaningfulProductNotes("Used as part of the bed routine."), false);
  assert.equal(hasMeaningfulProductNotes("Used on the scalp as part of Hair Routine."), false);
  assert.equal(hasMeaningfulProductNotes("A fluoride-free toothpaste tablet made with 5% nano-hydroxyapatite."), true);

  const actions = validateRecordActions([{ op: "upsert", record: {
    key: "toothpaste", type: "product", title: "Toothpaste", scope: "activity", data: {
      kind: "product", name: "Toothpaste", notes: "Used as part of the bed routine.",
    },
  } }]);
  assert.equal(actions[0].record.data.notes, "");
});

test("rejects a summary that only repeats schedule information", () => {
  assert.equal(hasUsefulActivityRecordData(record("summary", "Cardio overview", {
    summary: "Cardio session",
    fields: [{ label: "Planned duration", value: "15 minutes" }],
  }), { activityTitle: "Cardio", plannedDurationMinutes: 15 }), false);
});

test("hides a descriptive walk overview when a measured-session tracker already owns the useful surface", () => {
  assert.equal(hasUsefulActivityRecordData(record("summary", "Morning light walk", {
    summary: "A normal morning walk intended to get morning light into the eyes.",
    fields: [{ label: "Walk type", value: "Normal walk" }, { label: "Purpose", value: "Morning light exposure" }],
  }), {
    activityTitle: "Morning Walk",
    siblingRecordTypes: ["session_log", "summary"],
  }), false);
});

test("keeps a measured-session overview when it contains direction that changes the session", () => {
  assert.equal(hasUsefulActivityRecordData(record("summary", "Morning walk constraint", {
    summary: "Keep effort under 4/10 while the knee settles.",
    fields: [{ label: "Route", value: "Flat neighborhood loop" }],
  }), {
    activityTitle: "Morning Walk",
    siblingRecordTypes: ["session_log", "summary"],
  }), true);
});

test("accepts components with immediately useful content", () => {
  assert.equal(hasUsefulActivityRecordData(record("checklist", "Shower routine", {
    items: [{ id: "condition", label: "Condition hair" }],
  })), true);
  assert.equal(hasUsefulActivityRecordData(record("daily_selection", "Supplements", {
    items: [{ id: "magnesium", label: "Magnesium", active: true }], entries: [],
  })), true);
  assert.equal(hasUsefulActivityRecordData(record("meal_log", "Today’s shake", {
    kind: "shake", recipes: [], entries: [{ id: "shake-2026-08-22", date: "2026-08-22", title: "Strawberry shake" }],
  })), true);
  assert.equal(hasUsefulActivityRecordData(record("workout", "Leg day", {
    exercises: [{ id: "lunges", name: "Walking lunges" }],
  })), true);
  assert.equal(hasUsefulActivityRecordData(record("workout", "Gym choice", {
    exercises: [], openChoices: [{ id: "gym-choice", label: "Choose one machine at the gym" }],
  })), true);
  assert.equal(hasUsefulActivityRecordData(record("recurring_step", "Grooming roller", {
    label: "Use the grooming roller", cadence: { kind: "weekly", every: 1 }, anchorDate: "2026-08-21",
  })), true);
  assert.equal(hasUsefulActivityRecordData(record("equipment", "Equipment", {
    items: [{ id: "dumbbells", name: "Dumbbells" }],
  })), true);
  assert.equal(hasUsefulActivityRecordData(record("session_log", "Cardio session", {
    choiceRecordKey: "cardio-choice",
    fields: [{ id: "duration", label: "Duration", input: "number", kind: "duration", unit: "min" }],
    entries: [],
  })), true);
  assert.equal(hasUsefulActivityRecordData(record("strength_session", "Lift sessions", {
    workoutRecordKey: "leg-day", sessions: [],
  })), true);
  assert.equal(hasUsefulActivityRecordData(record("summary", "Cardio plan", {
    summary: "Use the rowing machine and track distance.",
    fields: [],
  }), { activityTitle: "Cardio", plannedDurationMinutes: 15 }), true);
});

test("does not admit an empty inline routine into a workspace", () => {
  assert.deepEqual(validateWorkspaceActions([{
    op: "upsert",
    component: { id: "shower-routine", type: "routine", title: "Shower routine", steps: [], facts: [] },
  }], 300), []);
  assert.deepEqual(validateWorkspaceActions([{
    op: "upsert",
    component: { id: "shower-routine", type: "routine", title: "Shower routine", summary: "Routine details not yet specified." },
  }], 300), []);
});

test("normalizes a bounded meal log without requiring recipe or ingredient detail", () => {
  const actions = validateRecordActions([{ op: "upsert", record: {
    key: "meals", type: "meal_log", title: "Breakfast", scope: "activity", data: {
      kind: "meal", recipes: [], entries: [{ id: "breakfast-2026-08-22", date: "2026-08-22", title: "Turkey sandwich", sourceUrl: "javascript:alert(1)" }],
    },
  } }], "2026-08-22");
  assert.equal(actions.length, 1);
  assert.equal(actions[0].record.data.entries[0].title, "Turkey sandwich");
  assert.equal(actions[0].record.data.entries[0].sourceUrl, "");
});
