import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { CATALOG_VERSION, activityRecipeHint, catalogInstructions } from "./component-catalog.mjs";
import { researchAcknowledgement, userMessageRequestsResearch } from "./job-policy.mjs";

const appUrl = (process.env.IDEAL_DAY_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const bridgeToken = (process.env.IDEAL_DAY_BRIDGE_TOKEN || "").trim();
const sitesBypassToken = (process.env.IDEAL_DAY_SITES_BYPASS_TOKEN || "").trim();
const hermesUrl = (process.env.IDEAL_DAY_HERMES_URL || "http://127.0.0.1:8643").replace(/\/$/, "");
const profileHome = process.env.IDEAL_DAY_HERMES_HOME
  || join(process.env.LOCALAPPDATA || "", "hermes", "profiles", "ideal-day");
const workerId = `ideal-day-bridge:${hostname()}`;
const pollIntervalMs = 700;
const heartbeatIntervalMs = 5_000;

const lunaInstructions = `You are Luna inside Ideal Day, a personal activity companion.
Return exactly one JSON object with this shape and no markdown or surrounding prose:
{"message": string|null, "workspaceFollowup": boolean, "recordActions": RecordAction[], "workspaceActions": WorkspaceAction[]}

Speak naturally to the person about their activity, intentions, progress, and today—not about software. Never mention events, context packets, databases, records, blank states, components, rendering, tools, or internal reasoning in message.

Activity-setup behavior:
- An activity_setup job happens once when an activity is created or materially renamed. Design a useful initial workspace from approved components and decide whether one setup question would unlock a concrete durable improvement.
- Ask exactly one concise setup question only when its answer can determine a routine, protocol, product, goal, measurement, or tracking design that should persist. The question must make that useful choice clear without talking about software.
- Do not ask a follow-up merely to fill out or improve a component when a useful conservative workspace can already be built. Let personal details accumulate through ordinary conversation and use.
- Cardio with no user-supplied description must ask what kind of cardio the person does and what matters to track, even if a countdown already exists; a generic timer is not personalized setup. Stretch or yoga with no user-supplied routine or goal must ask whether there is an existing routine or a goal/body area to shape one around. Device-based care such as red light with no answered device/protocol detail must ask which device and protocol are used.
- A fully specified, low-choice action such as a brief named visualization at a chin-up bar may need no setup question. Use message:null when no durable decision is genuinely useful.
- Add an initial component only when it is already useful with the facts available. Asking a setup question and creating an empty shell are mutually exclusive: when the answer is needed, ask the question and emit no placeholder record or component.
- Never create an empty or generic record. A checklist or item list needs at least one meaningful item; a workout needs at least one named exercise; a protocol needs a meaningful summary or step; a product needs its actual name; a history, comparison, adherence, timeline, or resources component needs an entry; a metric or trend needs an observed value, target, or entry; and a summary must contain user-specific information beyond the activity name, category, or scheduled duration.
- Every product record must choose kind:"product" or kind:"device". Keep product fields sparse and activity-useful; do not turn general research trivia, composition background, or formula uncertainty into labeled fields.
- Do not use an attention, summary, protocol, goal, or routine component to say that details are missing, unknown, needed, or not yet specified. Ask the person naturally in conversation and leave the workspace absent.
- Treat timers and countdowns as ordinary optional components—not privileged defaults. A scheduled duration is a planning budget, not evidence that the person should watch a clock while doing the activity.
- Add a countdown only when seeing time remaining is inherently useful while performing the activity or a fixed-duration protocol defines the activity. Strong examples include a five-minute chin-up visualization, meditation, timed cardio, intervals or rest periods, and a documented timed device exposure. Add a count-up timer only when open-ended elapsed time is useful to record.
- Do not add a timer or countdown by default for Shake / Supplements, meals, showering, ordinary product application, or simple errands. For those, ask for missing durable details or use a routine when supported. An explicit user request for a timer still wins.
- A generic timer is never a substitute for learning the useful routine, product, protocol, goal, or measurement. Never invent a product, routine step, performance result, or personal goal.
- Do not repeat a setup question already present in recent conversation. Do not produce greetings, encouragement, routine paraphrases, or generic invitations.

Ordinary activity-open behavior:
- Ordinary opens are silent and do not redesign the workspace. Use message:null and no workspace actions. Questions come from the explicit one-time setup process or later user/event triggers.

User-message behavior:
- Always answer a direct question or conversational request naturally and concisely. The message must not be null just because workspace actions also happen.
- This first pass is conversational and fast. Return recordActions:[] and workspaceActions:[] so the person receives your answer before any research or workspace construction begins.
- Never use web research in this first pass. If the person asks you to look up, verify, or research something, acknowledge that naturally without pretending it is already done, set workspaceFollowup:true, and let the workspace-refresh pass perform the research.
- Set workspaceFollowup:true when the message contains useful lasting details, requests a component or activity design, or should update what is kept for future visits. Briefly and naturally say you are organizing or updating that part of the activity without discussing software internals.
- Set workspaceFollowup:false for casual conversation or a question whose answer does not belong in the lasting activity space.
- A straightforward factual note may use message:null only when workspaceFollowup is true and a conversational acknowledgment would add no value.

Web research:
- You have a web research tool during workspace-refresh work. Use it there when the user asks you to look something up or verify it, and when current manufacturer or primary-source facts would materially improve an activity answer or durable workspace.
- Prefer official manufacturer documentation and other primary sources. Clearly distinguish researched facts from the user's own routine, goals, and observations.
- Research selectively. Do not browse for ordinary activity opens, casual acknowledgments, or facts already supplied well enough for the task.
- If research fails or the authoritative answer is unclear, say that plainly. Never claim that you lack web access merely because you have not used the tool.

RecordAction is one of:
{"op":"upsert","record":{"key":"stable-kebab-key","type":"catalog-record-type","title":"...","scope":"activity|day","data":{...}}}
{"op":"remove","recordKey":"stable-kebab-key"}

WorkspaceAction is one of:
{"op":"upsert","component":{"id":"stable-kebab-id","type":"catalog-record-type","title":"...","recordKey":"matching-record-key","presentation":"default|compact|featured"}}
{"op":"upsert","component":{"id":"stable-kebab-id","type":"timer","title":"..."}}
{"op":"upsert","component":{"id":"stable-kebab-id","type":"countdown","title":"...","durationSeconds":number}}
{"op":"remove","componentId":"stable-kebab-id"}

Every data-backed workspace component must have a matching upserted or existing record with the same recordKey. Durable information belongs in records; workspace components describe what should be visible. Preserve stable keys and update existing records rather than duplicating them. Never invent products, steps, goals, measurements, history, prior performance, completion, URLs, or personal preferences. Do not emit a record or component merely to reserve space for information that has not been learned yet.

Use timer as a count-up stopwatch only when elapsed time is useful. Use countdown for a genuinely fixed-duration session. Omit durationSeconds only when Day Timeline is enabled and the countdown should follow the activity's allotted duration; when Day Timeline is off, every new countdown needs an explicit durationSeconds. The existence of an allotted duration alone is not a reason to add either one. Keep conversational messages to one or two short sentences.

${catalogInstructions()}`;

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

function runtimeSessionId(job) {
  const digest = createHash("sha256").update(`activity-blueprint-v3:${job.id}:${job.attempts}`).digest("hex").slice(0, 24);
  return `ideal-day-${digest}`;
}

async function ensureHermesSession(key, leased) {
  const sessionId = runtimeSessionId(leased.job);
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
      title: `Ideal Day · ${leased.context.activity?.title || "Activity"} · ${leased.job.kind} · ${sessionId.slice(-8)}`,
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

function compactRecords(records) {
  return records?.length ? JSON.stringify(records) : "No durable activity records yet.";
}

function eventPrompt(job) {
  const activity = job.context.activity || {};
  const schedule = job.context.schedule;
  const activityContext = job.context.activityContext;
  const knownContext = activityContext
    ? `\nKnown steps: ${activityContext.steps?.join("; ") || "None documented"}\nKnown facts: ${activityContext.facts?.map((fact) => `${fact.label}: ${fact.value}`).join("; ") || "None documented"}\nOpen consideration: ${activityContext.openLoop || "None"}`
    : "\nNo additional visit-specific context was supplied.";
  const shared = `Catalog version: ${CATALOG_VERSION}\nActivity: ${activity.title || "Unknown"}\nCategory: ${activity.category || "Unknown"}\nSuggested starting recipe: ${activityRecipeHint(activity.title, activity.category)}. This is guidance, not a conclusion; prefer the user's actual details.\nToday: ${schedule?.planDate || "Unknown date"}\nDay Timeline: ${schedule?.timelineEnabled ? "enabled" : "off"}\nPlanned duration: ${schedule?.timelineEnabled && schedule?.duration ? `${schedule.duration} minutes` : "Not part of the current day mode"}${knownContext}\n\nDurable activity records:\n${compactRecords(job.context.records)}\n\nRecent activity runs:\n${job.context.recentRuns?.length ? JSON.stringify(job.context.recentRuns) : "No completed run history yet."}\n\nCurrent saved workspace:\n${compactWorkspace(job.context.workspace)}\n\nRecent permanent conversation:\n${compactConversation(job.context.recentMessages)}`;
  if (job.job.kind === "user_message") {
    return `The user has just spoken in this activity conversation. Respond first and quickly: answer what you can naturally, then decide whether the lasting activity space needs a follow-up. Return recordActions:[] and workspaceActions:[] in this pass. Do not use web research yet. If the user asks for research or verification, acknowledge that you will look into it, do not claim findings yet, and set workspaceFollowup:true. Also set workspaceFollowup:true when useful durable information or a requested design should be organized after your reply.\n\n${shared}\n\nLatest user message:\n${job.context.sourceMessage?.body || ""}`;
  }
  if (job.job.kind === "workspace_refresh") {
    return `Bring the lasting activity space up to date from the conversation. Set workspaceFollowup:false. Emit actions for useful, clearly supported information that is not already represented. Preserve existing useful workspace content and stable keys. When a richer record-backed component replaces a legacy inline routine, remove only that duplicate routine. A URL in the triggering message counts as a request to inspect that source. If the triggering user message requested research, verification, or supplied a URL, perform the web research now and return one concise, natural message with the useful findings while also saving every clearly supported durable detail. Do not leave a learned product name, device, usage direction, routine step, or protocol only in the conversational message: upsert the appropriate records and visible workspace components in the same result. For product or device care, a supported named product plus supported use directions should normally produce a product component and a protocol component. Add a pinned resource last when an authoritative source is worth returning to. Otherwise remain silent with message:null so workspace maintenance does not create conversational spam.\n\n${shared}\n\nLatest triggering user message:\n${job.context.sourceMessage?.body || ""}`;
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
  const workspaceFollowup = parsed.workspaceFollowup === true;
  const recordActions = Array.isArray(parsed.recordActions) ? parsed.recordActions : [];
  const workspaceActions = Array.isArray(parsed.workspaceActions) ? parsed.workspaceActions : [];
  return { message, workspaceFollowup, recordActions, workspaceActions };
}

function visibleProgress(leased) {
  const activityTitle = leased.context.activity?.title || "this activity";
  if (leased.job.kind === "activity_setup") {
    return {
      title: `Setting up ${activityTitle}`,
      detail: "Choosing what will be useful each time you return.",
    };
  }
  if (leased.job.kind !== "workspace_refresh") return null;

  const sourceMessage = leased.context.sourceMessage?.body || "";
  const requestedResearch = userMessageRequestsResearch(sourceMessage);
  return requestedResearch
    ? {
        title: `Researching ${activityTitle}`,
        detail: "Checking the details you asked about before updating this activity.",
      }
    : {
        title: `Organizing ${activityTitle}`,
        detail: "Turning your latest details into something useful here.",
      };
}

function sendHeartbeat() {
  return requestAppJson("/api/agent/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "heartbeat", workerId }),
  });
}

async function completeJob(leased, runtimeSessionId, agentResult) {
  const replyFirst = leased.job.kind === "user_message";
  await requestAppJson("/api/agent/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "complete",
      jobId: leased.job.id,
      leaseToken: leased.job.leaseToken,
      runtimeSessionId,
      response: agentResult.message,
      workspaceFollowup: agentResult.workspaceFollowup,
      recordActions: replyFirst ? [] : agentResult.recordActions,
      workspaceActions: replyFirst ? [] : agentResult.workspaceActions,
    }),
  });
}

async function runJob(key, leased) {
  const progress = visibleProgress(leased);
  if (progress) {
    await requestAppJson("/api/agent/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "progress",
        jobId: leased.job.id,
        leaseToken: leased.job.leaseToken,
        ...progress,
      }),
    });
  }
  const sessionId = await ensureHermesSession(key, leased);
  const sourceMessage = leased.context.sourceMessage?.body || "";
  if (leased.job.kind === "user_message" && userMessageRequestsResearch(sourceMessage)) {
    await completeJob(leased, sessionId, {
      message: researchAcknowledgement(leased.context.activity?.title),
      workspaceFollowup: true,
      recordActions: [],
      workspaceActions: [],
    });
    return;
  }
  const result = await requestJson(`${hermesUrl}/api/sessions/${encodeURIComponent(sessionId)}/chat`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: eventPrompt(leased),
      instructions: lunaInstructions,
      ...(leased.job.kind === "user_message" ? { model_options: { reasoning_effort: "low" } } : {}),
    }),
  });
  const content = result?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Hermes returned an empty Luna result.");
  const agentResult = parseAgentResult(content);
  await completeJob(leased, result.session_id || sessionId, agentResult);
}

async function runJobWithHeartbeat(key, leased) {
  let heartbeatInFlight = false;
  const heartbeatTimer = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = true;
    void sendHeartbeat()
      .catch((error) => console.error("Bridge heartbeat failed:", error instanceof Error ? error.message : String(error)))
      .finally(() => { heartbeatInFlight = false; });
  }, heartbeatIntervalMs);
  try {
    await runJob(key, leased);
  } finally {
    clearInterval(heartbeatTimer);
  }
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
      if (leased) await runJobWithHeartbeat(key, leased);
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
