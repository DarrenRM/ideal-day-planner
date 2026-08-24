import assert from "node:assert/strict";
import test from "node:test";

import {
  formatScheduleOccurrenceDate,
  scheduleOccurrenceDetail,
  shouldShowActivitySchedule,
} from "../app/schedule-summary.ts";

test("schedule dates favor nearby human language", () => {
  assert.equal(formatScheduleOccurrenceDate("2026-08-24", "2026-08-24"), "Today");
  assert.equal(formatScheduleOccurrenceDate("2026-08-25", "2026-08-24"), "Tomorrow");
  assert.equal(formatScheduleOccurrenceDate("2026-08-27", "2026-08-24"), "Thursday");
  assert.equal(formatScheduleOccurrenceDate("2026-09-03", "2026-08-24"), "Thu, Sep 3");
});

test("only meaningful whole-activity schedules get a summary", () => {
  const daily = { advancementKind: "calendar", cadenceKind: "daily", endDate: null, stepCount: 1 };
  assert.equal(shouldShowActivitySchedule(daily), false);
  assert.equal(shouldShowActivitySchedule({ ...daily, cadenceKind: "interval_days" }), true);
  assert.equal(shouldShowActivitySchedule({ ...daily, stepCount: 2 }), true);
  assert.equal(shouldShowActivitySchedule({ ...daily, endDate: "2026-09-01" }), true);
  assert.equal(shouldShowActivitySchedule({ ...daily, advancementKind: "completion" }), true);
});

test("rotation details are shown without repeating the activity title", () => {
  assert.equal(scheduleOccurrenceDetail("Shower", "Shower"), null);
  assert.equal(scheduleOccurrenceDetail("Leg day", "Lift"), "Leg day");
});
