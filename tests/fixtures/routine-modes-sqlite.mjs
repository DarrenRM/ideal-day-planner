import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import { configureSelectionModes } from "../../app/daily-selection-model.ts";
import { validateRecordActions } from "../../app/activity-record-model.ts";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`CREATE TABLE activity_records (id TEXT PRIMARY KEY, user_id TEXT, payload_json TEXT, version INTEGER, updated_at TEXT, archived_at TEXT);
CREATE TABLE activity_record_revisions (id TEXT PRIMARY KEY, record_id TEXT, revision_number INTEGER, title TEXT, payload_json TEXT);`);
const original = { kind: "routine", items: [{ id: "mask", label: "Light mask", subjectKey: "device", allowMultiple: true }], entries: [{ id: "old", date: "2026-09-03", itemIds: ["mask"], counts: { mask: 2 } }] };
sqlite.prepare("INSERT INTO activity_records VALUES ('choices', 'partner', ?, 10, NULL, NULL)").run(JSON.stringify(original));
let loseResponse = false;
let concurrentUse = false;
const db = {
  prepare(sql) {
    const bind = (...args) => ({ sql, args, async first() { return sqlite.prepare(sql).get(...args) ?? null; } });
    return { ...bind(), bind };
  },
  async batch(statements) {
    if (concurrentUse) {
      concurrentUse = false;
      sqlite.exec("UPDATE activity_records SET version = version + 1");
    }
    sqlite.exec("BEGIN");
    let results;
    try { results = statements.map(({ sql, args }) => ({ meta: sqlite.prepare(sql).run(...args) })); sqlite.exec("COMMIT"); }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    if (loseResponse) { loseResponse = false; throw new Error("Lost response after commit"); }
    return results;
  },
};
async function readActivityRecords() {
  const row = sqlite.prepare("SELECT * FROM activity_records WHERE id = 'choices'").get();
  return [{ id: row.id, key: "choices", type: "daily_selection", title: "Choices", scope: "activity", subjectKey: null, scopeDate: null, version: row.version, data: JSON.parse(row.payload_json) }];
}
// Compile the actual mutation entry point, supplying only its database and
// record readers. This exercises production SQL, validation and retry logic.
const source = readFileSync(new URL("../../app/api/agent-store.ts", import.meta.url), "utf8");
const body = source.slice(source.indexOf("export async function applyUserRecordMutation("), source.indexOf("export async function readConversationState("));
const compiled = ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
new Function("exports", "getD1", "readActivityRecords", "safeId", "configureSelectionModes", "validateRecordActions", compiled)(exports, () => db, readActivityRecords, (value) => encodeURIComponent(value).replaceAll("%", "_"), configureSelectionModes, validateRecordActions);
const input = { userId: "partner", activityId: "face", recordKey: "choices", actionId: "configure-1", operation: "configure_daily_selection_modes", payload: { expectedVersion: 10, itemId: "mask", modes: [{ id: "red", label: "Red" }, { id: "green", label: "Green" }, { id: "amber", label: "Amber" }] } };
loseResponse = true;
await assert.rejects(exports.applyUserRecordMutation(input), /Lost response/);
const [saved] = await exports.applyUserRecordMutation(input);
assert.equal(saved.version, 11, "retry must not configure twice or reject its own successful write");
assert.deepEqual(saved.data.entries, original.entries);
assert.equal(saved.data.items.length, 4);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM activity_record_revisions").get().n, 1);
await assert.rejects(exports.applyUserRecordMutation({ ...input, actionId: "stale" }), /routine changed/);
concurrentUse = true;
await assert.rejects(exports.applyUserRecordMutation({ ...input, actionId: "raced", payload: { ...input.payload, expectedVersion: 11 } }), /routine changed/);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM activity_record_revisions").get().n, 1);
assert.deepEqual((await readActivityRecords())[0].data, saved.data);
sqlite.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON activity_record_revisions BEGIN SELECT RAISE(ABORT, 'receipt failure'); END;");
await assert.rejects(exports.applyUserRecordMutation({ ...input, actionId: "rollback", payload: { ...input.payload, expectedVersion: 12 } }), /receipt failure/);
assert.equal((await readActivityRecords())[0].version, 12, "receipt failure rolls back configuration");
sqlite.close();
