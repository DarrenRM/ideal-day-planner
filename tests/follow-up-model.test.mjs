import assert from "node:assert/strict";
import test from "node:test";
import { validateFollowUpActions } from "../app/follow-up-model.ts";

test("accepts a bounded future check-in and rejects stale or vague actions", () => {
  assert.deepEqual(validateFollowUpActions([{
    op: "upsert",
    key: "elliptical-one-week",
    title: "One-week elliptical trial",
    question: "How did the elliptical feel after a week?",
    dueDate: "2026-08-28",
    inferred: true,
  }, {
    op: "upsert",
    key: "past",
    title: "Past",
    question: "Too late?",
    dueDate: "2026-08-20",
    inferred: false,
  }], "2026-08-21"), [{
    op: "upsert",
    key: "elliptical-one-week",
    title: "One-week elliptical trial",
    question: "How did the elliptical feel after a week?",
    dueDate: "2026-08-28",
    inferred: true,
  }]);
});

test("supports completing and dismissing existing follow-ups", () => {
  assert.deepEqual(validateFollowUpActions([
    { op: "complete", key: "elliptical-one-week" },
    { op: "dismiss", key: "another-trial" },
  ], "2026-08-21"), [
    { op: "complete", key: "elliptical-one-week" },
    { op: "dismiss", key: "another-trial" },
  ]);
});

