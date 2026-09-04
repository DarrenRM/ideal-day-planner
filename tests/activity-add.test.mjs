import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createActivityAddSubmission, activityAddScheduleSummary } from "../app/activity-add-submission.ts";

const payload = { title: "Evening walk", category: "Care", duration: 20, icon: "sun", color: "#d58db5",
  date: "2026-09-03", schedule: { kind: "daily" }, includeToday: true, planRole: "extra", origin: "user", setupRequest: "" };
const created = () => Response.json({ activity: { id: "walk", title: payload.title } });
const day = () => Response.json({ items: [] });

test("Add ignores rapid repeat submissions while saving", async () => {
  let release;
  const calls = [];
  const pending = new Promise((resolve) => { release = resolve; });
  const submission = createActivityAddSubmission(async (url, options) => {
    calls.push({ url, options });
    return options?.method === "POST" ? pending : day();
  }, () => "one-intent");
  const first = submission.submit(payload);
  assert.equal(submission.busy, true);
  assert.equal(await submission.submit(payload), null);
  release(created());
  await first;
  assert.equal(calls.filter((call) => call.options?.method === "POST").length, 1);
});

test("a lost POST response retries the identical identity, date, schedule and setup request", async () => {
  const requests = [];
  const submission = createActivityAddSubmission(async (_url, options) => {
    if (options?.method !== "POST") return day();
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) throw new TypeError("Network disconnected after commit");
    return created();
  }, () => "one-intent");
  await assert.rejects(submission.submit(payload));
  assert.equal(submission.pending, true);
  await submission.submit({ ...payload, date: "2026-09-04", schedule: { kind: "none" }, title: "Changed draft" });
  assert.deepEqual(requests[0], requests[1]);
});

test("failed day refresh retries only the GET, never creates another activity", async () => {
  let posts = 0, gets = 0;
  const submission = createActivityAddSubmission(async (_url, options) => {
    if (options?.method === "POST") { posts++; return created(); }
    gets++;
    return gets === 1 ? new Response("Unavailable", { status: 503 }) : day();
  });
  await assert.rejects(submission.submit(payload), /saved.*refresh/);
  assert.equal(submission.saved, true);
  await submission.submit(payload);
  assert.equal(posts, 1);
  assert.equal(gets, 2);
});

test("validation failures unlock editing, but server failures retain the pending intent", async () => {
  for (const [status, pending] of [[400, false], [401, false], [409, true], [500, true]]) {
    const submission = createActivityAddSubmission(async () => Response.json({ error: "Failed" }, { status }));
    await assert.rejects(submission.submit(payload));
    assert.equal(submission.pending, pending);
    assert.equal(submission.busy, false);
  }
});

test("schedule feedback distinguishes daily, today-only, unscheduled, and unfinished setup", () => {
  assert.match(activityAddScheduleSummary("daily", true, 2, []), /every day/);
  assert.match(activityAddScheduleSummary("none", true, 2, []), /Today only.*not appear automatically tomorrow/);
  assert.match(activityAddScheduleSummary("none", false, 2, []), /without a schedule/);
  assert.match(activityAddScheduleSummary("sequence", true, 2, []), /only after you save the sequence/);
  assert.match(activityAddScheduleSummary("luna", true, 2, []), /No repeat is set yet/);
  assert.match(activityAddScheduleSummary("interval_days", false, 4, []), /first occurrence is in 4 days/);
  assert.match(activityAddScheduleSummary("weekdays", true, 2, [5, 1]), /Mon, Fri/);
});

test("real Add handler commits atomically and survives duplicate requests and partial failures", () => {
  const result = spawnSync(process.execPath, ["--experimental-sqlite", "--experimental-strip-types",
    fileURLToPath(new URL("./fixtures/activity-add-sqlite.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
