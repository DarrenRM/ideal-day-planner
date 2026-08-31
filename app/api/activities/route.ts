import { getD1 } from "../../../db";
import { addLocalDays, isLocalDate, localDateInTimeZone, parseAdvancement, parseCadence } from "../../schedule-model";
import { normalizeActivityOrigin, normalizePlanRole } from "../../day-role";
import { apiFailure, ensureAgentSchema, ensureConversation, queueActivitySetup, requestIdentity, safeId } from "../agent-store";
import { activityMessageJobStatements } from "../activity-message-jobs";
import { applyOccurrenceAction } from "../schedule-actions";
import { resolveDay } from "../schedule-store";
import { activitySetupKey } from "../../activity-setup-policy";
import { updateActivityDetails } from "../activity-edit-store";

const CATEGORIES = new Set(["Light", "Recharge", "Training", "Fuel", "Care", "Logistics", "Creativity", "Spirit"]);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function duration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(480, Math.max(5, Math.round(value))) : null;
}

async function routineFor(userId: string) {
  return getD1().prepare(`
    SELECT id, schedule_revision AS revision, start_minutes AS startMinutes
    FROM routine_templates WHERE user_id = ? ORDER BY created_at LIMIT 1
  `).bind(userId).first<{ id: string; revision: number; startMinutes: number }>();
}

export async function GET(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to load activities." }, { status: 401 });
  try {
    const db = getD1();
    const activities = await db.prepare(`
      SELECT id, client_key AS clientKey, title, category, icon, color, origin
      FROM activities WHERE user_id = ? ORDER BY title
    `).bind(userId).all();
    const variants = await db.prepare(`
      SELECT id, activity_id AS activityId, client_key AS clientKey, name,
             description, default_duration_minutes AS defaultDurationMinutes, position
      FROM activity_variants
      WHERE user_id = ? AND archived_at IS NULL
      ORDER BY activity_id, position
    `).bind(userId).all();
    return Response.json({ activities: activities.results, variants: variants.results });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to change activities." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const mode = text(payload.mode, 40) || "create";
    const db = getD1();
    const routine = await routineFor(userId);
    if (!routine) return Response.json({ error: "Your routine is not ready yet." }, { status: 409 });

    if (mode === "set-role") {
      const occurrenceId = text(payload.occurrenceId, 200);
      const planRole = normalizePlanRole(payload.planRole);
      const occurrence = await db.prepare(`
        SELECT dpi.id, dpi.schedule_pattern_step_id AS schedulePatternStepId
        FROM daily_plan_items dpi
        JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
        WHERE dpi.id = ? AND dp.user_id = ?
      `).bind(occurrenceId, userId).first<{ id: string; schedulePatternStepId: string | null }>();
      if (!occurrence) return Response.json({ error: "Activity occurrence not found." }, { status: 404 });
      const statements = [db.prepare(`
        UPDATE daily_plan_items
        SET plan_role = ?, activated_at = NULL, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(planRole, occurrence.id)];
      if (occurrence.schedulePatternStepId) {
        statements.push(
          db.prepare(`UPDATE schedule_pattern_steps SET plan_role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(planRole, occurrence.schedulePatternStepId),
          db.prepare(`
            UPDATE daily_plan_items
            SET plan_role = ?, activated_at = NULL, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
            WHERE schedule_pattern_step_id = ? AND completed_at IS NULL AND skipped_at IS NULL
          `).bind(planRole, occurrence.schedulePatternStepId),
        );
      }
      const eventKey = `set-plan-role:${occurrence.id}:${planRole}:${crypto.randomUUID()}`;
      statements.push(
        db.prepare(`UPDATE routine_templates SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(routine.id),
        db.prepare(`
          INSERT INTO schedule_action_events
            (id, user_id, action_type, action_json, source, actor, idempotency_key)
          VALUES (?, ?, 'set_plan_role', ?, 'user', ?, ?)
        `).bind(
          `schedule-event:${safeId(userId)}:${crypto.randomUUID()}`,
          userId,
          JSON.stringify({ occurrenceId: occurrence.id, schedulePatternStepId: occurrence.schedulePatternStepId, planRole }),
          userId,
          eventKey,
        ),
      );
      await db.batch(statements);
      return Response.json({ updated: true, planRole });
    }

    if (mode === "update") {
      const clientKey = text(payload.activityId, 160);
      const title = text(payload.title, 60);
      const category = text(payload.category, 40);
      if (!clientKey || !title || !CATEGORIES.has(category)) return Response.json({ error: "A valid name and category are required." }, { status: 400 });
      const settings = await db.prepare(`SELECT time_zone AS timeZone FROM settings WHERE user_id = ?`)
        .bind(userId).first<{ timeZone: string }>();
      const date = isLocalDate(payload.date) ? payload.date : localDateInTimeZone(new Date(), settings?.timeZone || "America/Phoenix");
      const updated = await updateActivityDetails(db, { userId, clientKey, title, category, color: text(payload.color, 20), date });
      if (!updated) return Response.json({ error: "Activity not found." }, { status: 404 });
      return Response.json({ updated: true });
    }

    if (mode === "create-variant" || mode === "update-variant" || mode === "archive-variant") {
      const activityId = text(payload.activityId, 200);
      const activity = await db.prepare(`SELECT id FROM activities WHERE user_id = ? AND (id = ? OR client_key = ?) LIMIT 1`)
        .bind(userId, activityId, activityId).first<{ id: string }>();
      if (!activity) return Response.json({ error: "Activity not found." }, { status: 404 });
      if (mode === "archive-variant") {
        const variantId = text(payload.variantId, 200);
        await db.prepare(`UPDATE activity_variants SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND activity_id = ?`)
          .bind(variantId, userId, activity.id).run();
        return Response.json({ archived: true });
      }
      const name = text(payload.name, 60);
      const description = text(payload.description, 240) || null;
      const defaultDuration = payload.defaultDurationMinutes === null || payload.defaultDurationMinutes === undefined ? null : duration(payload.defaultDurationMinutes);
      if (!name || payload.defaultDurationMinutes !== null && payload.defaultDurationMinutes !== undefined && defaultDuration === null) {
        return Response.json({ error: "A valid variant name is required." }, { status: 400 });
      }
      if (mode === "update-variant") {
        const variantId = text(payload.variantId, 200);
        const result = await db.prepare(`
          UPDATE activity_variants
          SET name = ?, description = ?, default_duration_minutes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ? AND activity_id = ?
        `).bind(name, description, defaultDuration, variantId, userId, activity.id).run();
        if (!result.meta.changes) return Response.json({ error: "Variant not found." }, { status: 404 });
        return Response.json({ updated: true, variantId });
      }
      const count = await db.prepare(`SELECT COUNT(*) AS count FROM activity_variants WHERE activity_id = ?`).bind(activity.id).first<{ count: number }>();
      const clientKey = text(payload.clientKey, 160) || `variant-${crypto.randomUUID()}`;
      const variantId = `variant:${safeId(userId)}:${safeId(activity.id)}:${safeId(clientKey)}`;
      await db.prepare(`
        INSERT INTO activity_variants
          (id, user_id, activity_id, client_key, name, description, default_duration_minutes, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(variantId, userId, activity.id, clientKey, name, description, defaultDuration, count?.count ?? 0).run();
      return Response.json({ created: true, variantId });
    }

    const title = text(payload.title, 60);
    const category = text(payload.category, 40);
    const activityDuration = duration(payload.duration);
    const date = isLocalDate(payload.date) ? payload.date : null;
    if (!title || !CATEGORIES.has(category) || activityDuration === null) return Response.json({ error: "A valid name, category, and duration are required." }, { status: 400 });
    const clientKey = text(payload.clientKey, 160) || `custom-${crypto.randomUUID()}`;
    const activityId = `activity:${safeId(userId)}:${safeId(clientKey)}`;
    const icon = text(payload.icon, 8) || "✦";
    const color = /^#[0-9a-f]{6}$/i.test(text(payload.color, 20)) ? text(payload.color, 20) : "#a8c96d";
    const schedule = payload.schedule && typeof payload.schedule === "object" ? payload.schedule as Record<string, unknown> : { kind: "daily" };
    const setupRequest = text(payload.setupRequest, 4000);
    const planRole = normalizePlanRole(payload.planRole);
    const origin = normalizeActivityOrigin(payload.origin);
    const includeToday = payload.includeToday !== false;
    const cadence = schedule.kind === "none" ? null : parseCadence(schedule.kind === "daily" ? { kind: "daily" } : schedule);
    const advancement = schedule.kind === "none" ? null : parseAdvancement(payload.advancement ?? { kind: "calendar" });
    const requestedEffectiveDate = isLocalDate(payload.effectiveDate) ? payload.effectiveDate : date;
    const effectiveDate = requestedEffectiveDate && !includeToday && requestedEffectiveDate === date ? addLocalDays(requestedEffectiveDate, 1) : requestedEffectiveDate;
    if (schedule.kind !== "none" && (!cadence || !advancement || !effectiveDate)) {
      return Response.json({ error: "That schedule is not valid." }, { status: 400 });
    }
    await db.prepare(`
      INSERT INTO activities (id, user_id, client_key, title, category, icon, color, origin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(activityId, userId, clientKey, title, category, icon, color, origin).run();

    if (schedule.kind !== "none") {
      const positionRow = await db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS position FROM schedule_patterns WHERE routine_id = ? AND archived_at IS NULL`)
        .bind(routine.id).first<{ position: number }>();
      const patternId = `schedule-pattern:${safeId(userId)}:${safeId(clientKey)}`;
      const stepId = `schedule-step:${safeId(userId)}:${safeId(clientKey)}:0`;
      await db.batch([
        db.prepare(`
          INSERT INTO schedule_patterns
            (id, user_id, routine_id, client_key, name, position, cadence_json,
             advancement_json, anchor_date, initial_step_position, effective_date, revision)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1)
        `).bind(patternId, userId, routine.id, clientKey, title, positionRow?.position ?? 0, JSON.stringify(cadence), JSON.stringify(advancement), effectiveDate, effectiveDate),
        db.prepare(`
          INSERT INTO schedule_pattern_steps
            (id, pattern_id, activity_id, position, duration_minutes, plan_role)
          VALUES (?, ?, ?, 0, ?, ?)
        `).bind(stepId, patternId, activityId, activityDuration, planRole),
        db.prepare(`UPDATE routine_templates SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(routine.id),
      ]);
      if (date && includeToday) await resolveDay(userId, date, routine.id, `plan:${safeId(userId)}:${date}`, routine.startMinutes);
    } else if (includeToday && date) {
      await applyOccurrenceAction(userId, {
        type: "add_occurrence",
        activityId,
        date,
        durationMinutes: activityDuration,
        planRole,
        idempotencyKey: `create-activity:${clientKey}:${date}`,
      }, { source: "user", actor: userId });
    }
    await ensureAgentSchema();
    const activity = { id: activityId, clientKey, title, category, icon, color };
    if (setupRequest) {
      const conversationId = await ensureConversation(userId, activity);
      const clientMessageId = `setup-${crypto.randomUUID()}`;
      const messageId = `message:${safeId(userId)}:${safeId(clientMessageId)}`;
      await db.batch([
        db.prepare(`
          INSERT INTO activity_profiles (id, user_id, activity_id, setup_status, setup_key)
          VALUES (?, ?, ?, 'preparing', ?)
          ON CONFLICT(user_id, activity_id) DO UPDATE SET
            setup_status = 'preparing', setup_key = excluded.setup_key,
            setup_question_message_id = NULL, assessed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        `).bind(`activity-profile:${safeId(userId)}:${safeId(clientKey)}`, userId, activityId, activitySetupKey(activity)),
        db.prepare(`
          INSERT OR IGNORE INTO conversation_messages (id, conversation_id, role, body, source)
          VALUES (?, ?, 'user', ?, 'user')
        `).bind(messageId, conversationId, setupRequest),
        ...activityMessageJobStatements({
          userId, activityId, conversationId, sourceMessageId: messageId,
          clientMessageId, body: setupRequest, activityTitle: title,
        }),
      ]);
    } else {
      await queueActivitySetup(userId, activity);
    }
    return Response.json({ created: true, activity });
  } catch (error) {
    return apiFailure(error);
  }
}
