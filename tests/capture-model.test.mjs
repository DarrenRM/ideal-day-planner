import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeCaptureLabel, parseCaptureAction, validateCaptureActions } from "../app/capture-model.ts";

test("normalizes and validates bounded open-item captures", () => {
  assert.equal(normalizeCaptureLabel("  More ORANGES!!  "), "more oranges");
  assert.deepEqual(parseCaptureAction({
    op: "capture_open_item",
    activityId: "activity:resupply",
    destinationHint: "Resupply",
    label: "Oranges",
    detail: "Get more oranges",
    urgency: "soon",
    timing: "unspecified",
    idempotencyKey: "capture:message-1:oranges",
  }), {
    op: "capture_open_item",
    activityId: "activity:resupply",
    destinationHint: "Resupply",
    label: "Oranges",
    detail: "Get more oranges",
    urgency: "soon",
    timing: "unspecified",
    idempotencyKey: "capture:message-1:oranges",
  });
  assert.equal(parseCaptureAction({ op: "run_sql", label: "Oranges", idempotencyKey: "bad" }), null);
  assert.equal(parseCaptureAction({ op: "capture_open_item", label: "", idempotencyKey: "bad" }), null);
  assert.equal(validateCaptureActions([{}, { op: "capture_open_item", label: "Oranges", idempotencyKey: "capture:1" }]).length, 1);
});

test("keeps capture filing, timing, and UI behind typed app-owned boundaries", async () => {
  const [service, jobRoute, lunaRoute, captureRoute, dayRoute, page, bridge, migration] = await Promise.all([
    readFile(new URL("../app/api/capture-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/luna/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/captures/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/day/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../bridge/ideal-day-bridge.mjs", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0019_equal_vulture.sql", import.meta.url), "utf8"),
  ]);
  assert.match(service, /normalizeCaptureLabel/);
  assert.match(service, /validateRecordActions/);
  assert.match(service, /persistWorkspaceActions/);
  assert.match(service, /activate_activity_for_date/);
  assert.match(jobRoute, /validateCaptureActions/);
  assert.match(jobRoute, /applyCaptureAction/);
  assert.match(lunaRoute, /mode === "mark-read"/);
  assert.match(captureRoute, /updateCaptureTiming/);
  assert.match(dayRoute, /readCaptureAttention/);
  assert.match(page, /Needs attention/);
  assert.match(page, /attentionExtras/);
  assert.match(bridge, /CaptureAction:/);
  assert.match(bridge, /Filing an item does not change/);
  assert.match(migration, /CREATE TABLE `captured_intents`/);
  assert.match(migration, /ALTER TABLE `conversations` ADD `last_read_at`/);
});
