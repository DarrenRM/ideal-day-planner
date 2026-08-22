import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonrepair } from "jsonrepair";
import { CATALOG_VERSION, activityRecipeHint, catalogInstructions } from "./component-catalog.mjs";
import { researchAcknowledgement, userMessageRequestsResearch } from "./job-policy.mjs";
import { researchEvidenceForMessage } from "./source-research.mjs";

const appUrl = (process.env.IDEAL_DAY_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const bridgeToken = (process.env.IDEAL_DAY_BRIDGE_TOKEN || "").trim();
const sitesBypassToken = (process.env.IDEAL_DAY_SITES_BYPASS_TOKEN || "").trim();
const hermesUrl = (process.env.IDEAL_DAY_HERMES_URL || "http://127.0.0.1:8643").replace(/\/$/, "");
const profileHome = process.env.IDEAL_DAY_HERMES_HOME
  || join(process.env.LOCALAPPDATA || "", "hermes", "profiles", "ideal-day");
const workerId = `ideal-day-bridge:${hostname()}`;
const pollIntervalMs = 700;
const heartbeatIntervalMs = 5_000;
const workspaceModel = process.env.IDEAL_DAY_WORKSPACE_MODEL || "gpt-5.6-terra";
const conversationalModel = process.env.IDEAL_DAY_CONVERSATIONAL_MODEL || "gpt-5.6-luna";

function modelRoute(leased) {
  const workspaceJob = leased.job.kind === "workspace_refresh"
    || leased.job.kind === "activity_setup"
    || leased.job.kind === "variant_setup"
    || leased.job.kind === "global_message";
  return workspaceJob
    ? {
        provider: "openai-codex",
        model: workspaceModel,
        model_options: {
          reasoning: { enabled: true, effort: "low" },
          reasoning_effort: "low",
          service_tier: null,
          fast: false,
        },
      }
    : {
        provider: "openai-codex",
        model: conversationalModel,
        model_options: {
          reasoning: { enabled: true, effort: "low" },
          reasoning_effort: "low",
          service_tier: "priority",
          fast: true,
        },
      };
}

const resultShape = `Return exactly one JSON object with no markdown or surrounding prose:
{"message":string|null,"workspaceFollowup":boolean,"recordActions":RecordAction[],"workspaceActions":WorkspaceAction[],"activityMoves":ActivityMoveAction[],"followUpActions":FollowUpAction[],"followUpQuestion":{"body":string}|null,"scheduleProposal":ScheduleProposal|null,"occurrenceActions":OccurrenceAction[],"dayHighlight":{"body":string,"kind":"streak|milestone|momentum|effort|comeback|personal_best|completion"}|null}`;

const personaInstructions = `You are Luna inside Ideal Day, a personal activity companion. Speak naturally about the person's activity, intentions, progress, and today. Never mention software, prompts, context packets, databases, records, components, rendering, tools, or internal reasoning in message. Keep conversational messages to one or two short sentences.`;

const activityActionContract = `RecordAction:
{"op":"upsert","record":{"key":"stable-kebab-key","subjectKey":"product-or-device-record-key-or-null","type":"catalog-record-type","title":"...","scope":"activity|day|variant","data":{...}}}
or {"op":"remove","recordKey":"stable-kebab-key"}.

WorkspaceAction:
{"op":"upsert","component":{"id":"stable-kebab-id","type":"catalog-record-type","title":"...","recordKey":"matching-record-key","presentation":"default|compact|featured"}}
or timer/countdown upserts from the catalog, or {"op":"remove","componentId":"stable-kebab-id"}.

ActivityMoveAction:
{"op":"move_subject","targetActivityId":"exact-owned-activity-id","subjectKey":"existing-product-or-device-record-key"}.
Use this only when the person explicitly asks to relocate an existing product or device and everything that belongs to it. Name only the subject root; Ideal Day resolves its complete owned bundle and matching visible cards. Never edit/remove that subject in the same result. Conversation messages remain where they were written, but structured usage history, cadence, directions, and resources owned by the subject move with it. If the destination or subject is ambiguous, ask one natural clarification and return activityMoves:[].`;

const lunaInstructions = `${personaInstructions}
${resultShape}

This is durable activity design work. Set scheduleProposal:null, occurrenceActions:[], and dayHighlight:null.

Hard extraction checklist for the latest message:
1. Capture every named product/device as its own product record with exactly kind:"product" or kind:"device" and subjectKey equal to that product record's stable key. Give every record owned by that item the same subjectKey. Resource entries owned by an item also carry its itemKey; keep different subjects in separate resource records.
2. A cadence for a nested item inside this activity, such as using one named roller once a week within a broader Hair Routine, requires a recurring_step unless it already exists. Never use recurring_step to represent when the parent activity itself appears; parent cadence belongs exclusively to a ScheduleProposal handled by site-wide Luna.
3. “Used today” requires an activity_event unless it means the whole activity was completed.
4. User-stated facts are authoritative for their own routine. Source-derived facts require supplied research evidence or actual web research.
5. Every visible data component needs a matching existing or upserted recordKey. Preserve stable keys; do not duplicate.
6. Put adherence first, countdown second, and all resources last.
7. Do not ask a follow-up when the supplied facts already support a useful update.

Activity design rules:
- Never create an empty, generic, or “details needed” record/component. Ask naturally and leave that area absent.
- Every product record has only name, manufacturer, variant, concise notes, and the binary kind; never emit fields or usage subfields. Put repeatable directions in a shared protocol.
- When an activity uses multiple products or devices, create one product record and card for each named item. Put item-specific directions and resources in records with that item's subjectKey so they compose inside its card and move with it. Every item-owned resource entry also uses that item's itemKey. Keep adherence and genuinely activity-wide routines shared with no subjectKey; never combine unrelated products' resources into one ambiguous record.
- A deliberately undecided workout exercise belongs in openChoices. Keep equipment at activity scope unless it truly varies by session variant.
- Use session_choice for choosing a device mode today; use schedule variants only for an intentional recurring rotation.
- Timers/countdowns are ordinary options, not defaults. Add one only when elapsed/remaining time is inherently useful or explicitly requested. Never default them for supplements, meals, showers, ordinary product application, or errands. A five-minute chin-up visualization and documented timed exposure are appropriate countdowns.
- A newly created activity may ask exactly one high-value setup question when the answer determines a durable routine, protocol, product, goal, measurement, or tracking design. Never create a placeholder while asking.
- Cardio without a described form/goal, yoga/stretch without a routine/goal, and device care without device/protocol details warrant one setup question. A fully specified low-choice action may remain silent.
- Do not repeat a question already present in recent conversation. Never invent facts, products, steps, results, goals, URLs, or preferences.

Research rules:
- When fetched source evidence is supplied, treat it as the authoritative page snapshot and do not fetch that URL again.
- If source fetching failed, web search may be used for an official manufacturer or primary source; do not use page extraction on a search-only backend.
- Clearly distinguish researched facts from the person's own routine. If verification fails, say so plainly without claiming you lack web access.

${activityActionContract}

FollowUpAction:
{"op":"upsert","key":"stable-kebab-key","title":"short visible trial name","question":"the natural question Luna should ask when due","dueDate":"YYYY-MM-DD","inferred":boolean}
or {"op":"complete|dismiss","key":"existing-follow-up-key"}.
Create one for an explicit future check-in. Also infer one for a clearly finite trial such as “I’ll try the elliptical for one week,” even if the user does not literally say “ask me”; set inferred:true. Do not create one for vague possibilities. Complete an asked follow-up when the latest user message meaningfully answers it.

${catalogInstructions()}`;

const userMessageInstructions = `${personaInstructions}
${resultShape}
This is the fast conversational pass. Always return recordActions:[], workspaceActions:[], activityMoves:[], followUpActions:[], followUpQuestion:null, scheduleProposal:null, occurrenceActions:[], and dayHighlight:null. Answer direct questions naturally. Set workspaceFollowup:true when lasting details, a requested design, research, or an explicit move should be handled next; otherwise false. A request that changes only when the parent activity appears belongs to site-wide schedule work and should not request an activity-workspace follow-up. Never research in this pass or pretend research is complete.`;

const globalInstructions = `${personaInstructions}
${resultShape}
This is site-wide schedule work. Always return recordActions:[], workspaceActions:[], activityMoves:[], followUpActions:[], and dayHighlight:null. Use one followUpQuestion when an essential choice is ambiguous. Any recurring, multi-day, activity-creation, variant-creation, or pattern change requires a ScheduleProposal and confirmation. Only a clear reversible single occurrence may use occurrenceActions. Never mark an occurrence complete, invent an ID, optimize the routine without being asked, or guess a date/destination/collision policy.

ScheduleProposal: {"baseRevision":number,"effectiveDate":"YYYY-MM-DD","summary":string,"impact":{"todayChanges":number,"futurePatternChanges":number},"actions":ScheduleProposalAction[]}.
ScheduleProposalAction may create/update/archive activities or variants, add an occurrence, or create/replace/archive a pattern using only the supplied owned IDs and routine revision.`;

const dayHighlightInstructions = `${resultShape}
This is a silent editorial review. Return message:null, workspaceFollowup:false, no actions/proposal/follow-up, and either one supported dayHighlight or null. Choose one dominant fact in this order: personal best, comeback, real streak, unusual measured effort/longest meaningful block, verified completion cluster, count milestone. Five or more completions qualifies. Never append examples or combine achievements. Use at most 10 words and 64 characters.`;

const dueFollowUpInstructions = `${personaInstructions}
${resultShape}
This is a due check-in the person previously asked for or implied through a finite trial. Return one concise, context-aware question in message. Return workspaceFollowup:false and all action arrays empty, including followUpActions. Do not research, reschedule, or claim an outcome.`;

function instructionsForJob(leased) {
  if (leased.job.kind === "day_highlight") return dayHighlightInstructions;
  if (leased.job.kind === "follow_up") return dueFollowUpInstructions;
  if (leased.job.kind === "global_message" || leased.context.scope === "global") return globalInstructions;
  if (leased.job.kind === "user_message") return userMessageInstructions;
  return lunaInstructions;
}

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
  const route = modelRoute(leased);
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
      title: `Ideal Day · ${leased.context.activity?.title || (leased.context.scope === "global" ? "Luna" : "Activity")} · ${leased.job.kind} · ${sessionId.slice(-8)}`,
      ...route,
      require_model_lock: true,
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

function eventPrompt(job, options = {}) {
  if (job.job.kind === "day_highlight" || job.context.scope === "day_highlight") {
    return `Review today's completed activities and select the single most significant supported highlight. This is editorial judgment, not a recap or encouragement. Compare candidates before choosing one. Prefer a personal best, comeback, real streak, unusual measured effort, or verified cluster over a raw count; use the count only when it is genuinely the strongest fact. A fast cluster requires timestamps that actually support it; a streak requires consecutive prior days; a personal best requires comparable run measurements. Never mention a second achievement or append examples. Return dayHighlight:null when nothing clears that bar.

Date: ${job.context.localDate}
Today's activities and outcomes: ${JSON.stringify(job.context.today || [])}
Recent day totals: ${JSON.stringify(job.context.recentDays || [])}
Recent measured completed runs: ${JSON.stringify(job.context.recentRuns || [])}`;
  }
  if (job.context.scope === "global" || job.job.kind === "global_message") {
    return `The user has spoken to Luna about their day or schedule. Respond naturally and compile only safe, typed scheduling work. Recurring changes require a proposal and confirmation. If one essential choice is missing, ask exactly one useful clarification instead. A clear reversible change to one known occurrence may be emitted as an occurrence action. Never mutate the routine merely because you notice an optimization.

Local date: ${job.context.localDate}
Timezone: ${job.context.timeZone}
Routine revision: ${job.context.routine?.revision}
Settings: ${JSON.stringify(job.context.settings || {})}
Owned activities: ${JSON.stringify(job.context.activities || [])}
Owned variants: ${JSON.stringify(job.context.variants || [])}
Current schedule patterns: ${JSON.stringify(job.context.patterns || [])}
Today's occurrences: ${JSON.stringify(job.context.today || [])}
Source activity, when this request began inside one: ${JSON.stringify(job.context.sourceActivity || null)}
Source activity variant: ${job.context.sourceActivityVariantId || "None"}
Source activity records: ${compactRecords(job.context.sourceActivityRecords)}
Source activity workspace: ${compactWorkspace(job.context.sourceActivityWorkspace)}
Pending proposals: ${JSON.stringify(job.context.pendingProposals || [])}
Recent global conversation:
${compactConversation(job.context.recentMessages)}

Latest user message:
${job.context.sourceMessage?.body || ""}`;
  }
  const activity = job.context.activity || {};
  const schedule = job.context.schedule;
  const activityContext = job.context.activityContext;
  const knownContext = activityContext
    ? `\nKnown steps: ${activityContext.steps?.join("; ") || "None documented"}\nKnown facts: ${activityContext.facts?.map((fact) => `${fact.label}: ${fact.value}`).join("; ") || "None documented"}\nOpen consideration: ${activityContext.openLoop || "None"}`
    : "\nNo additional visit-specific context was supplied.";
  const shared = `Catalog version: ${CATALOG_VERSION}\nActivity: ${activity.title || "Unknown"}\nCategory: ${activity.category || "Unknown"}\nOwned activities available as move destinations: ${JSON.stringify(job.context.activities || [])}\nActive occurrence: ${JSON.stringify(job.context.occurrence || null)}\nActive variant ID: ${job.context.activityVariantId || "None"}\nSuggested starting recipe: ${activityRecipeHint(activity.title, activity.category)}. This is guidance, not a conclusion; prefer the user's actual details.\nToday: ${schedule?.planDate || "Unknown date"}\nDay Timeline: ${schedule?.timelineEnabled ? "enabled" : "off"}\nPlanned duration: ${schedule?.timelineEnabled && schedule?.duration ? `${schedule.duration} minutes` : "Not part of the current day mode"}${knownContext}\n\nDurable activity records (base plus active-variant overlay):\n${compactRecords(job.context.records)}\n\nPending or asked follow-ups:\n${job.context.followUps?.length ? JSON.stringify(job.context.followUps) : "None"}\n\nRecent activity runs:\n${job.context.recentRuns?.length ? JSON.stringify(job.context.recentRuns) : "No completed run history yet."}\n\nCurrent saved workspace (base plus active-variant overlay):\n${compactWorkspace(job.context.workspace)}\n\nRecent permanent conversation:\n${compactConversation(job.context.recentMessages)}`;
  if (job.job.kind === "follow_up") {
    return `A saved check-in is due. Ask the supplied question naturally, using the activity history only to make it less mechanical. Do not add advice before the user answers.\n\n${shared}\n\nDue follow-up:\n${JSON.stringify(job.context.dueFollowUp || null)}`;
  }
  if (job.job.kind === "user_message") {
    return `The user has just spoken in this activity conversation. Respond first and quickly: answer what you can naturally, then decide whether the lasting activity space needs a follow-up. Return recordActions:[] and workspaceActions:[] in this pass. Do not use web research yet. If the user asks for research or verification, acknowledge that you will look into it, do not claim findings yet, and set workspaceFollowup:true. Also set workspaceFollowup:true when useful durable information or a requested design should be organized after your reply.\n\n${shared}\n\nLatest user message:\n${job.context.sourceMessage?.body || ""}`;
  }
  if (job.job.kind === "workspace_refresh") {
    const evidence = options.researchEvidence
      ? `\n\nFetched source evidence (captured once by Ideal Day; do not fetch these URLs again):\n${options.researchEvidence}`
      : "";
    return `Bring the lasting activity space up to date. Set workspaceFollowup:false. Preserve useful content and stable keys. Apply the hard extraction checklist exactly once to the latest message, then emit only the necessary changes. Do not leave a learned product, device, cadence, usage event, direction, or protocol only in conversation. When the person explicitly asks to move an existing product or device, use one move_subject activityMove rooted at its product record instead of recreating it; the app moves all owned details. If the destination or subject is unclear, ask one concise question and make no move. Otherwise remain silent with message:null unless researched findings or a clarification need to be communicated.\n\n${shared}\n\nLatest triggering user message:\n${job.context.sourceMessage?.body || ""}${evidence}`;
  }
  if (job.job.kind === "variant_setup") {
    return `A schedule proposal has just created this activity variant. Build the useful variant-specific workspace now from the confirmed request. Put shared products, devices, equipment, goals, and sources at activity scope; put the session plan or protocol that changes with this variant at variant scope. Never ask a duplicate question and never create placeholders. Remain silent unless one essential choice still blocks a useful result.\n\n${shared}\n\nOriginal confirmed request:\n${job.context.sourceMessage?.body || ""}`;
  }
  if (job.job.kind === "activity_setup") {
    return `Prepare this activity for future use. Choose safe initial workspace components and ask at most one high-value setup question only when its answer will enable a named durable improvement. This is the setup decision; do not defer it to a later open.\n\n${shared}`;
  }
  return `This is an ordinary activity open from the earlier runtime. Remain silent and make no workspace changes. Return message:null and an empty workspaceActions array.\n\n${shared}`;
}

function compactDayHighlightBody(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const dominantClause = normalized.split(/(?:,\s+(?:including|with|plus)\b|\s+[—–]\s+|;)/i)[0].trim();
  const words = dominantClause.split(/\s+/).slice(0, 10);
  let compact = words.join(" ").replace(/[,:;—–-]+$/, "");
  if (compact.length > 64) {
    compact = compact.slice(0, 64).replace(/\s+\S*$/, "").replace(/[,:;—–-]+$/, "");
  }
  return compact;
}

function parseAgentResult(content) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = JSON.parse(jsonrepair(cleaned));
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Luna returned an invalid result envelope.");
  const message = typeof parsed.message === "string" && parsed.message.trim() ? parsed.message.trim() : null;
  const workspaceFollowup = parsed.workspaceFollowup === true;
  const recordActions = Array.isArray(parsed.recordActions) ? parsed.recordActions : [];
  const workspaceActions = Array.isArray(parsed.workspaceActions) ? parsed.workspaceActions : [];
  const activityMoves = Array.isArray(parsed.activityMoves) ? parsed.activityMoves : [];
  const followUpActions = Array.isArray(parsed.followUpActions) ? parsed.followUpActions : [];
  const followUpQuestion = parsed.followUpQuestion && typeof parsed.followUpQuestion === "object"
    && typeof parsed.followUpQuestion.body === "string" && parsed.followUpQuestion.body.trim()
    ? { body: parsed.followUpQuestion.body.trim() }
    : null;
  const scheduleProposal = parsed.scheduleProposal && typeof parsed.scheduleProposal === "object" ? parsed.scheduleProposal : null;
  const occurrenceActions = Array.isArray(parsed.occurrenceActions) ? parsed.occurrenceActions : [];
  const dayHighlightBody = compactDayHighlightBody(parsed.dayHighlight?.body);
  const dayHighlight = parsed.dayHighlight && typeof parsed.dayHighlight === "object" && !Array.isArray(parsed.dayHighlight)
    && dayHighlightBody
    ? { body: dayHighlightBody, kind: typeof parsed.dayHighlight.kind === "string" ? parsed.dayHighlight.kind : "completion" }
    : null;
  return { message, workspaceFollowup, recordActions, workspaceActions, activityMoves, followUpActions, followUpQuestion, scheduleProposal, occurrenceActions, dayHighlight };
}

function visibleProgress(leased) {
  if (leased.job.kind === "day_highlight") return null;
  if (leased.job.kind === "global_message") {
    return {
      title: "Luna is working on your day",
      detail: "Reviewing the request against your current activities and schedule.",
    };
  }
  const activityTitle = leased.context.activity?.title || "this activity";
  if (leased.job.kind === "activity_setup") {
    return {
      title: `Setting up ${activityTitle}`,
      detail: "Choosing what will be useful each time you return.",
    };
  }
  if (leased.job.kind !== "workspace_refresh" && leased.job.kind !== "variant_setup") return null;

  const sourceMessage = leased.context.sourceMessage?.body || "";
  const requestedResearch = userMessageRequestsResearch(sourceMessage);
  if (leased.job.kind === "variant_setup") {
    return {
      title: `Preparing ${activityTitle}`,
      detail: "Building the confirmed version of this activity.",
    };
  }
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

function sendHeartbeat(leased) {
  return requestAppJson("/api/agent/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "heartbeat",
      workerId,
      jobId: leased?.job?.id,
      leaseToken: leased?.job?.leaseToken,
    }),
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
      activityMoves: replyFirst ? [] : agentResult.activityMoves,
      followUpActions: replyFirst ? [] : agentResult.followUpActions,
      followUpQuestion: agentResult.followUpQuestion,
      scheduleProposal: agentResult.scheduleProposal,
      occurrenceActions: agentResult.occurrenceActions,
      dayHighlight: agentResult.dayHighlight,
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
  if (leased.job.kind === "activity_opened") {
    await completeJob(leased, sessionId, {
      message: null,
      workspaceFollowup: false,
      recordActions: [],
      workspaceActions: [],
      activityMoves: [],
      followUpActions: [],
      followUpQuestion: null,
      scheduleProposal: null,
      occurrenceActions: [],
      dayHighlight: null,
    });
    return;
  }
  if (leased.job.kind === "user_message" && userMessageRequestsResearch(sourceMessage)) {
    await completeJob(leased, sessionId, {
      message: researchAcknowledgement(leased.context.activity?.title),
      workspaceFollowup: true,
      recordActions: [],
      workspaceActions: [],
      activityMoves: [],
    });
    return;
  }
  const researchEvidence = leased.job.kind === "workspace_refresh" && userMessageRequestsResearch(sourceMessage)
    ? await researchEvidenceForMessage(sourceMessage)
    : null;
  const route = modelRoute(leased);
  const result = await requestJson(`${hermesUrl}/api/sessions/${encodeURIComponent(sessionId)}/chat`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: eventPrompt(leased, { researchEvidence }),
      instructions: instructionsForJob(leased),
      ...route,
      require_model_lock: true,
    }),
  });
  const content = result?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Hermes returned an empty Luna result.");
  let agentResult;
  try {
    agentResult = parseAgentResult(content);
  } catch (firstError) {
    const correction = await requestJson(`${hermesUrl}/api/sessions/${encodeURIComponent(sessionId)}/chat`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: "Your previous result did not match the required JSON envelope. Correct only its formatting and schema now. Preserve the same conclusions and evidence. Do not repeat research or use tools. Return only the corrected JSON object.",
        instructions: instructionsForJob(leased),
        ...route,
        model_options: {
          reasoning: { enabled: false },
          reasoning_effort: "none",
          service_tier: null,
          fast: false,
        },
        require_model_lock: true,
      }),
    });
    const correctedContent = correction?.message?.content;
    if (typeof correctedContent !== "string" || !correctedContent.trim()) throw firstError;
    agentResult = parseAgentResult(correctedContent);
  }
  await completeJob(leased, result.session_id || sessionId, agentResult);
}

async function runJobWithHeartbeat(key, leased) {
  let heartbeatInFlight = false;
  const heartbeatTimer = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = true;
    void sendHeartbeat(leased)
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

export { eventPrompt, lunaInstructions, parseAgentResult };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
