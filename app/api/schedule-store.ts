import { getD1 } from "../../db";
import {
  parseAdvancement,
  parseCadence,
  resolvePattern,
  type PatternState,
  type SchedulePattern,
  type ScheduleStep,
} from "../schedule-model";
import { parseActivityRecord, type ActivityRecord } from "../activity-record-model";
import { dueRecurringSteps } from "../due-recurring-step";
import { safeId } from "./agent-store";

export type ResolvedDayItem = {
  id: string;
  occurrenceId: string;
  occurrenceKey: string;
  activityId: string;
  activityVariantId: string | null;
  title: string;
  variantName: string | null;
  displayLabel: string | null;
  displayTitle: string;
  duration: number;
  category: string;
  icon: string;
  color: string;
  position: number;
  completedAt: string | null;
  skippedAt: string | null;
  planRole: "essential" | "extra";
  activatedAt: string | null;
  previousEligibleDate: string | null;
  previousCompletedAt: string | null;
  previousActivatedAt: string | null;
  previousPlanRole: "essential" | "extra" | null;
  revision: number;
};

type RecurringStepRow = {
  activityId: string;
  id: string;
  recordKey: string;
  subjectKey: string | null;
  recordType: string;
  title: string;
  scope: string;
  scopeDate: string | null;
  version: number;
  payloadJson: string;
  updatedAt: string;
};

async function dueStepsByActivity(userId: string, activityIds: string[], date: string) {
  const result = new Map<string, ReturnType<typeof dueRecurringSteps>>();
  if (!activityIds.length || !date) return result;
  const rows = await getD1().prepare(`
    SELECT activity_id AS activityId, id, record_key AS recordKey, subject_key AS subjectKey,
           record_type AS recordType, title, scope, scope_date AS scopeDate, version,
           payload_json AS payloadJson, updated_at AS updatedAt
    FROM activity_records
    WHERE user_id = ? AND archived_at IS NULL AND record_type = 'recurring_step'
      AND activity_id IN (${activityIds.map(() => "?").join(", ")})
      AND (scope = 'activity' OR (scope = 'day' AND scope_date = ?))
    ORDER BY created_at, id
  `).bind(userId, ...activityIds, date).all<RecurringStepRow>();
  const records = new Map<string, ActivityRecord[]>();
  for (const row of rows.results) {
    const parsed = parseActivityRecord(row);
    if (!parsed) continue;
    const list = records.get(row.activityId) ?? [];
    list.push(parsed);
    records.set(row.activityId, list);
  }
  for (const [activityId, activityRecords] of records) {
    const due = dueRecurringSteps(activityRecords, date);
    if (due.length) result.set(activityId, due);
  }
  return result;
}

type PatternRow = {
  id: string;
  name: string;
  position: number;
  cadenceJson: string;
  advancementJson: string;
  anchorDate: string;
  initialStepPosition: number;
  effectiveDate: string;
  endDate: string | null;
  revision: number;
  currentStepPosition: number | null;
  archivedAt: string | null;
};

type StepRow = {
  id: string;
  patternId: string;
  activityId: string;
  activityVariantId: string | null;
  position: number;
  durationMinutes: number;
  displayLabelOverride: string | null;
  planRole: "essential" | "extra";
};

const DAY_ROLE_MIGRATION = "day-roles-v1";

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function derivedDisplayTitle(title: string, variantName: string | null, label: string | null) {
  const suffix = label?.trim() || variantName?.trim();
  return suffix ? `${title} — ${suffix}` : title;
}

export async function ensureDefaultSchedule(userId: string, routineId: string) {
  const db = getD1();
  const count = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM schedule_patterns
    WHERE user_id = ? AND routine_id = ? AND archived_at IS NULL
  `).bind(userId, routineId).first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;

  const legacy = await db.prepare(`
    SELECT ri.id, ri.activity_id AS activityId, ri.position, ri.duration,
           ri.created_at AS createdAt, ri.updated_at AS updatedAt,
           a.client_key AS clientKey, a.title
    FROM routine_items ri
    JOIN activities a ON a.id = ri.activity_id
    WHERE ri.routine_id = ? AND a.user_id = ?
    ORDER BY ri.position
  `).bind(routineId, userId).all<{
    id: string;
    activityId: string;
    position: number;
    duration: number;
    createdAt: string;
    updatedAt: string;
    clientKey: string;
    title: string;
  }>();
  if (!legacy.results.length) return;

  const statements = legacy.results.flatMap((item) => {
    const patternId = `schedule-pattern:${item.id}`;
    return [
      db.prepare(`
        INSERT OR IGNORE INTO schedule_patterns
          (id, user_id, routine_id, client_key, name, position, cadence_json,
           advancement_json, anchor_date, initial_step_position, effective_date,
           revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, '{"kind":"daily"}', '{"kind":"calendar"}',
                '1970-01-01', 0, '1970-01-01', 1, ?, ?)
      `).bind(patternId, userId, routineId, `legacy-${item.position}-${item.clientKey}`, item.title, item.position, item.createdAt, item.updatedAt),
      db.prepare(`
        INSERT OR IGNORE INTO schedule_pattern_steps
          (id, pattern_id, activity_id, position, duration_minutes, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?)
      `).bind(`schedule-step:${item.id}`, patternId, item.activityId, item.duration, item.createdAt, item.updatedAt),
    ];
  });
  await db.batch(statements);
}

export async function ensureDayRoles(userId: string, routineId: string) {
  const db = getD1();
  const migrated = await db.prepare(`
    SELECT id FROM user_migrations WHERE user_id = ? AND migration_key = ?
  `).bind(userId, DAY_ROLE_MIGRATION).first<{ id: string }>();
  if (migrated) return;

  const count = await db.prepare(`
    SELECT COUNT(*) AS count FROM schedule_patterns
    WHERE user_id = ? AND routine_id = ? AND archived_at IS NULL
  `).bind(userId, routineId).first<{ count: number }>();
  const migrationId = `migration:${safeId(userId)}:${DAY_ROLE_MIGRATION}`;
  const statements = [];
  if ((count?.count ?? 0) > 8) {
    statements.push(
      db.prepare(`
        UPDATE schedule_pattern_steps
        SET plan_role = 'extra', updated_at = CURRENT_TIMESTAMP
        WHERE pattern_id IN (
          SELECT id FROM schedule_patterns
          WHERE user_id = ? AND routine_id = ? AND archived_at IS NULL
          ORDER BY position, id LIMIT -1 OFFSET 6
        )
      `).bind(userId, routineId),
      db.prepare(`
        UPDATE daily_plan_items
        SET plan_role = 'extra', activated_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE schedule_pattern_step_id IN (
          SELECT s.id FROM schedule_pattern_steps s
          WHERE s.pattern_id IN (
            SELECT id FROM schedule_patterns
            WHERE user_id = ? AND routine_id = ? AND archived_at IS NULL
            ORDER BY position, id LIMIT -1 OFFSET 6
          )
        )
      `).bind(userId, routineId),
    );
  }
  statements.push(db.prepare(`
    INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)
  `).bind(migrationId, userId, DAY_ROLE_MIGRATION));
  await db.batch(statements);
}

export async function readSchedulePatterns(userId: string, routineId: string, options: { includeArchived?: boolean } = {}): Promise<Array<{ pattern: SchedulePattern; state: PatternState | null; archivedAt: string | null }>> {
  const db = getD1();
  const archiveFilter = options.includeArchived ? "" : "AND sp.archived_at IS NULL";
  const patterns = await db.prepare(`
    SELECT sp.id, sp.name, sp.position, sp.cadence_json AS cadenceJson,
           sp.advancement_json AS advancementJson, sp.anchor_date AS anchorDate,
           sp.initial_step_position AS initialStepPosition,
           sp.effective_date AS effectiveDate, sp.end_date AS endDate,
           sp.revision, sps.current_step_position AS currentStepPosition,
           sp.archived_at AS archivedAt
    FROM schedule_patterns sp
    LEFT JOIN schedule_pattern_state sps ON sps.pattern_id = sp.id
    WHERE sp.user_id = ? AND sp.routine_id = ? ${archiveFilter}
    ORDER BY sp.position, sp.id
  `).bind(userId, routineId).all<PatternRow>();
  const stepArchiveFilter = options.includeArchived ? "" : "AND p.archived_at IS NULL";
  const steps = await db.prepare(`
    SELECT s.id, s.pattern_id AS patternId, s.activity_id AS activityId,
           s.activity_variant_id AS activityVariantId, s.position,
           s.duration_minutes AS durationMinutes,
           s.display_label_override AS displayLabelOverride,
           CASE WHEN s.plan_role = 'extra' THEN 'extra' ELSE 'essential' END AS planRole
    FROM schedule_pattern_steps s
    JOIN schedule_patterns p ON p.id = s.pattern_id
    WHERE p.user_id = ? AND p.routine_id = ? ${stepArchiveFilter}
    ORDER BY p.position, s.position
  `).bind(userId, routineId).all<StepRow>();
  const byPattern = new Map<string, ScheduleStep[]>();
  for (const step of steps.results) {
    const list = byPattern.get(step.patternId) ?? [];
    list.push(step);
    byPattern.set(step.patternId, list);
  }

  return patterns.results.flatMap((row) => {
    const cadence = parseCadence(parseJson(row.cadenceJson));
    const advancement = parseAdvancement(parseJson(row.advancementJson));
    const patternSteps = byPattern.get(row.id) ?? [];
    if (!cadence || !advancement || !patternSteps.length) return [];
    return [{
      pattern: {
        id: row.id,
        name: row.name,
        position: row.position,
        cadence,
        advancement,
        anchorDate: row.anchorDate,
        initialStepPosition: row.initialStepPosition,
        effectiveDate: row.effectiveDate,
        endDate: row.endDate,
        revision: row.revision,
        steps: patternSteps,
      },
      state: row.currentStepPosition === null ? null : { currentStepPosition: row.currentStepPosition },
      archivedAt: row.archivedAt,
    }];
  });
}

export async function resolveDay(userId: string, date: string, routineId: string, planId: string, startMinutes: number) {
  const db = getD1();
  await ensureDefaultSchedule(userId, routineId);
  await db.prepare(`
    INSERT OR IGNORE INTO daily_plans (id, user_id, plan_date, template_id, start_minutes)
    VALUES (?, ?, ?, ?, ?)
  `).bind(planId, userId, date, routineId, startMinutes).run();

  const patterns = await readSchedulePatterns(userId, routineId);
  const emissions = patterns.flatMap(({ pattern, state }) => {
    const resolved = resolvePattern(pattern, date, state);
    return resolved ? [{ pattern, resolved }] : [];
  });
  if (emissions.length) {
    const activityIds = [...new Set(emissions.map(({ resolved }) => resolved.step.activityId))];
    const placeholders = activityIds.map(() => "?").join(", ");
    const activities = await db.prepare(`
      SELECT id, client_key AS clientKey, title, category, icon, color
      FROM activities
      WHERE user_id = ? AND id IN (${placeholders})
    `).bind(userId, ...activityIds).all<{ id: string; clientKey: string; title: string; category: string; icon: string; color: string }>();
    const activityMap = new Map(activities.results.map((activity) => [activity.id, activity]));
    const variantIds = [...new Set(emissions.flatMap(({ resolved }) => resolved.step.activityVariantId ? [resolved.step.activityVariantId] : []))];
    const variants = variantIds.length
      ? await db.prepare(`
          SELECT id, activity_id AS activityId, name
          FROM activity_variants
          WHERE user_id = ? AND archived_at IS NULL AND id IN (${variantIds.map(() => "?").join(", ")})
        `).bind(userId, ...variantIds).all<{ id: string; activityId: string; name: string }>()
      : { results: [] as Array<{ id: string; activityId: string; name: string }> };
    const variantMap = new Map(variants.results.map((variant) => [variant.id, variant]));
    const statements = emissions.flatMap(({ pattern, resolved }) => {
      const activity = activityMap.get(resolved.step.activityId);
      if (!activity) return [];
      const variant = resolved.step.activityVariantId ? variantMap.get(resolved.step.activityVariantId) : null;
      if (resolved.step.activityVariantId && (!variant || variant.activityId !== activity.id)) return [];
      const occurrenceId = `day-item:${safeId(userId)}:${date}:${safeId(resolved.occurrenceKey)}`;
      return [db.prepare(`
        INSERT OR IGNORE INTO daily_plan_items
          (id, daily_plan_id, activity_id, occurrence_key, schedule_pattern_id,
           schedule_pattern_step_id, activity_variant_id, client_key, title,
           variant_name_snapshot, display_label_override, category, icon, color,
           position, duration, plan_role, source_date, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(
        occurrenceId, planId, activity.id, resolved.occurrenceKey, pattern.id,
        resolved.step.id, variant?.id ?? null, activity.clientKey, activity.title,
        variant?.name ?? null, resolved.step.displayLabelOverride, activity.category,
        activity.icon, activity.color, pattern.position, resolved.step.durationMinutes,
        resolved.step.planRole, date,
      )];
    });
    if (statements.length) await db.batch(statements);

    const dueSteps = await dueStepsByActivity(userId, activityIds, date);
    if (dueSteps.size) {
      const dueActivityIds = [...dueSteps.keys()];
      await db.prepare(`
        UPDATE daily_plan_items
        SET activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP),
            revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE daily_plan_id = ? AND plan_role = 'extra' AND activated_at IS NULL
          AND activity_id IN (${dueActivityIds.map(() => "?").join(", ")})
      `).bind(planId, ...dueActivityIds).run();
    }
  }

  await db.prepare(`
    UPDATE daily_plan_items
    SET activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP),
        revision = revision + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE daily_plan_id = ?
      AND plan_role = 'extra'
      AND activated_at IS NULL
      AND 1 = (
        SELECT CASE
          WHEN previous.plan_role = 'extra'
            AND previous.activated_at IS NOT NULL
            AND previous.completed_at IS NOT NULL
          THEN 1 ELSE 0
        END
        FROM daily_plan_items previous
        WHERE previous.schedule_pattern_id = daily_plan_items.schedule_pattern_id
          AND previous.schedule_pattern_step_id = daily_plan_items.schedule_pattern_step_id
          AND previous.source_date < daily_plan_items.source_date
          AND previous.removed_at IS NULL
        ORDER BY previous.source_date DESC, previous.created_at DESC, previous.id DESC
        LIMIT 1
      )
  `).bind(planId).run();
}

export async function readResolvedDay(userId: string, planId: string) {
  const result = await getD1().prepare(`
    SELECT dpi.id AS occurrenceId, dpi.occurrence_key AS occurrenceKey,
           dpi.client_key AS activityId, dpi.title,
           dpi.activity_variant_id AS activityVariantId,
           dpi.variant_name_snapshot AS variantName,
           dpi.display_label_override AS displayLabel,
           dpi.duration, dpi.category, dpi.icon, dpi.color, dpi.position,
           dpi.completed_at AS completedAt, dpi.skipped_at AS skippedAt,
           CASE WHEN dpi.plan_role = 'extra' THEN 'extra' ELSE 'essential' END AS planRole,
           dpi.activated_at AS activatedAt,
           (
             SELECT previous.source_date
             FROM daily_plan_items previous
             WHERE previous.schedule_pattern_id = dpi.schedule_pattern_id
               AND previous.schedule_pattern_step_id = dpi.schedule_pattern_step_id
               AND previous.source_date < dpi.source_date
               AND previous.removed_at IS NULL
             ORDER BY previous.source_date DESC, previous.created_at DESC, previous.id DESC
             LIMIT 1
           ) AS previousEligibleDate,
           (
             SELECT previous.completed_at
             FROM daily_plan_items previous
             WHERE previous.schedule_pattern_id = dpi.schedule_pattern_id
               AND previous.schedule_pattern_step_id = dpi.schedule_pattern_step_id
               AND previous.source_date < dpi.source_date
               AND previous.removed_at IS NULL
             ORDER BY previous.source_date DESC, previous.created_at DESC, previous.id DESC
             LIMIT 1
           ) AS previousCompletedAt,
           (
             SELECT previous.activated_at
             FROM daily_plan_items previous
             WHERE previous.schedule_pattern_id = dpi.schedule_pattern_id
               AND previous.schedule_pattern_step_id = dpi.schedule_pattern_step_id
               AND previous.source_date < dpi.source_date
               AND previous.removed_at IS NULL
             ORDER BY previous.source_date DESC, previous.created_at DESC, previous.id DESC
             LIMIT 1
           ) AS previousActivatedAt,
           (
             SELECT CASE WHEN previous.plan_role = 'extra' THEN 'extra' ELSE 'essential' END
             FROM daily_plan_items previous
             WHERE previous.schedule_pattern_id = dpi.schedule_pattern_id
               AND previous.schedule_pattern_step_id = dpi.schedule_pattern_step_id
               AND previous.source_date < dpi.source_date
               AND previous.removed_at IS NULL
             ORDER BY previous.source_date DESC, previous.created_at DESC, previous.id DESC
             LIMIT 1
           ) AS previousPlanRole,
           dpi.revision
    FROM daily_plan_items dpi
    JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
    WHERE dpi.daily_plan_id = ? AND dp.user_id = ? AND dpi.removed_at IS NULL
    ORDER BY dpi.position, dpi.created_at, dpi.id
  `).bind(planId, userId).all<Omit<ResolvedDayItem, "id" | "displayTitle">>();
  return result.results.map((item) => ({
    ...item,
    id: item.occurrenceId,
    occurrenceKey: item.occurrenceKey || `legacy:${item.occurrenceId}`,
    displayTitle: derivedDisplayTitle(item.title, item.variantName, item.displayLabel),
  }));
}
