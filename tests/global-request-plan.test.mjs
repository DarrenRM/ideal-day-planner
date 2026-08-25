import assert from "node:assert/strict";
import test from "node:test";

import {
  parseGlobalRequestPlan,
  parseStoredGlobalRequestPlan,
  validateHandledOutcomes,
} from "../app/global-request-plan.ts";

test("preserves bounded semantic outcomes from Luna's acknowledgement", () => {
  const plan = parseGlobalRequestPlan({
    kind: "durable_work",
    outcomes: ["Move retinol to Bed Routine", "Make Bed Routine essential"],
  });
  assert.deepEqual(plan, {
    kind: "durable_work",
    outcomes: ["Move retinol to Bed Routine", "Make Bed Routine essential"],
  });
  assert.deepEqual(parseStoredGlobalRequestPlan(JSON.stringify(plan)), plan);
  assert.equal(parseGlobalRequestPlan({ kind: "durable_work", outcomes: [] }), null);
});

test("requires Terra to cover every request outcome exactly once", () => {
  const plan = parseGlobalRequestPlan({
    kind: "durable_work",
    outcomes: ["Move retinol", "Make Bed Routine essential"],
  });
  assert.deepEqual(validateHandledOutcomes([
    { index: 1, via: "activity_work" },
    { index: 2, via: "schedule_proposal" },
  ], plan), [
    { index: 1, via: "activity_work" },
    { index: 2, via: "schedule_proposal" },
  ]);
  assert.equal(validateHandledOutcomes([{ index: 1, via: "activity_work" }], plan), null);
  assert.equal(validateHandledOutcomes([
    { index: 1, via: "activity_work" },
    { index: 1, via: "schedule_proposal" },
  ], plan), null);
});
