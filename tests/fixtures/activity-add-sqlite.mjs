import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import * as store from "../../app/api/activity-create-store.ts";
import * as scheduleModel from "../../app/schedule-model.ts";
import * as dayRole from "../../app/day-role.ts";
import * as setupPolicy from "../../app/activity-setup-policy.ts";
import * as timeZone from "../../app/time-zone.ts";

const sqlite = new DatabaseSync(":memory:");
for (const name of (await readdir(new URL("../../drizzle/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort()) {
  sqlite.exec(await readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8"));
}
sqlite.exec("PRAGMA foreign_keys = ON; INSERT INTO users (id) VALUES ('owner'), ('partner'); INSERT INTO routine_templates (id, user_id) VALUES ('routine', 'owner'), ('partner-routine', 'partner');");
let loseBatchResponse = false;
const db = {
  prepare(sql) {
    const bind = (...args) => ({ sql, args,
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { return { meta: sqlite.prepare(sql).run(...args) }; },
    });
    return { ...bind(), bind };
  },
  async batch(statements) {
    sqlite.exec("BEGIN");
    let results;
    try {
      results = statements.map(({ sql, args }) => ({ meta: sqlite.prepare(sql).run(...args) }));
      sqlite.exec("COMMIT");
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    if (loseBatchResponse) { loseBatchResponse = false; throw new Error("Lost batch response after commit"); }
    return results;
  },
};
const safeId = (value) => encodeURIComponent(value).replaceAll("%", "_");
async function loadModule(path, dependencies) {
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name) => {
    assert.ok(dependencies[name], `Unexpected dependency ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}
const jobs = await loadModule("../../app/api/activity-message-jobs.ts", {
  "../../db": { getD1: () => db }, "./agent-store": { safeId },
  "../schedule-intent": { messageHasScheduleIntent: () => false },
  "../research-intent": { messageRequestsResearch: () => false },
});
let failResolution = false, resolutions = 0;
const occurrences = new Set();
const route = await loadModule("../../app/api/activities/route.ts", {
  "../../../db": { getD1: () => db },
  "../../schedule-model": scheduleModel, "../../day-role": dayRole, "../../time-zone": timeZone,
  "../activity-create-store": store, "../../activity-setup-policy": setupPolicy,
  "../activity-edit-store": {}, "../activity-role-store": {},
  "../activity-message-jobs": jobs,
  "../agent-store": { requestIdentity: (request) => request.headers.get("test-user"),
    ensureAgentSchema: async () => {}, safeId,
    apiFailure: (error) => Response.json({ error: error.message }, { status: 500 }) },
  "../schedule-store": { resolveDay: async () => {
    resolutions++;
    if (failResolution) { failResolution = false; throw new Error("Temporary day resolution failure"); }
  } },
  "../schedule-actions": { applyOccurrenceAction: async (_user, action) => { occurrences.add(action.idempotencyKey); } },
});
const base = { title: "Evening / sunset walk", category: "Care", duration: 20, clientKey: "evening", date: "2026-09-03",
  schedule: { kind: "daily" }, includeToday: true, planRole: "extra", setupRequest: "" };
const post = (payload, user = "partner") => route.POST(new Request("http://test/api/activities", {
  method: "POST", headers: { "test-user": user, "content-type": "application/json" }, body: JSON.stringify(payload),
}));
const count = (table) => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const send = async (payload, status = 200, user = "partner") => {
  const response = await post(payload, user);
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
};

// Repeated/concurrent submissions use a single definition, pattern and setup.
const responses = await Promise.all([post(base), post(base)]);
assert.deepEqual(responses.map((response) => response.status), [200, 200]);
for (const table of ["activities", "schedule_patterns", "schedule_pattern_steps", "agent_jobs", "activity_creation_requests"]) assert.equal(count(table), 1, table);
assert.equal(sqlite.prepare("SELECT schedule_revision FROM routine_templates WHERE id='partner-routine'").get().schedule_revision, 2);
const resolved = resolutions;
await send(base);
assert.equal(resolutions, resolved, "completed retries do not resolve or alter today's activity again");
await send({ ...base, schedule: { kind: "none" } }, 409);
assert.equal(JSON.parse(sqlite.prepare("SELECT cadence_json FROM schedule_patterns").get().cadence_json).kind, "daily");

// Different accounts and deliberately separate intents can use the same name.
await send(base, 200, "owner");
await send({ ...base, clientKey: "another-walk" });
assert.equal(count("activities"), 3);

// Failure anywhere in core creation cannot strand an unscheduled activity.
sqlite.exec("CREATE TRIGGER fail_step BEFORE INSERT ON schedule_pattern_steps BEGIN SELECT RAISE(ABORT, 'step failed'); END;");
await send({ ...base, clientKey: "rollback" }, 500);
assert.equal(count("activities"), 3);
assert.equal(count("activity_creation_requests"), 3);
sqlite.exec("DROP TRIGGER fail_step;");
await send({ ...base, clientKey: "rollback" });

// Resume after the core committed but today's materialization failed.
failResolution = true;
await send({ ...base, clientKey: "resume", setupRequest: "Track time and distance" }, 500);
const jobsBefore = count("agent_jobs"), messagesBefore = count("conversation_messages");
await send({ ...base, clientKey: "resume", setupRequest: "Track time and distance" });
assert.equal(count("agent_jobs"), jobsBefore);
assert.equal(count("conversation_messages"), messagesBefore);
assert.equal(messagesBefore, 1);
assert.ok(sqlite.prepare("SELECT completed_at FROM activity_creation_requests WHERE activity_id='activity:partner:resume'").get().completed_at);
loseBatchResponse = true;
await send({ ...base, clientKey: "lost-response" });
await send({ ...base, clientKey: "lost-response" });

// Explicit no-repeat remains a single dated action; retries cannot multiply it.
const patternsBefore = count("schedule_patterns");
const midday = { ...base, clientKey: "midday", title: "Midday walk", schedule: { kind: "none" } };
await send(midday);
await send(midday);
assert.equal(count("schedule_patterns"), patternsBefore);
assert.equal(occurrences.size, 1);
assert.equal(JSON.parse(sqlite.prepare("SELECT request_json FROM activity_creation_requests WHERE activity_id='activity:partner:midday'").get().request_json).cadence, null);
await send({ ...base, clientKey: "invalid", schedule: { kind: "nonsense" } }, 400);
sqlite.close();
