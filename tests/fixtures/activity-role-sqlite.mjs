import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { findRoleOccurrence } from "../../app/api/activity-role-store.ts";

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
    removed_at TEXT,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  INSERT INTO activities VALUES
    ('activity-owner', 'owner', 'wall-sit'),
    ('activity-other', 'other', 'wall-sit');
  INSERT INTO daily_plans VALUES
    ('plan-current', 'owner', '2026-09-01'),
    ('plan-old', 'owner', '2026-08-31'),
    ('plan-other', 'other', '2026-09-01');
  INSERT INTO daily_plan_items VALUES
    ('occurrence-current', 'plan-current', 'activity-owner', NULL, 'wall-sit:2026-09-01', 'step-current', NULL, 0, '2026-09-01T07:00:00Z'),
    ('occurrence-variant', 'plan-current', 'activity-owner', 'variant-heavy', 'wall-sit-heavy:2026-09-01', 'step-heavy', NULL, 1, '2026-09-01T07:01:00Z'),
    ('occurrence-old', 'plan-old', 'activity-owner', NULL, 'wall-sit:2026-08-31', 'step-old', NULL, 0, '2026-08-31T07:00:00Z'),
    ('occurrence-other', 'plan-other', 'activity-other', NULL, 'wall-sit:2026-09-01', 'step-other', NULL, 0, '2026-09-01T07:00:00Z');
`);

const db = {
  prepare(sql) {
    return {
      bind(...params) {
        return { first: () => sqlite.prepare(sql).get(...params) };
      },
    };
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

sqlite.close();
