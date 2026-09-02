import { getD1 } from "../../../../db";
import { parseAdvancement } from "../../../schedule-model";
import { selectedSessionOptionId, sessionFieldValue, sessionFieldsForOption, type SessionChoiceData, type SessionLogData } from "../../../session-log-model";
import { recurringStepScheduleStatus, type RecurringCadence } from "../../../recurring-step-schedule";
import { selectionForDate, type DailySelectionData } from "../../../daily-selection-model";
import { apiFailure, applyUserRecordMutation, ensureAgentSchema, findActivity, queueDayHighlight, readActivityRecords, requestIdentity, safeId } from "../../agent-store";

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function boundedSeconds(value: unknown, allowZero = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= (allowZero ? 0 : 1) && rounded <= 24 * 60 * 60 ? rounded : null;
}

function completedSubjectKeysForDate(records: Awaited<ReturnType<typeof readActivityRecords>>, date: string, completionDates = new Map<string, string[]>()) {
  const productKeys = new Set(records.filter((record) => record.type === "product").map((record) => record.key));
  const variableSelections = records.filter((record) => record.type === "daily_selection" && record.data.kind === "routine");
  const variableSubjectKeys = new Set(variableSelections.flatMap((record) => (record.data as DailySelectionData).items
    .flatMap((item) => item.subjectKey ? [item.subjectKey] : [])));
  const selectedSubjectKeys = new Set(variableSelections.flatMap((record) => {
    const data = record.data as DailySelectionData;
    const selected = new Set(selectionForDate(data, date));
    return data.items.flatMap((item) => selected.has(item.id) && item.subjectKey ? [item.subjectKey] : []);
  }));
  return [...productKeys].filter((subjectKey) => records.some((record) => {
    if (variableSubjectKeys.has(subjectKey)) return selectedSubjectKeys.has(subjectKey);
    if (record.subjectKey !== subjectKey) return false;
    if (record.type === "adherence") {
      const effectiveDate = typeof record.data.effectiveDate === "string" ? record.data.effectiveDate : "";
      return /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) && effectiveDate <= date;
    }
    if (record.type !== "recurring_step") return false;
    const status = recurringStepScheduleStatus({
      anchorDate: typeof record.data.anchorDate === "string" ? record.data.anchorDate : undefined,
      cadence: record.data.cadence as RecurringCadence | undefined,
      completedDates: [...new Set([
        ...(Array.isArray(record.data.completedDates) ? record.data.completedDates.filter((value): value is string => typeof value === "string") : []),
        ...(completionDates.get(subjectKey) ?? []),
      ])],
    }, date);
    return Boolean(status.dueDate);
  }));
}

function completedSubjectKeysFromDetails(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "{}") as { completedSubjectKeys?: unknown };
    return Array.isArray(parsed.completedSubjectKeys) ? parsed.completedSubjectKeys.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

type DayItem = {
  id: string;
  dayPlanId: string;
  activityId: string;
  clientKey: string;
  activityVariantId: string | null;
  schedulePatternId: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  duration: number;
  dayTimelineEnabled: number;
};

async function completionAdvancementStatements(userId: string, item: DayItem, outcome: "completed" | "skipped") {
  if (!item.schedulePatternId) return [];
  const db = getD1();
  const pattern = await db.prepare(`
    SELECT advancement_json AS advancementJson,
           initial_step_position AS initialStepPosition,
           (SELECT COUNT(*) FROM schedule_pattern_steps WHERE pattern_id = schedule_patterns.id) AS stepCount
    FROM schedule_patterns
    WHERE id = ? AND user_id = ? AND archived_at IS NULL
  `).bind(item.schedulePatternId, userId).first<{ advancementJson: string; initialStepPosition: number; stepCount: number }>();
  if (!pattern || pattern.stepCount < 1) return [];
  let advancement = null;
  try {
    advancement = parseAdvancement(JSON.parse(pattern.advancementJson));
  } catch {
    return [];
  }
  if (advancement?.kind !== "completion" || outcome === "skipped" && !advancement.advanceOnSkip) return [];
  return [
    db.prepare(`
      INSERT OR IGNORE INTO schedule_pattern_state
        (pattern_id, current_step_position, revision)
      VALUES (?, ?, 1)
    `).bind(item.schedulePatternId, pattern.initialStepPosition),
    db.prepare(`
      UPDATE schedule_pattern_state
      SET current_step_position = (current_step_position + 1) % ?,
          last_advanced_daily_plan_item_id = ?, revision = revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE pattern_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM schedule_action_events
          WHERE user_id = ? AND idempotency_key = ?
        )
    `).bind(pattern.stepCount, item.id, item.schedulePatternId, userId, `pattern-advance:${item.id}`),
    db.prepare(`
      INSERT OR IGNORE INTO schedule_action_events
        (id, user_id, action_type, action_json, source, actor, idempotency_key)
      VALUES (?, ?, 'advance_pattern', ?, 'user', ?, ?)
    `).bind(
      `schedule-event:${safeId(userId)}:pattern-advance:${safeId(item.id)}`,
      userId,
      JSON.stringify({ patternId: item.schedulePatternId, occurrenceId: item.id, outcome }),
      userId,
      `pattern-advance:${item.id}`,
    ),
  ];
}

export async function POST(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to record this activity." }, { status: 401 });

  try {
    const payload = await request.json() as Record<string, unknown>;
    const mode = payload.mode;
    const refreshHighlight = payload.refreshHighlight !== false;
    const clientKey = typeof payload.activityId === "string" ? payload.activityId.trim().slice(0, 160) : "";
    const occurrenceId = typeof payload.occurrenceId === "string" ? payload.occurrenceId.trim().slice(0, 240) : "";
    const date = validDate(payload.date);
    if ((!clientKey && !occurrenceId) || !date) return Response.json({ error: "An occurrence and local date are required." }, { status: 400 });

    await ensureAgentSchema();
    const db = getD1();
    const item = await db.prepare(`
      SELECT dpi.id, dpi.activity_id AS activityId, dpi.client_key AS clientKey,
             dp.id AS dayPlanId,
             dpi.activity_variant_id AS activityVariantId,
             dpi.schedule_pattern_id AS schedulePatternId,
             dpi.completed_at AS completedAt, dpi.skipped_at AS skippedAt,
             dpi.duration, COALESCE(s.day_timeline_enabled, 0) AS dayTimelineEnabled
      FROM daily_plan_items dpi
      JOIN daily_plans dp ON dp.id = dpi.daily_plan_id
      LEFT JOIN settings s ON s.user_id = dp.user_id
      WHERE dp.user_id = ? AND dp.plan_date = ?
        AND (${occurrenceId ? "dpi.id = ?" : "dpi.client_key = ?"})
        AND dpi.removed_at IS NULL
      LIMIT 1
    `).bind(userId, date, occurrenceId || clientKey).first<DayItem>();
    if (!item) return Response.json({ error: "This occurrence is not scheduled for that day." }, { status: 404 });
    const dayItem = item;
    const activity = await findActivity(userId, item.clientKey);
    if (!activity || activity.id !== item.activityId) return Response.json({ error: "Activity not found." }, { status: 404 });
    const runId = `activity-run:${safeId(userId)}:${safeId(item.id)}`;

    if (mode === "skip" || mode === "unskip") {
      const skipped = mode === "skip";
      const statements = [
        db.prepare(`
          UPDATE daily_plan_items
          SET skipped_at = ${skipped ? "CURRENT_TIMESTAMP" : "NULL"}, completed_at = NULL,
              revision = revision + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(item.id),
        db.prepare(`
          INSERT INTO activity_runs
            (id, user_id, activity_id, activity_variant_id, daily_plan_item_id, plan_date,
             status, allotted_duration_seconds, planned_duration_seconds)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(daily_plan_item_id) WHERE daily_plan_item_id IS NOT NULL DO UPDATE SET
            activity_variant_id = excluded.activity_variant_id, status = excluded.status,
            actual_elapsed_seconds = NULL, timer_mode = NULL, timer_component_id = NULL,
            started_at = NULL, completed_at = NULL, details_json = NULL,
            updated_at = CURRENT_TIMESTAMP
        `).bind(
          runId, userId, activity.id, item.activityVariantId, item.id, date,
          skipped ? "skipped" : "planned",
          item.dayTimelineEnabled ? item.duration * 60 : null,
          item.dayTimelineEnabled ? item.duration * 60 : null,
        ),
      ];
      if (skipped && !item.skippedAt) statements.push(...await completionAdvancementStatements(userId, item, "skipped"));
      await db.batch(statements);
      const highlight = refreshHighlight ? await queueDayHighlight(userId, item.dayPlanId).catch((error) => {
        console.error("Could not refresh the day highlight after changing a skip.", error);
        return null;
      }) : null;
      return Response.json({ skipped, skippedAt: skipped ? new Date().toISOString() : null, runId, highlight });
    }

    if (mode === "reopen") {
      await db.batch([
        db.prepare("UPDATE daily_plan_items SET completed_at = NULL, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(item.id),
        db.prepare("UPDATE activity_runs SET status = 'reopened', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(runId, userId),
      ]);
      const highlight = refreshHighlight ? await queueDayHighlight(userId, item.dayPlanId).catch((error) => {
        console.error("Could not refresh the day highlight after reopening an activity.", error);
        return null;
      }) : null;
      return Response.json({ completed: false, runId, highlight });
    }

    if (mode !== "complete") return Response.json({ error: "Unsupported run operation." }, { status: 400 });
    if (item.completedAt) {
      const existingRun = await db.prepare("SELECT details_json AS detailsJson FROM activity_runs WHERE id = ? AND user_id = ?")
        .bind(runId, userId).first<{ detailsJson: string | null }>();
      return Response.json({ completed: true, completedAt: item.completedAt, completedSubjectKeys: completedSubjectKeysFromDetails(existingRun?.detailsJson), run: { id: runId }, idempotent: true });
    }

    const timing = payload.timing && typeof payload.timing === "object" ? payload.timing as Record<string, unknown> : null;
    const allottedDurationSeconds = dayItem.dayTimelineEnabled ? dayItem.duration * 60 : null;
    const plannedDurationSeconds = boundedSeconds(timing?.plannedSeconds) ?? allottedDurationSeconds;
    const actualElapsedSeconds = boundedSeconds(timing?.elapsedSeconds, true);
    const timerMode = timing?.mode === "timer" || timing?.mode === "countdown" ? timing.mode : null;
    const timerComponentId = typeof timing?.componentId === "string" ? timing.componentId.trim().slice(0, 64) : null;
    const startedAt = typeof timing?.startedAt === "string" && !Number.isNaN(Date.parse(timing.startedAt)) ? timing.startedAt : null;
    const activityRecords = await readActivityRecords(activity.id, date, item.activityVariantId);
    const priorRuns = await db.prepare(`
      SELECT plan_date AS planDate, details_json AS detailsJson
      FROM activity_runs
      WHERE user_id = ? AND activity_id = ? AND status = 'completed' AND plan_date < ?
      ORDER BY plan_date
    `).bind(userId, activity.id, date).all<{ planDate: string; detailsJson: string | null }>();
    const completionDates = new Map<string, string[]>();
    for (const priorRun of priorRuns.results) {
      for (const subjectKey of completedSubjectKeysFromDetails(priorRun.detailsJson)) {
        completionDates.set(subjectKey, [...(completionDates.get(subjectKey) ?? []), priorRun.planDate]);
      }
    }
    const completedSubjectKeys = completedSubjectKeysForDate(activityRecords, date, completionDates);
    const recordVersions = activityRecords.map((record) => ({
      key: record.key,
      type: record.type,
      version: record.version,
    }));
    const detailsJson = JSON.stringify({
      ...(timerMode ? { timingSource: "workspace", timerMode, timerComponentId } : {}),
      completedSubjectKeys,
      recordVersions,
    });
    const statements = [
      db.prepare(`
        UPDATE daily_plan_items
        SET completed_at = CURRENT_TIMESTAMP, skipped_at = NULL,
            revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND completed_at IS NULL
      `).bind(item.id),
      db.prepare(`
        INSERT INTO activity_runs
          (id, user_id, activity_id, activity_variant_id, daily_plan_item_id, plan_date,
           status, allotted_duration_seconds, planned_duration_seconds,
           actual_elapsed_seconds, timer_mode, timer_component_id, started_at,
           completed_at, details_json)
        VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(daily_plan_item_id) WHERE daily_plan_item_id IS NOT NULL DO UPDATE SET
          activity_variant_id = excluded.activity_variant_id, status = 'completed',
          allotted_duration_seconds = excluded.allotted_duration_seconds,
          planned_duration_seconds = excluded.planned_duration_seconds,
          actual_elapsed_seconds = excluded.actual_elapsed_seconds,
          timer_mode = excluded.timer_mode, timer_component_id = excluded.timer_component_id,
          started_at = excluded.started_at, completed_at = CURRENT_TIMESTAMP,
          details_json = excluded.details_json, updated_at = CURRENT_TIMESTAMP
      `).bind(
        runId, userId, activity.id, item.activityVariantId, item.id, date,
        allottedDurationSeconds, plannedDurationSeconds, actualElapsedSeconds,
        timerMode, timerComponentId, startedAt, detailsJson,
      ),
      ...await completionAdvancementStatements(userId, item, "completed"),
    ];
    await db.batch(statements);
    if (actualElapsedSeconds !== null && actualElapsedSeconds > 0) {
      const sessionLog = activityRecords.find((record) => record.type === "session_log");
      const sessionData = sessionLog?.data as SessionLogData | undefined;
      const choice = sessionData?.choiceRecordKey
        ? activityRecords.find((record) => record.key === sessionData.choiceRecordKey && record.type === "session_choice")
        : undefined;
      const optionId = choice
        ? selectedSessionOptionId(choice.data as SessionChoiceData, date)
        : sessionData?.defaultOption?.id;
      const durationField = optionId && sessionData
        ? sessionFieldsForOption(sessionData, optionId).find((field) => field.kind === "duration")
        : undefined;
      const existingEntry = sessionData?.entries?.find((entry) => entry.date === date && entry.optionId === optionId);
      if (sessionLog && optionId && durationField && !sessionFieldValue(existingEntry, durationField)) {
        await applyUserRecordMutation({
          userId,
          activityId: activity.id,
          activityVariantId: item.activityVariantId,
          recordKey: sessionLog.key,
          actionId: `session-timing:${runId}`,
          operation: "save_session_log",
          payload: {
            optionId,
            values: [{ field: durationField.id, value: String(Math.round((actualElapsedSeconds / 60) * 10) / 10) }],
          },
          planDate: date,
        }).catch((error) => console.error("Could not add measured-session timing after completion.", error));
      }
    }
    for (const strengthSession of activityRecords.filter((record) => record.type === "strength_session")) {
      await applyUserRecordMutation({
        userId,
        activityId: activity.id,
        activityVariantId: item.activityVariantId,
        recordKey: strengthSession.key,
        actionId: `strength-finish:${runId}:${strengthSession.key}`,
        operation: "finish_strength_session",
        payload: {},
        planDate: date,
      }).catch((error) => console.error("Could not finish the strength session after completion.", error));
    }
    const highlight = refreshHighlight ? await queueDayHighlight(userId, item.dayPlanId).catch((error) => {
      console.error("Could not queue the day highlight after completion.", error);
      return null;
    }) : null;

    return Response.json({
      completed: true,
      completedAt: new Date().toISOString(),
      completedSubjectKeys,
      run: { id: runId, allottedDurationSeconds, plannedDurationSeconds, actualElapsedSeconds, timerMode },
      highlight,
    });
  } catch (error) {
    return apiFailure(error);
  }
}
