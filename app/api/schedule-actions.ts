import { getD1 } from "../../db";
import { parseOccurrenceAction } from "../schedule-model";
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
  if (action.type !== "add_occurrence") {
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
    await db.prepare(`
      UPDATE daily_plan_items
      SET completed_at = ${values.completed}, skipped_at = ${values.skipped}, removed_at = ${values.removed},
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
