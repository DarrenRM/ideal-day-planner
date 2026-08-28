import assert from "node:assert/strict";
import test from "node:test";

import { dueRecurringSteps } from "../app/due-recurring-step.ts";

const retinol = {
  id: "record:retinol",
  key: "retinol-schedule",
  subjectKey: "retinol",
  type: "recurring_step",
  title: "Retinol nights",
  scope: "activity",
  scopeDate: null,
  version: 1,
  data: { label: "Use Retinol 1%", cadence: { kind: "weekdays", weekdays: [2, 5] }, anchorDate: "2026-08-25", completedDates: [] },
  updatedAt: "2026-08-24 12:00:00",
};

test("keeps one nested recurring obligation due until it is completed", () => {
  assert.deepEqual(dueRecurringSteps([retinol], "2026-08-25"), [{ recordKey: "retinol-schedule", subjectKey: "retinol", label: "Use Retinol 1%", dueDate: "2026-08-25", dueState: "today" }]);
  assert.deepEqual(dueRecurringSteps([retinol], "2026-08-26"), [{ recordKey: "retinol-schedule", subjectKey: "retinol", label: "Use Retinol 1%", dueDate: "2026-08-25", dueState: "overdue" }]);
  assert.deepEqual(dueRecurringSteps([{ ...retinol, data: { ...retinol.data, completedDates: ["2026-08-26"] } }], "2026-08-26"), []);
  assert.deepEqual(dueRecurringSteps([retinol], "2026-08-28"), [{ recordKey: "retinol-schedule", subjectKey: "retinol", label: "Use Retinol 1%", dueDate: "2026-08-28", dueState: "today" }]);
});
