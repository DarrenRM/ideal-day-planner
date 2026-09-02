import { env } from "cloudflare:workers";
import { apiFailure, ensureAgentSchema, isLocalBridgeRequest, migrateFaceCareToVariableRoutine } from "../../../agent-store";

async function tokensMatch(expected: string, supplied: string) {
  const encoder = new TextEncoder();
  const [expectedHash, suppliedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
  ]);
  const left = new Uint8Array(expectedHash);
  const right = new Uint8Array(suppliedHash);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function bridgeOnly(request: Request) {
  if (request.headers.get("origin")) return false;
  if (isLocalBridgeRequest(request)) return true;
  const expected = ((env as typeof env & { IDEAL_DAY_BRIDGE_TOKEN?: string }).IDEAL_DAY_BRIDGE_TOKEN || "").trim();
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return Boolean(expected && supplied && await tokensMatch(expected, supplied));
}

export async function POST(request: Request) {
  if (!await bridgeOnly(request)) return Response.json({ error: "Agent bridge authentication failed." }, { status: 403 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const migration = typeof payload.migration === "string" ? payload.migration : "";
    const userId = typeof payload.userId === "string" ? payload.userId.trim().slice(0, 200) : "";
    const activityId = typeof payload.activityId === "string" ? payload.activityId.trim().slice(0, 240) : "";
    if (migration !== "face-care-variable-routine-v1" || !userId || !activityId) {
      return Response.json({ error: "The reviewed migration request is incomplete." }, { status: 400 });
    }
    await ensureAgentSchema();
    return Response.json(await migrateFaceCareToVariableRoutine({ userId, activityId }));
  } catch (error) {
    return apiFailure(error);
  }
}
