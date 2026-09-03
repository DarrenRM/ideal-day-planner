import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import * as store from "../../app/api/clarification-answer-store.ts";
import * as model from "../../app/conversation-clarification-model.ts";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE activities (id TEXT PRIMARY KEY, user_id TEXT, title TEXT);
  CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT, scope_type TEXT);
  CREATE TABLE conversation_messages (
    id TEXT PRIMARY KEY, conversation_id TEXT REFERENCES conversations(id), role TEXT, body TEXT, source TEXT
  );
  CREATE TABLE conversation_clarifications (
    id TEXT PRIMARY KEY, user_id TEXT, conversation_id TEXT REFERENCES conversations(id),
    activity_id TEXT, activity_variant_id TEXT, source_agent_job_id TEXT, question TEXT, options_json TEXT,
    status TEXT DEFAULT 'pending', selected_option_id TEXT,
    response_message_id TEXT REFERENCES conversation_messages(id), answered_at TEXT, updated_at TEXT
  );
  CREATE TABLE agent_jobs (
    id TEXT PRIMARY KEY, user_id TEXT, scope_type TEXT, activity_id TEXT, activity_variant_id TEXT,
    conversation_id TEXT REFERENCES conversations(id), kind TEXT, idempotency_key TEXT UNIQUE,
    source_message_id TEXT REFERENCES conversation_messages(id), delegation_instruction TEXT
  );
  INSERT INTO activities VALUES ('face-care', 'owner', 'Face Care');
  INSERT INTO conversations VALUES ('activity-chat', 'owner', 'activity'), ('global-chat', 'owner', 'global');
  INSERT INTO agent_jobs (id, user_id, scope_type, kind) VALUES
    ('activity-worker', 'owner', 'activity', 'workspace_refresh'),
    ('global-worker', 'owner', 'global', 'global_refresh');
`);
const db = {
  prepare(sql) {
    return { bind(...args) {
      return { sql, args, async first() { return sqlite.prepare(sql).get(...args) ?? null; } };
    } };
  },
  async batch(statements) {
    sqlite.exec("BEGIN");
    try {
      const result = statements.map(({ sql, args }) => ({ meta: sqlite.prepare(sql).run(...args) }));
      sqlite.exec("COMMIT");
      return result;
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
};
// Exercise the real HTTP handler with only its runtime/auth dependencies replaced.
const code = ts.transpileModule(await readFile(new URL("../../app/api/clarifications/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
const dependencies = {
  "../../../db": { getD1: () => db },
  "../clarification-answer-store": store,
  "../../conversation-clarification-model": model,
  "../agent-store": {
    requestIdentity: (request) => request.headers.get("test-user"),
    ensureAgentSchema: async () => {},
    safeId: (value) => encodeURIComponent(value).replaceAll("%", "_"),
    apiFailure: (error) => Response.json({ error: error.message }, { status: 500 }),
  },
};
new Function("require", "exports", code)((name) => {
  assert.ok(dependencies[name], `Unexpected dependency ${name}`);
  return dependencies[name];
}, exports);

const response = "I choose whichever Face Care steps fit my skin each day. Replace the fixed routine with a daily checklist, and let me record multiple LED mask sessions for different colors.";
const options = JSON.stringify([
  { id: "choose-daily", label: "Choose daily", response },
  { id: "every-step", label: "Every step", response: "Keep the fixed routine." },
]);
function seed(id, { chat = "activity-chat", activity = "face-care", variant = null, source = "migration" } = {}) {
  sqlite.prepare(`INSERT INTO conversation_clarifications
    (id, user_id, conversation_id, activity_id, activity_variant_id, source_agent_job_id, question, options_json)
    VALUES (?, 'owner', ?, ?, ?, ?, 'How should Face Care work?', ?)`)
    .run(id, chat, activity, variant, source, options);
}
function answer(id, optionId = "choose-daily", userId = "owner") {
  return exports.POST(new Request("https://example.test/api/clarifications", {
    method: "POST", headers: { "test-user": userId, "content-type": "application/json" },
    body: JSON.stringify({ clarificationId: id, optionId }),
  }));
}
const jobs = () => sqlite.prepare("SELECT * FROM agent_jobs WHERE source_message_id IS NOT NULL ORDER BY id").all();
seed("migration");
assert.equal((await answer("migration")).status, 202);
assert.equal(jobs().length, 1, "daily checklist must not also queue schedule or fast-chat work");
assert.equal(jobs()[0].kind, "workspace_refresh");
assert.equal(jobs()[0].activity_variant_id, null);
assert.deepEqual({ ...await store.readAnsweredClarification(db, "owner", jobs()[0].source_message_id) }, {
  question: "How should Face Care work?", response,
});
assert.equal(await store.readAnsweredClarification(db, "other", jobs()[0].source_message_id), null);
assert.equal((await answer("migration")).status, 200);
assert.equal((await answer("migration", "every-step")).status, 409);
assert.equal(jobs().length, 1);

seed("delegated", { chat: "global-chat", variant: "evening", source: "activity-worker" });
assert.equal((await answer("delegated")).status, 202);
const delegated = jobs().find((job) => job.id.includes("delegated"));
assert.equal(delegated.kind, "workspace_refresh");
assert.equal(delegated.scope_type, "activity");
assert.equal(delegated.conversation_id, "global-chat");
assert.equal(delegated.activity_id, "face-care");
assert.equal(delegated.activity_variant_id, "evening");

seed("coordinator", { source: "global-worker" });
assert.equal((await answer("coordinator")).status, 202);
const coordinator = jobs().find((job) => job.id.includes("coordinator"));
assert.equal(coordinator.kind, "global_refresh");
assert.equal(JSON.parse(coordinator.delegation_instruction).kind, "durable_work");
seed("global", { chat: "global-chat", activity: null });
assert.equal((await answer("global")).status, 202);
assert.equal(jobs().find((job) => job.id.endsWith(":global")).kind, "global_refresh");

seed("race");
const competing = await Promise.all([answer("race"), answer("race", "every-step")]);
assert.deepEqual(competing.map((result) => result.status).sort(), [202, 409]);
assert.equal(jobs().filter((job) => job.id.includes(":race")).length, 1);
assert.equal(sqlite.prepare("SELECT body FROM conversation_messages WHERE id LIKE '%:race'").get().body, response);

seed("protected");
const count = jobs().length;
assert.equal((await answer("protected", "choose-daily", "other")).status, 404);
assert.equal((await answer("protected", "invalid")).status, 400);
assert.equal((await answer("protected", "choose-daily", "")).status, 401);
assert.equal(jobs().length, count);
sqlite.exec("CREATE TRIGGER fail_queue BEFORE INSERT ON agent_jobs BEGIN SELECT RAISE(ABORT, 'queue failure'); END;");
assert.equal((await answer("protected")).status, 500);
assert.equal(sqlite.prepare("SELECT status FROM conversation_clarifications WHERE id = 'protected'").get().status, "pending");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM conversation_messages WHERE id LIKE '%:protected'").get().n, 0);
sqlite.close();
