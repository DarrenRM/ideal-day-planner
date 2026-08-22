import { getD1 } from "../../../db";
import { archiveParentCadenceRecords, backfillBoundedSessionChoices, backfillExplicitFollowUps, backfillMeasuredSessionLogs, ensureAgentSchema, findActivity, migrateLegacyProductOwnership, queueActivitySetup, queueDayHighlightIfNeeded, queueDueFollowUps } from "../agent-store";
import { ensureDefaultSchedule, readResolvedDay, resolveDay } from "../schedule-store";

const CATEGORIES = new Set(["Light", "Recharge", "Training", "Fuel", "Care", "Logistics", "Creativity", "Spirit"]);
const LEGACY_MIGRATION = "local-routine-v1";

type StoredItem = {
  id: string;
  occurrenceId?: string;
  activityId?: string;
  title: string;
  duration: number;
  category: string;
  icon: string;
  color: string;
  completedAt?: string | null;
  skippedAt?: string | null;
};

function identity(request: Request) {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (userId) return userId;

  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return "local-development-user";
  return null;
}

function requestedDate(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function safeSegment(value: string) {
  return encodeURIComponent(value).replaceAll("%", "_");
}

function normalizeCategory(value: unknown) {
  if (value === "Reset") return "Recharge";
  return typeof value === "string" && CATEGORIES.has(value) ? value : null;
}

function normalizeItems(value: unknown): StoredItem[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const seen = new Set<string>();
  const items: StoredItem[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const raw = candidate as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 160) : "";
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 60) : "";
    const category = normalizeCategory(raw.category);
    const icon = typeof raw.icon === "string" ? raw.icon.slice(0, 8) : "";
    const color = typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : "";
    const rawDuration = typeof raw.duration === "number" ? raw.duration : Number.NaN;
    const duration = Math.min(480, Math.max(5, Math.round(rawDuration / 5) * 5));

    if (!id || seen.has(id) || !title || !category || !icon || !color || !Number.isFinite(duration)) return null;
    seen.add(id);
    const completedAt = typeof raw.completedAt === "string" ? raw.completedAt.slice(0, 40) : null;
    const skippedAt = typeof raw.skippedAt === "string" ? raw.skippedAt.slice(0, 40) : null;
    items.push({ id, title, category, icon, color, duration, completedAt, skippedAt });
  }

  return items;
}

function normalizeStartMinutes(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 480;
  return Math.min(1435, Math.max(0, Math.round(value / 5) * 5));
}

function ids(userId: string, date: string) {
  const user = safeSegment(userId);
  return {
    templateId: `template:${user}:default`,
    planId: `plan:${user}:${date}`,
    migrationId: `migration:${user}:${LEGACY_MIGRATION}`,
  };
}

async function ensureAccount(userId: string, date: string) {
  const db = getD1();
  const { templateId } = ids(userId, date);
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").bind(userId),
    db.prepare("INSERT OR IGNORE INTO routine_templates (id, user_id, name, start_minutes) VALUES (?, ?, 'Ideal Day', 480)").bind(templateId, userId),
    db.prepare("INSERT OR IGNORE INTO settings (user_id, day_timeline_enabled, pull_forward_after_early_completion) VALUES (?, 0, 0)").bind(userId),
    db.prepare("UPDATE activities SET category = 'Recharge', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND category = 'Reset'").bind(userId),
    db.prepare("UPDATE daily_plan_items SET category = 'Recharge', updated_at = CURRENT_TIMESTAMP WHERE category = 'Reset' AND daily_plan_id IN (SELECT id FROM daily_plans WHERE user_id = ?)").bind(userId),
  ]);
  return templateId;
}

async function readDay(userId: string, date: string) {
  const db = getD1();
  const { planId } = ids(userId, date);
  const plan = await db.prepare(`
    SELECT dp.start_minutes AS startMinutes, dp.started_at AS startedAt,
           dp.highlight_status AS highlightStatus, dp.highlight_body AS highlightBody,
           dp.highlight_kind AS highlightKind, dp.highlight_revision AS highlightRevision,
           COALESCE(rt.start_minutes, 480) AS preferredStartMinutes,
           COALESCE(s.day_timeline_enabled, 0) AS dayTimelineEnabled,
           COALESCE(s.pull_forward_after_early_completion, 0) AS pullForwardAfterEarlyCompletion
    FROM daily_plans dp
    LEFT JOIN routine_templates rt ON rt.id = dp.template_id
    LEFT JOIN settings s ON s.user_id = dp.user_id
    WHERE dp.id = ? AND dp.user_id = ?
  `).bind(planId, userId).first<{ startMinutes: number; startedAt: string | null; highlightStatus: string; highlightBody: string | null; highlightKind: string | null; highlightRevision: number; preferredStartMinutes: number; dayTimelineEnabled: number; pullForwardAfterEarlyCompletion: number }>();
  if (!plan) return null;

  const items = await readResolvedDay(userId, planId);
  await queueDueFollowUps(userId, date);
  const queuedHighlight = items.some((item) => item.completedAt)
    ? await queueDayHighlightIfNeeded(userId, planId)
    : null;

  return {
    items,
    startMinutes: plan.startMinutes,
    preferredStartMinutes: plan.preferredStartMinutes,
    startedAt: plan.startedAt,
    highlight: queuedHighlight ?? {
      status: plan.highlightStatus,
      body: plan.highlightBody,
      kind: plan.highlightKind,
      revision: plan.highlightRevision,
    },
    settings: {
      dayTimelineEnabled: Boolean(plan.dayTimelineEnabled),
      pullForwardAfterEarlyCompletion: Boolean(plan.pullForwardAfterEarlyCompletion),
    },
  };
}

async function startToday(userId: string, date: string, currentMinutes: unknown) {
  const db = getD1();
  const { planId } = ids(userId, date);
  const plan = await db.prepare("SELECT started_at AS startedAt FROM daily_plans WHERE id = ? AND user_id = ?")
    .bind(planId, userId).first<{ startedAt: string | null }>();
  if (!plan) throw new Error("Today has not loaded yet.");
  if (plan.startedAt) return readDay(userId, date);

  const current = typeof currentMinutes === "number" && Number.isFinite(currentMinutes)
    ? Math.min(1435, Math.max(0, currentMinutes))
    : 480;
  const anchoredStart = Math.min(1435, Math.ceil(current / 5) * 5);
  await db.prepare(`
    UPDATE daily_plans
    SET start_minutes = ?, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND started_at IS NULL
  `).bind(anchoredStart, planId, userId).run();
  return readDay(userId, date);
}

async function resetToday(userId: string, date: string) {
  const db = getD1();
  const { planId } = ids(userId, date);
  const plan = await db.prepare("SELECT id FROM daily_plans WHERE id = ? AND user_id = ?")
    .bind(planId, userId).first<{ id: string }>();
  if (!plan) throw new Error("Today has not loaded yet.");

  await db.batch([
    db.prepare(`
      UPDATE daily_plans
      SET start_minutes = COALESCE(
            (SELECT start_minutes FROM routine_templates WHERE id = daily_plans.template_id),
            480
          ),
          started_at = NULL,
          highlight_status = 'idle', highlight_body = NULL, highlight_kind = NULL,
          highlight_revision = highlight_revision + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(planId, userId),
    db.prepare(`
      UPDATE daily_plan_items
      SET completed_at = NULL, skipped_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE daily_plan_id = ?
    `).bind(planId),
    db.prepare(`
      UPDATE activity_runs
      SET status = 'planned',
          actual_elapsed_seconds = NULL,
          timer_mode = NULL,
          timer_component_id = NULL,
          started_at = NULL,
          completed_at = NULL,
          details_json = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND plan_date = ?
    `).bind(userId, date),
    db.prepare(`
      UPDATE agent_jobs
      SET status = 'succeeded', lease_token = NULL, lease_owner = NULL,
          lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND day_plan_id = ? AND kind = 'day_highlight'
        AND status IN ('queued', 'leased', 'running', 'retryable_failure')
    `).bind(userId, planId),
  ]);
  return readDay(userId, date);
}

async function createTodayFromTemplate(userId: string, date: string, templateId: string) {
  const db = getD1();
  const { planId } = ids(userId, date);
  const template = await db.prepare("SELECT start_minutes AS startMinutes FROM routine_templates WHERE id = ? AND user_id = ?").bind(templateId, userId).first<{ startMinutes: number }>();
  await resolveDay(userId, date, templateId, planId, template?.startMinutes ?? 480);
}

async function hasTemplateItems(userId: string, templateId: string) {
  await ensureDefaultSchedule(userId, templateId);
  const row = await getD1().prepare("SELECT COUNT(*) AS count FROM schedule_patterns WHERE routine_id = ? AND archived_at IS NULL").bind(templateId).first<{ count: number }>();
  return (row?.count ?? 0) > 0;
}

async function importLegacy(userId: string, date: string, items: StoredItem[], startMinutes: number) {
  const db = getD1();
  const { templateId, planId, migrationId } = ids(userId, date);
  const user = safeSegment(userId);
  const statements = [
    db.prepare("INSERT OR IGNORE INTO daily_plans (id, user_id, plan_date, template_id, start_minutes) VALUES (?, ?, ?, ?, ?)")
      .bind(planId, userId, date, templateId, startMinutes),
  ];

  items.forEach((item, position) => {
    const activityId = `activity:${user}:${safeSegment(item.id)}`;
    statements.push(
      db.prepare(`
        INSERT INTO activities (id, user_id, client_key, title, category, icon, color)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, client_key) DO UPDATE SET
          title = excluded.title, category = excluded.category, icon = excluded.icon, color = excluded.color, updated_at = CURRENT_TIMESTAMP
      `).bind(activityId, userId, item.id, item.title, item.category, item.icon, item.color),
      db.prepare("INSERT OR IGNORE INTO routine_items (id, routine_id, activity_id, position, duration) VALUES (?, ?, ?, ?, ?)")
        .bind(`template-item:${user}:${safeSegment(item.id)}`, templateId, activityId, position, item.duration),
    );
  });
  statements.push(
    db.prepare("UPDATE routine_templates SET start_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(startMinutes, templateId, userId),
    db.prepare("INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)").bind(migrationId, userId, LEGACY_MIGRATION),
  );
  await db.batch(statements);
  await ensureDefaultSchedule(userId, templateId);
}

async function activityDefinitions(userId: string) {
  const rows = await getD1().prepare(`
    SELECT client_key AS clientKey, title, category FROM activities WHERE user_id = ?
  `).bind(userId).all<{ clientKey: string; title: string; category: string }>();
  return new Map(rows.results.map((row) => [row.clientKey, row]));
}

async function prepareActivitySetups(userId: string, items: StoredItem[]) {
  if (!items.length) return;
  await ensureAgentSchema();
  for (const item of items) {
    const activity = await findActivity(userId, item.id);
    if (activity) await queueActivitySetup(userId, activity);
  }
}

async function restoreTemplateAndToday(userId: string, date: string, items: StoredItem[], startMinutes: number) {
  const db = getD1();
  const { templateId, planId, migrationId } = ids(userId, date);
  const user = safeSegment(userId);
  const statements = [
    db.prepare("DELETE FROM schedule_patterns WHERE routine_id = ?").bind(templateId),
    db.prepare("DELETE FROM routine_items WHERE routine_id = ?").bind(templateId),
    db.prepare("DELETE FROM daily_plan_items WHERE daily_plan_id = ?").bind(planId),
    db.prepare("UPDATE routine_templates SET start_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(startMinutes, templateId, userId),
    db.prepare("UPDATE daily_plans SET start_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(startMinutes, planId, userId),
  ];

  items.forEach((item, position) => {
    const activityId = `activity:${user}:${safeSegment(item.id)}`;
    statements.push(
      db.prepare(`
        INSERT INTO activities (id, user_id, client_key, title, category, icon, color)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, client_key) DO UPDATE SET
          title = excluded.title, category = excluded.category, icon = excluded.icon, color = excluded.color, updated_at = CURRENT_TIMESTAMP
      `).bind(activityId, userId, item.id, item.title, item.category, item.icon, item.color),
      db.prepare("INSERT INTO routine_items (id, routine_id, activity_id, position, duration) VALUES (?, ?, ?, ?, ?)")
        .bind(`template-item:${user}:${safeSegment(item.id)}`, templateId, activityId, position, item.duration),
    );
  });

  statements.push(
    db.prepare("UPDATE user_migrations SET completed_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(migrationId, userId),
    db.prepare(`
      DELETE FROM activities
      WHERE user_id = ?
        AND id NOT IN (SELECT activity_id FROM routine_items)
        AND id NOT IN (SELECT activity_id FROM daily_plan_items)
    `).bind(userId),
  );
  await db.batch(statements);
  await ensureDefaultSchedule(userId, templateId);
  await resolveDay(userId, date, templateId, planId, startMinutes);
}

function unauthorized() {
  return Response.json({ error: "Sign in with ChatGPT to load your day." }, { status: 401 });
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  console.error(`Day API failed: ${message}`);
  return Response.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  const userId = identity(request);
  const date = requestedDate(request);
  if (!userId) return unauthorized();
  if (!date) return Response.json({ error: "A valid local date is required." }, { status: 400 });

  try {
    await ensureAgentSchema();
    const templateId = await ensureAccount(userId, date);
    await archiveParentCadenceRecords(userId);
    await backfillExplicitFollowUps(userId);
    await backfillBoundedSessionChoices(userId);
    await backfillMeasuredSessionLogs(userId);
    await migrateLegacyProductOwnership(userId);
    if (!await hasTemplateItems(userId, templateId)) {
      const row = await getD1().prepare(`
        SELECT COALESCE(day_timeline_enabled, 0) AS dayTimelineEnabled,
               COALESCE(pull_forward_after_early_completion, 0) AS pullForwardAfterEarlyCompletion
        FROM settings WHERE user_id = ?
      `).bind(userId).first<{ dayTimelineEnabled: number; pullForwardAfterEarlyCompletion: number }>();
      return Response.json({
        date,
        items: [],
        startMinutes: 480,
        preferredStartMinutes: 480,
        startedAt: null,
        settings: {
          dayTimelineEnabled: Boolean(row?.dayTimelineEnabled),
          pullForwardAfterEarlyCompletion: Boolean(row?.pullForwardAfterEarlyCompletion),
        },
        needsImport: true,
      });
    }
    await createTodayFromTemplate(userId, date, templateId);
    return Response.json({ date, ...await readDay(userId, date), needsImport: false });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const userId = identity(request);
  const date = requestedDate(request);
  if (!userId) return unauthorized();
  if (!date) return Response.json({ error: "A valid local date is required." }, { status: 400 });

  try {
    await ensureAgentSchema();
    const payload = await request.json() as { mode?: unknown; items?: unknown; startMinutes?: unknown; currentMinutes?: unknown };
    const templateId = await ensureAccount(userId, date);
    if (payload.mode === "start-day") {
      await createTodayFromTemplate(userId, date, templateId);
      return Response.json({ date, ...await startToday(userId, date, payload.currentMinutes), needsImport: false });
    }
    if (payload.mode === "reset-today") {
      await createTodayFromTemplate(userId, date, templateId);
      return Response.json({ date, ...await resetToday(userId, date), needsImport: false, reset: true });
    }
    const items = normalizeItems(payload.items);
    if (!items) return Response.json({ error: "Invalid routine items." }, { status: 400 });
    const startMinutes = normalizeStartMinutes(payload.startMinutes);
    const before = await activityDefinitions(userId);
    if (payload.mode === "restore-template") {
      await createTodayFromTemplate(userId, date, templateId);
      await restoreTemplateAndToday(userId, date, items, startMinutes);
      await prepareActivitySetups(userId, items.filter((item) => {
        const previous = before.get(item.id);
        return !previous || previous.title !== item.title || previous.category !== item.category;
      }));
      return Response.json({ date, ...await readDay(userId, date), needsImport: false, restored: true });
    }
    if (!await hasTemplateItems(userId, templateId)) await importLegacy(userId, date, items, startMinutes);
    await createTodayFromTemplate(userId, date, templateId);
    await prepareActivitySetups(userId, items.filter((item) => !before.has(item.id)));
    return Response.json({ date, ...await readDay(userId, date), needsImport: false });
  } catch (error) {
    return failure(error);
  }
}
