import assert from "node:assert/strict";
import test from "node:test";
import { dayModePolicy, DEFAULT_DAY_SETTINGS } from "../app/day-settings.ts";

test("checklist mode is the default and disables every clock-derived surface", () => {
  assert.deepEqual(dayModePolicy(DEFAULT_DAY_SETTINGS), {
    timelineEnabled: false,
    showStartGate: false,
    showClockState: false,
    showDurationControls: false,
    showMinuteSummaries: false,
  });
});

test("Day Timeline enables the complete clock policy as one unit", () => {
  assert.deepEqual(dayModePolicy({ ...DEFAULT_DAY_SETTINGS, dayTimelineEnabled: true }), {
    timelineEnabled: true,
    showStartGate: true,
    showClockState: true,
    showDurationControls: true,
    showMinuteSummaries: true,
  });
});

