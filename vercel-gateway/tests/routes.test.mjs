import assert from "node:assert/strict";
import test from "node:test";
import login from "../api/login.mjs";
import logout from "../api/logout.mjs";
import proxy from "../api/proxy.mjs";
import session from "../api/session.mjs";
import { createSession, makePasswordHash, readBootstrapUsers, SESSION_COOKIE, sessionFromRequest } from "../lib/auth.mjs";

const testEnvironment = {
  IDEAL_DAY_SESSION_SECRET: "route-test-session-secret-that-is-long-enough",
  IDEAL_DAY_USER_A_ID: "vercel-a",
  IDEAL_DAY_USER_A_PASSWORD_HASH: makePasswordHash("first password", { cost: 16384, salt: Buffer.alloc(16, 3) }),
  IDEAL_DAY_USER_A_SESSION_VERSION: "1",
  IDEAL_DAY_USER_B_ID: "vercel-b",
  IDEAL_DAY_USER_B_PASSWORD_HASH: makePasswordHash("second password", { cost: 16384, salt: Buffer.alloc(16, 4) }),
  IDEAL_DAY_USER_B_SESSION_VERSION: "1",
};

function withEnvironment(callback, extra = {}) {
  const environment = { ...testEnvironment, ...extra };
  const prior = {};
  for (const [key, value] of Object.entries(environment)) { prior[key] = process.env[key]; process.env[key] = value; }
  return Promise.resolve(callback()).finally(() => {
    for (const key of Object.keys(environment)) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  });
}

test("logged-out pages redirect and logged-out APIs disclose no data", async () => {
  const page = await proxy.fetch(new Request("https://example.vercel.app/?path=" , { headers: { accept: "text/html" } }));
  assert.equal(page.status, 307);
  assert.equal(page.headers.get("location"), "/login?next=%2F");
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

test("blocked origin paths stay blocked however the path is spelled", async () => withEnvironment(async () => {
  const [user] = readBootstrapUsers();
  const cookie = `${SESSION_COOKIE}=${createSession(user, testEnvironment.IDEAL_DAY_SESSION_SECRET)}`;
  const forwarded = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (request) => { forwarded.push(new URL(request.url).pathname); return new Response("{}", { status: 200 }); };
  try {
    const proxied = (path) => proxy.fetch(new Request(`https://example.vercel.app/x?${new URLSearchParams({ path })}`, { headers: { cookie, accept: "application/json" } }));
    for (const path of ["restore", "api/agent/jobs", "api/agent/jobs/claim", "API/Agent/Jobs", "api/agent/%2e/jobs", "api/x/../agent/jobs", "%2e/restore", "%72estore", "api%2Fagent%2Fjobs", "api/agent/%252e/jobs", "api\\agent\\jobs"]) {
      const response = await proxied(path);
      assert.equal(response.status, 404, path);
    }
    assert.deepEqual(forwarded, []);
    const allowed = await proxied("api/day");
    assert.equal(allowed.status, 200);
    assert.deepEqual(forwarded, ["/api/day"]);
  } finally {
    globalThis.fetch = realFetch;
  }
}, { IDEAL_DAY_ORIGIN_URL: "https://origin.example", IDEAL_DAY_SITES_BYPASS_TOKEN: "test-bypass", IDEAL_DAY_VERCEL_GATEWAY_TOKEN: "test-gateway" }));

test("login rejects cross-origin requests", async () => withEnvironment(async () => {
  const response = await login.fetch(new Request("https://example.vercel.app/_ideal-day/login", { method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" }, body: JSON.stringify({ password: "first password" }) }));
  assert.equal(response.status, 403);
}));

test("a valid password switches demo identity while an invalid password preserves it", async () => withEnvironment(async () => {
  let cookie = "";
  for (const [password, expectedUser] of [["first password", "vercel-a"], ["second password", "vercel-b"], ["first password", "vercel-a"]]) {
    const response = await login.fetch(new Request("https://example.vercel.app/_ideal-day/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://example.vercel.app", cookie, "x-forwarded-for": "192.0.2.12" },
      body: JSON.stringify({ password, returnTo: "/" }),
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, redirectTo: "/" });
    const replacement = response.headers.get("set-cookie") || "";
    assert.match(replacement, /^__Host-ideal_day_session=/);
    assert.match(replacement, /Path=\//);
    assert.match(replacement, /HttpOnly; Secure; SameSite=Lax/);
    cookie = replacement.split(";")[0];
    assert.equal(sessionFromRequest(new Request("https://example.vercel.app/", { headers: { cookie } }))?.userId, expectedUser);
  }
  const rejected = await login.fetch(new Request("https://example.vercel.app/_ideal-day/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.vercel.app", cookie, "x-forwarded-for": "192.0.2.12" },
    body: JSON.stringify({ password: "wrong" }),
  }));
  assert.equal(rejected.status, 401);
  assert.equal(rejected.headers.get("set-cookie"), null);
  assert.equal(sessionFromRequest(new Request("https://example.vercel.app/", { headers: { cookie } }))?.userId, "vercel-a");
}));
