import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { findRoleOccurrence, persistActivityRole } from "../../app/api/activity-role-store.ts";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE activities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    client_key TEXT NOT NULL
  );
  CREATE TABLE daily_plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_date TEXT NOT NULL
  );
  CREATE TABLE daily_plan_items (
    id TEXT PRIMARY KEY,
    daily_plan_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    activity_variant_id TEXT,
    occurrence_key TEXT NOT NULL,
    schedule_pattern_step_id TEXT,
    plan_role TEXT NOT NULL DEFAULT 'essential',
    activated_at TEXT,
    deactivated_at TEXT,
    completed_at TEXT,
    skipped_at TEXT,
    removed_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE schedule_pattern_steps (
    id TEXT PRIMARY KEY,
    plan_role TEXT NOT NULL DEFAULT 'essential',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE routine_templates (
    id TEXT PRIMARY KEY,
    schedule_revision INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE schedule_action_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_json TEXT NOT NULL,
    source TEXT NOT NULL,
    actor TEXT NOT NULL,
    idempotency_key TEXT NOT NULL
  );

  INSERT INTO activities VALUES
    ('activity-owner', 'owner', 'wall-sit'),
    ('activity-other', 'other', 'wall-sit');
  INSERT INTO daily_plans VALUES
    ('plan-current', 'owner', '2026-09-01'),
    ('plan-future', 'owner', '2026-09-02'),
    ('plan-old', 'owner', '2026-08-31'),
    ('plan-other', 'other', '2026-09-01');
  INSERT INTO daily_plan_items
    (id, daily_plan_id, activity_id, activity_variant_id, occurrence_key,
     schedule_pattern_step_id, position, created_at)
  VALUES
    ('occurrence-current', 'plan-current', 'activity-owner', NULL, 'wall-sit:2026-09-01', 'step-current', 0, '2026-09-01T07:00:00Z'),
    ('occurrence-future', 'plan-future', 'activity-owner', NULL, 'wall-sit:2026-09-02', 'step-current', 0, '2026-09-02T07:00:00Z'),
    ('occurrence-variant', 'plan-current', 'activity-owner', 'variant-heavy', 'wall-sit-heavy:2026-09-01', 'step-heavy', 1, '2026-09-01T07:01:00Z'),
    ('occurrence-old', 'plan-old', 'activity-owner', NULL, 'wall-sit:2026-08-31', 'step-old', 0, '2026-08-31T07:00:00Z'),
    ('occurrence-other', 'plan-other', 'activity-other', NULL, 'wall-sit:2026-09-01', 'step-other', 0, '2026-09-01T07:00:00Z');
  INSERT INTO schedule_pattern_steps (id) VALUES ('step-current');
  INSERT INTO routine_templates (id) VALUES ('routine-owner');
`);

const db = {
  prepare(sql) {
    return {
      bind(...params) {
        return {
          first: () => sqlite.prepare(sql).get(...params),
          run: () => sqlite.prepare(sql).run(...params),
        };
      },
    };
  },
  async batch(statements) {
    return statements.map((statement) => statement.run());
  },
};

const base = {
  userId: "owner",
  occurrenceId: "occurrence-old",
  occurrenceKey: "wall-sit:2026-09-01",
  activityId: "wall-sit",
  activityVariantId: "",
  date: "2026-09-01",
};

assert.deepEqual({ ...await findRoleOccurrence(db, base) }, {
  id: "occurrence-current",
  schedulePatternStepId: "step-current",
});

assert.deepEqual({ ...await findRoleOccurrence(db, {
  ...base,
  occurrenceKey: "missing-key",
  activityVariantId: "variant-heavy",
}) }, {
  id: "occurrence-variant",
  schedulePatternStepId: "step-heavy",
});

assert.equal(await findRoleOccurrence(db, { ...base, userId: "missing-user" }), undefined);

assert.deepEqual({ ...await findRoleOccurrence(db, {
  ...base,
  occurrenceKey: "",
  activityId: "",
  activityVariantId: "",
  date: "",
}) }, {
  id: "occurrence-old",
  schedulePatternStepId: "step-old",
});

await persistActivityRole(db, {
  userId: "owner",
  routineId: "routine-owner",
  occurrence: { id: "occurrence-current", schedulePatternStepId: "step-current" },
  planRole: "extra",
});

const currentExtra = sqlite.prepare(`
  SELECT plan_role AS planRole, activated_at AS activatedAt, deactivated_at AS deactivatedAt
  FROM daily_plan_items WHERE id = 'occurrence-current'
`).get();
const futureExtra = sqlite.prepare(`
  SELECT plan_role AS planRole, activated_at AS activatedAt, deactivated_at AS deactivatedAt
  FROM daily_plan_items WHERE id = 'occurrence-future'
`).get();
assert.equal(currentExtra.planRole, "extra");
assert.equal(currentExtra.activatedAt, null);
assert.equal(typeof currentExtra.deactivatedAt, "string");
assert.deepEqual({ ...futureExtra }, { planRole: "extra", activatedAt: null, deactivatedAt: null });

sqlite.exec(`
  UPDATE daily_plan_items
  SET activated_at = CURRENT_TIMESTAMP
  WHERE plan_role = 'extra' AND activated_at IS NULL AND deactivated_at IS NULL
`);
assert.equal(sqlite.prepare("SELECT activated_at FROM daily_plan_items WHERE id = 'occurrence-current'").get().activated_at, null);
assert.equal(typeof sqlite.prepare("SELECT activated_at FROM daily_plan_items WHERE id = 'occurrence-future'").get().activated_at, "string");

await persistActivityRole(db, {
  userId: "owner",
  routineId: "routine-owner",
  occurrence: { id: "occurrence-current", schedulePatternStepId: "step-current" },
  planRole: "essential",
});
assert.equal(sqlite.prepare("SELECT deactivated_at FROM daily_plan_items WHERE id = 'occurrence-current'").get().deactivated_at, null);

sqlite.close();
