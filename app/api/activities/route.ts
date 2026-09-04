import { getD1 } from "../../../db";
import { addLocalDays, isLocalDate, localDateInTimeZone, parseAdvancement, parseCadence } from "../../schedule-model";
import { normalizeActivityOrigin, normalizePlanRole } from "../../day-role";
import { apiFailure, ensureAgentSchema, requestIdentity, safeId } from "../agent-store";
import { activityMessageJobStatements } from "../activity-message-jobs";
import { applyOccurrenceAction } from "../schedule-actions";
import { resolveDay } from "../schedule-store";
import { activitySetupKey } from "../../activity-setup-policy";
import { updateActivityDetails } from "../activity-edit-store";
import { findRoleOccurrence, persistActivityRole } from "../activity-role-store";
import { ActivityCreationConflict, createActivityOnce } from "../activity-create-store";

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
      const occurrenceKey = text(payload.occurrenceKey, 240);
      const activityId = text(payload.activityId, 200);
      const activityVariantId = text(payload.activityVariantId, 200);
      const date = isLocalDate(payload.date) ? payload.date : "";
      const planRole = normalizePlanRole(payload.planRole);
      const occurrence = await findRoleOccurrence(db, { userId, occurrenceId, occurrenceKey, activityId, activityVariantId, date });
      if (!occurrence) return Response.json({ error: "Activity occurrence not found." }, { status: 404 });
      await persistActivityRole(db, { userId, routineId: routine.id, occurrence, planRole });
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
    const scheduleChoice = ["none", "daily", "weekdays", "interval_days", "sequence", "luna"].includes(String(payload.scheduleChoice))
      ? String(payload.scheduleChoice) : null;
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
    await ensureAgentSchema();
    const statements = [db.prepare(`
      INSERT INTO activities (id, user_id, client_key, title, category, icon, color, origin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(activityId, userId, clientKey, title, category, icon, color, origin)];

    if (schedule.kind !== "none") {
      const patternId = `schedule-pattern:${safeId(userId)}:${safeId(clientKey)}`;
      const stepId = `schedule-step:${safeId(userId)}:${safeId(clientKey)}:0`;
      statements.push(
        db.prepare(`
          INSERT INTO schedule_patterns
            (id, user_id, routine_id, client_key, name, position, cadence_json,
             advancement_json, anchor_date, initial_step_position, effective_date, revision)
          VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM schedule_patterns WHERE routine_id = ? AND archived_at IS NULL), ?, ?, ?, 0, ?, 1)
        `).bind(patternId, userId, routine.id, clientKey, title, routine.id, JSON.stringify(cadence), JSON.stringify(advancement), effectiveDate, effectiveDate),
        db.prepare(`
          INSERT INTO schedule_pattern_steps
            (id, pattern_id, activity_id, position, duration_minutes, plan_role)
          VALUES (?, ?, ?, 0, ?, ?)
        `).bind(stepId, patternId, activityId, activityDuration, planRole),
        db.prepare(`UPDATE routine_templates SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(routine.id),
      );
    }
    const activity = { id: activityId, clientKey, title, category, icon, color };
    const conversationId = `conversation:${safeId(userId)}:${safeId(clientKey)}`;
    const setupKey = activitySetupKey(activity);
    statements.push(
      db.prepare(`INSERT INTO conversations (id, user_id, activity_id) VALUES (?, ?, ?)`)
        .bind(conversationId, userId, activityId),
      db.prepare(`
        INSERT INTO activity_profiles (id, user_id, activity_id, setup_status, setup_key)
        VALUES (?, ?, ?, 'preparing', ?)
      `).bind(`activity-profile:${safeId(userId)}:${safeId(clientKey)}`, userId, activityId, setupKey),
    );
    if (setupRequest) {
      const clientMessageId = `setup-${clientKey}`;
      const messageId = `message:${safeId(userId)}:${safeId(clientMessageId)}`;
      statements.push(
        db.prepare(`
          INSERT OR IGNORE INTO conversation_messages (id, conversation_id, role, body, source)
          VALUES (?, ?, 'user', ?, 'user')
        `).bind(messageId, conversationId, setupRequest),
        ...activityMessageJobStatements({
          userId, activityId, conversationId, sourceMessageId: messageId,
          clientMessageId, body: setupRequest, activityTitle: title,
        }),
      );
    } else {
      statements.push(db.prepare(`
        INSERT INTO agent_jobs (id, user_id, activity_id, conversation_id, kind, idempotency_key)
        VALUES (?, ?, ?, ?, 'activity_setup', ?)
      `).bind(`agent-job:${safeId(userId)}:setup:${safeId(clientKey)}:${setupKey}`,
        userId, activityId, conversationId, `activity-setup:${activityId}:${setupKey}`));
    }
    await createActivityOnce(db, {
      userId, activityId, statements,
      requestJson: JSON.stringify({ title, category, activityDuration, icon, color, origin,
        cadence, advancement, effectiveDate, date, includeToday, planRole, setupRequest, scheduleChoice }),
      resolveOccurrence: async () => {
        if (!includeToday || !date) return;
        if (cadence) {
          await resolveDay(userId, date, routine.id, `plan:${safeId(userId)}:${date}`, routine.startMinutes);
        } else {
          await applyOccurrenceAction(userId, {
            type: "add_occurrence", activityId, date, durationMinutes: activityDuration,
            planRole, idempotencyKey: `create-activity:${clientKey}:${date}`,
          }, { source: "user", actor: userId });
        }
      },
    });
    return Response.json({ created: true, activity });
  } catch (error) {
    if (error instanceof ActivityCreationConflict) return Response.json({ error: error.message }, { status: 409 });
    return apiFailure(error);
  }
}
