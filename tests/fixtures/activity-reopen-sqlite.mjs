import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { reopenActivityOccurrence } from "../../app/api/activity-reopen-store.ts";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE daily_plans (id TEXT PRIMARY KEY, user_id TEXT);
  CREATE TABLE daily_plan_items (id TEXT PRIMARY KEY, daily_plan_id TEXT, completed_at TEXT, revision INTEGER, updated_at TEXT);
  CREATE TABLE activity_runs (id TEXT PRIMARY KEY, user_id TEXT, status TEXT, updated_at TEXT, details_json TEXT);
  CREATE TABLE activity_records (id TEXT PRIMARY KEY, payload_json TEXT);
  INSERT INTO daily_plans VALUES ('today', 'partner'), ('other', 'owner');
  INSERT INTO daily_plan_items VALUES ('face-care', 'today', 'completed', 1, NULL), ('other', 'other', 'completed', 1, NULL);
  INSERT INTO activity_runs VALUES ('run', 'partner', 'completed', NULL, '{"completedSubjectKeys":["mask"]}'), ('other-run', 'owner', 'completed', NULL, '{}');
  INSERT INTO activity_records VALUES ('choices', '{"entries":[{"date":"2026-09-03","itemIds":["mask"],"counts":{"mask":2}}]}');
`);
const db = {
  prepare(sql) { return { bind(...args) { return { sql, args }; } }; },
  async batch(statements) {
    sqlite.exec("BEGIN");
    try { const results = statements.map(({ sql, args }) => sqlite.prepare(sql).run(...args)); sqlite.exec("COMMIT"); return results; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
};
const choices = sqlite.prepare("SELECT payload_json FROM activity_records").get().payload_json;
await reopenActivityOccurrence(db, { userId: "partner", occurrenceId: "face-care", runId: "run" });
assert.equal(sqlite.prepare("SELECT completed_at FROM daily_plan_items WHERE id = 'face-care'").get().completed_at, null);
assert.equal(sqlite.prepare("SELECT status FROM activity_runs WHERE id = 'run'").get().status, "reopened");
assert.equal(sqlite.prepare("SELECT payload_json FROM activity_records").get().payload_json, choices);
assert.equal(sqlite.prepare("SELECT details_json FROM activity_runs WHERE id = 'run'").get().details_json, '{"completedSubjectKeys":["mask"]}');
await reopenActivityOccurrence(db, { userId: "partner", occurrenceId: "other", runId: "other-run" });
assert.equal(sqlite.prepare("SELECT completed_at FROM daily_plan_items WHERE id = 'other'").get().completed_at, "completed");
assert.equal(sqlite.prepare("SELECT status FROM activity_runs WHERE id = 'other-run'").get().status, "completed");
sqlite.exec("UPDATE daily_plan_items SET completed_at = 'completed' WHERE id = 'face-care'; CREATE TRIGGER fail_reopen BEFORE UPDATE ON activity_runs BEGIN SELECT RAISE(ABORT, 'run failure'); END;");
await assert.rejects(reopenActivityOccurrence(db, { userId: "partner", occurrenceId: "face-care", runId: "run" }), /run failure/);
assert.equal(sqlite.prepare("SELECT completed_at FROM daily_plan_items WHERE id = 'face-care'").get().completed_at, "completed");
sqlite.close();
