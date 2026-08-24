import assert from "node:assert/strict";
import test from "node:test";

import { dayProgressCounts, GO_FURTHER_PREVIEW_LIMIT, normalizeActivityOrigin, normalizePlanRole, partitionAvailableExtras, partitionDayItems } from "../app/day-role.ts";

test("keeps activity origin separate from the dated commitment role", () => {
  assert.equal(normalizeActivityOrigin("starter"), "starter");
  assert.equal(normalizeActivityOrigin("luna"), "luna");
  assert.equal(normalizeActivityOrigin("unknown"), "user");
  assert.equal(normalizePlanRole("extra"), "extra");
  assert.equal(normalizePlanRole("starter"), "essential");
});

test("promotes only activated extras into today's active list", () => {
  const items = [
    { id: "morning", planRole: "essential" },
    { id: "walk", planRole: "extra" },
    { id: "stretch", planRole: "extra", activatedAt: "2026-08-23 08:10:00" },
    { id: "finished-extra", planRole: "extra", completedAt: "2026-08-23 09:00:00" },
  ];
  const result = partitionDayItems(items);
  assert.deepEqual(result.active.map((item) => item.id), ["morning", "stretch", "finished-extra"]);
  assert.deepEqual(result.availableExtras.map((item) => item.id), ["walk"]);
  assert.equal(GO_FURTHER_PREVIEW_LIMIT, 3);
});

test("activated extras expand today's progress denominator without changing the essential count", () => {
  assert.deepEqual(dayProgressCounts([
    { planRole: "essential", completedAt: "2026-08-23 08:00:00" },
    { planRole: "essential", completedAt: "2026-08-23 08:05:00" },
    { planRole: "extra" },
    { planRole: "extra", activatedAt: "2026-08-23 08:10:00", completedAt: "2026-08-23 08:20:00" },
    { planRole: "extra", activatedAt: "2026-08-23 08:15:00" },
    { planRole: "extra", activatedAt: "2026-08-23 08:15:00", skippedAt: "2026-08-23 08:16:00" },
  ]), {
    selectedTotal: 4,
    selectedCompleted: 3,
    essentialTotal: 2,
    essentialCompleted: 2,
  });
});

test("Keep it going requires a completed, activated extra on the previous matching occurrence", () => {
  const result = partitionAvailableExtras([
    { id: "continued", planRole: "extra", previousPlanRole: "extra", previousEligibleDate: "2026-08-22", previousActivatedAt: "2026-08-22 08:00:00", previousCompletedAt: "2026-08-22 08:20:00" },
    { id: "not-selected", planRole: "extra", previousPlanRole: "extra", previousEligibleDate: "2026-08-22", previousActivatedAt: null, previousCompletedAt: "2026-08-22 08:20:00" },
    { id: "missed-last-time", planRole: "extra", previousPlanRole: "extra", previousEligibleDate: "2026-08-22", previousActivatedAt: "2026-08-22 08:00:00", previousCompletedAt: null },
    { id: "formerly-essential", planRole: "extra", previousPlanRole: "essential", previousEligibleDate: "2026-08-22", previousActivatedAt: "2026-08-22 08:00:00", previousCompletedAt: "2026-08-22 08:20:00" },
  ]);
  assert.deepEqual(result.keepGoing.map((item) => item.id), ["continued"]);
  assert.deepEqual(result.moreOptions.map((item) => item.id), ["not-selected", "missed-last-time", "formerly-essential"]);
});
