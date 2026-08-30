import assert from "node:assert/strict";
import test from "node:test";

import {
  priorExerciseResult,
  strengthSessionForDate,
  strengthSessionProgress,
  strengthWeekSummary,
  summarizeStrengthExerciseSets,
  summarizeStrengthSets,
} from "../app/strength-session-model.ts";
import { parseActivityRecord } from "../app/activity-record-model.ts";

const data = {
  workoutRecordKey: "leg-day",
  sessions: [
    {
      id: "first", date: "2026-08-18", workoutTitle: "Leg Day", exercises: [{
        id: "first-lunges", exerciseId: "walking-lunges", name: "Walking lunges",
        sets: [
          { id: "a", ordinal: 1, type: "working", load: "25 lb", reps: 10, completedAt: "2026-08-18T12:00:00Z" },
          { id: "b", ordinal: 2, type: "working", load: "25 lb", reps: 9, completedAt: "2026-08-18T12:02:00Z" },
        ],
      }],
    },
    {
      id: "today", date: "2026-08-21", workoutTitle: "Leg Day", exercises: [{
        id: "today-lunges", exerciseId: "walking-lunges", name: "Walking lunges",
        sets: [{ id: "c", ordinal: 1, type: "working", load: "25 lb", reps: 11, completedAt: "2026-08-21T12:00:00Z" }],
      }],
    },
  ],
};

test("derives today's strength progress and previous exercise values from dated sessions", () => {
  assert.equal(strengthSessionForDate(data, "2026-08-21")?.id, "today");
  assert.equal(priorExerciseResult(data, "walking-lunges", "2026-08-21")?.sets.length, 2);
  assert.deepEqual(strengthSessionProgress(strengthSessionForDate(data, "2026-08-21"), ["walking-lunges", "goblet-squat"]), {
    completedExercises: 1,
    totalExercises: 2,
    completedSets: 1,
  });
  assert.equal(summarizeStrengthSets(data.sessions[0].exercises[0].sets), "25 lb × 10 · 25 lb × 9");
});

test("compresses repeated performed sets for a modified-session recap", () => {
  assert.equal(summarizeStrengthExerciseSets([
    { id: "a", ordinal: 1, type: "working", load: "5 lb in each hand", reps: 8, completedAt: "" },
    { id: "b", ordinal: 2, type: "working", load: "5 lb in each hand", reps: 8, completedAt: "" },
    { id: "c", ordinal: 3, type: "working", load: "5 lb in each hand", reps: 8, completedAt: "" },
    { id: "d", ordinal: 4, type: "working", load: "5 lb in each hand", reps: 8, completedAt: "" },
    { id: "e", ordinal: 5, type: "working", load: "5 lb in each hand", reps: 8, completedAt: "" },
  ]), "5 sets × 8 reps · 5 lb in each hand");
});

test("derives weekly workout and set counts without agent-maintained summaries", () => {
  assert.deepEqual(strengthWeekSummary(data, "2026-08-21"), { sessions: 2, sets: 3 });
});

test("preserves an explicitly linked warm-up as a workout phase", () => {
  const record = parseActivityRecord({
    id: "warmup-record",
    recordKey: "leg-day-warmup",
    recordType: "protocol",
    title: "Leg-day dynamic warm-up",
    scope: "activity",
    scopeDate: null,
    version: 1,
    payloadJson: JSON.stringify({
      workoutRecordKey: "leg-day",
      phase: "warmup",
      summary: "Prepare for the first exercise.",
      steps: [{ id: "walk", label: "Easy walk" }],
    }),
    updatedAt: "2026-08-22T12:00:00Z",
  });
  assert.equal(record?.data.workoutRecordKey, "leg-day");
  assert.equal(record?.data.phase, "warmup");
});
