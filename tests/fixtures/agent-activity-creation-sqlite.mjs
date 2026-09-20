import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import * as creationStore from "../../app/api/activity-create-store.ts";

const sqlite = new DatabaseSync(":memory:");
for (const name of (await readdir(new URL("../../drizzle/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(await readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8"));
sqlite.exec("PRAGMA foreign_keys=ON; INSERT INTO users(id) VALUES ('owner'),('partner'); INSERT INTO routine_templates(id,user_id) VALUES ('routine','owner'),('partner-routine','partner');");
sqlite.exec("INSERT INTO conversations(id,user_id,scope_type) VALUES ('global','partner','global'),('owner-global','owner','global'); INSERT INTO conversation_messages(id,conversation_id,role,body,source) VALUES ('source-1','global','user','Create releasing tension','user'),('owner-source','owner-global','user','Create releasing tension','user');");
let loseResponse = false;
const db = {
  prepare(sql) {
    const bind = (...args) => ({ sql, args, async first() { return sqlite.prepare(sql).get(...args) ?? null; }, async run() { return { meta: sqlite.prepare(sql).run(...args) }; } });
    return { ...bind(), bind };
  },
  async batch(statements) {
    sqlite.exec("BEGIN");
    try { for (const { sql, args } of statements) sqlite.prepare(sql).run(...args); sqlite.exec("COMMIT"); }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    if (loseResponse) { loseResponse = false; throw new Error("Lost response after commit"); }
  },
};
const code = ts.transpileModule(await readFile(new URL("../../app/api/agent-activity-creation.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const service = {};
new Function("require", "exports", code)((name) => { assert.equal(name, "./activity-create-store"); return creationStore; }, service);
let failResolution = false;
const input = { userId: "partner", sourceMessageId: "source-1", jobId: "job-1", conversationId: "global", localDate: "2026-09-20",
  action: { title: "Releasing tension", category: "Training", durationMinutes: 15, cadence: { kind: "daily" }, effectiveDate: "2026-09-20", planRole: "essential" },
  resolveDay: async () => { if (failResolution) { failResolution = false; throw new Error("Resolution failed"); } },
};
const count = (table) => sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
// Core failure rolls back the activity too.
sqlite.exec("CREATE TRIGGER fail_step BEFORE INSERT ON schedule_pattern_steps BEGIN SELECT RAISE(ABORT,'step failed'); END;");
await assert.rejects(service.createAgentActivity(db, input), /step failed/);
assert.equal(count("activities"), 0);
sqlite.exec("DROP TRIGGER fail_step");
loseResponse = true; failResolution = true;
await assert.rejects(service.createAgentActivity(db, input), /Resolution failed/);
assert.equal(count("activities"), 1);
const created = await service.createAgentActivity(db, input);
assert.deepEqual(await service.createAgentActivity(db, input), created);
assert.equal(count("activities"), 1); assert.equal(count("schedule_patterns"), 1); assert.equal(count("schedule_action_events"), 1);
assert.equal(sqlite.prepare("SELECT plan_role FROM schedule_pattern_steps").get().plan_role, "essential");
assert.equal(sqlite.prepare("SELECT duration_minutes FROM schedule_pattern_steps").get().duration_minutes, 15);
await assert.rejects(service.createAgentActivity(db, { ...input, sourceMessageId: "repeat-request" }), /already exists/);
await assert.rejects(service.createAgentActivity(db, { ...input, action: { ...input.action, durationMinutes: 20 } }), /different details/);
await service.createAgentActivity(db, { ...input, userId: "owner", sourceMessageId: "owner-source", conversationId: "owner-global" });
assert.equal(count("activities"), 2);
sqlite.exec("UPDATE schedule_pattern_steps SET duration_minutes=30 WHERE activity_id='" + created.activityId + "'");
await assert.rejects(service.createAgentActivity(db, input), /no longer matches/);
