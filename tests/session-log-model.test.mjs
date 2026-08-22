import assert from "node:assert/strict";
import test from "node:test";

import {
  measuredSessionFields,
  selectedSessionOptionId,
  sessionFieldsForOption,
  summarizeSessionLog,
} from "../app/session-log-model.ts";

test("an explicit daily choice overrides a bounded trial", () => {
  const data = {
    selections: [{ date: "2026-08-21", optionId: "rower" }],
    activeSelection: { optionId: "elliptical", startDate: "2026-08-20", endDate: "2026-08-28" },
  };
  assert.equal(selectedSessionOptionId(data, "2026-08-21"), "rower");
  assert.equal(selectedSessionOptionId(data, "2026-08-22"), "elliptical");
  assert.equal(selectedSessionOptionId(data, "2026-08-29"), undefined);
});

test("builds modality-specific fields without showing another option's settings", () => {
  const fields = measuredSessionFields([
    { id: "elliptical", label: "Elliptical" },
    { id: "rower", label: "Row machine" },
  ]);
  const data = { fields };
  const elliptical = sessionFieldsForOption(data, "elliptical");
  const rower = sessionFieldsForOption(data, "rower");
  assert.deepEqual(elliptical.slice(0, 2).map((field) => field.kind), ["duration", "effort"]);
  assert.ok(elliptical.some((field) => field.id === "elliptical-incline"));
  assert.ok(!elliptical.some((field) => field.id === "rower-damper"));
  assert.ok(rower.some((field) => field.id === "rower-split"));
  assert.ok(rower.some((field) => field.id === "rower-damper"));
});

test("summarizes the selected modality for the current calendar week", () => {
  const data = {
    fields: measuredSessionFields([{ id: "elliptical", label: "Elliptical" }]),
    entries: [
      { id: "prior", date: "2026-08-16", optionId: "elliptical", values: [{ field: "duration", value: "10" }] },
      { id: "monday", date: "2026-08-17", optionId: "elliptical", values: [{ field: "duration", value: "15" }, { field: "effort", value: "6" }, { field: "elliptical-distance", value: "1.5" }] },
      { id: "friday", date: "2026-08-21", optionId: "elliptical", values: [{ field: "duration", value: "20" }, { field: "effort", value: "8" }, { field: "elliptical-distance", value: "2" }] },
      { id: "other", date: "2026-08-21", optionId: "bike", values: [{ field: "duration", value: "99" }] },
    ],
  };
  const summary = summarizeSessionLog(data, "elliptical", "2026-08-21");
  assert.equal(summary.latestPrior?.id, "monday");
  assert.equal(summary.weekEntries.length, 2);
  assert.equal(summary.totalDuration, 35);
  assert.equal(summary.totalDistance, 3.5);
  assert.equal(summary.averageEffort, 7);
  assert.equal(summary.weekDays.reduce((sum, day) => sum + day.value, 0), 35);
  assert.equal(summary.recentWeeks.length, 4);
  assert.deepEqual(summary.recentWeeks.at(-1), {
    startDate: "2026-08-17", endDate: "2026-08-23", sessions: 2, duration: 35,
  });
});
