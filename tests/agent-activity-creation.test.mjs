import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as schedule from "../app/schedule-model.ts";
import { parseGlobalRequestPlan, validateHandledOutcomes } from "../app/global-request-plan.ts";
import { parseAgentResult } from "../bridge/ideal-day-bridge.mjs";

const code = ts.transpileModule(await readFile(new URL("../app/activity-creation-model.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const model = {};
new Function("require", "exports", code)(() => schedule, model);
const action = { title: "Releasing tension", category: "Training", durationMinutes: 15, cadence: { kind: "daily" }, effectiveDate: "2026-09-20", planRole: "essential" };

test("creation requires all schedule details and survives the bridge envelope", () => {
  assert.deepEqual(model.parseActivityCreation(action), action);
  for (const field of Object.keys(action)) {
    const invalid = { ...action }; delete invalid[field];
    assert.equal(model.parseActivityCreation(invalid), null, field);
  }
  assert.equal(model.parseActivityCreation({ ...action, durationMinutes: 0 }), null);
  assert.deepEqual(parseAgentResult(JSON.stringify({ activityCreation: action })).activityCreation, action);
});

test("a creation cannot be marked handled by a promise, empty result, or wrong worker", () => {
  const plan = parseGlobalRequestPlan({ kind: "durable_work", outcomes: ["Create releasing tension"], outcomeKinds: ["activity_creation"] });
  for (const via of ["message", "activity_work", "schedule_proposal"]) {
    assert.equal(validateHandledOutcomes([{ index: 1, via }], plan), null);
  }
  assert.equal(validateHandledOutcomes([], plan), null);
  assert.deepEqual(validateHandledOutcomes([{ index: 1, via: "activity_creation" }], plan), [{ index: 1, via: "activity_creation" }]);
  assert.equal(parseGlobalRequestPlan({ ...plan, outcomeKinds: [] }), null);
});

test("creation commits schedule atomically, recovers uncertain writes, and isolates users", () => {
  const result = spawnSync(process.execPath, ["--experimental-sqlite", "--experimental-strip-types", fileURLToPath(new URL("./fixtures/agent-activity-creation-sqlite.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
