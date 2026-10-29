// Origin paths the gateway never forwards. The bridge's job API also requires the bridge token at the
// origin, which the gateway never sends; this list keeps both out of reach of browser sessions.
const BLOCKED_PATHS = ["/restore", "/api/agent/jobs"];

// Compare the path the origin will route, not the raw string: "/api/x/../agent/jobs", "/%2e/restore"
// and "/%72estore" all reach blocked paths once dot segments are resolved and escapes decoded.
export function isBlockedPath(path) {
  let current = path;
  try {
    for (let pass = 0; pass < 4; pass += 1) {
      const next = decodeURIComponent(new URL(current, "https://path.invalid").pathname);
      if (next === current) break;
      current = next;
    }
  } catch {
    return true;
  }
  const pathname = current.toLowerCase();
  return BLOCKED_PATHS.some((blocked) => pathname === blocked || pathname.startsWith(`${blocked}/`));
}
