import assert from "node:assert/strict";
import test from "node:test";

import { GO_FURTHER_PREVIEW_LIMIT, normalizeActivityOrigin, normalizePlanRole, partitionDayItems } from "../app/day-role.ts";

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
