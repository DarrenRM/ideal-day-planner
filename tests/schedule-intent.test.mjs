import assert from "node:assert/strict";
import test from "node:test";
import { messageHasScheduleIntent } from "../app/schedule-intent.ts";

test("recognizes ordinary schedule language inside an activity message", () => {
  assert.equal(messageHasScheduleIntent("I plan to use it once a week as part of my hair routine"), false);
  assert.equal(messageHasScheduleIntent("Rotate legs, chest, back, and core"), true);
  assert.equal(messageHasScheduleIntent("Use the face mask every other day"), true);
  assert.equal(messageHasScheduleIntent("I used the grooming roller today"), false);
});

test("keeps the cadence of a nested tool inside its parent activity", () => {
  assert.equal(messageHasScheduleIntent("Use the roller every other day within Hair Routine"), false);
  assert.equal(messageHasScheduleIntent("Schedule Hair Routine every other day"), true);
});
