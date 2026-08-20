import { getD1 } from "../../../db";
import { ensureAgentSchema, findActivity, queueActivitySetup } from "../agent-store";

const CATEGORIES = new Set(["Light", "Recharge", "Training", "Fuel", "Care", "Logistics", "Creativity", "Spirit"]);
const LEGACY_MIGRATION = "local-routine-v1";

type StoredItem = {
  id: string;
  title: string;
  duration: number;
  category: string;
  icon: string;
  color: string;
  completedAt?: string | null;
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
    items.push({ id, title, category, icon, color, duration, completedAt });
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
    db.prepare("INSERT OR IGNORE INTO settings (user_id, pull_forward_after_early_completion) VALUES (?, 0)").bind(userId),
    db.prepare("UPDATE activities SET category = 'Recharge', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND category = 'Reset'").bind(userId),
    db.prepare("UPDATE daily_plan_items SET category = 'Recharge', updated_at = CURRENT_TIMESTAMP WHERE category = 'Reset' AND daily_plan_id IN (SELECT id FROM daily_plans WHERE user_id = ?)").bind(userId),
  ]);
  return templateId;
}

async function readDay(userId: string, date: string) {
  const db = getD1();
  const { planId } = ids(userId, date);
  const plan = await db.prepare("SELECT start_minutes AS startMinutes FROM daily_plans WHERE id = ? AND user_id = ?").bind(planId, userId).first<{ startMinutes: number }>();
  if (!plan) return null;

  const result = await db.prepare(`
    SELECT client_key AS id, title, duration, category, icon, color, completed_at AS completedAt
    FROM daily_plan_items
    WHERE daily_plan_id = ? AND removed_at IS NULL
    ORDER BY position ASC
  `).bind(planId).all<StoredItem>();

  return { items: result.results, startMinutes: plan.startMinutes };
}

async function createTodayFromTemplate(userId: string, date: string, templateId: string) {
  const db = getD1();
  const { planId } = ids(userId, date);
  const existing = await db.prepare("SELECT id FROM daily_plans WHERE id = ? AND user_id = ?").bind(planId, userId).first();
  if (existing) return;

  const template = await db.prepare("SELECT start_minutes AS startMinutes FROM routine_templates WHERE id = ? AND user_id = ?").bind(templateId, userId).first<{ startMinutes: number }>();
  const templateItems = await db.prepare(`
    SELECT a.id AS activityId, a.client_key AS clientKey, a.title, a.category, a.icon, a.color, ri.position, ri.duration
    FROM routine_items ri
    JOIN activities a ON a.id = ri.activity_id
    WHERE ri.routine_id = ?
    ORDER BY ri.position ASC
  `).bind(templateId).all<{ activityId: string; clientKey: string; title: string; category: string; icon: string; color: string; position: number; duration: number }>();

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO daily_plans (id, user_id, plan_date, template_id, start_minutes) VALUES (?, ?, ?, ?, ?)")
      .bind(planId, userId, date, templateId, template?.startMinutes ?? 480),
    ...templateItems.results.map((item) => db.prepare(`
      INSERT OR IGNORE INTO daily_plan_items
        (id, daily_plan_id, activity_id, client_key, title, category, icon, color, position, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(`day-item:${safeSegment(userId)}:${date}:${safeSegment(item.clientKey)}`, planId, item.activityId, item.clientKey, item.title, item.category, item.icon, item.color, item.position, item.duration)),
  ]);
}

async function hasTemplateItems(templateId: string) {
  const row = await getD1().prepare("SELECT COUNT(*) AS count FROM routine_items WHERE routine_id = ?").bind(templateId).first<{ count: number }>();
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
      db.prepare(`
        INSERT OR IGNORE INTO daily_plan_items
          (id, daily_plan_id, activity_id, client_key, title, category, icon, color, position, duration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(`day-item:${user}:${date}:${safeSegment(item.id)}`, planId, activityId, item.id, item.title, item.category, item.icon, item.color, position, item.duration),
    );
  });
  statements.push(
    db.prepare("UPDATE routine_templates SET start_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(startMinutes, templateId, userId),
    db.prepare("INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)").bind(migrationId, userId, LEGACY_MIGRATION),
  );
  await db.batch(statements);
}

async function replaceToday(userId: string, date: string, items: StoredItem[], startMinutes: number) {
  const db = getD1();
  const { planId } = ids(userId, date);
  const user = safeSegment(userId);
  const statements = [
    db.prepare("UPDATE daily_plans SET start_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(startMinutes, planId, userId),
    db.prepare("DELETE FROM daily_plan_items WHERE daily_plan_id = ?").bind(planId),
  ];

  items.forEach((item, position) => {
    const activityId = `activity:${user}:${safeSegment(item.id)}`;
    statements.push(
      db.prepare(`
        INSERT INTO activities (id, user_id, client_key, title, category, icon, color)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, client_key) DO UPDATE SET
          title = excluded.title, category = excluded.category, icon = excluded.icon,
          color = excluded.color, updated_at = CURRENT_TIMESTAMP
      `).bind(activityId, userId, item.id, item.title, item.category, item.icon, item.color),
      db.prepare(`
        INSERT INTO daily_plan_items
          (id, daily_plan_id, activity_id, client_key, title, category, icon, color, position, duration, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(`day-item:${user}:${date}:${safeSegment(item.id)}`, planId, activityId, item.id, item.title, item.category, item.icon, item.color, position, item.duration, item.completedAt ?? null),
    );
  });
  await db.batch(statements);
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

async function saveTodayAsTemplate(userId: string, date: string) {
  const db = getD1();
  const { templateId, planId } = ids(userId, date);
  const user = safeSegment(userId);
  const plan = await db.prepare("SELECT start_minutes AS startMinutes FROM daily_plans WHERE id = ? AND user_id = ?")
    .bind(planId, userId)
    .first<{ startMinutes: number }>();
  if (!plan) throw new Error("Today has not loaded yet.");

  const dayItems = await db.prepare(`
    SELECT client_key AS clientKey, title, category, icon, color, position, duration
    FROM daily_plan_items
    WHERE daily_plan_id = ? AND removed_at IS NULL
    ORDER BY position ASC
  `).bind(planId).all<{ clientKey: string; title: string; category: string; icon: string; color: string; position: number; duration: number }>();

  const statements = [
    db.prepare("DELETE FROM routine_items WHERE routine_id = ?").bind(templateId),
    db.prepare("UPDATE routine_templates SET start_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .bind(plan.startMinutes, templateId, userId),
  ];

  dayItems.results.forEach((item, position) => {
    const activityId = `activity:${user}:${safeSegment(item.clientKey)}`;
    statements.push(
      db.prepare(`
        INSERT INTO activities (id, user_id, client_key, title, category, icon, color)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, client_key) DO UPDATE SET
          title = excluded.title, category = excluded.category, icon = excluded.icon, color = excluded.color, updated_at = CURRENT_TIMESTAMP
      `).bind(activityId, userId, item.clientKey, item.title, item.category, item.icon, item.color),
      db.prepare("INSERT INTO routine_items (id, routine_id, activity_id, position, duration) VALUES (?, ?, ?, ?, ?)")
        .bind(`template-item:${user}:${safeSegment(item.clientKey)}`, templateId, activityId, position, item.duration),
    );
  });

  await db.batch(statements);
  return { count: dayItems.results.length, startMinutes: plan.startMinutes };
}

async function restoreTemplateAndToday(userId: string, date: string, items: StoredItem[], startMinutes: number) {
  const db = getD1();
  const { templateId, planId, migrationId } = ids(userId, date);
  const user = safeSegment(userId);
  const statements = [
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
      db.prepare(`
        INSERT INTO daily_plan_items
          (id, daily_plan_id, activity_id, client_key, title, category, icon, color, position, duration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(`day-item:${user}:${date}:${safeSegment(item.id)}`, planId, activityId, item.id, item.title, item.category, item.icon, item.color, position, item.duration),
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
}

function unauthorized() {
  return Response.json({ error: "Sign in with ChatGPT to load your day." }, { status: 401 });
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  const userId = identity(request);
  const date = requestedDate(request);
  if (!userId) return unauthorized();
  if (!date) return Response.json({ error: "A valid local date is required." }, { status: 400 });

  try {
    const templateId = await ensureAccount(userId, date);
    if (!await hasTemplateItems(templateId)) return Response.json({ date, items: [], startMinutes: 480, needsImport: true });
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
    const payload = await request.json() as { mode?: unknown; items?: unknown; startMinutes?: unknown };
    const templateId = await ensureAccount(userId, date);
    if (payload.mode === "save-template") {
      const result = await saveTodayAsTemplate(userId, date);
      return Response.json({ date, ...result, savedAsTemplate: true });
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
    if (!await hasTemplateItems(templateId)) await importLegacy(userId, date, items, startMinutes);
    await createTodayFromTemplate(userId, date, templateId);
    await prepareActivitySetups(userId, items.filter((item) => !before.has(item.id)));
    return Response.json({ date, ...await readDay(userId, date), needsImport: false });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  const userId = identity(request);
  const date = requestedDate(request);
  if (!userId) return unauthorized();
  if (!date) return Response.json({ error: "A valid local date is required." }, { status: 400 });

  try {
    const payload = await request.json() as { items?: unknown; startMinutes?: unknown };
    const items = normalizeItems(payload.items);
    if (!items) return Response.json({ error: "Invalid routine items." }, { status: 400 });
    const startMinutes = normalizeStartMinutes(payload.startMinutes);
    const templateId = await ensureAccount(userId, date);
    if (!await hasTemplateItems(templateId)) return Response.json({ error: "Import the routine before editing today." }, { status: 409 });
    const before = await activityDefinitions(userId);
    await createTodayFromTemplate(userId, date, templateId);
    await replaceToday(userId, date, items, startMinutes);
    await prepareActivitySetups(userId, items.filter((item) => {
      const previous = before.get(item.id);
      return !previous || previous.title !== item.title || previous.category !== item.category;
    }));
    return Response.json({ date, ...await readDay(userId, date), needsImport: false });
  } catch (error) {
    return failure(error);
  }
}
