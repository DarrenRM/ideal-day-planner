import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("reopening saves occurrence and run together without erasing choices or affecting another account", () => {
  const result = spawnSync(process.execPath, ["--experimental-sqlite", "--experimental-strip-types", fileURLToPath(new URL("./fixtures/activity-reopen-sqlite.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("header, footer, Completed list and overflow offer the shared reopen operation", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /disabled=\{isCompleting\} type="button" onClick=\{\(\) => void toggleActivityComplete\(\)\}/);
  assert.match(page, /complete-status-button[^]*?disabled=\{isPending\}/);
  assert.doesNotMatch(page, /disabled=\{isCompleting \|\| isComplete\}|disabled=\{isPending \|\| isComplete\}/);
  assert.match(page, /onReopen=\{\(item\) => void updateActivityStatus\(item, "reopen"\)\}/);
  assert.match(page, /role="menuitem"[^\n]*Mark incomplete/);
});
