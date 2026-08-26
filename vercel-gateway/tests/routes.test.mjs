import assert from "node:assert/strict";
import test from "node:test";
import login from "../api/login.mjs";
import logout from "../api/logout.mjs";
import proxy from "../api/proxy.mjs";
import session from "../api/session.mjs";
import { makePasswordHash } from "../lib/auth.mjs";

const testEnvironment = {
  IDEAL_DAY_SESSION_SECRET: "route-test-session-secret-that-is-long-enough",
  IDEAL_DAY_USER_A_ID: "vercel-a",
  IDEAL_DAY_USER_A_PASSWORD_HASH: makePasswordHash("first password", { cost: 16384, salt: Buffer.alloc(16, 3) }),
  IDEAL_DAY_USER_A_SESSION_VERSION: "1",
  IDEAL_DAY_USER_B_ID: "vercel-b",
  IDEAL_DAY_USER_B_PASSWORD_HASH: makePasswordHash("second password", { cost: 16384, salt: Buffer.alloc(16, 4) }),
  IDEAL_DAY_USER_B_SESSION_VERSION: "1",
};

function withEnvironment(callback) {
  const prior = {};
  for (const [key, value] of Object.entries(testEnvironment)) { prior[key] = process.env[key]; process.env[key] = value; }
  return Promise.resolve(callback()).finally(() => {
    for (const key of Object.keys(testEnvironment)) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  });
}

test("logged-out pages redirect and logged-out APIs disclose no data", async () => {
  const page = await proxy.fetch(new Request("https://example.vercel.app/?path=" , { headers: { accept: "text/html" } }));
  assert.equal(page.status, 307);
  assert.match(page.headers.get("location") || "", /^\/login\?next=/);
  const api = await proxy.fetch(new Request("https://example.vercel.app/api/day?path=api%2Fday", { headers: { accept: "application/json" } }));
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: "Authentication required." });
});

test("a valid password creates a secure session while failures stay generic", async () => withEnvironment(async () => {
  const rejected = await login.fetch(new Request("https://example.vercel.app/_ideal-day/login", { method: "POST", headers: { "content-type": "application/json", "origin": "https://example.vercel.app", "x-forwarded-for": "192.0.2.10" }, body: JSON.stringify({ password: "wrong" }) }));
  assert.equal(rejected.status, 401);
  assert.deepEqual(await rejected.json(), { error: "That password was not accepted." });

  const accepted = await login.fetch(new Request("https://example.vercel.app/_ideal-day/login", { method: "POST", headers: { "content-type": "application/json", "origin": "https://example.vercel.app", "x-forwarded-for": "192.0.2.11" }, body: JSON.stringify({ password: "first password", returnTo: "//attacker.example" }) }));
  assert.equal(accepted.status, 200);
  const cookie = accepted.headers.get("set-cookie") || "";
  assert.match(cookie, /^__Host-ideal_day_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.deepEqual(await accepted.json(), { ok: true, redirectTo: "/testing" });

  const cookiePair = cookie.split(";")[0];
  const current = await session.fetch(new Request("https://example.vercel.app/_ideal-day/session", { headers: { cookie: cookiePair } }));
  assert.equal(current.status, 200);
  const signedOut = await logout.fetch();
  assert.equal(signedOut.status, 303);
  assert.match(signedOut.headers.get("set-cookie") || "", /Max-Age=0/);
}));

test("login rejects cross-origin requests", async () => withEnvironment(async () => {
  const response = await login.fetch(new Request("https://example.vercel.app/_ideal-day/login", { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" }, body: JSON.stringify({ password: "first password" }) }));
  assert.equal(response.status, 403);
}));
