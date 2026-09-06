import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readAgentTrackRecord, readHistoryDetail, readTrackRecord } from "../../app/api/track-record-store.ts";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE activities (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, category TEXT);
  CREATE TABLE daily_plans (id TEXT PRIMARY KEY, user_id TEXT, plan_date TEXT);
  CREATE UNIQUE INDEX daily_plans_user_date_unique ON daily_plans(user_id, plan_date);
  CREATE TABLE daily_plan_items (id TEXT PRIMARY KEY, daily_plan_id TEXT, activity_id TEXT, title TEXT,
    variant_name_snapshot TEXT, display_label_override TEXT, category TEXT, duration INTEGER, position INTEGER,
    plan_role TEXT, activated_at TEXT, completed_at TEXT, skipped_at TEXT, removed_at TEXT);
  CREATE INDEX daily_plan_items_plan_position_idx ON daily_plan_items(daily_plan_id, position);
  CREATE TABLE activity_runs (id TEXT PRIMARY KEY, user_id TEXT, daily_plan_item_id TEXT, actual_elapsed_seconds INTEGER);
  CREATE TABLE activity_records (id TEXT PRIMARY KEY, user_id TEXT, activity_id TEXT, title TEXT, record_type TEXT, payload_json TEXT);
  INSERT INTO activities VALUES ('walk', 'owner', 'Walking now renamed', 'Training'), ('care', 'owner', 'Care', 'Care'), ('private', 'partner', 'Private', 'Spirit');
  INSERT INTO daily_plans VALUES ('d1', 'owner', '2026-09-01'), ('empty', 'owner', '2026-09-03'), ('other', 'partner', '2026-09-01');
  INSERT INTO daily_plan_items VALUES
    ('one', 'd1', 'walk', 'Morning walk then', 'Easy', NULL, 'Training', 30, 0, 'essential', NULL, 'done', NULL, NULL),
    ('two', 'd1', 'walk', 'Evening walk then', NULL, NULL, 'Training', 30, 1, 'essential', NULL, NULL, 'skip', NULL),
    ('extra', 'd1', 'care', 'Care', NULL, NULL, 'Care', 10, 2, 'extra', 'chosen', NULL, NULL, NULL),
    ('unchosen', 'd1', 'care', 'Care', NULL, NULL, 'Care', 10, 3, 'extra', NULL, NULL, NULL, NULL),
    ('removed', 'd1', 'care', 'Care', NULL, NULL, 'Care', 10, 4, 'essential', NULL, NULL, NULL, 'removed'),
    ('secret', 'other', 'private', 'Private', NULL, NULL, 'Spirit', 30, 0, 'essential', NULL, 'done', NULL, NULL);
  INSERT INTO activity_runs VALUES ('run', 'owner', 'one', 300), ('secret', 'partner', 'secret', 9999);
`);
const db = { prepare(sql) { return { bind(...values) { return {
  async all() { return { results: sqlite.prepare(sql).all(...values) }; },
  async first() { return sqlite.prepare(sql).get(...values) ?? null; },
}; } }; } };
const addRecord = (id, user, activity, type, data) => sqlite.prepare("INSERT INTO activity_records VALUES (?, ?, ?, ?, ?, ?)").run(id, user, activity, id, type, JSON.stringify(data));
addRecord("measured", "owner", "walk", "session_log", { fields: [{ id: "minutes", label: "Duration", unit: "min" }], defaultOption: { id: "walk", label: "Walk" }, entries: [{ id: "s1", date: "2026-09-01", optionId: "walk", values: [{ field: "minutes", value: "5" }], note: "In the park" }] });
addRecord("selection", "owner", "care", "daily_selection", { items: [{ id: "serum", label: "Serum" }, { id: "mask", label: "Face mask" }], entries: [{ id: "e1", date: "2026-09-02", itemIds: ["serum"] }] });
addRecord("recurring", "owner", "care", "recurring_step", { label: "Scalp roller", completedDates: ["2026-09-01"] });
addRecord("secret", "partner", "private", "meal_log", { entries: [{ id: "secret", date: "2026-09-01", title: "Secret dinner" }] });

const before = sqlite.prepare("SELECT total_changes() AS n").get().n;
const range = { start: "2026-09-01", end: "2026-09-03" };
const overview = await readTrackRecord(db, "owner", range, "2026-09-06");
assert.deepEqual(overview.totals, { planned: 3, completed: 1, skipped: 1 });
assert.deepEqual(overview.days.map(({ known, planned, entries }) => [known, planned, entries]), [[true, 3, 2], [false, 0, 1], [true, 0, 0]]);
assert.equal(overview.activities.length, 2);
const walks = await readTrackRecord(db, "owner", { ...range, activityId: "walk" }, "2026-09-06");
assert.deepEqual(walks.totals, { planned: 2, completed: 1, skipped: 1 });
const detail = await readHistoryDetail(db, "owner", "2026-09-01");
assert.equal(detail.occurrences.length, 3);
assert.equal(detail.occurrences[0].title, "Morning walk then");
assert.equal(detail.occurrences[0].variantName, "Easy");
assert.equal(detail.occurrences[0].actualSeconds, 300);
assert.equal(detail.occurrences[1].actualSeconds, null, "a 30 minute estimate is not recorded time");
assert.ok(detail.entries.some((entry) => entry.lines.includes("Duration: 5 min")));
assert.ok(detail.entries.some((entry) => entry.title === "Scalp roller"));
assert.ok(!JSON.stringify(detail).includes("Secret"));
const missing = await readHistoryDetail(db, "owner", "2026-09-02");
assert.equal(missing.known, false);
assert.deepEqual(missing.entries[0].lines, ["Serum"], "parent completion never infers all products used");
assert.equal((await readHistoryDetail(db, "owner", "2026-09-01", "private")).entries.length, 0);
const agent = await readAgentTrackRecord(db, "owner", "2026-09-06", "How was my track record from 2026-09-01 to 2026-09-03?");
assert.deepEqual(agent.totals, overview.totals);
assert.equal(agent.missingDays, 1);
assert.equal(sqlite.prepare("SELECT total_changes() AS n").get().n, before, "all reads must leave the database unchanged");

// History has no recent-run limit and does not collapse repeated occurrences.
for (let i = 0; i < 125; i++) sqlite.prepare("INSERT INTO daily_plan_items VALUES (?, 'd1', 'walk', 'Walk', NULL, NULL, 'Training', 10, ?, 'essential', NULL, 'done', NULL, NULL)").run(`old-${i}`, i + 10);
assert.equal((await readTrackRecord(db, "owner", { start: "2026-01-01", end: "2026-09-06" }, "2026-09-06")).totals.completed, 126);
// Corrections are reflected by both consumers without erasing the saved log.
sqlite.exec("UPDATE daily_plan_items SET completed_at = NULL WHERE id = 'one'");
assert.equal((await readHistoryDetail(db, "owner", "2026-09-01", "walk")).entries.length, 1);
assert.equal((await readAgentTrackRecord(db, "owner", "2026-09-06", "this month", "walk")).totals.completed, 125);
const plan = sqlite.prepare("EXPLAIN QUERY PLAN SELECT id FROM daily_plans WHERE user_id = ? AND plan_date BETWEEN ? AND ?").all("owner", range.start, range.end);
assert.ok(plan.some((row) => row.detail.includes("daily_plans_user_date_unique")));
sqlite.close();
