import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("role changes resolve a current occurrence when the client row is stale", () => {
  const result = spawnSync(process.execPath, [
    "--experimental-sqlite", "--experimental-strip-types",
    fileURLToPath(new URL("./fixtures/activity-role-sqlite.mjs", import.meta.url)),
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
