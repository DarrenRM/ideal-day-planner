import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "__Host-ideal_day_session";
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const SCRYPT_KEY_BYTES = 32;

function base64Url(value) { return Buffer.from(value).toString("base64url"); }
function safeEqual(left, right) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function sessionSignature(payload, secret) { return createHmac("sha256", secret).update(payload).digest("base64url"); }

export function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? [part.trim(), ""] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }).filter(([key]) => key));
}

export function readBootstrapUsers(environment = process.env) {
  return ["A", "B"].map((slot) => ({
    slot,
    userId: (environment[`IDEAL_DAY_USER_${slot}_ID`] || "").trim(),
    passwordHash: (environment[`IDEAL_DAY_USER_${slot}_PASSWORD_HASH`] || "").trim(),
    sessionVersion: Number.parseInt(environment[`IDEAL_DAY_USER_${slot}_SESSION_VERSION`] || "1", 10),
  })).filter((user) => user.userId && user.passwordHash && Number.isInteger(user.sessionVersion) && user.sessionVersion > 0);
}

export function makePasswordHash(password, parameters = {}) {
  const cost = parameters.cost || 32768;
  const blockSize = parameters.blockSize || 8;
  const parallelization = parameters.parallelization || 1;
  const salt = parameters.salt || randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEY_BYTES, { N: cost, r: blockSize, p: parallelization, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${cost}$${blockSize}$${parallelization}$${base64Url(salt)}$${base64Url(derived)}`;
}

export function verifyPassword(password, encoded) {
  if (typeof password !== "string" || !password || password.length > 256) return false;
  const [algorithm, costText, blockText, parallelText, saltText, hashText] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const cost = Number.parseInt(costText, 10);
  const blockSize = Number.parseInt(blockText, 10);
  const parallelization = Number.parseInt(parallelText, 10);
  if (!Number.isInteger(cost) || cost < 16384 || cost > 131072 || !Number.isInteger(blockSize) || blockSize < 1 || blockSize > 16 || !Number.isInteger(parallelization) || parallelization < 1 || parallelization > 4) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    const supplied = scryptSync(password, Buffer.from(saltText, "base64url"), expected.length, { N: cost, r: blockSize, p: parallelization, maxmem: 128 * 1024 * 1024 });
    return safeEqual(expected, supplied);
  } catch { return false; }
}

export function matchBootstrapUser(password, users) {
  let match = null;
  for (const user of users) if (verifyPassword(password, user.passwordHash)) match = user;
  return match;
}

export function createSession(user, secret, now = Date.now()) {
  if (!secret || secret.length < 32) throw new Error("IDEAL_DAY_SESSION_SECRET must contain at least 32 characters.");
  const payload = base64Url(JSON.stringify({ sub: user.userId, slot: user.slot, sv: user.sessionVersion, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_SECONDS, nonce: randomBytes(12).toString("base64url") }));
  return `${payload}.${sessionSignature(payload, secret)}`;
}

export function verifySession(token, secret, users, now = Date.now()) {
  if (!token || !secret) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEqual(signature, sessionSignature(payload, secret))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const user = users.find((candidate) => candidate.slot === claims.slot && candidate.userId === claims.sub);
    if (!user || claims.sv !== user.sessionVersion || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(now / 1000)) return null;
    return user;
  } catch { return null; }
}

export function sessionFromRequest(request, environment = process.env) {
  const token = parseCookies(request.headers.get("cookie") || "")[SESSION_COOKIE];
  return verifySession(token, environment.IDEAL_DAY_SESSION_SECRET || "", readBootstrapUsers(environment));
}

export function sessionCookie(token) { return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`; }
export function clearSessionCookie() { return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`; }
export function safeReturnTo(value) { return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value.slice(0, 1000) : "/testing"; }
