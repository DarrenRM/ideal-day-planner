import assert from "node:assert/strict";
import test from "node:test";

import { activityWorkReceipt, historicalWorkspaceReceipt, scheduleWorkReceipt } from "../app/work-receipt-model.ts";

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

test("a subject move receipt carries the destination used by View", () => {
  assert.deepEqual(activityWorkReceipt({
    activityTitle: "Skin Routine",
    jobKind: "user_message",
    existingRecords: [{ key: "retinol", title: "Retinol Night Serum" }],
    recordActions: [],
    workspaceActions: [],
    activityMoves: [{ op: "move_subject", subjectKey: "retinol", targetActivityId: "activity:bed" }],
    moveDetails: [{ subjectTitle: "Retinol Night Serum", targetTitle: "Bed Routine", targetActivityId: "activity:bed", targetActivityClientKey: "bed-routine" }],
    followUpActions: [],
  }), {
    kind: "subject_move",
    title: "Retinol Night Serum moved to Bed Routine",
    detail: "All of its linked details moved together.",
    target: "workspace",
    targetActivityId: "activity:bed",
    targetActivityClientKey: "bed-routine",
  });
});

test("reconstructs a specific historical product setup from workspace revisions", () => {
  assert.deepEqual(historicalWorkspaceReceipt({
    activityTitle: "Skin Routine",
    before: [],
    after: [
      { id: "roller", type: "product", title: "Beard Grooming Roller" },
      { id: "protocol", type: "protocol", title: "Skin Routine Protocol" },
      { id: "weekly", type: "recurring_step", title: "Weekly Beard Grooming Roller" },
      { id: "history", type: "activity_event", title: "Beard Grooming Roller Use" },
    ],
  }), {
    kind: "activity_update",
    title: "Beard Grooming Roller added",
    detail: "Added Beard Grooming Roller with routine steps, a weekly schedule, and use history to Skin Routine.",
    target: "workspace",
  });
});

test("reconstructs a partial historical move without claiming the history moved", () => {
  assert.deepEqual(historicalWorkspaceReceipt({
    activityTitle: "Skin Routine",
    moveTargetTitle: "Hair Routine",
    before: [
      { id: "roller", type: "product", title: "Beard Grooming Roller" },
      { id: "protocol", type: "protocol", title: "Skin Routine Protocol" },
      { id: "weekly", type: "recurring_step", title: "Weekly Beard Grooming Roller" },
      { id: "history", type: "activity_event", title: "Beard Grooming Roller Use" },
    ],
    after: [{ id: "history", type: "activity_event", title: "Beard Grooming Roller Use" }],
  }), {
    kind: "subject_move",
    title: "Beard Grooming Roller moved to Hair Routine",
    detail: "Moved the product, routine steps, and a weekly schedule to Hair Routine. Use history stayed in Skin Routine.",
    target: "workspace",
  });
});

test("reconstructs cleanup of a leftover historical activity event", () => {
  assert.deepEqual(historicalWorkspaceReceipt({
    activityTitle: "Skin Routine",
    before: [{ id: "history", type: "activity_event", title: "Beard Grooming Roller Use" }],
    after: [],
  }), {
    kind: "activity_update",
    title: "Beard Grooming Roller history removed",
    detail: "Removed the remaining use history from Skin Routine.",
    target: "workspace",
  });
});
