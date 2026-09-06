import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { historyDates, historyDayState, historyPeriod, historyRangeForMessage, validHistoryDate } from "../app/track-record-model.ts";
import { projectHistoryEntry } from "../app/api/track-record-store.ts";
import { eventPrompt } from "../bridge/ideal-day-bridge.mjs";

test("calendar validates real dates, leap years and bounded ranges", () => {
  assert.equal(validHistoryDate("2026-02-29"), false);
  assert.equal(validHistoryDate("2024-02-29"), true);
  assert.equal(validHistoryDate("2026-13-01"), false);
  assert.equal(historyDates("2024-01-01", "2024-12-31").length, 366);
  assert.equal(historyDates("2024-01-01", "2025-01-01").length, 0);
  assert.deepEqual(historyPeriod("2024-02-04", "month"), { start: "2024-02-01", end: "2024-02-29" });
});

test("heatmap distinguishes unknown, unscheduled, skipped and partial days", () => {
  const day = { date: "2026-09-01", planned: 0, completed: 0, skipped: 0, known: false, entries: 0 };
  assert.equal(historyDayState(day), "unknown");
  assert.equal(historyDayState({ ...day, known: true }), "unscheduled");
  assert.equal(historyDayState({ ...day, known: true, planned: 1, skipped: 1 }), "zero");
  assert.equal(historyDayState({ ...day, known: true, planned: 2, completed: 1 }), "mostly");
});

test("Luna history interprets requested periods without assuming every day is scheduled", () => {
  assert.equal(historyRangeForMessage("last month", "2026-01-03").start, "2025-12-01");
  assert.equal(historyRangeForMessage("last week", "2026-09-06").start, "2026-08-24");
  assert.equal(historyRangeForMessage("this week", "2026-09-06").start, "2026-08-31");
  assert.equal(historyRangeForMessage("last year", "2026-09-06").end, "2025-12-31");
  assert.equal(historyRangeForMessage("How did August go?", "2026-09-06").start, "2026-08-01");
  assert.equal(historyRangeForMessage("from 2026-07-01 to 2026-07-31", "2026-09-06").end, "2026-07-31");
});

test("strength details preserve performed exercises and units, without inventing performance", () => {
  const entry = projectHistoryEntry({ recordId: "r", activityId: "a", activityTitle: "Lift", title: "Strength", type: "strength_session", payload: "{}", date: "2026-09-01", entry: JSON.stringify({ id: "s", workoutTitle: "Modified session", exercises: [{ name: "Squat", sets: [{ ordinal: 1, load: "40 kg", reps: 8, rir: 2 }] }], note: "Felt good" }) });
  assert.equal(entry.title, "Modified session");
  assert.deepEqual(entry.lines, ["Squat · Set 1: 8 reps × 40 kg · 2 reps in reserve", "Felt good"]);
});

test("history reader uses real SQLite and shares scoped saved facts with Luna", () => {
  const result = spawnSync(process.execPath, ["--experimental-sqlite", "--experimental-strip-types", fileURLToPath(new URL("./fixtures/track-record-sqlite.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("durable global and activity Luna receive history while the acknowledgement stays lightweight", () => {
  const trackRecord = { start: "2026-09-01", end: "2026-09-06", totals: { planned: 6, completed: 4, skipped: 1 }, missingDays: 2, rules: "Missing days are unknown", activities: [], days: [], recentEntries: [] };
  const context = { scope: "global", sourceMessage: { body: "How is my track record?" }, trackRecord };
  assert.match(eventPrompt({ job: { kind: "global_refresh" }, context }), /"completed":4/);
  assert.doesNotMatch(eventPrompt({ job: { kind: "global_message" }, context }), /"completed":4/);
  assert.match(eventPrompt({ job: { kind: "user_message" }, context: { ...context, scope: "activity", activity: { title: "Walk" } } }), /Missing days are unknown/);
});
