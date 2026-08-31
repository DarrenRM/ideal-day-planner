import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { updateActivityDetails } from "../../app/api/activity-edit-store.ts";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE activities (id TEXT PRIMARY KEY, user_id TEXT, client_key TEXT, title TEXT, category TEXT, color TEXT, updated_at TEXT);
  CREATE TABLE daily_plans (id TEXT PRIMARY KEY, user_id TEXT, plan_date TEXT);
  CREATE TABLE daily_plan_items (
    id TEXT PRIMARY KEY, daily_plan_id TEXT, activity_id TEXT, title TEXT, category TEXT, color TEXT,
    revision INTEGER DEFAULT 1, updated_at TEXT, activity_variant_id TEXT DEFAULT 'gentle',
    display_label_override TEXT DEFAULT 'Recovery', duration INTEGER DEFAULT 30,
    completed_at TEXT, skipped_at TEXT, position INTEGER DEFAULT 3, plan_role TEXT DEFAULT 'extra'
  );
  INSERT INTO activities VALUES ('a', 'owner', 'stretch', 'Stretch', 'Recharge', '#67b7ce', NULL);
  INSERT INTO activities VALUES ('b', 'other', 'stretch', 'Other stretch', 'Recharge', '#67b7ce', NULL);
  INSERT INTO daily_plans VALUES ('past', 'owner', '2026-08-30'), ('today', 'owner', '2026-08-31'),
    ('future', 'owner', '2026-09-01'), ('other', 'other', '2026-08-31');
  INSERT INTO daily_plan_items (id, daily_plan_id, activity_id, title, category, color, completed_at)
    VALUES ('past', 'past', 'a', 'Stretch', 'Recharge', '#67b7ce', '2026-08-30T12:00:00Z'),
    ('today', 'today', 'a', 'Stretch', 'Recharge', '#67b7ce', '2026-08-31T12:00:00Z'),
    ('second', 'today', 'a', 'Stretch', 'Recharge', '#67b7ce', NULL),
    ('future', 'future', 'a', 'Stretch', 'Recharge', '#67b7ce', NULL),
    ('other', 'other', 'b', 'Other stretch', 'Recharge', '#67b7ce', NULL);
`);

// Execute the production statements in SQLite with D1's atomic batch contract.
const db = {
  prepare(sql) { return { bind(...args) { return { sql, args }; } }; },
  async batch(statements) {
    sqlite.exec("BEGIN");
    try {
      const results = statements.map(({ sql, args }) => ({ meta: sqlite.prepare(sql).run(...args) }));
      sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
};
const input = { userId: "owner", clientKey: "stretch", title: "Morning mobility", category: "Training", color: "#a8c96d", date: "2026-08-31" };
const readItems = () => sqlite.prepare("SELECT * FROM daily_plan_items ORDER BY id").all().map((row) => ({ ...row }));
const before = readItems();
assert.equal(await updateActivityDetails(db, input), true);
assert.equal(sqlite.prepare("SELECT title FROM activities WHERE id = 'a'").get().title, input.title);
for (const row of readItems()) {
  const original = before.find((item) => item.id === row.id);
  if (["today", "second", "future"].includes(row.id)) {
    assert.deepEqual({ ...row, title: original.title, category: original.category, color: original.color, revision: original.revision, updated_at: original.updated_at }, original);
    assert.equal(row.title, input.title);
    assert.equal(row.category, input.category);
    assert.equal(row.color, input.color);
    assert.equal(row.revision, 2);
  } else assert.deepEqual(row, original);
}
assert.equal(sqlite.prepare("SELECT title FROM activities WHERE id = 'b'").get().title, "Other stretch");
const saved = readItems();
assert.equal(await updateActivityDetails(db, { ...input, clientKey: "missing" }), false);
assert.deepEqual(readItems(), saved);

// A snapshot failure must also roll back the definition, never half-save.
sqlite.exec("CREATE TRIGGER fail_edit BEFORE UPDATE ON daily_plan_items BEGIN SELECT RAISE(ABORT, 'snapshot failure'); END;");
await assert.rejects(updateActivityDetails(db, { ...input, title: "Should roll back" }), /snapshot failure/);
assert.equal(sqlite.prepare("SELECT title FROM activities WHERE id = 'a'").get().title, input.title);
assert.deepEqual(readItems(), saved);
sqlite.close();
