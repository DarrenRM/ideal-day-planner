import assert from "node:assert/strict";
import test from "node:test";

import {
  priorExerciseResult,
  strengthSessionForDate,
  strengthSessionProgress,
  strengthWeekSummary,
  summarizeStrengthSets,
} from "../app/strength-session-model.ts";

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

test("derives weekly workout and set counts without agent-maintained summaries", () => {
  assert.deepEqual(strengthWeekSummary(data, "2026-08-21"), { sessions: 2, sets: 3 });
});
