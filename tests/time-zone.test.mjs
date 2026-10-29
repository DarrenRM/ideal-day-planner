import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { canonicalTimeZone, FALLBACK_TIME_ZONE, resolveTimeZone } from "../app/time-zone.ts";
import { localDateInTimeZone } from "../app/schedule-model.ts";

test("time zones are validated and stored in their canonical spelling", () => {
  assert.equal(canonicalTimeZone("america/los_angeles"), "America/Los_Angeles");
  assert.equal(canonicalTimeZone("Europe/Paris"), "Europe/Paris");
  for (const value of ["", "Not/AZone", "x".repeat(65), null, undefined, 42]) assert.equal(canonicalTimeZone(value), null);
  assert.equal(resolveTimeZone("Not/AZone"), FALLBACK_TIME_ZONE);
  assert.equal(FALLBACK_TIME_ZONE, "UTC");
});

test("the same instant is a different local day for people in different zones", () => {
  const lateEvening = "2026-08-22T02:30:00Z";
  assert.equal(localDateInTimeZone(lateEvening, resolveTimeZone("America/Los_Angeles")), "2026-08-21");
  assert.equal(localDateInTimeZone(lateEvening, resolveTimeZone("Europe/London")), "2026-08-22");
});

test("existing accounts keep their zone, new ones start in UTC, and the browser's zone is saved", () => {
  const result = spawnSync(process.execPath, ["--experimental-sqlite", "--experimental-strip-types", fileURLToPath(new URL("./fixtures/time-zone-sqlite.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("no server or client path assumes one fixed time zone", async () => {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
      if (entry.isDirectory()) await walk(next);
      else if (/\.(ts|tsx|mjs)$/.test(entry.name)) files.push(next);
    }
  };
  for (const dir of ["../app/", "../bridge/", "../db/"]) await walk(new URL(dir, import.meta.url));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /["'`]America\/[A-Za-z_]+/, fileURLToPath(file));
  }
});

test("server routes take today from the person's zone, not the server clock", async () => {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
      if (entry.isDirectory()) await walk(next);
      else if (/\.ts$/.test(entry.name)) files.push(next);
    }
  };
  await walk(new URL("../app/api/", import.meta.url));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /new Date\(\)\.toLocaleDateString\("en-CA"\)/, fileURLToPath(file));
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/, fileURLToPath(file));
  }
});
