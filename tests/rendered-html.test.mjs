import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the idealized day planner", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Idealized day<\/title>/i);
  assert.match(html, /id="page-title">[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)<\/h1>/);
  assert.match(html, /Loading your saved day/);
  assert.doesNotMatch(html, /Walk in sun|Stretch \/ yoga|>Shake<|>Breakfast</);
  assert.match(html, /Drag a handle to reorder/);
  assert.match(html, /Adjust minutes on any block/);
  assert.match(html, /Add Activity/);
  assert.doesNotMatch(html, /Reset order/);
  assert.match(html, /aria-label="Idealized day schedule"/);
  assert.doesNotMatch(html, /Mobility · breathe and open up/);
  assert.doesNotMatch(html, /Move Stretch \/ yoga up/);
  assert.doesNotMatch(html, />Week</);
  assert.doesNotMatch(html, /Primary navigation/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|SkeletonPreview/i);
  assert.doesNotMatch(html, /__variable_geist|_vinext_fonts/i);
});

test("keeps the routine data and interactions in the page", async () => {
  const [page, workspace, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /localStorage/);
  assert.match(page, /\/api\/day\?date=/);
  assert.match(page, /needsImport/);
  assert.match(page, /method: "PUT"/);
  assert.match(page, /saveTodayAsTemplate/);
  assert.match(page, /Save today as default template/);
  assert.match(await readFile(new URL("../app/api/day/route.ts", import.meta.url), "utf8"), /save-template/);
  assert.match(await readFile(new URL("../app/api/day/route.ts", import.meta.url), "utf8"), /restore-template/);
  assert.match(page, /MIGRATION_KEY/);
  assert.match(page, /useState<RoutineItem\[\]>\(\[\]\)/);
  assert.match(page, /hasLoaded \? <>\{scheduledItems\.map/);
  assert.match(page, /draggable/);
  assert.match(page, /onDrop/);
  assert.match(page, /DropTarget/);
  assert.match(page, /adjustDuration/);
  assert.match(page, /Math\.floor\(item\.duration \/ DURATION_STEP\)/);
  assert.match(page, /Math\.ceil\(item\.duration \/ DURATION_STEP\)/);
  assert.match(page, /setDuration/);
  assert.match(page, /onBlur=\{\(\) => setDuration\(item\.id, normalizeActivityDuration\(item\.duration\)\)\}/);
  assert.match(page, /Duration for .* in minutes/);
  assert.doesNotMatch(page, /resetOrder/);
  assert.match(page, /addItem/);
  assert.match(page, /normalizeActivityDuration/);
  assert.match(page, /Math\.round\(duration \/ 5\) \* 5/);
  assert.match(page, /id="block-duration"[\s\S]*?min="5"[\s\S]*?step="5"/);
  assert.match(page, /custom-/);
  assert.match(page, /CATEGORY_OPTIONS: Category\[\].*Recharge.*Logistics.*Creativity.*Spirit/s);
  assert.match(page, /type Category = .*Recharge.*Spirit/);
  assert.match(page, /normalizeCategory/);
  assert.match(page, /CategoryPicker/);
  assert.match(page, /ChevronDown/);
  assert.match(page, /Logistics: \{ icon:/);
  assert.match(page, /Creativity: \{ icon:/);
  assert.match(page, /Remove \$\{item\.title\}/);
  assert.match(page, /DELETED_KEY/);
  assert.doesNotMatch(page, /setDeletedDefaultIds/);
  assert.match(page, /startEditing/);
  assert.match(page, /saveEdit/);
  assert.match(page, /handleOutsidePointerDown/);
  assert.match(page, /closest\("\.inline-edit-form"\)/);
  assert.match(page, /Tag for \$\{item\.title\}/);
  assert.match(page, /ActivityWorkbench/);
  assert.match(page, /function formatTodayHeading/);
  assert.match(page, /formatDayOrdinal/);
  assert.match(page, /ActivityWorkspace/);
  assert.doesNotMatch(page, /breakfastDisplayContext|MOCK_ACTIVITY_CONTEXT|workspaceInputs/);
  assert.doesNotMatch(page, /breakfastPrototypeReply|Prototype Luna|Luna offline/);
  assert.match(page, /Talk with Luna about/);
  assert.doesNotMatch(page, /Breakfast is blank right now/);
  assert.match(page, /conversationShouldFollowRef/);
  assert.match(page, /scrollTo\(\{/);
  assert.match(page, /prefers-reduced-motion/);
  assert.match(page, /mode: "open"/);
  assert.match(page, /mode: "message"/);
  assert.match(page, /visitId/);
  assert.match(page, /scheduleRefresh\(Boolean\(state\.activeJob\)\)/);
  assert.match(page, /hasActiveJob \? 700 : 8_000/);
  assert.match(page, /Permanent activity thread/);
  assert.doesNotMatch(page, /Luna is joining/);
  assert.match(page, /activeJob\?\.kind === "user_message"/);
  assert.match(page, /activeJob\?\.kind === "activity_setup"/);
  assert.match(page, /Luna is setting this up/);
  assert.doesNotMatch(page, /Done — I added oranges to your breakfast list/);
  assert.doesNotMatch(page, /maps cleanly to an approved component/);
  assert.match(page, /Live activity/);
  assert.match(page, /Mark Complete/);
  assert.match(page, /captureActivityTimingSnapshot/);
  assert.match(page, /\/api\/activity\/run/);
  assert.match(page, /Fake time of day/);
  assert.match(page, /Follow clock-selected activity/);
  assert.match(page, /completedIds/);
  assert.doesNotMatch(page, /COMPLETE_KEY/);
  assert.match(workspace, /Nothing to manage here yet/);
  assert.match(workspace, /Plans, history, and useful controls/);
  assert.match(workspace, /hasConversation/);
  assert.match(workspace, /function TimerComponent/);
  assert.match(workspace, /function CountdownComponent/);
  assert.match(workspace, /function RoutineComponent/);
  assert.match(workspace, /ideal-day-timer:/);
  assert.match(workspace, /ideal-day-countdown:/);
  assert.match(workspace, /component\.durationSeconds/);
  assert.match(workspace, /component\.durationSource === "activity"/);
  assert.match(workspace, /captureActivityTimingSnapshot/);
  assert.doesNotMatch(workspace, /RESUPPLY_WORKSPACE|LIFT_WORKSPACE|HAIR_SERUM_WORKSPACE|breakfastWorkspace|Toothpaste|Bench press|Multi-peptide|Oranges|Mock|Preview/);
  assert.doesNotMatch(workspace, /dangerouslySetInnerHTML|\beval\s*\(|new Function/);
  assert.match(css, /--bg: #0a0c0f/);
  assert.match(css, /--type-sans: ui-sans-serif, system-ui/);
  assert.doesNotMatch(css, /--font-geist-/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /\.drop-indicator/);
  assert.match(css, /\.duration-control/);
  assert.match(css, /\.add-block-form/);
  assert.match(css, /\.planner-menu-popover/);
  assert.match(css, /\.planner-menu-trigger/);
  assert.match(css, /\.dev-clock-popover/);
  assert.match(css, /\.now-line/);
  assert.match(css, /\.activity-expansion/);
  assert.match(css, /\.activity-workbench-grid/);
  assert.match(css, /\.activity-workspace/);
  assert.match(css, /\.shopping-list/);
  assert.match(css, /\.workout-plan/);
  assert.match(css, /\.protocol-steps/);
  assert.match(css, /\.component-request/);
  assert.match(css, /\.blank-workspace/);
  assert.match(css, /\.time-component-display/);
  assert.match(css, /\.routine-component-summary/);
  assert.match(css, /\.prototype-typing/);
  assert.match(css, /\.activity-conversation/);
  assert.match(css, /\.complete-activity-button/);
  assert.match(css, /\.routine-row\.is-past:not\(\.is-current\) \.routine-card:not\(\.is-expanded\)/);
  assert.match(css, /\.category-picker-options/);
  assert.match(css, /\.category-picker-trigger svg/);
  assert.match(css, /\.edit-item-button/);
  assert.match(page, /GripVertical/);
  assert.match(page, /Pencil/);
  assert.match(page, /Trash2/);
  assert.match(page, /mobile-time-label/);
  assert.match(page, /item-meta/);
  assert.match(css, /\.delete-item-button/);
  assert.match(css, /\.routine-row > \.time-label \{ display: none; \}/);
  assert.match(css, /\.mobile-time-label/);
  assert.match(css, /grid-template-columns: 38px 68px 38px/);
  assert.match(css, /\.hero, \.summary-rail \{ display: none; \}/);
  assert.match(css, /\.item-copy \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/s);
  assert.match(css, /\.drag-button \{[^}]*grid-row: 1 \/ 3;[^}]*justify-self: center/s);
  assert.match(css, /\.item-meta \{[^}]*padding-right: 15px/s);
  assert.match(css, /\.duration-control \{[^}]*grid-column: 2 \/ 4;[^}]*justify-self: start;[^}]*width: auto/s);
  assert.match(css, /\.inline-edit-form/);
  assert.match(css, /\.schedule-loading-row/);
});

test("keeps Luna, setup blueprints, runs, and workspace writes behind durable typed boundaries", async () => {
  const [schema, activityRoute, runRoute, dayRoute, jobRoute, store, workspaceModel, bridge, productSpec, smartFlowGuide, packageJson] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/activity/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/activity/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/day/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/ideal-day-bridge.mjs", import.meta.url), "utf8"),
    readFile(new URL("../PRODUCT_SPEC.md", import.meta.url), "utf8"),
    readFile(new URL("../SMART_FLOW_USER_TESTING.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /export const conversations/);
  assert.match(schema, /export const conversationMessages/);
  assert.match(schema, /export const activityVisits/);
  assert.match(schema, /contextJson/);
  assert.match(schema, /export const agentJobs/);
  assert.match(schema, /idempotencyKey/);
  assert.match(schema, /export const agentSessionBindings/);
  assert.match(schema, /export const activityWorkspaces/);
  assert.match(schema, /export const workspaceRevisions/);
  assert.match(schema, /export const activityProfiles/);
  assert.match(schema, /export const activityRuns/);
  assert.doesNotMatch(activityRoute, /OPENING_COOLDOWN_MS|Math\.floor\(Date\.now/);
  assert.match(activityRoute, /INSERT OR IGNORE INTO activity_visits/);
  assert.doesNotMatch(activityRoute, /'activity_opened'/);
  assert.match(activityRoute, /queueActivitySetup/);
  assert.match(activityRoute, /safeActivityContext/);
  assert.match(runRoute, /INSERT INTO activity_runs/);
  assert.match(runRoute, /actual_elapsed_seconds/);
  assert.match(runRoute, /allotted_duration_seconds/);
  assert.match(runRoute, /planned_duration_seconds/);
  assert.match(runRoute, /UPDATE daily_plan_items SET completed_at/);
  assert.match(dayRoute, /prepareActivitySetups/);
  assert.match(dayRoute, /completed_at AS completedAt/);
  assert.match(jobRoute, /lease_expires_at/);
  assert.match(jobRoute, /request\.headers\.get\("origin"\)/);
  assert.match(jobRoute, /activityContext/);
  assert.match(jobRoute, /INSERT OR IGNORE INTO conversation_messages/);
  assert.match(jobRoute, /validateWorkspaceActions/);
  assert.match(jobRoute, /persistWorkspaceActions/);
  assert.match(jobRoute, /either a Luna response or a workspace change/);
  assert.match(jobRoute, /hermes-activity-blueprint-v2/);
  assert.match(jobRoute, /completeActivitySetup/);
  assert.match(jobRoute, /markActivitySetupAnswered/);
  assert.match(store, /requestIdentity/);
  assert.match(store, /host === "localhost" \|\| host === "127\.0\.0\.1"/);
  assert.match(bridge, /profiles", "ideal-day"/);
  assert.match(bridge, /readHermesKey/);
  assert.match(store, /persistWorkspaceActions/);
  assert.match(store, /queueActivitySetup/);
  assert.match(store, /setup_status = 'preparing'/);
  assert.match(workspaceModel, /type: "timer"/);
  assert.match(workspaceModel, /type: "countdown"/);
  assert.match(workspaceModel, /type: "routine"/);
  assert.match(workspaceModel, /defaultCountdownSeconds/);
  assert.match(workspaceModel, /durationSource/);
  assert.match(bridge, /Activity-setup behavior/);
  assert.match(bridge, /Cardio with no user-supplied description must ask/);
  assert.match(bridge, /Ordinary opens are silent and do not redesign the workspace/);
  assert.match(bridge, /workspaceActions/);
  assert.match(bridge, /parseAgentResult/);
  assert.match(bridge, /activity-blueprint-v2/);
  assert.match(bridge, /Do not produce greetings, encouragement, routine paraphrases/);
  assert.match(bridge, /A pure note can be handled with actions and message:null/);
  assert.match(bridge, /No routine details, goals, or history are documented/);
  assert.doesNotMatch(bridge, /api[_-]?key\s*=\s*["'][A-Za-z0-9_-]{20,}/i);
  assert.match(productSpec, /Opening an activity is a deterministic UI event/);
  assert.match(productSpec, /ordinary opens enqueue no conversational agent job/);
  assert.match(productSpec, /Activity creation is the primary workspace-design moment/);
  assert.match(productSpec, /actual elapsed time remains unknown/);
  assert.match(productSpec, /count-up timers, and countdowns/);
  assert.match(smartFlowGuide, /Question product semantics, not only visual polish/);
  assert.match(smartFlowGuide, /Does an activity-level component remain when the activity is reopened and on future days/);
  assert.match(packageJson, /"bridge": "node bridge\/ideal-day-bridge\.mjs"/);
});
