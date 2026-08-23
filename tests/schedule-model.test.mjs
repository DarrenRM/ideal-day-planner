import assert from "node:assert/strict";
import test from "node:test";

import {
  addLocalDays,
  cadenceTriggers,
  localDateInTimeZone,
  nextCompletionStep,
  parseAdvancement,
  parseCadence,
  parseOccurrenceAction,
  parseSchedulePattern,
  parseScheduleProposal,
  previewPattern,
  resolvePattern,
} from "../app/schedule-model.ts";

function pattern(overrides = {}) {
  return {
    id: "schedule:test",
    name: "Test sequence",
    position: 0,
    cadence: { kind: "daily" },
    advancement: { kind: "calendar" },
    anchorDate: "2026-08-21",
    initialStepPosition: 0,
    effectiveDate: "2026-08-21",
    endDate: null,
    revision: 1,
    steps: [
      { id: "step:a", activityId: "activity:a", activityVariantId: null, position: 0, durationMinutes: 30, displayLabelOverride: null },
      { id: "step:b", activityId: "activity:b", activityVariantId: null, position: 1, durationMinutes: 20, displayLabelOverride: null },
    ],
    ...overrides,
  };
}

test("validates and normalizes the bounded schedule language", () => {
  assert.deepEqual(parseCadence({ kind: "weekdays", weekdays: [5, 1, 3, 1] }), {
    kind: "weekdays",
    weekdays: [1, 3, 5],
    intervalWeeks: 1,
  });
  assert.deepEqual(parseCadence({ kind: "interval_days", every: 2, anchorDate: "2026-08-21" }), {
    kind: "interval_days",
    every: 2,
    anchorDate: "2026-08-21",
  });
  assert.equal(parseCadence({ kind: "weekdays", weekdays: [] }), null);
  assert.equal(parseCadence({ kind: "interval_days", every: 0, anchorDate: "2026-08-21" }), null);
  assert.deepEqual(parseAdvancement({ kind: "completion", advanceOnSkip: false }), { kind: "completion", advanceOnSkip: false });
  assert.equal(parseSchedulePattern(pattern())?.steps[0].planRole, "essential");
  assert.equal(parseSchedulePattern(pattern({ steps: [{ ...pattern().steps[0], planRole: "extra" }] }))?.steps[0].planRole, "extra");
  assert.equal(parseOccurrenceAction({ type: "activate_extra", occurrenceId: "occurrence:1", idempotencyKey: "activate:1" })?.type, "activate_extra");
  assert.deepEqual(parseOccurrenceAction({
    type: "activate_activity_for_date",
    activityId: "activity:resupply",
    date: "2026-08-24",
    idempotencyKey: "capture-date:1",
  }), {
    type: "activate_activity_for_date",
    activityId: "activity:resupply",
    date: "2026-08-24",
    idempotencyKey: "capture-date:1",
  });
});

test("performs local-date arithmetic without DST drift", () => {
  assert.equal(addLocalDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addLocalDays("2026-12-31", 1), "2027-01-01");
  assert.equal(localDateInTimeZone("2026-08-22T02:00:00Z", "America/Phoenix"), "2026-08-21");
});

test("resolves one-step daily and every-other-day schedules", () => {
  const oneStep = pattern({ steps: [pattern().steps[0]] });
  assert.equal(resolvePattern(oneStep, "2026-08-21")?.step.activityId, "activity:a");
  assert.equal(resolvePattern(oneStep, "2026-08-22")?.step.activityId, "activity:a");

  const alternateDays = pattern({ cadence: { kind: "interval_days", every: 2, anchorDate: "2026-08-21" } });
  assert.equal(cadenceTriggers(alternateDays.cadence, "2026-08-21", alternateDays.effectiveDate), true);
  assert.equal(resolvePattern(alternateDays, "2026-08-22"), null);
  assert.equal(resolvePattern(alternateDays, "2026-08-23")?.step.activityId, "activity:b");
});

test("rotates a cross-activity weekday sequence across a weekend", () => {
  const weekdays = pattern({ cadence: { kind: "weekdays", weekdays: [1, 2, 3, 4, 5], intervalWeeks: 1 } });
  assert.equal(resolvePattern(weekdays, "2026-08-21")?.step.activityId, "activity:a");
  assert.equal(resolvePattern(weekdays, "2026-08-22"), null);
  assert.equal(resolvePattern(weekdays, "2026-08-24")?.step.activityId, "activity:b");
  assert.equal(resolvePattern(weekdays, "2026-08-25")?.step.activityId, "activity:a");
});

test("rotates variants of one activity with the same universal steps", () => {
  const variants = pattern({
    cadence: { kind: "weekdays", weekdays: [1, 3, 5], intervalWeeks: 1 },
    steps: ["legs", "core", "push", "pull"].map((name, position) => ({
      id: `step:${name}`,
      activityId: "activity:gym",
      activityVariantId: `variant:${name}`,
      position,
      durationMinutes: 45,
      displayLabelOverride: null,
    })),
  });
  assert.deepEqual(previewPattern(variants, "2026-08-21", 5).map((entry) => entry.step.activityVariantId), [
    "variant:legs",
    "variant:core",
    "variant:push",
    "variant:pull",
    "variant:legs",
  ]);
});

test("completion-based sequences advance according to skip policy", () => {
  const stayOnSkip = pattern({ advancement: { kind: "completion", advanceOnSkip: false } });
  assert.equal(resolvePattern(stayOnSkip, "2026-08-21", { currentStepPosition: 1 })?.step.activityId, "activity:b");
  assert.equal(nextCompletionStep(stayOnSkip, { currentStepPosition: 1 }, "skipped"), 1);
  assert.equal(nextCompletionStep(stayOnSkip, { currentStepPosition: 1 }, "completed"), 0);

  const advanceOnSkip = pattern({ advancement: { kind: "completion", advanceOnSkip: true } });
  assert.equal(nextCompletionStep(advanceOnSkip, { currentStepPosition: 0 }, "skipped"), 1);
});

test("honors effective and end dates and stable occurrence identity", () => {
  const bounded = pattern({ effectiveDate: "2026-08-22", anchorDate: "2026-08-22", endDate: "2026-08-23" });
  assert.equal(resolvePattern(bounded, "2026-08-21"), null);
  assert.equal(resolvePattern(bounded, "2026-08-24"), null);
  assert.equal(resolvePattern(bounded, "2026-08-22")?.occurrenceKey, "pattern:schedule:test:2026-08-22");
});

test("rejects malformed patterns and occurrence actions", () => {
  assert.ok(parseSchedulePattern(pattern()));
  assert.equal(parseSchedulePattern(pattern({ steps: [] })), null);
  assert.equal(parseSchedulePattern(pattern({ initialStepPosition: 3 })), null);
  assert.deepEqual(parseOccurrenceAction({
    type: "move_to_date",
    occurrenceId: "occurrence:1",
    date: "2026-08-25",
    idempotencyKey: "action:1",
  }), {
    type: "move_to_date",
    occurrenceId: "occurrence:1",
    date: "2026-08-25",
    idempotencyKey: "action:1",
  });
  assert.deepEqual(parseOccurrenceAction({
    type: "set_activity",
    occurrenceId: "occurrence:1",
    activityId: "activity:cardio",
    activityVariantId: "variant:bike",
    idempotencyKey: "action:substitute",
  }), {
    type: "set_activity",
    occurrenceId: "occurrence:1",
    activityId: "activity:cardio",
    activityVariantId: "variant:bike",
    idempotencyKey: "action:substitute",
  });
  assert.equal(parseOccurrenceAction({
    type: "move_to_date",
    occurrenceId: "occurrence:1",
    date: "tomorrow",
    idempotencyKey: "action:1",
  }), null);
});

test("validates a bounded recurring proposal without weakening its typed pattern", () => {
  const proposed = parseScheduleProposal({
    baseRevision: 4,
    effectiveDate: "2026-08-24",
    summary: "Alternate Lift and Cardio on weekdays.",
    impact: { todayChanges: 0, futurePatternChanges: 1 },
    actions: [{
      type: "create_pattern",
      clientKey: "weekday-training",
      pattern: {
        ...pattern({ id: undefined, revision: undefined, effectiveDate: "2026-08-24", anchorDate: "2026-08-24" }),
        id: undefined,
        revision: undefined,
      },
    }],
  });
  assert.ok(proposed);
  assert.equal(proposed.actions[0].pattern.name, "Test sequence");
  assert.equal(proposed.actions[0].pattern.steps.length, 2);
  assert.equal(parseScheduleProposal({ ...proposed, baseRevision: 0 }), null);
});

test("validates proposal-owned activities, variants, and an explicit dated occurrence", () => {
  const proposed = parseScheduleProposal({
    baseRevision: 7,
    effectiveDate: "2026-08-21",
    summary: "Add Gym with a leg-day rotation beginning today.",
    impact: { todayChanges: 1, futurePatternChanges: 1 },
    actions: [
      { type: "create_activity", clientKey: "gym", title: "Gym", category: "Training", durationMinutes: 45 },
      { type: "create_variant", activityId: "proposal:gym", clientKey: "legs", name: "Leg day", defaultDurationMinutes: 45 },
      { type: "add_occurrence", activityId: "proposal:gym", activityVariantId: "proposal:legs", date: "2026-08-21", durationMinutes: 45 },
    ],
  });
  assert.ok(proposed);
  assert.equal(proposed.actions[2].type, "add_occurrence");
  assert.equal(parseScheduleProposal({ ...proposed, actions: [{ type: "create_activity", clientKey: "bad", title: "Bad", category: "Unknown", durationMinutes: 15 }] }), null);
});
