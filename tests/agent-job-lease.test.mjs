import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("a final attempt that stops responding is marked failed instead of staying in progress", () => {
  const result = spawnSync(process.execPath, ["--experimental-sqlite", "--experimental-strip-types", fileURLToPath(new URL("./fixtures/abandoned-job-sqlite.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("the bridge lease clears abandoned final attempts before choosing the next job", async () => {
  const source = await readFile(new URL("../app/api/agent/jobs/route.ts", import.meta.url), "utf8");
  const cleared = source.indexOf("db.prepare(FAIL_ABANDONED_FINAL_ATTEMPTS).run()");
  assert.ok(cleared > 0);
  assert.ok(cleared < source.indexOf("const candidate = await db.prepare("));
});
