import assert from "node:assert/strict";
import test from "node:test";
import { createSession, makePasswordHash, matchBootstrapUser, safeReturnTo, verifyPassword, verifySession } from "../lib/auth.mjs";

const users = [
  { slot: "A", userId: "user-a", passwordHash: makePasswordHash("alpha phrase", { cost: 16384, salt: Buffer.alloc(16, 1) }), sessionVersion: 1 },
  { slot: "B", userId: "user-b", passwordHash: makePasswordHash("bravo phrase", { cost: 16384, salt: Buffer.alloc(16, 2) }), sessionVersion: 3 },
];
const secret = "a-test-session-secret-that-is-long-enough";

test("password hashes distinguish the two bootstrap users", () => {
  assert.equal(matchBootstrapUser("alpha phrase", users)?.userId, "user-a");
  assert.equal(matchBootstrapUser("bravo phrase", users)?.userId, "user-b");
  assert.equal(matchBootstrapUser("wrong", users), null);
  assert.equal(verifyPassword("alpha phrase", users[0].passwordHash), true);
});

test("sessions are signed, expire, and respect session-version revocation", () => {
  const now = Date.UTC(2026, 7, 25);
  const token = createSession(users[0], secret, now);
  assert.equal(verifySession(token, secret, users, now + 1000)?.userId, "user-a");
  assert.equal(verifySession(`${token}x`, secret, users, now + 1000), null);
  assert.equal(verifySession(token, secret, [{ ...users[0], sessionVersion: 2 }, users[1]], now + 1000), null);
  assert.equal(verifySession(token, secret, users, now + 31 * 24 * 60 * 60 * 1000), null);
});

test("return paths cannot escape the deployment", () => {
  assert.equal(safeReturnTo("/today?date=2026-08-25"), "/today?date=2026-08-25");
  assert.equal(safeReturnTo("https://example.com"), "/testing");
  assert.equal(safeReturnTo("//example.com"), "/testing");
});
