import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("moving out of Essentials resolves stale rows and keeps today in More for today", () => {
  const result = spawnSync(process.execPath, [
    "--experimental-sqlite", "--experimental-strip-types",
    fileURLToPath(new URL("./fixtures/activity-role-sqlite.mjs", import.meta.url)),
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("automatic extra activation respects an explicit return to More for today", async () => {
  const [actions, store] = await Promise.all([
    readFile(new URL("../app/api/schedule-actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/schedule-store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(actions, /action\.type === "activate_extra"[\s\S]*deactivated_at = NULL/);
  assert.match(actions, /action\.type === "deactivate_extra"[\s\S]*deactivated_at = CURRENT_TIMESTAMP/);
  assert.equal(store.match(/AND deactivated_at IS NULL/g)?.length, 2);
});
