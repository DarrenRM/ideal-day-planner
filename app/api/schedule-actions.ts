import { getD1 } from "../../db";
import { cadenceTriggers, parseDirectScheduleAction, parseOccurrenceAction } from "../schedule-model";
import { safeId } from "./agent-store";
import { resolveDay } from "./schedule-store";

type ApplySource = {
  source: "user" | "luna";
  actor: string;
  conversationId?: string | null;
  sourceMessageId?: string | null;
  sourceAgentJobId?: string | null;
};

function statusValues(status: "planned" | "completed" | "skipped" | "removed") {
  if (status === "completed") return { completed: "CURRENT_TIMESTAMP", skipped: "NULL", removed: "NULL" };
  if (status === "skipped") return { completed: "NULL", skipped: "CURRENT_TIMESTAMP", removed: "NULL" };
  if (status === "removed") return { completed: "NULL", skipped: "NULL", removed: "CURRENT_TIMESTAMP" };
  return { completed: "NULL", skipped: "NULL", removed: "NULL" };
}

export async function applyDirectScheduleAction(
  userId: string,
  rawAction: unknown,
  source: ApplySource & { idempotencyKey: string },
) {
  const action = parseDirectScheduleAction(rawAction);
  if (!action) throw new Error("That schedule change is not valid.");
  const db = getD1();
  const routine = await db.prepare(`
    SELECT id, schedule_revision AS revision, start_minutes AS startMinutes
    FROM routine_templates
    WHERE user_id = ?
    ORDER BY created_at
    LIMIT 1
  `).bind(userId).first<{ id: string; revision: number; startMinutes: number }>();
  if (!routine) throw new Error("Your routine is not ready yet.");
  const reconcileEffectiveDate = async () => {
    if (action.type === "set_pattern_step_role") {
      await db.prepare(`
        UPDATE daily_plan_items
        SET plan_role = ?, activated_at = NULL, revision = revision + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE schedule_pattern_id = ? AND schedule_pattern_step_id = ?
          AND source_date >= ? AND completed_at IS NULL AND skipped_at IS NULL
          AND removed_at IS NULL AND plan_role <> ?
      `).bind(action.planRole, action.patternId, action.stepId, action.effectiveDate, action.planRole).run();
      await resolveDay(userId, action.effectiveDate, routine.id, `plan:${safeId(userId)}:${action.effectiveDate}`, routine.startMinutes);
      return;
    }
    if (cadenceTriggers(action.cadence, action.effectiveDate, action.effectiveDate)) {
      await resolveDay(userId, action.effectiveDate, routine.id, `plan:${safeId(userId)}:${action.effectiveDate}`, routine.startMinutes);
    } else {
      await db.prepare(`
        UPDATE daily_plan_items
        SET removed_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE schedule_pattern_id = ? AND source_date = ?
          AND completed_at IS NULL AND skipped_at IS NULL AND removed_at IS NULL
      `).bind(action.patternId, action.effectiveDate).run();
    }
  };
  const existingEvent = await db.prepare(`
    SELECT id FROM schedule_action_events WHERE user_id = ? AND idempotency_key = ?
  `).bind(userId, source.idempotencyKey).first<{ id: string }>();
  if (existingEvent) {
    await reconcileEffectiveDate();
    return { action, idempotent: true };
  }
  if (routine.revision !== action.baseRevision) throw new Error("Your schedule changed while Luna was preparing this update.");

  const pattern = await db.prepare(`
    SELECT pattern.id, pattern.revision,
           COUNT(step.id) AS stepCount,
           SUM(CASE WHEN step.activity_id = ? THEN 1 ELSE 0 END) AS matchingSteps,
           SUM(CASE WHEN step.id = ? AND step.activity_id = ? THEN 1 ELSE 0 END) AS matchingTargetSteps
    FROM schedule_patterns pattern
    JOIN schedule_pattern_steps step ON step.pattern_id = pattern.id
    WHERE pattern.id = ? AND pattern.user_id = ? AND pattern.routine_id = ?
      AND pattern.archived_at IS NULL
    GROUP BY pattern.id, pattern.revision
  `).bind(action.activityId, action.type === "set_pattern_step_role" ? action.stepId : "", action.activityId, action.patternId, userId, routine.id).first<{
    id: string;
    revision: number;
    stepCount: number;
    matchingSteps: number;
    matchingTargetSteps: number;
  }>();
  if (!pattern) throw new Error("That schedule is no longer available.");
  if (pattern.revision !== action.expectedRevision) throw new Error("That schedule changed while Luna was preparing this update.");
  if (action.type === "set_pattern_cadence" && (Number(pattern.stepCount) !== 1 || Number(pattern.matchingSteps) !== 1)) {
    throw new Error("This change affects a rotation and needs review before it can be applied.");
  }
  if (action.type === "set_pattern_step_role" && Number(pattern.matchingTargetSteps) !== 1) {
    throw new Error("That activity role is no longer available to change.");
  }

  if (action.type === "set_pattern_step_role") {
    await db.batch([
      db.prepare(`
        UPDATE schedule_pattern_steps
        SET plan_role = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND pattern_id = ? AND activity_id = ?
      `).bind(action.planRole, action.stepId, action.patternId, action.activityId),
      db.prepare(`
        UPDATE schedule_patterns SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND routine_id = ? AND revision = ? AND archived_at IS NULL
      `).bind(action.patternId, userId, routine.id, action.expectedRevision),
      db.prepare(`
        UPDATE routine_templates
        SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND schedule_revision = ?
      `).bind(routine.id, userId, action.baseRevision),
      db.prepare(`
        INSERT INTO schedule_action_events
          (id, user_id, conversation_id, source_message_id, source_agent_job_id,
           action_type, action_json, source, actor, idempotency_key)
        VALUES (?, ?, ?, ?, ?, 'set_pattern_step_role', ?, ?, ?, ?)
      `).bind(
        `schedule-event:${safeId(userId)}:${safeId(source.idempotencyKey)}`,
        userId,
        source.conversationId ?? null,
        source.sourceMessageId ?? null,
        source.sourceAgentJobId ?? null,
        JSON.stringify(action),
        source.source,
        source.actor,
        source.idempotencyKey,
      ),
    ]);
    await reconcileEffectiveDate();
    return { action, idempotent: false, revision: action.expectedRevision + 1 };
  }

  const anchorDate = action.cadence.kind === "interval_days" ? action.cadence.anchorDate : action.effectiveDate;
  await db.batch([
    db.prepare(`
      UPDATE schedule_patterns
      SET cadence_json = ?, anchor_date = ?, effective_date = ?, revision = revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND routine_id = ? AND revision = ? AND archived_at IS NULL
    `).bind(
      JSON.stringify(action.cadence), anchorDate, action.effectiveDate,
      action.patternId, userId, routine.id, action.expectedRevision,
    ),
    db.prepare(`
      UPDATE routine_templates
      SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND schedule_revision = ?
    `).bind(routine.id, userId, action.baseRevision),
    db.prepare(`
      INSERT INTO schedule_action_events
        (id, user_id, conversation_id, source_message_id, source_agent_job_id,
         action_type, action_json, source, actor, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'set_pattern_cadence', ?, ?, ?, ?)
    `).bind(
      `schedule-event:${safeId(userId)}:${safeId(source.idempotencyKey)}`,
      userId,
      source.conversationId ?? null,
      source.sourceMessageId ?? null,
      source.sourceAgentJobId ?? null,
      JSON.stringify(action),
      source.source,
      source.actor,
      source.idempotencyKey,
    ),
  ]);
  await reconcileEffectiveDate();
  return { action, idempotent: false, revision: action.expectedRevision + 1 };
}

export async function applyOccurrenceAction(userId: string, rawAction: unknown, source: ApplySource) {
  const action = parseOccurrenceAction(rawAction);
  if (!action) throw new Error("That day change is not valid.");
  const db = getD1();
  const existingEvent = await db.prepare(`
    SELECT id FROM schedule_action_events WHERE user_id = ? AND idempotency_key = ?
  `).bind(userId, action.idempotencyKey).first<{ id: string }>();
  if (existingEvent) return { action, idempotent: true };

  let occurrence: {
    id: string;
    dailyPlanId: string;
    activityId: string;
    activityVariantId: string | null;
    clientKey: string;
    title: string;
    variantName: string | null;
    displayLabel: string | null;
    category: string;
    icon: string;
    color: string;
    duration: number;
    position: number;
    sourceDate: string | null;
    planDate: string;
    planRole: "essential" | "extra";
    activatedAt: string | null;
  } | null = null;
  if (action.type !== "add_occurrence" && action.type !== "activate_activity_for_date") {
    occurrence = await db.prepare(`
      SELECT dpi.id, dpi.daily_plan_id AS dailyPlanId, dpi.activity_id AS activityId,
             dpi.activity_variant_id AS activityVariantId, dpi.client_key AS clientKey,
             dpi.title, dpi.variant_name_snapshot AS variantName,
             dpi.display_label_override AS displayLabel, dpi.category, dpi.icon, dpi.color,
             dpi.duration, dpi.position, dpi.source_date AS sourceDate, dp.plan_date AS planDate,
             CASE WHEN dpi.plan_role = 'extra' THEN 'extra' ELSE 'essential' END AS planRole,
             dpi.activated_at AS activatedAt
      FROM daily_plan_items dpi
      JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
      WHERE dpi.id = ? AND dp.user_id = ?
    `).bind(action.occurrenceId, userId).first<typeof occurrence extends infer T ? Exclude<T, null> : never>();
    if (!occurrence) throw new Error("That occurrence was not found.");
  }

  if (action.type === "move_within_day" && occurrence) {
    await db.prepare(`
      UPDATE daily_plan_items SET position = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(action.position, occurrence.id).run();
  } else if (action.type === "set_duration" && occurrence) {
    await db.prepare(`
      UPDATE daily_plan_items SET duration = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(action.durationMinutes, occurrence.id).run();
  } else if (action.type === "set_activity" && occurrence) {
    const activity = await db.prepare(`
      SELECT id, client_key AS clientKey, title, category, icon, color
      FROM activities WHERE id = ? AND user_id = ?
    `).bind(action.activityId, userId).first<{ id: string; clientKey: string; title: string; category: string; icon: string; color: string }>();
    if (!activity) throw new Error("That substitute activity was not found.");
    let variantName: string | null = null;
    if (action.activityVariantId) {
      const variant = await db.prepare(`
        SELECT name FROM activity_variants
        WHERE id = ? AND user_id = ? AND activity_id = ? AND archived_at IS NULL
      `).bind(action.activityVariantId, userId, activity.id).first<{ name: string }>();
      if (!variant) throw new Error("That variant does not belong to the substitute activity.");
      variantName = variant.name;
    }
    await db.prepare(`
      UPDATE daily_plan_items
      SET activity_id = ?, activity_variant_id = ?, client_key = ?, title = ?,
          variant_name_snapshot = ?, display_label_override = NULL, category = ?, icon = ?, color = ?,
          revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      activity.id, action.activityVariantId ?? null, activity.clientKey, activity.title,
      variantName, activity.category, activity.icon, activity.color, occurrence.id,
    ).run();
  } else if (action.type === "set_label" && occurrence) {
    await db.prepare(`
      UPDATE daily_plan_items SET display_label_override = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(action.displayLabel, occurrence.id).run();
  } else if (action.type === "set_variant" && occurrence) {
    let variantName: string | null = null;
    if (action.activityVariantId) {
      const variant = await db.prepare(`
        SELECT name FROM activity_variants
        WHERE id = ? AND user_id = ? AND activity_id = ? AND archived_at IS NULL
      `).bind(action.activityVariantId, userId, occurrence.activityId).first<{ name: string }>();
      if (!variant) throw new Error("That variant does not belong to this activity.");
      variantName = variant.name;
    }
    await db.prepare(`
      UPDATE daily_plan_items
      SET activity_variant_id = ?, variant_name_snapshot = ?, revision = revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(action.activityVariantId, variantName, occurrence.id).run();
  } else if (action.type === "set_status" && occurrence) {
    const values = statusValues(action.status);
    const activated = action.status === "completed"
      ? "CASE WHEN plan_role = 'extra' THEN COALESCE(activated_at, CURRENT_TIMESTAMP) ELSE activated_at END"
      : "activated_at";
    await db.prepare(`
      UPDATE daily_plan_items
      SET completed_at = ${values.completed}, skipped_at = ${values.skipped}, removed_at = ${values.removed},
          activated_at = ${activated},
          revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(occurrence.id).run();
  } else if (action.type === "activate_extra" && occurrence) {
    if (occurrence.planRole !== "extra") throw new Error("That activity is already essential today.");
    await db.prepare(`
      UPDATE daily_plan_items
      SET activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP),
          revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(occurrence.id).run();
  } else if (action.type === "deactivate_extra" && occurrence) {
    if (occurrence.planRole !== "extra") throw new Error("Only a Go Further activity can return to More for today.");
    const result = await db.prepare(`
      UPDATE daily_plan_items
      SET activated_at = NULL, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND completed_at IS NULL AND skipped_at IS NULL AND removed_at IS NULL
    `).bind(occurrence.id).run();
    if (!result.meta.changes) throw new Error("Only an unfinished activity can return to More for today.");
  } else if (action.type === "move_to_date" && occurrence) {
    const routine = await db.prepare(`
      SELECT rt.id AS routineId, rt.start_minutes AS startMinutes
      FROM routine_templates rt WHERE rt.user_id = ? ORDER BY rt.created_at LIMIT 1
    `).bind(userId).first<{ routineId: string; startMinutes: number }>();
    if (!routine) throw new Error("The routine could not be found.");
    const targetPlanId = `plan:${safeId(userId)}:${action.date}`;
    await resolveDay(userId, action.date, routine.routineId, targetPlanId, routine.startMinutes);
    const movedId = `day-item:${safeId(userId)}:${action.date}:moved:${safeId(occurrence.id)}`;
    const movedKey = `moved:${occurrence.id}:${action.date}`;
    await db.batch([
      db.prepare(`
        INSERT OR IGNORE INTO daily_plan_items
          (id, daily_plan_id, activity_id, occurrence_key, activity_variant_id,
           client_key, title, variant_name_snapshot, display_label_override,
           category, icon, color, position, duration, source_date,
           moved_from_daily_plan_item_id, plan_role, activated_at, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(
        movedId, targetPlanId, occurrence.activityId, movedKey, occurrence.activityVariantId,
        occurrence.clientKey, occurrence.title, occurrence.variantName, occurrence.displayLabel,
        occurrence.category, occurrence.icon, occurrence.color, action.position ?? occurrence.position,
        occurrence.duration, occurrence.sourceDate ?? occurrence.planDate, occurrence.id,
        occurrence.planRole, occurrence.activatedAt,
      ),
      db.prepare(`
        UPDATE daily_plan_items
        SET removed_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(occurrence.id),
    ]);
  } else if (action.type === "activate_activity_for_date") {
    const activity = await db.prepare(`
      SELECT id, client_key AS clientKey, title, category, icon, color
      FROM activities
      WHERE user_id = ? AND (id = ? OR client_key = ?)
      LIMIT 1
    `).bind(userId, action.activityId, action.activityId).first<{ id: string; clientKey: string; title: string; category: string; icon: string; color: string }>();
    if (!activity) throw new Error("That activity was not found.");
    const routine = await db.prepare(`
      SELECT id AS routineId, start_minutes AS startMinutes
      FROM routine_templates WHERE user_id = ? ORDER BY created_at LIMIT 1
    `).bind(userId).first<{ routineId: string; startMinutes: number }>();
    if (!routine) throw new Error("The routine could not be found.");
    const planId = `plan:${safeId(userId)}:${action.date}`;
    await resolveDay(userId, action.date, routine.routineId, planId, routine.startMinutes);
    const existing = await db.prepare(`
      SELECT id, CASE WHEN plan_role = 'extra' THEN 'extra' ELSE 'essential' END AS planRole
      FROM daily_plan_items
      WHERE daily_plan_id = ? AND activity_id = ? AND removed_at IS NULL
      ORDER BY position, created_at, id
      LIMIT 1
    `).bind(planId, activity.id).first<{ id: string; planRole: "essential" | "extra" }>();
    if (existing) {
      if (existing.planRole === "extra") {
        await db.prepare(`
          UPDATE daily_plan_items
          SET activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP), revision = revision + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(existing.id).run();
      }
    } else {
      const occurrenceId = `day-item:${safeId(userId)}:${action.date}:capture:${safeId(action.idempotencyKey)}`;
      await db.prepare(`
        INSERT OR IGNORE INTO daily_plan_items
          (id, daily_plan_id, activity_id, occurrence_key, client_key, title, category, icon, color,
           position, duration, plan_role, activated_at, source_date, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 999, 15, 'extra', CURRENT_TIMESTAMP, ?, 1)
      `).bind(
        occurrenceId, planId, activity.id, `capture:${action.idempotencyKey}`,
        activity.clientKey, activity.title, activity.category, activity.icon, activity.color, action.date,
      ).run();
    }
  } else if (action.type === "add_occurrence") {
    const activity = await db.prepare(`
      SELECT id, client_key AS clientKey, title, category, icon, color
      FROM activities
      WHERE user_id = ? AND (id = ? OR client_key = ?)
      LIMIT 1
    `).bind(userId, action.activityId, action.activityId).first<{ id: string; clientKey: string; title: string; category: string; icon: string; color: string }>();
    if (!activity) throw new Error("That activity was not found.");
    let variantName: string | null = null;
    if (action.activityVariantId) {
      const variant = await db.prepare(`
        SELECT name FROM activity_variants
        WHERE id = ? AND user_id = ? AND activity_id = ? AND archived_at IS NULL
      `).bind(action.activityVariantId, userId, activity.id).first<{ name: string }>();
      if (!variant) throw new Error("That variant does not belong to this activity.");
      variantName = variant.name;
    }
    const routine = await db.prepare(`
      SELECT id AS routineId, start_minutes AS startMinutes
      FROM routine_templates WHERE user_id = ? ORDER BY created_at LIMIT 1
    `).bind(userId).first<{ routineId: string; startMinutes: number }>();
    if (!routine) throw new Error("The routine could not be found.");
    const planId = `plan:${safeId(userId)}:${action.date}`;
    await resolveDay(userId, action.date, routine.routineId, planId, routine.startMinutes);
    const occurrenceId = `day-item:${safeId(userId)}:${action.date}:adhoc:${safeId(action.idempotencyKey)}`;
    await db.prepare(`
      INSERT OR IGNORE INTO daily_plan_items
        (id, daily_plan_id, activity_id, occurrence_key, activity_variant_id,
         client_key, title, variant_name_snapshot, category, icon, color,
         position, duration, plan_role, source_date, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      occurrenceId, planId, activity.id, `adhoc:${action.idempotencyKey}`,
      action.activityVariantId ?? null, activity.clientKey, activity.title, variantName,
      activity.category, activity.icon, activity.color, action.position ?? 999,
      action.durationMinutes ?? 15, action.planRole ?? "essential", action.date,
    ).run();
  }

  await db.prepare(`
    INSERT INTO schedule_action_events
      (id, user_id, conversation_id, source_message_id, source_agent_job_id,
       action_type, action_json, source, actor, idempotency_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    `schedule-event:${safeId(userId)}:${safeId(action.idempotencyKey)}`,
    userId, source.conversationId ?? null, source.sourceMessageId ?? null,
    source.sourceAgentJobId ?? null, action.type, JSON.stringify(action),
    source.source, source.actor, action.idempotencyKey,
  ).run();
  return { action, idempotent: false };
}
