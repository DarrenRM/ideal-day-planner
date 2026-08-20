import { getD1 } from "../../../db";
import { DEFAULT_DAY_SETTINGS, normalizeDaySettings } from "../../day-settings";
import { requestIdentity } from "../agent-store";

async function ensureSettings(userId: string) {
  const db = getD1();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").bind(userId),
    db.prepare(`
      INSERT OR IGNORE INTO settings
        (user_id, day_timeline_enabled, pull_forward_after_early_completion)
      VALUES (?, 0, 0)
    `).bind(userId),
  ]);
}

async function readSettings(userId: string) {
  const row = await getD1().prepare(`
    SELECT day_timeline_enabled AS dayTimelineEnabled,
           pull_forward_after_early_completion AS pullForwardAfterEarlyCompletion
    FROM settings
    WHERE user_id = ?
  `).bind(userId).first<Record<string, unknown>>();
  return normalizeDaySettings(row ?? DEFAULT_DAY_SETTINGS);
}

export async function GET(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to load settings." }, { status: 401 });

  try {
    await ensureSettings(userId);
    return Response.json({ settings: await readSettings(userId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Settings could not be loaded." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const userId = requestIdentity(request);
  if (!userId) return Response.json({ error: "Sign in to save settings." }, { status: 401 });

  try {
    const payload = await request.json() as Record<string, unknown>;
    if (typeof payload.dayTimelineEnabled !== "boolean") {
      return Response.json({ error: "Day Timeline must be on or off." }, { status: 400 });
    }
    await ensureSettings(userId);
    await getD1().prepare(`
      UPDATE settings
      SET day_timeline_enabled = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).bind(payload.dayTimelineEnabled ? 1 : 0, userId).run();
    return Response.json({ settings: await readSettings(userId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Settings could not be saved." }, { status: 500 });
  }
}

