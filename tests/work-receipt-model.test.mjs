import assert from "node:assert/strict";
import test from "node:test";

import { activityWorkReceipt, scheduleWorkReceipt } from "../app/work-receipt-model.ts";

test("describes a committed cadence change with the activity name", () => {
  assert.deepEqual(scheduleWorkReceipt({
    activityTitle: "Shower",
    previousCadence: { kind: "interval_days", every: 2, anchorDate: "2026-08-21" },
    cadence: { kind: "interval_days", every: 3, anchorDate: "2026-08-23" },
  }), {
    kind: "schedule_update",
    title: "Shower schedule updated",
    detail: "Every other day → Every 3 days",
    target: "workspace",
  });
});

test("summarizes actual record changes and a check-in without internal language", () => {
  assert.deepEqual(activityWorkReceipt({
    activityTitle: "Hair Routine",
    jobKind: "workspace_refresh",
    existingRecords: [{ key: "serum", title: "LL-01" }],
    recordActions: [
      { op: "upsert", record: { key: "serum", type: "product", title: "LL-01", data: {} } },
      { op: "upsert", record: { key: "roller", type: "product", title: "Scalp grooming roller", data: {} } },
    ],
    workspaceActions: [],
    activityMoves: [],
    followUpActions: [{ op: "upsert", key: "roller-check", title: "scalp comfort", question: "How did it feel?", dueDate: "2026-08-31", inferred: false }],
  }), {
    kind: "activity_update",
    title: "Hair Routine updated",
    detail: "Added Scalp grooming roller. Updated LL-01.",
    secondary: "Check-in set for August 31.",
    target: "workspace",
  });
});

test("does not create a receipt when no durable activity work was committed", () => {
  assert.equal(activityWorkReceipt({
    activityTitle: "Lift",
    jobKind: "user_message",
    existingRecords: [],
    recordActions: [],
    workspaceActions: [],
    activityMoves: [],
    followUpActions: [],
  }), null);
});
