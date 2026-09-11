import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { removeStaleIntervalDayItems } from "../../app/api/schedule-reconciliation-store.ts";

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE daily_plan_items (
    id TEXT PRIMARY KEY,
    daily_plan_id TEXT NOT NULL,
    occurrence_key TEXT,
    schedule_pattern_id TEXT,
    activated_at TEXT,
    completed_at TEXT,
    skipped_at TEXT,
    removed_at TEXT,
    source_date TEXT,
    moved_from_daily_plan_item_id TEXT,
    revision INTEGER NOT NULL DEFAULT 1
  );

  INSERT INTO daily_plan_items VALUES
    ('same-day-generated', 'today', 'pattern:shower:2026-09-11', 'shower', NULL, NULL, NULL, NULL, '2026-09-11', NULL, 1),
    ('retroactive-carry', 'today', 'carry:shower:2026-09-10', 'shower', '2026-09-11 08:00:00', NULL, NULL, NULL, '2026-09-10', 'yesterday-shower', 1),
    ('customized-carry', 'today', 'carry:shower:2026-09-09', 'shower', '2026-09-11 08:00:00', NULL, NULL, NULL, '2026-09-09', 'older-shower', 2),
    ('completed-carry', 'today', 'carry:shower:2026-09-08', 'shower', '2026-09-11 08:00:00', '2026-09-11 09:00:00', NULL, NULL, '2026-09-08', 'old-shower', 1),
    ('manual-move', 'today', 'moved:yesterday-shower:2026-09-11', 'shower', NULL, NULL, NULL, NULL, '2026-09-10', 'yesterday-shower', 1),
    ('activated-extra', 'today', 'pattern:shower:2026-09-11', 'shower', '2026-09-11 08:00:00', NULL, NULL, NULL, '2026-09-11', NULL, 1),
    ('other-pattern', 'today', 'carry:stretch:2026-09-10', 'stretch', '2026-09-11 08:00:00', NULL, NULL, NULL, '2026-09-10', 'yesterday-stretch', 1),
    ('other-plan', 'tomorrow', 'carry:shower:2026-09-10', 'shower', '2026-09-12 08:00:00', NULL, NULL, NULL, '2026-09-10', 'yesterday-shower', 1);
`);

const db = {
  prepare(sql) {
    return {
      bind(...params) {
        return { run: () => sqlite.prepare(sql).run(...params) };
      },
    };
  },
};

await removeStaleIntervalDayItems(db, {
  planId: "today",
  date: "2026-09-11",
  patternIds: ["shower"],
});

assert.deepEqual(
  sqlite.prepare("SELECT id FROM daily_plan_items ORDER BY id").all().map((row) => row.id),
  ["activated-extra", "completed-carry", "customized-carry", "manual-move", "other-pattern", "other-plan"],
);

await removeStaleIntervalDayItems(db, { planId: "today", date: "2026-09-11", patternIds: [] });
sqlite.close();
