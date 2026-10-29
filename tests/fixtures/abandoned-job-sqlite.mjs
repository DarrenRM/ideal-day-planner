import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { FAIL_ABANDONED_FINAL_ATTEMPTS } from "../../app/api/agent-job-lease.ts";

const sqlite = new DatabaseSync(":memory:");
for (const name of (await readdir(new URL("../../drizzle/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort()) {
  sqlite.exec(await readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8"));
}
sqlite.exec(`
  INSERT INTO users (id) VALUES ('owner');
  INSERT INTO conversations (id, user_id, scope_type) VALUES ('global', 'owner', 'global');
`);
const insert = sqlite.prepare(`
  INSERT INTO agent_jobs (id, user_id, scope_type, conversation_id, kind, idempotency_key, status, attempts, lease_token, lease_owner, lease_expires_at)
  VALUES (?, 'owner', 'global', 'global', 'global_message', ?, ?, ?, 'token', 'bridge', datetime('now', ?))
`);
// [id, status, attempts, lease offset]
for (const [id, status, attempts, offset] of [
  ["final-expired-running", "running", 3, "-1 minute"],
  ["final-expired-leased", "leased", 3, "-1 minute"],
  ["final-live", "running", 3, "+2 minutes"],
  ["earlier-expired", "running", 2, "-1 minute"],
  ["final-succeeded", "succeeded", 3, "-1 minute"],
]) insert.run(id, id, status, attempts, offset);

sqlite.prepare(FAIL_ABANDONED_FINAL_ATTEMPTS).run();
const jobs = Object.fromEntries(sqlite.prepare("SELECT id, status, lease_token AS leaseToken, lease_expires_at AS leaseExpiresAt, error FROM agent_jobs").all().map((job) => [job.id, job]));

for (const id of ["final-expired-running", "final-expired-leased"]) {
  assert.equal(jobs[id].status, "failed", id);
  assert.equal(jobs[id].leaseToken, null, id);
  assert.equal(jobs[id].leaseExpiresAt, null, id);
  assert.match(jobs[id].error, /final attempt stopped responding/, id);
}
// A live final attempt may still finish, and an earlier attempt is retried by the normal lease query.
assert.equal(jobs["final-live"].status, "running");
assert.equal(jobs["earlier-expired"].status, "running");
assert.equal(jobs["final-succeeded"].status, "succeeded");
assert.equal(jobs["final-succeeded"].error, null);
