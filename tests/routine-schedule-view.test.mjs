import assert from "node:assert/strict";
import test from "node:test";
import { groupRoutinePatterns, isRotationPattern, isSimpleDailyPattern } from "../app/routine-schedule-view.ts";

function pattern(id, cadence, activityIds, archived = false) {
  return {
    id,
    name: id,
    position: 0,
    cadence,
    advancement: { kind: "calendar" },
    anchorDate: "2026-08-23",
    initialStepPosition: 0,
    effectiveDate: "2026-08-23",
    endDate: null,
    revision: 1,
    archived,
    steps: activityIds.map((activityId, position) => ({
      id: `${id}:${position}`,
      activityId,
      activityVariantId: null,
      position,
      durationMinutes: 15,
      displayLabelOverride: null,
      planRole: "essential",
    })),
  };
}

test("separates ordinary daily rules from custom schedules, rotations, and paused rules", () => {
  const daily = pattern("daily", { kind: "daily" }, ["walk"]);
  const weekdays = pattern("weekdays", { kind: "weekdays", weekdays: [1, 3, 5], intervalWeeks: 1 }, ["lift"]);
  const rotation = pattern("rotation", { kind: "daily" }, ["lift", "cardio"]);
  const paused = pattern("paused", { kind: "daily" }, ["stretch"], true);
  const groups = groupRoutinePatterns([daily, weekdays, rotation, paused]);

  assert.equal(isSimpleDailyPattern(daily), true);
  assert.equal(isRotationPattern(rotation), true);
  assert.deepEqual(groups.daily.map((item) => item.id), ["daily"]);
  assert.deepEqual(groups.custom.map((item) => item.id), ["weekdays", "rotation"]);
  assert.deepEqual(groups.paused.map((item) => item.id), ["paused"]);
  assert.equal(groups.activityCount, 3);
  assert.equal(groups.customCount, 1);
  assert.equal(groups.rotationCount, 1);
});
