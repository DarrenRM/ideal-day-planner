import type { getD1 } from "../../db";
import type { ActivityCreation } from "../activity-creation-model";
import { createActivityOnce, ActivityCreationConflict } from "./activity-create-store";

const safeId = (value: string) => encodeURIComponent(value).replaceAll("%", "_");

// A retry of the same source message always targets the same definition. The
// creation receipt owns recovery after an uncertain commit or day resolution.
export async function createAgentActivity(db: ReturnType<typeof getD1>, input: {
  userId: string; sourceMessageId: string; conversationId: string; jobId: string;
  action: ActivityCreation; localDate: string;
  resolveDay: (userId: string, date: string, routineId: string, planId: string, startMinutes: number) => Promise<unknown>;
}) {
  const { userId, action } = input;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.sourceMessageId));
  const clientKey = `luna-${Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32)}`;
  const activityId = `activity:${safeId(userId)}:${clientKey}`;
  const patternId = `schedule-pattern:${safeId(userId)}:${clientKey}`;
  const stepId = `schedule-step:${safeId(userId)}:${clientKey}:0`;
  const routine = await db.prepare("SELECT id, start_minutes AS startMinutes FROM routine_templates WHERE user_id = ? ORDER BY created_at LIMIT 1")
    .bind(userId).first<{ id: string; startMinutes: number }>();
  if (!routine) throw new ActivityCreationConflict("Your routine is not ready yet.");
  const duplicate = await db.prepare("SELECT id FROM activities WHERE user_id = ? AND lower(trim(title)) = lower(trim(?)) AND id <> ? LIMIT 1")
    .bind(userId, action.title, activityId).first();
  if (duplicate) throw new ActivityCreationConflict("An activity with this name already exists. Use the existing activity instead of creating another.");
  const requestJson = JSON.stringify(action);
  const statements = [
    db.prepare("INSERT INTO activities (id, user_id, client_key, title, category, icon, color, origin) VALUES (?, ?, ?, ?, ?, '✦', '#a8c96d', 'user')")
      .bind(activityId, userId, clientKey, action.title, action.category),
    db.prepare(`INSERT INTO schedule_patterns
      (id, user_id, routine_id, client_key, name, position, cadence_json, advancement_json, anchor_date, initial_step_position, effective_date, revision)
      VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM schedule_patterns WHERE routine_id = ? AND archived_at IS NULL), ?, ?, ?, 0, ?, 1)`)
      .bind(patternId, userId, routine.id, clientKey, action.title, routine.id, JSON.stringify(action.cadence), JSON.stringify({ kind: "calendar" }), action.effectiveDate, action.effectiveDate),
    db.prepare("INSERT INTO schedule_pattern_steps (id, pattern_id, activity_id, position, duration_minutes, plan_role) VALUES (?, ?, ?, 0, ?, ?)")
      .bind(stepId, patternId, activityId, action.durationMinutes, action.planRole),
    db.prepare("UPDATE routine_templates SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .bind(routine.id, userId),
    db.prepare("INSERT INTO conversations (id, user_id, activity_id) VALUES (?, ?, ?)")
      .bind(`conversation:${safeId(userId)}:${clientKey}`, userId, activityId),
    db.prepare(`INSERT INTO schedule_action_events
      (id, user_id, conversation_id, source_message_id, source_agent_job_id, action_type, action_json, source, actor, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'create_activity', ?, 'user', ?, ?)`)
      .bind(`schedule-event:${activityId}`, userId, input.conversationId, input.sourceMessageId, input.jobId, requestJson, userId, `create:${activityId}`),
  ];
  await createActivityOnce(db, { userId, activityId, requestJson, statements,
    resolveOccurrence: () => input.resolveDay(userId, input.localDate, routine.id, `plan:${safeId(userId)}:${input.localDate}`, routine.startMinutes),
  });
  // Verify actual persisted definition and schedule, including after a retry.
  const saved = await db.prepare(`SELECT a.title, a.category, s.duration_minutes AS durationMinutes, s.plan_role AS planRole,
      p.cadence_json AS cadenceJson, p.effective_date AS effectiveDate
    FROM activities a JOIN schedule_pattern_steps s ON s.activity_id = a.id
    JOIN schedule_patterns p ON p.id = s.pattern_id
    WHERE a.id = ? AND a.user_id = ? AND p.id = ? AND p.archived_at IS NULL`)
    .bind(activityId, userId, patternId).first<{ title: string; category: string; durationMinutes: number; planRole: string; cadenceJson: string; effectiveDate: string }>();
  if (!saved || saved.title !== action.title || saved.category !== action.category
    || saved.durationMinutes !== action.durationMinutes || saved.planRole !== action.planRole
    || saved.effectiveDate !== action.effectiveDate || saved.cadenceJson !== JSON.stringify(action.cadence)) {
    throw new ActivityCreationConflict("The saved activity no longer matches this creation request. Review the existing activity before retrying.");
  }
  return { activityId, clientKey, title: saved.title };
}
