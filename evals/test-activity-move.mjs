import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { eventPrompt, lunaInstructions, parseAgentResult } from "../bridge/ideal-day-bridge.mjs";
import { validateActivityMoveActions } from "../app/activity-transfer-model.ts";
import { fixture } from "./fixtures/skin-to-hair-move.mjs";

const hermesUrl = (process.env.IDEAL_DAY_HERMES_URL || "http://127.0.0.1:8643").replace(/\/$/, "");
const profileHome = process.env.IDEAL_DAY_HERMES_HOME
  || join(process.env.LOCALAPPDATA || "", "hermes", "profiles", "ideal-day");

function cleanYamlScalar(value) {
  const trimmed = value.trim();
  return ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ? trimmed.slice(1, -1)
    : trimmed;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `${response.status} ${response.statusText}`);
  return payload;
}

const config = await readFile(join(profileHome, "config.yaml"), "utf8");
const keyMatch = config.match(/^\s+key:\s*(.+)$/m);
if (!keyMatch) throw new Error("The ideal-day Hermes profile has no API-server key.");
const key = cleanYamlScalar(keyMatch[1]);
const sessionId = `ideal-day-eval-move-${randomUUID().slice(0, 8)}`;
const modelOptions = {
  reasoning: { enabled: true, effort: "low" },
  reasoning_effort: "low",
  service_tier: null,
  fast: false,
};

await requestJson(`${hermesUrl}/api/sessions`, {
  method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({
    id: sessionId,
    source: "api_server",
    title: `Ideal Day move eval · ${sessionId.slice(-8)}`,
    provider: "openai-codex",
    model: "gpt-5.6-terra",
    model_options: modelOptions,
    require_model_lock: true,
  }),
});

const startedAt = performance.now();
const response = await requestJson(`${hermesUrl}/api/sessions/${encodeURIComponent(sessionId)}/chat`, {
  method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({
    message: eventPrompt(fixture.leased),
    instructions: lunaInstructions,
    provider: "openai-codex",
    model: "gpt-5.6-terra",
    model_options: modelOptions,
    require_model_lock: true,
  }),
});
const result = parseAgentResult(response?.message?.content || response?.message || "");
const moves = validateActivityMoveActions(result.activityMoves, "activity:skin-routine");
const movedKeys = new Set(moves.flatMap((move) => move.recordKeys));
const complete = moves.length === 1
  && moves[0].targetActivityId === fixture.expectedTargetActivityId
  && fixture.expectedRecordKeys.every((keyName) => movedKeys.has(keyName));

console.log(JSON.stringify({
  latencySeconds: Number(((performance.now() - startedAt) / 1000).toFixed(1)),
  complete,
  message: result.message,
  followUpQuestion: result.followUpQuestion,
  activityMoves: moves,
  unexpectedRecordWrites: result.recordActions.length,
  unexpectedWorkspaceWrites: result.workspaceActions.length,
}, null, 2));

if (!complete || result.recordActions.length || result.workspaceActions.length) process.exitCode = 1;
