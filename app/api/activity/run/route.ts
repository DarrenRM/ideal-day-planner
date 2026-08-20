import { getD1 } from "../../../../db";
import { apiFailure, ensureAgentSchema, findActivity, readActivityRecords, requestIdentity, safeId } from "../../agent-store";

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function boundedSeconds(value: unknown, allowZero = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= (allowZero ? 0 : 1) && rounded <= 24 * 60 * 60 ? rounded : null;
}

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to record this activity." }, { status: 401 });

  try {
    const payload = await request.json() as Record<string, unknown>;
    const mode = payload.mode;
    const clientKey = typeof payload.activityId === "string" ? payload.activityId.trim().slice(0, 160) : "";
    const date = validDate(payload.date);
    if (!clientKey || !date) return Response.json({ error: "An activity and local date are required." }, { status: 400 });

    await ensureAgentSchema();
    const activity = await findActivity(userId, clientKey);
    if (!activity) return Response.json({ error: "Activity not found." }, { status: 404 });
    const db = getD1();
    const dayItem = await db.prepare(`
      SELECT dpi.id, dpi.duration, COALESCE(s.day_timeline_enabled, 0) AS dayTimelineEnabled
      FROM daily_plan_items dpi
      JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
      LEFT JOIN settings s ON s.user_id = dp.user_id
      WHERE dp.user_id = ? AND dp.plan_date = ? AND dpi.activity_id = ? AND dpi.removed_at IS NULL
      LIMIT 1
    `).bind(userId, date, activity.id).first<{ id: string; duration: number; dayTimelineEnabled: number }>();
    if (!dayItem) return Response.json({ error: "This activity is not scheduled for that day." }, { status: 404 });

    const runId = `activity-run:${safeId(userId)}:${safeId(activity.clientKey)}:${date}`;
    if (mode === "skip" || mode === "unskip") {
      const skipped = mode === "skip";
      await db.batch([
        db.prepare(`
          UPDATE daily_plan_items
          SET skipped_at = ${skipped ? "CURRENT_TIMESTAMP" : "NULL"}, completed_at = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(dayItem.id),
        db.prepare(`
          INSERT INTO activity_runs
            (id, user_id, activity_id, daily_plan_item_id, plan_date, status,
             allotted_duration_seconds, planned_duration_seconds)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, activity_id, plan_date) DO UPDATE SET
            daily_plan_item_id = excluded.daily_plan_item_id,
            status = excluded.status,
            actual_elapsed_seconds = NULL,
            timer_mode = NULL,
            timer_component_id = NULL,
            started_at = NULL,
            completed_at = NULL,
            details_json = NULL,
            updated_at = CURRENT_TIMESTAMP
        `).bind(
          runId, userId, activity.id, dayItem.id, date, skipped ? "skipped" : "planned",
          dayItem.dayTimelineEnabled ? dayItem.duration * 60 : null,
          dayItem.dayTimelineEnabled ? dayItem.duration * 60 : null,
        ),
      ]);
      return Response.json({ skipped, skippedAt: skipped ? new Date().toISOString() : null, runId });
    }

    if (mode === "reopen") {
      await db.batch([
        db.prepare("UPDATE daily_plan_items SET completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(dayItem.id),
        db.prepare("UPDATE activity_runs SET status = 'reopened', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(runId, userId),
      ]);
      return Response.json({ completed: false, runId });
    }

    if (mode !== "complete") return Response.json({ error: "Unsupported run operation." }, { status: 400 });

    const timing = payload.timing && typeof payload.timing === "object" ? payload.timing as Record<string, unknown> : null;
    const allottedDurationSeconds = dayItem.dayTimelineEnabled ? dayItem.duration * 60 : null;
    const plannedDurationSeconds = boundedSeconds(timing?.plannedSeconds) ?? allottedDurationSeconds;
    const actualElapsedSeconds = boundedSeconds(timing?.elapsedSeconds, true);
    const timerMode = timing?.mode === "timer" || timing?.mode === "countdown" ? timing.mode : null;
    const timerComponentId = typeof timing?.componentId === "string" ? timing.componentId.trim().slice(0, 64) : null;
    const startedAt = typeof timing?.startedAt === "string" && !Number.isNaN(Date.parse(timing.startedAt)) ? timing.startedAt : null;
    const recordVersions = (await readActivityRecords(activity.id, date)).map((record) => ({
      key: record.key,
      type: record.type,
      version: record.version,
    }));
    const detailsJson = JSON.stringify({
      ...(timerMode ? { timingSource: "workspace", timerMode, timerComponentId } : {}),
      recordVersions,
    });

    await db.batch([
      db.prepare("UPDATE daily_plan_items SET completed_at = CURRENT_TIMESTAMP, skipped_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(dayItem.id),
      db.prepare(`
        INSERT INTO activity_runs
          (id, user_id, activity_id, daily_plan_item_id, plan_date, status,
           allotted_duration_seconds, planned_duration_seconds, actual_elapsed_seconds,
           timer_mode, timer_component_id, started_at, completed_at, details_json)
        VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(user_id, activity_id, plan_date) DO UPDATE SET
          daily_plan_item_id = excluded.daily_plan_item_id,
          status = 'completed',
          allotted_duration_seconds = excluded.allotted_duration_seconds,
          planned_duration_seconds = excluded.planned_duration_seconds,
          actual_elapsed_seconds = excluded.actual_elapsed_seconds,
          timer_mode = excluded.timer_mode,
          timer_component_id = excluded.timer_component_id,
          started_at = excluded.started_at,
          completed_at = CURRENT_TIMESTAMP,
          details_json = excluded.details_json,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        runId, userId, activity.id, dayItem.id, date,
        allottedDurationSeconds, plannedDurationSeconds, actualElapsedSeconds,
        timerMode, timerComponentId, startedAt, detailsJson,
      ),
    ]);

    return Response.json({
      completed: true,
      completedAt: new Date().toISOString(),
      run: {
        id: runId,
        allottedDurationSeconds,
        plannedDurationSeconds,
        actualElapsedSeconds,
        timerMode,
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
