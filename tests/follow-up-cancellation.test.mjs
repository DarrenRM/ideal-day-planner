import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const store = await readFile(new URL("../app/api/agent-store.ts", import.meta.url), "utf8");

test("removing a check-in cancels queued or active Luna work", () => {
  const mutation = store.match(/export async function updateActivityFollowUp[\s\S]*?return readActivityFollowUps\(input\.activityId\);/u)?.[0] || "";
  assert.match(mutation, /SET status = 'cancelled'/);
  assert.match(mutation, /status IN \('queued', 'leased', 'running', 'retryable_failure'\)/);
  assert.match(mutation, /lease_token = NULL/);
  assert.match(mutation, /SET status = 'dismissed'/);
});

test("due follow-up jobs are only inserted while the check-in is pending", () => {
  const queue = store.match(/export async function queueDueFollowUps[\s\S]*?return due\.results\.length;/u)?.[0] || "";
  assert.match(queue, /INSERT OR IGNORE INTO agent_jobs/);
  assert.match(queue, /FROM activity_follow_ups/);
  assert.match(queue, /status = 'pending'/);
});
