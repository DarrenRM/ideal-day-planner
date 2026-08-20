import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";

const appUrl = (process.env.IDEAL_DAY_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const bridgeToken = (process.env.IDEAL_DAY_BRIDGE_TOKEN || "").trim();
const sitesBypassToken = (process.env.IDEAL_DAY_SITES_BYPASS_TOKEN || "").trim();
const hermesUrl = (process.env.IDEAL_DAY_HERMES_URL || "http://127.0.0.1:8643").replace(/\/$/, "");
const profileHome = process.env.IDEAL_DAY_HERMES_HOME
  || join(process.env.LOCALAPPDATA || "", "hermes", "profiles", "ideal-day");
const workerId = `ideal-day-bridge:${hostname()}`;
const pollIntervalMs = 700;

const lunaInstructions = `You are Luna inside Ideal Day, a personal activity companion.
Return exactly one JSON object with this shape and no markdown or surrounding prose:
{"message": string|null, "workspaceActions": WorkspaceAction[]}

Speak naturally to the person about their activity, intentions, progress, and today—not about software. Never mention events, context packets, databases, records, blank states, components, rendering, tools, or internal reasoning in message.

Activity-setup behavior:
- An activity_setup job happens once when an activity is created or materially renamed. Design a useful initial workspace from approved components and decide whether one setup question would unlock a concrete durable improvement.
- Ask exactly one concise setup question only when its answer can determine a routine, protocol, product, goal, measurement, or tracking design that should persist. The question must make that useful choice clear without talking about software.
- Cardio with no user-supplied description must ask what kind of cardio the person does and what matters to track, even if a countdown already exists; a generic timer is not personalized setup. Stretch or yoga with no user-supplied routine or goal must ask whether there is an existing routine or a goal/body area to shape one around. Device-based care such as red light with no answered device/protocol detail must ask which device and protocol are used.
- A fully specified, low-choice action such as a brief named visualization at a chin-up bar may need no setup question. Use message:null when no durable decision is genuinely useful.
- Add safe structural defaults immediately when they fit, but treat timers and countdowns as ordinary optional components—not privileged defaults. A scheduled duration is a planning budget, not evidence that the person should watch a clock while doing the activity.
- Add a countdown only when seeing time remaining is inherently useful while performing the activity or a fixed-duration protocol defines the activity. Strong examples include a five-minute chin-up visualization, meditation, timed cardio, intervals or rest periods, and a documented timed device exposure. Add a count-up timer only when open-ended elapsed time is useful to record.
- Do not add a timer or countdown by default for Shake / Supplements, meals, showering, ordinary product application, or simple errands. For those, ask for missing durable details or use a routine when supported. An explicit user request for a timer still wins.
- A generic timer is never a substitute for learning the useful routine, product, protocol, goal, or measurement. Never invent a product, routine step, performance result, or personal goal.
- Do not repeat a setup question already present in recent conversation. Do not produce greetings, encouragement, routine paraphrases, or generic invitations.

Ordinary activity-open behavior:
- Ordinary opens are silent and do not redesign the workspace. Use message:null and no workspace actions. Questions come from the explicit one-time setup process or later user/event triggers.

User-message behavior:
- Always answer a direct question or conversational request naturally and concisely. The message must not be null just because workspace actions also happen.
- When the same message supplies useful lasting details, briefly acknowledge what you are keeping in ordinary language. Do not promise to save something later: include the matching workspaceActions in this result.
- For a straightforward factual note, a successful workspace action may be the entire response; use message:null instead of adding a redundant acknowledgment.
- When the user supplies clear durable information that would be useful at future visits, immediately emit workspaceActions in the same run. Do not merely repeat the information in chat.
- Preserve existing useful workspace content. Upsert a stable component id when updating the same concept.

Web research:
- You have a web research tool. Use it when the user asks you to look something up or verify it, and when current manufacturer or primary-source facts would materially improve an activity answer or durable workspace.
- Prefer official manufacturer documentation and other primary sources. Clearly distinguish researched facts from the user's own routine, goals, and observations.
- Research selectively. Do not browse for ordinary activity opens, casual acknowledgments, or facts already supplied well enough for the task.
- If research fails or the authoritative answer is unclear, say that plainly. Never claim that you lack web access merely because you have not used the tool.

WorkspaceAction is one of:
{"op":"upsert","component":{"id":"stable-kebab-id","type":"routine","title":"...","summary":"...","steps":["..."],"facts":[{"label":"...","value":"..."}]}}
{"op":"upsert","component":{"id":"stable-kebab-id","type":"timer","title":"..."}}
{"op":"upsert","component":{"id":"stable-kebab-id","type":"countdown","title":"...","durationSeconds":number}}
{"op":"remove","componentId":"stable-kebab-id"}

Use routine for a product, protocol, plan, or repeatable sequence. Use timer as a count-up stopwatch only when elapsed time is useful. Use countdown for a genuinely fixed-duration session; omit durationSeconds when the activity's allotted duration should be used. The existence of an allotted duration alone is not a reason to add either one. Do not invent products, steps, goals, or history. Keep conversational messages to one or two short sentences.`;

function cleanYamlScalar(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function readHermesKey() {
  const config = await readFile(join(profileHome, "config.yaml"), "utf8");
  const match = config.match(/^\s+key:\s*(.+)$/m);
  if (!match) throw new Error("The ideal-day Hermes profile has no API-server key.");
  return cleanYamlScalar(match[1]);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 204) return null;
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { error: text }; }
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `${response.status} ${response.statusText}`);
  return payload;
}

function appHeaders(headers = {}) {
  return {
    ...(bridgeToken ? { authorization: `Bearer ${bridgeToken}` } : {}),
    ...(sitesBypassToken ? { "OAI-Sites-Authorization": `Bearer ${sitesBypassToken}` } : {}),
    ...headers,
  };
}

function requestAppJson(path, options = {}) {
  return requestJson(`${appUrl}${path}`, { ...options, headers: appHeaders(options.headers) });
}

function runtimeSessionId(conversationId) {
  const digest = createHash("sha256").update(`activity-blueprint-v2:${conversationId}`).digest("hex").slice(0, 24);
  return `ideal-day-${digest}`;
}

async function ensureHermesSession(key, leased, existingSessionId) {
  const sessionId = existingSessionId || runtimeSessionId(leased.job.conversationId);
  const response = await fetch(`${hermesUrl}/api/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (response.ok) return sessionId;
  if (response.status !== 404) throw new Error(`Hermes session lookup failed (${response.status}).`);

  const created = await fetch(`${hermesUrl}/api/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      id: sessionId,
      source: "api_server",
      title: `Ideal Day · ${leased.context.activity?.title || "Activity"} · activity-blueprint-v2`,
    }),
  });
  if (!created.ok && created.status !== 409) {
    const text = await created.text();
    const existingSession = created.status === 400
      ? text.match(/Title already in use by session ([A-Za-z0-9_-]+)/)?.[1]
      : null;
    if (existingSession) return existingSession;
    throw new Error(`Hermes session creation failed (${created.status}): ${text.slice(0, 300)}`);
  }
  return sessionId;
}

function compactConversation(messages) {
  if (!messages?.length) return "No prior conversation yet.";
  return messages.map((message) => `${message.author === "luna" ? "Luna" : "User"}: ${message.body}`).join("\n");
}

function compactWorkspace(workspace) {
  const components = workspace?.document?.components;
  return components?.length ? JSON.stringify(workspace.document) : "No saved workspace components yet.";
}

function eventPrompt(job) {
  const activity = job.context.activity || {};
  const schedule = job.context.schedule;
  const activityContext = job.context.activityContext;
  const knownContext = activityContext
    ? `\nKnown steps: ${activityContext.steps?.join("; ") || "None documented"}\nKnown facts: ${activityContext.facts?.map((fact) => `${fact.label}: ${fact.value}`).join("; ") || "None documented"}\nOpen consideration: ${activityContext.openLoop || "None"}`
    : "\nNo routine details, goals, or history are documented for this activity yet.";
  const shared = `Activity: ${activity.title || "Unknown"}\nCategory: ${activity.category || "Unknown"}\nToday: ${schedule?.planDate || "Unknown date"}\nPlanned duration: ${schedule?.duration ? `${schedule.duration} minutes` : "Unknown"}${knownContext}\n\nCurrent saved workspace:\n${compactWorkspace(job.context.workspace)}\n\nRecent permanent conversation:\n${compactConversation(job.context.recentMessages)}`;
  if (job.job.kind === "user_message") {
    return `The user has just spoken in this activity conversation. Always answer a direct question or request. If the message also contains useful lasting information, acknowledge it naturally and capture it with workspaceActions now. Use web research when the user asks for it or current primary-source facts would materially improve the answer. A pure factual note with no question can be handled with actions and message:null.\n\n${shared}\n\nLatest user message:\n${job.context.sourceMessage?.body || ""}`;
  }
  if (job.job.kind === "workspace_refresh") {
    return `Silently bring the workspace up to date from the conversation. Use message:null. Emit only actions for useful, clearly supported information that is not already represented.\n\n${shared}`;
  }
  if (job.job.kind === "activity_setup") {
    return `Prepare this activity for future use. Choose safe initial workspace components and ask at most one high-value setup question only when its answer will enable a named durable improvement. This is the setup decision; do not defer it to a later open.\n\n${shared}`;
  }
  return `This is an ordinary activity open from the earlier runtime. Remain silent and make no workspace changes. Return message:null and an empty workspaceActions array.\n\n${shared}`;
}

function parseAgentResult(content) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Luna returned an invalid result envelope.");
  const message = typeof parsed.message === "string" && parsed.message.trim() ? parsed.message.trim() : null;
  const workspaceActions = Array.isArray(parsed.workspaceActions) ? parsed.workspaceActions : [];
  return { message, workspaceActions };
}

async function runJob(key, leased) {
  const sessionId = await ensureHermesSession(key, leased, leased.runtimeSessionId);
  const result = await requestJson(`${hermesUrl}/api/sessions/${encodeURIComponent(sessionId)}/chat`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: eventPrompt(leased),
      instructions: lunaInstructions,
    }),
  });
  const content = result?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Hermes returned an empty Luna result.");
  const agentResult = parseAgentResult(content);
  await requestAppJson("/api/agent/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "complete",
      jobId: leased.job.id,
      leaseToken: leased.job.leaseToken,
      runtimeSessionId: result.session_id || sessionId,
      response: agentResult.message,
      workspaceActions: agentResult.workspaceActions,
    }),
  });
}

async function reportFailure(leased, error) {
  try {
    await requestAppJson("/api/agent/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "failure",
        jobId: leased.job.id,
        leaseToken: leased.job.leaseToken,
        error: error instanceof Error ? error.message : String(error),
      }),
    });
  } catch (reportError) {
    console.error("Could not release failed job:", reportError instanceof Error ? reportError.message : reportError);
  }
}

async function main() {
  const appHost = new URL(appUrl).hostname;
  if (appHost !== "localhost" && appHost !== "127.0.0.1" && (!bridgeToken || !sitesBypassToken)) {
    throw new Error("A production bridge requires IDEAL_DAY_BRIDGE_TOKEN and IDEAL_DAY_SITES_BYPASS_TOKEN.");
  }
  const key = await readHermesKey();
  await requestJson(`${hermesUrl}/health`, { headers: { authorization: `Bearer ${key}` } });
  console.log(`Ideal Day bridge ready (${workerId}).`);

  while (true) {
    let leased = null;
    try {
      leased = await requestAppJson(`/api/agent/jobs?workerId=${encodeURIComponent(workerId)}`);
      if (leased) await runJob(key, leased);
    } catch (error) {
      if (leased) await reportFailure(leased, error);
      else console.error("Bridge poll failed:", error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, leased ? 80 : pollIntervalMs));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
