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
const HERMES_MESSAGE_CHAR_BUDGET = 60_000;

function modelRoute(leased) {
  const workspaceJob = leased.job.kind === "workspace_refresh"
    || leased.job.kind === "activity_setup"
    || leased.job.kind === "variant_setup"
    || leased.job.kind === "global_refresh"
    || leased.job.kind === "onboarding_proposal";
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
{"message":string|null,"workspaceFollowup":boolean,"recordActions":RecordAction[],"workspaceActions":WorkspaceAction[],"activityMoves":ActivityMoveAction[],"activityWorkRequests":ActivityWorkRequest[],"captureActions":CaptureAction[],"followUpActions":FollowUpAction[],"followUpQuestion":{"body":string}|null,"scheduleActions":DirectScheduleAction[],"scheduleProposal":ScheduleProposal|null,"occurrenceActions":OccurrenceAction[],"dayHighlight":{"body":string,"kind":"streak|milestone|momentum|effort|comeback|personal_best|completion"}|null}`;

const globalAcknowledgementShape = `Return exactly one JSON object with no markdown or surrounding prose:
{"message":string|null,"workspaceFollowup":boolean,"requestPlan":{"kind":"conversation|question|durable_work","outcomes":string[]}}`;

const globalCoordinatorShape = `Return exactly one JSON object with no markdown or surrounding prose:
{"message":string|null,"workspaceFollowup":false,"recordActions":[],"workspaceActions":[],"activityMoves":[],"activityWorkRequests":ActivityWorkRequest[],"captureActions":CaptureAction[],"followUpActions":[],"followUpQuestion":{"body":string}|null,"scheduleActions":DirectScheduleAction[],"scheduleProposal":ScheduleProposal|null,"occurrenceActions":OccurrenceAction[],"dayHighlight":null,"handledOutcomes":[{"index":number,"via":"message|activity_work|schedule_change|schedule_proposal|occurrence|capture|clarification"}]}`;

const onboardingProposalShape = `Return exactly one JSON object with no markdown or surrounding prose:
{"onboardingProposal":{"summary":string,"activities":[{"key":string,"title":string,"category":"Light|Recharge|Training|Fuel|Care|Logistics|Creativity|Spirit","durationMinutes":number,"reason":string,"selected":boolean,"immediatelyActionable":boolean}],"calibration":{"afterDays":number,"note":string}}}`;

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

This is durable activity design work. Set activityWorkRequests:[], captureActions:[], scheduleActions:[], scheduleProposal:null, occurrenceActions:[], and dayHighlight:null.

Hard extraction checklist for the latest message:
1. Capture every named product/device as its own product record with exactly kind:"product" or kind:"device" and subjectKey equal to that product record's stable key. Give every record owned by that item the same subjectKey. Resource entries owned by an item also carry its itemKey; keep different subjects in separate resource records.
2. Every named product/device whose use is tracked needs its own subject-owned rhythm: adherence with effectiveDate for daily use, or recurring_step for an independent cadence such as one roller once a week. Never use recurring_step to represent when the parent activity itself appears; parent cadence belongs exclusively to site-wide scheduling, either a direct user-requested action or a proactive Luna proposal. If the item is added after today's parent activity was already completed and the person did not explicitly say they used the item today, start it on its first future eligible date with no completed history.
3. “Used today” requires an activity_event unless it means the whole activity was completed.
4. User-stated facts are authoritative for their own routine. Source-derived facts require supplied research evidence or actual web research.
5. Every visible data component needs a matching existing or upserted recordKey. Preserve stable keys; do not duplicate.
6. Put subject-owned adherence/recurrence inside its product card, before that product's protocol; put all resources last. Activity-wide adherence remains first and countdown second.
7. Do not ask a follow-up when the supplied facts already support a useful update.
8. When the person reports a measured session, put the modality, actual duration, distance/results, effort, and machine settings they supplied into the existing session_log entry for that date and option. Preserve all prior entries and existing field definitions. Chat and the interactive form share this one canonical log; never duplicate the same values into metric, trend, history, quick_log, or activity_event records.
9. When the person reports lifting results, preserve the workout plan and write the dated exercises, sets, loads, reps, optional set type, and optional reps-in-reserve into its linked strength_session. A phrase such as “3 sets of 10 at 25 pounds” means three performed sets. Never place performed sets or hand-written “last time” summaries in workout; the app derives them from strength_session.
10. A supplement roster belongs in one activity-scoped daily_selection. “I take magnesium” or another confirmed stable statement adds/reactivates the item but does not claim it was used today. “I took/used magnesium today” adds/reactivates it and includes its id in today's dated entry. Hypotheticals, questions, and “considering” statements do neither. “I stopped taking magnesium” marks it inactive without deleting prior entries. Preserve every existing item and dated entry when updating this record; never maintain a separate supplement history copy.
11. Meals, shakes, and food prep belong in one activity-scoped meal_log. Explicit past/current language such as “had,” “ate,” “drank,” “made,” or “prepped” creates a concise dated entry; plans, questions, and possibilities do not. “Had a strawberry shake” needs only that title. Preserve ingredients, amounts, servings, batch size, storage, or modifications only when the person supplied them. A linked recipe may create or update a reusable recipe from fetched evidence; create a dated entry too only when the person says they actually made/consumed it. Keep recipes and every prior entry when updating, reuse stable ids for corrections, and never duplicate this data into history, item_list, protocol, resources, or activity_event.

Activity design rules:
- Never create an empty, generic, or “details needed” record/component. Ask naturally and leave that area absent.
- Every product record has only name, manufacturer, variant, concise notes, and the binary kind; never emit fields or usage subfields. Put repeatable directions in a subject-owned protocol.
- When an activity uses multiple products or devices, create one product record and card for each named item. Put item-specific rhythm, directions, and resources in records with that item's subjectKey so they compose inside its card and move with it. Every item-owned resource entry also uses that item's itemKey. Never infer a new item's history from the parent activity. Use an activity-wide rhythm only when all subjects are intentionally synchronized; never combine unrelated products' resources into one ambiguous record.
- A deliberately undecided workout exercise belongs in openChoices. Keep equipment at activity scope unless it truly varies by session variant. Use named schedule variants for a recurring split such as Legs/Push/Pull; each variant may own a workout plan and linked strength_session while sharing the parent activity conversation and equipment. Warm-ups and cool-downs are workout phases, not numbered exercises: create or update a protocol with that workout's workoutRecordKey and phase warmup or cooldown.
- Use session_choice for choosing a device mode today; use schedule variants only for an intentional recurring rotation.
- Use session_log when one whole session is described by a modality, duration, and a few measurements or settings. Link it to session_choice when options exist. Keep its fields evidence-based and modality-aware; do not expose every conceivable fitness metric. Use workout plus one linked strength_session when individual exercises, sets, reps, or loads need tracking.
- Timers/countdowns are ordinary options, not defaults. Add one only when elapsed/remaining time is inherently useful or explicitly requested. Never default them for supplements, meals, showers, ordinary product application, or errands. A five-minute chin-up visualization and documented timed exposure are appropriate countdowns.
- Food tracking follows the person's natural level of detail. Do not ask them to enumerate ingredients, do not invent nutrition or recipe detail, and do not create a checklist of sandwich or meal ingredients. A concise meal_log entry is useful on its own; recipe and ingredient details stay optional.
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
This is the fast conversational pass. Always return recordActions:[], workspaceActions:[], activityMoves:[], activityWorkRequests:[], captureActions:[], followUpActions:[], followUpQuestion:null, scheduleActions:[], scheduleProposal:null, occurrenceActions:[], and dayHighlight:null. Answer direct questions naturally. Set workspaceFollowup:true when lasting details, a requested design, research, or an explicit move should be handled next; otherwise false. Explicitly reporting food or drink eaten, consumed, made, or prepped is lasting detail and always needs workspaceFollowup:true. A request that changes only when the parent activity appears belongs to site-wide schedule work and should not request an activity-workspace follow-up. For an explicit schedule request, acknowledge the requested change without claiming it is already complete. Never research in this pass or pretend research is complete.`;

const globalMessageInstructions = `${personaInstructions}
${globalAcknowledgementShape}
This is the immediate site-wide acknowledgement pass. You receive the person's latest message and only a small amount of conversational history. Do not answer from activity state, research, plan changes, or claim work is complete. Briefly acknowledge what the person asked and say you will check or handle it unless the prompt says an activity conversation already supplied the visible reply; in that case return message:null. Preserve compound intent: requestPlan.outcomes contains one concise entry for every separate question, requested change, research task, or item to remember. Use kind:"durable_work" when any outcome requires research or a lasting change, kind:"question" for questions that require the person's Ideal Day state, and kind:"conversation" only for ordinary conversation with no requested outcome. A question or durable_work plan must contain at least one outcome and sets workspaceFollowup:true. Conversation may use outcomes:[] and workspaceFollowup:false.`;

const globalInstructions = `${personaInstructions}
${globalCoordinatorShape}
This is the durable site-wide coordinator pass. Semantically review every latest user message; there is deliberately no keyword gate in front of this pass. Always return workspaceFollowup:false, recordActions:[], workspaceActions:[], activityMoves:[], followUpActions:[], and dayHighlight:null. Use activityWorkRequests to hand durable activity work to one or more exact owned activities. Research and current activity knowledge come before clarification: never ask for a preference or cadence that the supplied official source or existing routine can answer, and never invent an unsupported recommendation. Use one followUpQuestion only when an essential choice remains ambiguous after reviewing that evidence. A clear user-authored request to change one supplied activity cadence or Essential/More-for-today role applies immediately through one DirectScheduleAction. Do not turn an explicit user instruction into a proposal. ScheduleProposal is reserved for a proactive Luna recommendation that Luna originated, such as a due check-in suggesting an adjustment; it is not a confirmation gate for work the person just directly requested. A clear reversible single occurrence may use occurrenceActions. Never mark an occurrence complete, invent an ID, optimize the routine without being asked, or guess a date, target, anchor, or collision policy. If the message is purely conversational or fully answered by the immediate pass and requires no durable work, return message:null with every action array empty and no proposal or follow-up.

A single message may combine several kinds of work. The supplied request plan is Luna's acknowledgement-time extraction, not an authority over facts, but every numbered outcome must be resolved in this coordinator pass. Satisfy every explicit clause; do not drop activity work because schedule work is also requested, or vice versa. You may emit activityWorkRequests and a direct schedule action together. For each request-plan outcome, return one handledOutcomes entry with its one-based index and the actual result channel used. Never mark an outcome handled without emitting that channel. When moving an existing product or device between activities, delegate to the activity that currently owns the subject and tell its specialist to use move_subject with the exact destination activity; separately apply any explicitly requested destination-role change with a DirectScheduleAction.

ActivityWorkRequest: {"activityId":"exact-owned-activity-id","instruction":"concise description of the durable work, including relevant researched conclusions and user intent"}.
Use this when the latest request asks Luna to add, update, move, research for, or otherwise maintain an activity. Select the destination only from the supplied owned IDs. If the user names an activity, use that exact matching owned activity. Include enough evidence-based direction for its specialist pass, but never emit its record or component changes here. Return message:null when delegation is the remaining work; the activity pass will report the finished result in this same conversation.

DirectScheduleAction is either {"type":"set_pattern_cadence","baseRevision":number,"activityId":"exact-owned-activity-id","patternId":"exact-existing-pattern-id","expectedRevision":number,"cadence":{"kind":"daily"}|{"kind":"weekdays","weekdays":[0-6],"intervalWeeks":number}|{"kind":"interval_days","every":number,"anchorDate":"YYYY-MM-DD"},"effectiveDate":"YYYY-MM-DD","summary":string} or {"type":"set_pattern_step_role","baseRevision":number,"activityId":"exact-owned-activity-id","patternId":"exact-existing-pattern-id","stepId":"exact-existing-step-id","expectedRevision":number,"planRole":"essential|extra","effectiveDate":"YYYY-MM-DD","summary":string}.
Use scheduleActions only when the latest user message directly requests this one change and every required value is explicit or supplied in current schedule context. For “every N days, counting from yesterday,” use yesterday as cadence.anchorDate and today as effectiveDate. For “make X essential” or its semantic equivalent, target X's exact supplied pattern step and use planRole:"essential"; use "extra" when the person directly asks to move it out of Essentials. Preserve every field outside the requested change. Return one brief completion message when using scheduleActions. Otherwise return scheduleActions:[].

CaptureAction: {"op":"capture_open_item","activityId":"exact-owned-activity-id"|null,"destinationHint":string,"label":string,"detail":string,"urgency":""|"now"|"soon"|"this_week"|"later","timing":"unspecified"|"today"|"tomorrow"|"later","idempotencyKey":"stable-id"}.
Use captureActions for an explicit open loop such as “I need more oranges,” “buy toothpaste,” or “restock filters.” Do not capture hypotheticals, questions, already-completed actions, or general observations. Choose activityId only when one supplied owned activity is an obvious home; otherwise use null and a short destinationHint. Use today or tomorrow only when the person explicitly says so; otherwise use unspecified and ask one friendly timing question after confirming where you saved it. Filing an item does not change the destination activity's essential/extra role. Do not also create an occurrenceAction for the same capture; Ideal Day applies explicit timing from the capture itself.

ScheduleProposal: {"baseRevision":number,"effectiveDate":"YYYY-MM-DD","summary":string,"impact":{"todayChanges":number,"futurePatternChanges":number},"actions":ScheduleProposalAction[]}.
ScheduleProposalAction may create/update/archive activities or variants, add an occurrence, or create/replace/archive a pattern using only the supplied owned IDs and routine revision.
For a pattern action, copy the complete supplied pattern shape. A replacement is {"type":"replace_pattern","patternId":"exact-existing-pattern-id","expectedRevision":number,"pattern":{"name":string,"position":number,"cadence":cadence-object,"advancement":{"kind":"calendar"}|{"kind":"completion","advanceOnSkip":boolean},"anchorDate":"YYYY-MM-DD","initialStepPosition":number,"effectiveDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"|null,"steps":[{"id":string,"activityId":"exact-owned-activity-id","activityVariantId":"exact-owned-variant-id"|null,"position":number,"durationMinutes":number,"displayLabelOverride":string|null,"planRole":string}]}}. Each planRole must be exactly "essential" or "extra". A creation uses the same pattern object with {"type":"create_pattern","clientKey":"stable-id","pattern":...}. An archive is {"type":"archive_pattern","patternId":"exact-existing-pattern-id","expectedRevision":number}.
Every proposed schedule step may set planRole:"essential" or "extra". Use essential for the small must-do foundation the person wants to count toward a successful day; use extra for optional ways to go further. This role is independent of who created the activity. Preserve an existing step's role unless the person asks to change priority or the proposal is explicitly organizing an unclassified routine.`;

const dayHighlightInstructions = `${resultShape}
This is a silent editorial review. Return message:null, workspaceFollowup:false, no actions/proposal/follow-up, including captureActions:[], and either one supported dayHighlight or null. Choose one dominant fact in this order: personal best, comeback, real streak, unusual measured effort/longest meaningful block, verified completion cluster, count milestone. Five or more completions qualifies. Never append examples or combine achievements. Use at most 10 words and 64 characters.`;

const dueFollowUpInstructions = `${personaInstructions}
${resultShape}
This is a due check-in the person previously asked for or implied through a finite trial. Return one concise, context-aware question in message. Return workspaceFollowup:false and all action arrays empty, including captureActions and followUpActions. Do not research, reschedule, or claim an outcome.`;

const onboardingProposalInstructions = `${personaInstructions}
${onboardingProposalShape}
Design six to eight candidate activities for the person's first Essential set. This is a provisional selection surface, not a home screen and not durable activity data. Every title must name a familiar, concrete action such as Morning walk, Strength session, Focus block, Breakfast, Bed routine, Meditation, Tidy reset, or an equally specific activity supported by the person's answers. Never use vague mood or outcome labels such as Morning reset, Important progress, Ease into evening, Move your body, or Intentional meal. Tie each short reason to an actual priority, friction, or rhythm the person selected. Preselect exactly three candidates for gentle, four for balanced, and five for push. Return no optional pool, stretch goals, future candidates, Highlights, achievements, or completion language. Do not invent medical, dietary, product, or exercise details. Calibration must be 3-7 days from the start.`;

function instructionsForJob(leased) {
  if (leased.job.kind === "onboarding_proposal") return onboardingProposalInstructions;
  if (leased.job.kind === "day_highlight") return dayHighlightInstructions;
  if (leased.job.kind === "follow_up") return dueFollowUpInstructions;
  if (leased.job.kind === "global_message") return globalMessageInstructions;
  if (leased.job.kind === "global_refresh" || leased.context.scope === "global") return globalInstructions;
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

function compactConversation(messages, { limit = 12, maxChars = 6_000 } = {}) {
  if (!messages?.length) return "No prior conversation yet.";
  const selected = [];
  let used = 0;
  for (const message of messages.slice(-limit).reverse()) {
    const body = String(message.body || "").trim().slice(0, 1_200);
    const line = `${message.author === "luna" ? "Luna" : "User"}: ${body}`;
    if (selected.length && used + line.length + 1 > maxChars) break;
    selected.push(line);
    used += line.length + 1;
  }
  return selected.reverse().join("\n") || "No prior conversation yet.";
}

function compactWorkspace(workspace) {
  const components = workspace?.document?.components;
  return components?.length ? JSON.stringify(workspace.document) : "No saved workspace components yet.";
}

function compactRecords(records) {
  return records?.length ? JSON.stringify(records) : "No durable activity records yet.";
}

function boundedJsonProjection(value, maxChars) {
  const items = Array.isArray(value) ? value : [];
  const selected = [];
  for (const item of items) {
    const candidate = JSON.stringify({ items: [...selected, item], omitted: items.length - selected.length - 1 });
    if (candidate.length > maxChars) break;
    selected.push(item);
  }
  return JSON.stringify({ items: selected, omitted: items.length - selected.length });
}

function compactActivityKnowledge(activities) {
  return (activities || []).map((activity) => ({
    activityId: activity.id,
    records: (activity.records || []).map((record) => ({
      key: record.key,
      subjectKey: record.subjectKey || null,
      type: record.type,
      title: record.title,
      scope: record.scope,
      activityVariantId: record.activityVariantId || null,
    })),
  })).filter((activity) => activity.records.length);
}

function compactSchedulePatterns(patterns) {
  return (patterns || []).map((pattern) => ({
    id: pattern.id,
    name: pattern.name,
    position: pattern.position,
    cadence: pattern.cadence,
    advancement: pattern.advancement,
    anchorDate: pattern.anchorDate,
    initialStepPosition: pattern.initialStepPosition,
    effectiveDate: pattern.effectiveDate,
    endDate: pattern.endDate,
    revision: pattern.revision,
    steps: (pattern.steps || []).map((step) => ({
      id: step.id,
      activityId: step.activityId,
      activityVariantId: step.activityVariantId || null,
      position: step.position,
      durationMinutes: step.durationMinutes,
      displayLabelOverride: step.displayLabelOverride || null,
      planRole: step.planRole,
    })),
  }));
}

function compactToday(today) {
  return (today || []).map((occurrence) => ({
    occurrenceId: occurrence.occurrenceId,
    activityId: occurrence.activityId,
    activityVariantId: occurrence.activityVariantId || null,
    title: occurrence.title,
    completedAt: occurrence.completedAt || null,
    skippedAt: occurrence.skippedAt || null,
  }));
}

function assertPromptBudget(prompt, kind) {
  if (prompt.length > HERMES_MESSAGE_CHAR_BUDGET) {
    throw new Error(`${kind} prompt exceeded the safe Hermes message budget (${prompt.length} characters).`);
  }
  return prompt;
}

function eventPrompt(job, options = {}) {
  if (job.job.kind === "onboarding_proposal" || job.context.scope === "onboarding") {
    const revision = job.context.revisionRequest
      ? `\nThe person is revising an existing draft. Preserve useful parts and apply this request: ${job.context.revisionRequest}\nCurrent editable draft: ${JSON.stringify(job.context.currentProposal || null)}`
      : "";
    return `Create a personalized candidate set only after reviewing all four onboarding answers. Use plain, familiar activity names and return one complete selection surface. Do not create duplicate activities, a generic wellness starter pack, an optional backlog, or a miniature home screen.\n\nStructured onboarding answers:\n${JSON.stringify(job.context.answers || null)}\n\nHuman-readable summary:\n${job.context.goals}\n\nRequested coaching pace: ${job.context.capacity}\nLocal date: ${job.context.localDate}${revision}`;
  }
  if (job.job.kind === "day_highlight" || job.context.scope === "day_highlight") {
    return `Review today's completed activities and select the single most significant supported highlight. This is editorial judgment, not a recap or encouragement. Compare candidates before choosing one. Prefer a personal best, comeback, real streak, unusual measured effort, or verified cluster over a raw count; use the count only when it is genuinely the strongest fact. A fast cluster requires timestamps that actually support it; a streak requires consecutive prior days; a personal best requires comparable run measurements. Never mention a second achievement or append examples. Return dayHighlight:null when nothing clears that bar.

Date: ${job.context.localDate}
Today's activities and outcomes: ${JSON.stringify(job.context.today || [])}
Recent day totals: ${JSON.stringify(job.context.recentDays || [])}
Recent measured completed runs: ${JSON.stringify(job.context.recentRuns || [])}`;
  }
  if (job.context.scope === "global" || job.job.kind === "global_message" || job.job.kind === "global_refresh") {
    const latestMessage = String(job.context.sourceMessage?.body || "").trim();
    if (job.job.kind === "global_message") {
      const phase = job.context.sourceActivity
        ? "The activity conversation already owns the visible immediate reply. Return message:null and the request plan so site-wide coordination can continue without duplicating that reply."
        : "Acknowledge the complete latest message now. Do not inspect or answer from the person's activity state in this pass.";
      return assertPromptBudget(`${phase}

Latest user message (primary and complete):
${latestMessage}

Recent conversation for pronoun and follow-up continuity only:
${compactConversation(job.context.recentMessages, { limit: 8, maxChars: 4_000 })}`, "global acknowledgement");
    }

    const evidence = options.researchEvidence
      ? `\n\nFetched source evidence (captured once by Ideal Day; do not fetch these URLs again):\n${String(options.researchEvidence).slice(0, 10_000)}`
      : "";
    const prompt = `Coordinate the requested durable work now. Use the compact ownership index to select exact activities, and delegate activity-specific changes with activityWorkRequests. If full record details are needed to answer or change an activity, delegate to that activity instead of guessing.

Latest user message (primary and complete):
${latestMessage}

Numbered request plan extracted during acknowledgement:
${JSON.stringify(job.context.requestPlan || null)}

Local date: ${job.context.localDate}
Timezone: ${job.context.timeZone}
Routine revision: ${job.context.routine?.revision}
Settings: ${JSON.stringify(job.context.settings || {})}
Owned activities: ${boundedJsonProjection(job.context.activities || [], 12_000)}
Durable ownership index: ${boundedJsonProjection(compactActivityKnowledge(job.context.activityKnowledge), 14_000)}
Owned variants: ${boundedJsonProjection(job.context.variants || [], 5_000)}
Current schedule patterns: ${boundedJsonProjection(compactSchedulePatterns(job.context.patterns), 20_000)}
Today's occurrence/status index: ${boundedJsonProjection(compactToday(job.context.today), 9_000)}
Source activity, when this request began inside one: ${JSON.stringify(job.context.sourceActivity || null)}
Source activity variant: ${job.context.sourceActivityVariantId || "None"}
Source activity record index: ${boundedJsonProjection(compactActivityKnowledge([{ id: job.context.sourceActivity?.id || "source", records: job.context.sourceActivityRecords || [] }]), 10_000)}
Source activity workspace is intentionally omitted; delegate activity-specific work to its bounded compiler.
Pending proposals: ${boundedJsonProjection(job.context.pendingProposals || [], 5_000)}
Recent global conversation:
${compactConversation(job.context.recentMessages, { limit: 12, maxChars: 6_000 })}${evidence}`;
    return assertPromptBudget(prompt, "global coordinator");
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
    const delegation = job.context.delegationInstruction
      ? `\n\nSite-wide Luna's validated handoff:\n${job.context.delegationInstruction}`
      : "";
    return `Bring the lasting activity space up to date. Set workspaceFollowup:false. Preserve useful content and stable keys. Apply the hard extraction checklist exactly once to the latest message, then emit only the necessary changes. Do not leave a learned product, device, cadence, usage event, direction, or protocol only in conversation. When the person explicitly asks to move an existing product or device, use one move_subject activityMove rooted at its product record instead of recreating it; the app moves all owned details. If the destination or subject is unclear, put one concise question in followUpQuestion and make no move. Otherwise keep followUpQuestion:null. Only researched findings belong in message; ordinary workspace compilation must return message:null.\n\n${shared}\n\nLatest triggering user message:\n${job.context.sourceMessage?.body || ""}${delegation}${evidence}`;
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
  const onboardingProposal = parsed.onboardingProposal && typeof parsed.onboardingProposal === "object" && !Array.isArray(parsed.onboardingProposal)
    ? parsed.onboardingProposal
    : null;
  const message = typeof parsed.message === "string" && parsed.message.trim() ? parsed.message.trim() : null;
  const workspaceFollowup = parsed.workspaceFollowup === true;
  const recordActions = Array.isArray(parsed.recordActions) ? parsed.recordActions : [];
  const workspaceActions = Array.isArray(parsed.workspaceActions) ? parsed.workspaceActions : [];
  const activityMoves = Array.isArray(parsed.activityMoves) ? parsed.activityMoves : [];
  const activityWorkRequests = Array.isArray(parsed.activityWorkRequests) ? parsed.activityWorkRequests : [];
  const captureActions = Array.isArray(parsed.captureActions) ? parsed.captureActions : [];
  const followUpActions = Array.isArray(parsed.followUpActions) ? parsed.followUpActions : [];
  const followUpQuestion = parsed.followUpQuestion && typeof parsed.followUpQuestion === "object"
    && typeof parsed.followUpQuestion.body === "string" && parsed.followUpQuestion.body.trim()
    ? { body: parsed.followUpQuestion.body.trim() }
    : null;
  const scheduleActions = Array.isArray(parsed.scheduleActions) ? parsed.scheduleActions : [];
  const scheduleProposal = parsed.scheduleProposal && typeof parsed.scheduleProposal === "object" ? parsed.scheduleProposal : null;
  const occurrenceActions = Array.isArray(parsed.occurrenceActions) ? parsed.occurrenceActions : [];
  const requestPlanSource = parsed.requestPlan && typeof parsed.requestPlan === "object" && !Array.isArray(parsed.requestPlan)
    ? parsed.requestPlan
    : null;
  const requestKind = ["conversation", "question", "durable_work"].includes(requestPlanSource?.kind)
    ? requestPlanSource.kind
    : null;
  const requestOutcomes = Array.isArray(requestPlanSource?.outcomes)
    ? requestPlanSource.outcomes
      .filter((outcome) => typeof outcome === "string" && outcome.trim())
      .slice(0, 6)
      .map((outcome) => outcome.trim().slice(0, 300))
    : [];
  const requestPlan = requestKind && (requestKind === "conversation" || requestOutcomes.length)
    ? { kind: requestKind, outcomes: requestOutcomes }
    : null;
  const handledOutcomes = Array.isArray(parsed.handledOutcomes)
    ? parsed.handledOutcomes.slice(0, 12)
    : [];
  const dayHighlightBody = compactDayHighlightBody(parsed.dayHighlight?.body);
  const dayHighlight = parsed.dayHighlight && typeof parsed.dayHighlight === "object" && !Array.isArray(parsed.dayHighlight)
    && dayHighlightBody
    ? { body: dayHighlightBody, kind: typeof parsed.dayHighlight.kind === "string" ? parsed.dayHighlight.kind : "completion" }
    : null;
  return { message, onboardingProposal, workspaceFollowup, requestPlan, handledOutcomes, recordActions, workspaceActions, activityMoves, activityWorkRequests, captureActions, followUpActions, followUpQuestion, scheduleActions, scheduleProposal, occurrenceActions, dayHighlight };
}

function visibleProgress(leased) {
  if (leased.job.kind === "onboarding_proposal") {
    return {
      title: "Building your starting day",
      detail: "Connecting your goals to a small set you can actually try.",
    };
  }
  if (leased.job.kind === "day_highlight") return null;
  if (leased.job.kind === "global_message") {
    return null;
  }
  if (leased.job.kind === "global_refresh") {
    return {
      title: userMessageRequestsResearch(leased.context.sourceMessage?.body || "") ? "Checking the details" : "Pulling this together",
      detail: "Reviewing your activities and deciding what should change.",
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
  const replyFirst = leased.job.kind === "user_message" || leased.job.kind === "global_message";
  await requestAppJson("/api/agent/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "complete",
      jobId: leased.job.id,
      leaseToken: leased.job.leaseToken,
      runtimeSessionId,
      response: agentResult.message,
      onboardingProposal: agentResult.onboardingProposal,
      workspaceFollowup: agentResult.workspaceFollowup,
      requestPlan: agentResult.requestPlan,
      handledOutcomes: agentResult.handledOutcomes,
      recordActions: replyFirst ? [] : agentResult.recordActions,
      workspaceActions: replyFirst ? [] : agentResult.workspaceActions,
      activityMoves: replyFirst ? [] : agentResult.activityMoves,
      activityWorkRequests: replyFirst ? [] : agentResult.activityWorkRequests,
      captureActions: replyFirst ? [] : agentResult.captureActions,
      followUpActions: replyFirst ? [] : agentResult.followUpActions,
      followUpQuestion: replyFirst ? null : agentResult.followUpQuestion,
      scheduleActions: replyFirst ? [] : agentResult.scheduleActions,
      scheduleProposal: replyFirst ? null : agentResult.scheduleProposal,
      occurrenceActions: replyFirst ? [] : agentResult.occurrenceActions,
      localDate: leased.context.localDate,
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
  const researchEvidence = (leased.job.kind === "workspace_refresh" || leased.job.kind === "global_refresh") && userMessageRequestsResearch(sourceMessage)
    ? await researchEvidenceForMessage(sourceMessage)
    : null;
  const route = modelRoute(leased);
  const prompt = assertPromptBudget(eventPrompt(leased, { researchEvidence }), leased.job.kind);
  const result = await requestJson(`${hermesUrl}/api/sessions/${encodeURIComponent(sessionId)}/chat`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: prompt,
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

export { eventPrompt, globalInstructions, globalMessageInstructions, lunaInstructions, parseAgentResult };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
