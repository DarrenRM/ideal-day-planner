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

test("routes commitment-tier changes through the schedule coordinator", () => {
  assert.equal(messageHasScheduleIntent("Make this an essential"), true);
  assert.equal(messageHasScheduleIntent("Move Shower to Go Further"), true);
  assert.equal(messageHasScheduleIntent("This should become a core activity"), true);
  assert.equal(messageHasScheduleIntent("Prioritize this as part of my daily routine"), true);
  assert.equal(messageHasScheduleIntent("This activity feels essential to me"), false);
});
