import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("removes an untouched carried interval after its source day is completed retroactively", () => {
  const result = spawnSync(process.execPath, [
    "--experimental-sqlite",
    "--experimental-strip-types",
    fileURLToPath(new URL("./fixtures/schedule-reconciliation-sqlite.mjs", import.meta.url)),
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("refreshes Today immediately after a historical completion correction", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const endpoint = options\.reconcile[\s\S]*`\/api\/day\?date=\$\{todayDateKey\}&timeZone=\$\{encodeURIComponent\(browserTimeZone\(\)\)\}`[\s\S]*`\/api\/day\?date=\$\{todayDateKey\}&sync=1`/);
  assert.match(page, /async function togglePastDayCompletion[\s\S]*setPastDayItems[\s\S]*await reloadToday\(\{ reconcile: true \}\);[\s\S]*setSaveState\("saved"\)/);
  assert.match(page, /<TrackRecordView[\s\S]*onChanged=\{\(\) => \{[\s\S]*reloadToday\(\{ background: true, reconcile: true \}\)/);
});

test("wires stale interval cleanup into day resolution", async () => {
  const store = await readFile(new URL("../app/api/schedule-store.ts", import.meta.url), "utf8");
  assert.match(store, /const staleIds = intervalPatternIds[\s\S]*removeStaleIntervalDayItems\(db, \{ planId, date, patternIds: staleIds \}\)/);
});
