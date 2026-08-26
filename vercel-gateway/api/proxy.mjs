import { sessionFromRequest } from "../lib/auth.mjs";
import { redirect, SECURITY_HEADERS } from "../lib/responses.mjs";

const REQUEST_HEADER_ALLOWLIST = new Set(["accept", "accept-language", "content-type", "if-match", "if-none-match", "user-agent"]);
const RESPONSE_HEADER_BLOCKLIST = new Set(["connection", "content-encoding", "content-length", "keep-alive", "set-cookie", "transfer-encoding", "upgrade"]);
const BLOCKED_PATHS = ["/restore", "/api/agent/jobs"];

function originConfiguration() {
  const originUrl = (process.env.IDEAL_DAY_ORIGIN_URL || "").replace(/\/+$/, "");
  const sitesBypassToken = (process.env.IDEAL_DAY_SITES_BYPASS_TOKEN || "").trim();
  const gatewayToken = (process.env.IDEAL_DAY_VERCEL_GATEWAY_TOKEN || "").trim();
  if (!originUrl || !sitesBypassToken || !gatewayToken) throw new Error("The Ideal Day origin is not configured.");
  return { originUrl, sitesBypassToken, gatewayToken };
}

function requestPath(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  url.searchParams.delete("path");
  const query = url.searchParams.toString();
  return `/${path.replace(/^\/+/, "")}${query ? `?${query}` : ""}`;
}

function proxiedHeaders(request, configuration, user) {
  const headers = new Headers();
  for (const [key, value] of request.headers) if (REQUEST_HEADER_ALLOWLIST.has(key.toLowerCase())) headers.set(key, value);
  headers.set("oai-sites-authorization", `Bearer ${configuration.sitesBypassToken}`);
  headers.set("x-ideal-day-gateway-authorization", `Bearer ${configuration.gatewayToken}`);
  headers.set("x-ideal-day-principal-id", user.userId);
  return headers;
}

function rewriteLocation(location, configuration, request) {
  if (!location) return null;
  return location.startsWith(configuration.originUrl) ? `${new URL(request.url).origin}${location.slice(configuration.originUrl.length)}` : location;
}

function isSafeMethod(method) { return method === "GET" || method === "HEAD" || method === "OPTIONS"; }
function isSameOriginWrite(request) {
  if (isSafeMethod(request.method)) return true;
  const supplied = request.headers.get("origin");
  return Boolean(supplied && supplied === new URL(request.url).origin);
}

async function onboardingRequired(configuration, request, user) {
  const response = await fetch(`${configuration.originUrl}/api/onboarding/status`, { headers: proxiedHeaders(request, configuration, user), redirect: "manual" });
  if (!response.ok) throw new Error("Onboarding status could not be verified.");
  const payload = await response.json();
  return payload?.onboardingRequired !== false;
}

export default {
  async fetch(request) {
    const user = sessionFromRequest(request);
    const publicUrl = new URL(request.url);
    if (!user) {
      if (publicUrl.pathname.startsWith("/api/") || request.headers.get("accept")?.includes("application/json")) return Response.json({ error: "Authentication required." }, { status: 401, headers: SECURITY_HEADERS });
      return redirect(`/login?next=${encodeURIComponent(`${publicUrl.pathname}${publicUrl.search}`)}`, 307);
    }
    if (!isSameOriginWrite(request)) return Response.json({ error: "Request origin was not accepted." }, { status: 403, headers: SECURITY_HEADERS });

    try {
      const configuration = originConfiguration();
      const path = requestPath(request);
      if (BLOCKED_PATHS.some((blocked) => path === blocked || path.startsWith(`${blocked}/`) || path.startsWith(`${blocked}?`))) return Response.json({ error: "Not found." }, { status: 404, headers: SECURITY_HEADERS });
      if (request.method === "GET" && path === "/" && request.headers.get("accept")?.includes("text/html") && await onboardingRequired(configuration, request, user)) return redirect("/testing", 307);
      const originResponse = await fetch(new Request(`${configuration.originUrl}${path}`, {
        method: request.method,
        headers: proxiedHeaders(request, configuration, user),
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
        duplex: request.method === "GET" || request.method === "HEAD" ? undefined : "half",
      }));
      const headers = new Headers(SECURITY_HEADERS);
      for (const [key, value] of originResponse.headers) if (!RESPONSE_HEADER_BLOCKLIST.has(key.toLowerCase())) headers.set(key, value);
      headers.set("cache-control", "private, no-store, max-age=0");
      const location = rewriteLocation(originResponse.headers.get("location"), configuration, request);
      if (location) headers.set("location", location);
      return new Response(originResponse.body, { status: originResponse.status, headers });
    } catch (error) {
      console.error("Ideal Day gateway request failed", error instanceof Error ? error.message : "unknown error");
      return Response.json({ error: "Ideal Day is temporarily unavailable." }, { status: 502, headers: SECURITY_HEADERS });
    }
  },
};
