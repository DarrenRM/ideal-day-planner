import { matchBootstrapUser, createSession, readBootstrapUsers, safeReturnTo, sessionCookie } from "../lib/auth.mjs";
import { json } from "../lib/responses.mjs";

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function sourceKey(request) { return (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown").split(",")[0].trim().slice(0, 80); }
function rateLimited(key, now = Date.now()) {
  const previous = attempts.get(key);
  if (!previous || now - previous.startedAt >= WINDOW_MS) { attempts.set(key, { count: 1, startedAt: now }); return false; }
  previous.count += 1;
  return previous.count > MAX_ATTEMPTS;
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, { allow: "POST" });
    if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Request origin was not accepted." }, 403);
    if (rateLimited(sourceKey(request))) return json({ error: "Too many attempts. Wait a few minutes and try again." }, 429, { "retry-after": "900" });
    let body;
    try { body = await request.json(); } catch { return json({ error: "That password was not accepted." }, 401); }
    const password = typeof body?.password === "string" ? body.password : "";
    const users = readBootstrapUsers();
    const user = users.length === 2 ? matchBootstrapUser(password, users) : null;
    if (!user) return json({ error: "That password was not accepted." }, 401);
    attempts.delete(sourceKey(request));
    const token = createSession(user, process.env.IDEAL_DAY_SESSION_SECRET || "");
    return json({ ok: true, redirectTo: safeReturnTo(body?.returnTo) }, 200, { "set-cookie": sessionCookie(token) });
  },
};
