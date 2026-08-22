import assert from "node:assert/strict";
import test from "node:test";
import { inferSessionChoicePlan } from "../app/session-choice-plan.ts";

test("turns an explicit one-week option trial into a bounded default", () => {
  assert.deepEqual(inferSessionChoicePlan({
    options: [{ id: "elliptical", label: "Elliptical" }, { id: "bike", label: "Bike" }],
    selections: [{ date: "2026-08-21", optionId: "elliptical" }],
  }, [{
    id: "follow-up-1",
    title: "One-week elliptical trial",
    question: "How did a week on the elliptical feel?",
    sourceDate: "2026-08-21",
    dueDate: "2026-08-28",
  }]), {
    followUpId: "follow-up-1",
    optionId: "elliptical",
    startDate: "2026-08-21",
    endDate: "2026-08-28",
    reason: "One-week elliptical trial",
  });
});

test("does not invent a plan from an unrelated or ambiguous follow-up", () => {
  const data = { options: [{ id: "elliptical", label: "Elliptical" }, { id: "bike", label: "Bike" }] };
  assert.equal(inferSessionChoicePlan(data, [{
    id: "follow-up-1", title: "Cardio review", question: "How is cardio going?", sourceDate: "2026-08-21", dueDate: "2026-08-28",
  }]), null);
  assert.equal(inferSessionChoicePlan(data, [{
    id: "follow-up-2", title: "One-week machine trial", question: "Compare elliptical and bike.", sourceDate: "2026-08-21", dueDate: "2026-08-28",
  }]), null);
});
