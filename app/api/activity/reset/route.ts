import { getD1 } from "../../../../db";
import {
  apiFailure,
  ensureAgentSchema,
  ensureConversation,
  findActivity,
  queueActivitySetup,
  queueDayHighlight,
  readConversationState,
  requestIdentity,
} from "../../agent-store";

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to reset this activity." }, { status: 401 });

  try {
    const payload = await request.json() as Record<string, unknown>;
    const activityKey = typeof payload.activityId === "string" ? payload.activityId.trim().slice(0, 160) : "";
    const date = validDate(payload.date);
    if (!activityKey || !date) return Response.json({ error: "An activity and local date are required." }, { status: 400 });

    await ensureAgentSchema();
    const activity = await findActivity(userId, activityKey);
    if (!activity) return Response.json({ error: "Activity not found." }, { status: 404 });

    const db = getD1();
    await db.batch([
      db.prepare("DELETE FROM record_relations WHERE activity_id = ? OR record_id IN (SELECT id FROM activity_records WHERE user_id = ? AND activity_id = ?)").bind(activity.id, userId, activity.id),
      db.prepare("DELETE FROM activity_record_revisions WHERE record_id IN (SELECT id FROM activity_records WHERE user_id = ? AND activity_id = ?)").bind(userId, activity.id),
      db.prepare("DELETE FROM activity_records WHERE user_id = ? AND activity_id = ?").bind(userId, activity.id),
      db.prepare("DELETE FROM workspace_revisions WHERE workspace_id IN (SELECT id FROM activity_workspaces WHERE user_id = ? AND activity_id = ?)").bind(userId, activity.id),
      db.prepare("DELETE FROM activity_workspaces WHERE user_id = ? AND activity_id = ?").bind(userId, activity.id),
      db.prepare("DELETE FROM agent_session_bindings WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ? AND activity_id = ?)").bind(userId, activity.id),
      db.prepare("DELETE FROM activity_visits WHERE user_id = ? AND activity_id = ?").bind(userId, activity.id),
      db.prepare("DELETE FROM activity_follow_ups WHERE user_id = ? AND activity_id = ?").bind(userId, activity.id),
      db.prepare("DELETE FROM conversation_artifacts WHERE user_id = ? AND activity_id = ?").bind(userId, activity.id),
      db.prepare("DELETE FROM conversation_clarifications WHERE user_id = ? AND activity_id = ?").bind(userId, activity.id),
      db.prepare("DELETE FROM conversation_messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ? AND activity_id = ?)").bind(userId, activity.id),
      db.prepare("DELETE FROM agent_jobs WHERE user_id = ? AND activity_id = ?").bind(userId, activity.id),
      db.prepare("DELETE FROM conversations WHERE user_id = ? AND activity_id = ?").bind(userId, activity.id),
      db.prepare("DELETE FROM activity_profiles WHERE user_id = ? AND activity_id = ?").bind(userId, activity.id),
      db.prepare("DELETE FROM activity_runs WHERE user_id = ? AND activity_id = ?").bind(userId, activity.id),
      db.prepare(`
        UPDATE daily_plan_items
        SET completed_at = NULL, skipped_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE activity_id = ? AND daily_plan_id IN (
          SELECT id FROM daily_plans WHERE user_id = ? AND plan_date = ?
        )
      `).bind(activity.id, userId, date),
    ]);

    const dayPlan = await db.prepare("SELECT id FROM daily_plans WHERE user_id = ? AND plan_date = ?")
      .bind(userId, date).first<{ id: string }>();
    if (dayPlan) await queueDayHighlight(userId, dayPlan.id).catch((error) => {
      console.error("Could not refresh the day highlight after resetting an activity.", error);
    });

    await queueActivitySetup(userId, activity);
    const conversationId = await ensureConversation(userId, activity);
    return Response.json({ conversationId, ...await readConversationState(conversationId, date), reset: true }, { status: 202 });
  } catch (error) {
    return apiFailure(error);
  }
}
