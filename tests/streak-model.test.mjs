import assert from "node:assert/strict";
import test from "node:test";
import { dailyCompletionStreak, dailyStreakBlocks, recurringCompletionStreak, streakSteps } from "../app/streak-model.ts";

test("derives a daily streak without giving a new subject older completions", () => {
  assert.deepEqual(dailyCompletionStreak(["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24"], "2026-08-24"), { count: 5, completedToday: true });
  assert.deepEqual(dailyCompletionStreak([], "2026-08-24"), { count: 0, completedToday: false });
  assert.deepEqual(streakSteps(0), [1, 2, 3, 4, 5, 6, 7]);
});

test("compresses completed seven-day blocks while keeping the active week readable", () => {
  assert.deepEqual(dailyStreakBlocks(6, true), { completedDays: 6, completedWeeks: 0 });
  assert.deepEqual(dailyStreakBlocks(7, true), { completedDays: 7, completedWeeks: 1 });
  assert.deepEqual(dailyStreakBlocks(7, false), { completedDays: 0, completedWeeks: 1 });
  assert.deepEqual(dailyStreakBlocks(8, true), { completedDays: 1, completedWeeks: 1 });
  assert.deepEqual(streakSteps(1), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(streakSteps(8), [2, 3, 4, 5, 6, 7, 8]);
});

test("keeps a future recurring product at Use 1 until its first eligible day", () => {
  assert.deepEqual(recurringCompletionStreak({
    anchorDate: "2026-08-25",
    cadence: { kind: "weekdays", weekdays: [2, 5] },
    completedDates: [],
    today: "2026-08-24",
  }), { count: 0, completedToday: false });
});

test("completion API snapshots due subject keys instead of inheriting the activity", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/api/activity/run/route.ts", import.meta.url), "utf8"));
  assert.match(source, /completedSubjectKeysForDate/);
  assert.match(source, /effectiveDate <= date/);
  assert.match(source, /recurringDateIsDue/);
  assert.match(source, /completedSubjectKeys,/);
});
