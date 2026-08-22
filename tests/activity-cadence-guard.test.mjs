import assert from "node:assert/strict";
import test from "node:test";
import { recurringStepRepresentsParentActivity, removeParentCadenceRecordActions } from "../app/activity-cadence-guard.ts";

function recurring(key, label, subjectKey = null, itemKey = undefined) {
  return { key, subjectKey, type: "recurring_step", title: label, scope: "activity", data: { label, itemKey, cadence: { kind: "interval_days", every: 2 }, anchorDate: "2026-08-21" } };
}

test("rejects recurring steps that duplicate the parent activity cadence", () => {
  const activity = { title: "Shower", clientKey: "shower" };
  assert.equal(recurringStepRepresentsParentActivity(recurring("shower-cadence", "Every-other-day shower"), activity), true);
  assert.equal(recurringStepRepresentsParentActivity(recurring("roller-weekly", "Use the grooming roller", "grooming-roller", "grooming-roller"), activity), false);
  assert.deepEqual(removeParentCadenceRecordActions([
    { op: "upsert", record: recurring("shower-cadence", "Every-other-day shower") },
    { op: "upsert", record: recurring("roller-weekly", "Use the grooming roller", "grooming-roller", "grooming-roller") },
  ], activity).map((action) => action.op === "upsert" ? action.record.key : action.recordKey), ["roller-weekly"]);
});

