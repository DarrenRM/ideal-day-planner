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
  assert.match(html, /<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"\/>/i);
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"\/>/i);
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"\/>/i);
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"[^>]*\/>/i);
  assert.match(html, /id="page-title">[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)<\/h1>/);
  assert.match(html, /Loading your saved day/);
  assert.doesNotMatch(html, /Walk in sun|Stretch \/ yoga|>Shake<|>Breakfast</);
  assert.match(html, /Drag an activity to reorder/);
  assert.doesNotMatch(html, /Adjust minutes on any block/);
  assert.match(html, /class="app-shell is-checklist-mode"/);
  assert.match(html, /aria-label="Open settings"/);
  assert.match(html, />\+<\/span> Add<\/button>/);
  assert.doesNotMatch(html, /Reset order/);
  assert.match(html, /aria-label="Idealized day schedule"/);
  assert.doesNotMatch(html, /Mobility · breathe and open up/);
  assert.doesNotMatch(html, /Move Stretch \/ yoga up/);
  assert.doesNotMatch(html, />Week</);
  assert.doesNotMatch(html, /Primary navigation/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|SkeletonPreview/i);
  assert.doesNotMatch(html, /__variable_geist|_vinext_fonts/i);
});

test("supports an installed iOS app without resizing the assistant dock", async () => {
  const [layout, css, manifestText] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.match(layout, /viewport-fit=cover/);
  assert.match(layout, /statusBarStyle:\s*"black-translucent"/);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /apple-touch-icon\.png/);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.background_color, "#0a0c0f");
  assert.match(css, /--conversation-dock-height:\s*58px/);
  assert.match(css, /\.global-luna-dock[^}]*min-height:\s*58px[^}]*padding:\s*0 16px/);
  assert.doesNotMatch(css, /--conversation-dock-height:[^;]*safe-area-inset-bottom/);
});

test("uses one shared, direct-import Phosphor icon system", async () => {
  const surfacePaths = [
    "../app/activity-duration-control.tsx",
    "../app/activity-presentation.ts",
    "../app/activity-record-components.tsx",
    "../app/activity-workspace.tsx",
    "../app/components/component-library-page.tsx",
    "../app/global-luna.tsx",
    "../app/luna-demo/page.tsx",
    "../app/occurrence-editor.tsx",
    "../app/page.tsx",
    "../app/schedule-manager.tsx",
    "../app/streak-track.tsx",
    "../app/testing/page.tsx",
  ];
  const [packageText, icons, ...surfaces] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/icons.ts", import.meta.url), "utf8"),
    ...surfacePaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.equal(packageJson.dependencies["@phosphor-icons/react"], "^2.1.10");
  assert.equal(packageJson.dependencies["lucide-react"], undefined);
  assert.match(icons, /@phosphor-icons\/react\/dist\/csr\/Heart/);
  assert.ok((icons.match(/@phosphor-icons\/react\/dist\/csr\//g) ?? []).length > 40);
  assert.doesNotMatch(surfaces.join("\n"), /lucide-react/);
});

test("keeps the routine data and interactions in the page", async () => {
  const [page, workspace, drawer, css, durationControl, activityPresentation, workReceipt] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/use-mobile-conversation-drawer.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-duration-control.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-presentation.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/conversation-work-receipt.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /localStorage/);
  assert.match(page, /\/api\/day\?date=/);
  assert.match(page, /needsImport/);
  assert.match(page, /method: "PUT"/);
  assert.doesNotMatch(page, /saveTodayAsTemplate|Save today as default template/);
  const dayRoute = await readFile(new URL("../app/api/day/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(dayRoute, /save-template/);
  assert.match(dayRoute, /restore-template/);
  assert.match(dayRoute, /queueDayHighlightIfNeeded/);
  assert.match(page, /<ScheduleManager/);
  assert.match(page, /className="planner-menu-trigger"[\s\S]*?<MoreVertical/);
  assert.doesNotMatch(page, /planner-menu-label/);
  assert.doesNotMatch(page, /MoreHorizontal/);
  assert.match(page, /\/api\/occurrences/);
  assert.match(page, /MIGRATION_KEY/);
  assert.match(page, /useState<RoutineItem\[\]>\(\[\]\)/);
  assert.match(page, /hasLoaded \? <>[\s\S]*displayedScheduledItems\.map/);
  assert.match(page, /<DayHighlights/);
  assert.doesNotMatch(page, /daily-list-heading[\s\S]{0,220}<small>/);
  assert.match(page, /Keep it going/);
  assert.match(page, /<h3 id="go-further-title">More for today<\/h3>/);
  assert.match(page, /Still going strong\? Here are some stretch goals\./);
  assert.doesNotMatch(page, /<h3 id="go-further-title">Go Further<\/h3>/);
  assert.match(page, /More to choose from/);
  assert.ok(page.indexOf('className="keep-going-heading"') < page.indexOf('className={`go-further'), "Keep it going should precede Go Further");
  assert.match(page, /promoteExtra/);
  assert.match(page, /mode: "set-role"/);
  assert.match(page, /GO_FURTHER_PREVIEW_LIMIT/);
  assert.match(css, /\.go-further-option \{[^}]*min-height: 52px;/);
  assert.match(css, /\.keep-going-heading \{[^}]*text-transform: uppercase/);
  assert.doesNotMatch(css, /\.keep-going-option/);
  assert.doesNotMatch(page, /Build on what worked last time/);
  assert.match(page, /completedItems\.length > 1 \? <span[^>]*className=\{`day-highlights-count/);
  assert.match(css, /\.day-highlights\.is-single \.day-highlights-overview \{ grid-template-columns: minmax\(0, 1fr\) 38px 14px; \}/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.day-highlights-overview \{[^}]*min-height: 86px;/);
  assert.match(page, /draggable/);
  assert.match(page, /onDrop/);
  assert.match(page, /DropTarget/);
  assert.match(page, /adjustDuration/);
  assert.match(page, /Math\.floor\(item\.duration \/ DURATION_STEP\)/);
  assert.match(page, /Math\.ceil\(item\.duration \/ DURATION_STEP\)/);
  assert.match(page, /setDuration/);
  assert.match(durationControl, /onBlur=\{\(\) => onSet\(normalizeActivityDuration\(item\.duration\)\)\}/);
  assert.match(durationControl, /Length for .* in minutes/);
  assert.doesNotMatch(page, /resetOrder/);
  assert.match(page, /addItem/);
  assert.match(page, /normalizeActivityDuration/);
  assert.match(durationControl, /Math\.round\(duration \/ DURATION_STEP\) \* DURATION_STEP/);
  assert.match(page, /id="block-duration"[\s\S]*?min="5"[\s\S]*?step="5"/);
  assert.match(page, /custom-/);
  assert.match(activityPresentation, /CATEGORY_OPTIONS: ActivityCategory\[\].*Recharge.*Logistics.*Creativity.*Spirit/s);
  assert.match(activityPresentation, /type ActivityCategory = .*Recharge.*Spirit/);
  assert.match(page, /normalizeCategory/);
  assert.match(page, /CategoryPicker/);
  assert.match(page, /ChevronDown/);
  assert.match(activityPresentation, /Logistics: \{ icon:/);
  assert.match(activityPresentation, /Creativity: \{ icon:/);
  assert.match(page, /requestRemoveItem\(item\)/);
  assert.match(page, /DELETED_KEY/);
  assert.doesNotMatch(page, /setDeletedDefaultIds/);
  assert.match(page, /startEditing/);
  assert.match(page, /saveEdit/);
  assert.match(page, /handleOutsidePointerDown/);
  assert.match(page, /closest\("\.inline-edit-form"\)/);
  assert.match(page, /id=\{`activity-title-edit-\$\{item\.id\}`\}/);
  assert.match(page, /ActivityWorkbench/);
  assert.match(page, /function formatTodayHeading/);
  assert.match(page, /formatDayOrdinal/);
  assert.match(page, /function MobileDateHeading/);
  assert.match(page, /mobile-date-month/);
  assert.match(page, /mobile-date-primary/);
  assert.match(page, /mobile-date-weekday/);
  assert.match(page, /mobile-date-number/);
  assert.match(css, /\.mobile-date-lockup[^}]*grid-template-columns: max-content 1px/);
  assert.match(css, /\.planner-header:has\(\.mobile-date-lockup\) \.planner-actions[^}]*position: static/);
  assert.match(css, /\.mobile-date-month[^}]*text-transform: uppercase/);
  assert.match(css, /\.mobile-date-weekday[^}]*color: var\(--text\)/);
  assert.match(page, /ActivityWorkspace/);
  assert.match(page, /workspaceWorkState/);
  assert.match(page, /activeJobHasWorker/);
  assert.match(page, /activeJob\.status !== "retryable_failure"/);
  assert.match(page, /activeJob\.status === "leased" \|\| activeJob\.status === "running"/);
  assert.match(page, /hasWorkspaceJob/);
  assert.match(page, /<ConversationWorkReceipt/);
  assert.match(workReceipt, /conversation-work-receipt/);
  assert.match(workReceipt, /conversation-work-receipt-entry/);
  assert.match(workReceipt, /conversation-work-receipt-action/);
  assert.match(workReceipt, /conversation-work-receipt-meta/);
  assert.doesNotMatch(workReceipt, /conversation-work-receipt-check/);
  assert.match(workReceipt, /subject_move: "Activity moved"/);
  assert.match(workReceipt, /<strong>\{WORK_RECEIPT_LABELS\[artifact\.kind\]\}<\/strong>/);
  assert.match(workReceipt, /conversation-work-receipt-detail">\{artifact\.title\}/);
  assert.doesNotMatch(workReceipt, /conversation-work-receipt-detail">\{artifact\.detail\}/);
  assert.match(css, /\.conversation-work-receipt-entry \{[^}]*flex: 0 0 auto;/);
  assert.match(css, /\.conversation-work-receipt \{[^}]*grid-template-columns: 58px minmax\(0, 1fr\) 62px;/);
  assert.match(css, /\.conversation-work-receipt-icon \{[^}]*align-self: center;[^}]*justify-self: center;/);
  assert.match(css, /\.conversation-work-receipt-detail \{[^}]*-webkit-line-clamp: 2;/);
  assert.match(css, /\.conversation-work-receipt-action \{[^}]*align-self: stretch;[^}]*border-left:/);
  assert.match(css, /\.conversation-work-receipt-meta \{[^}]*justify-content: flex-start;[^}]*margin: 4px 3px 0;/);
  assert.match(css, /\.global-luna-message time, \.global-luna-scroll \.conversation-work-receipt-meta \{[^}]*font-size: var\(--type-body\);[^}]*line-height: var\(--leading-body\);/);
  assert.match(page, /mode: "view_artifact"/);
  assert.doesNotMatch(page, /workspaceReadyLabel/);
  assert.match(page, /useMobileConversationDrawer/);
  assert.match(page, /conversation-unread-badge/);
  assert.match(page, /isOpeningActivity = connectionState === "joining" \|\| !conversationDrawer\.isPreferenceReady/);
  assert.match(page, /activity-opening-state/);
  assert.match(page, /Getting things ready…/);
  assert.match(page, /openConversationOnMount/);
  assert.match(page, /showEmptyState=\{showEmptyWorkspace\}/);
  assert.match(page, /preferConversation: showEmptyWorkspace/);
  assert.doesNotMatch(page, /disabled=\{!showWorkspace\}/);
  assert.match(page, /setStartConversationActivityId\(launchedItems\.find/);
  assert.match(drawer, /idealized-day-mobile-drawer-v2/);
  assert.match(drawer, /resolveMobileDrawerInitialOpen/);
  assert.match(drawer, /contentReady/);
  assert.match(drawer, /hasConversationJob/);
  assert.match(drawer, /explicitOpenRef/);
  assert.match(drawer, /function readPreference/);
  assert.match(drawer, /function savePreference/);
  assert.match(drawer, /function handlePointerDown/);
  assert.match(drawer, /function handlePointerUp/);
  assert.match(drawer, /const isOpen = canCollapse \? preferredOpen : true/);
  assert.match(drawer, /isPreferenceReady/);
  assert.match(page, /if \(clockCurrentItem\) setDismissedClockActivityId\(clockCurrentItem\.id\)/);
  assert.match(page, /Notes &amp; Assistant/);
  assert.doesNotMatch(page, /conversation-status/);
  assert.match(page, /conversationAnchorTopRef/);
  assert.match(page, /useLayoutEffect/);
  assert.match(page, /scheduleRefresh\(Boolean\(state\.activeJob\)\)/);
  assert.doesNotMatch(page, /breakfastDisplayContext|MOCK_ACTIVITY_CONTEXT|workspaceInputs/);
  assert.doesNotMatch(page, /breakfastPrototypeReply|Prototype Luna|Luna offline/);
  assert.match(page, /Talk with Luna about/);
  assert.doesNotMatch(page, /Breakfast is blank right now/);
  assert.match(page, /conversationShouldFollowRef/);
  assert.match(page, /conversationProgrammaticScrollRef/);
  assert.match(page, /scrollConversationToBottom/);
  assert.match(page, /scrollTo\(\{/);
  assert.match(page, /prefers-reduced-motion/);
  assert.match(page, /mode: "open"/);
  assert.match(page, /mode: "message"/);
  assert.match(page, /visitId/);
  assert.match(page, /scheduleRefresh\(Boolean\(state\.activeJob\)\)/);
  assert.match(page, /hasActiveJob \? 700 : 8_000/);
  assert.doesNotMatch(page, /Permanent activity thread/);
  assert.doesNotMatch(page, /Luna is joining/);
  assert.match(page, /agentSurfaceState\(activeJob\?\.kind\)/);
  assert.doesNotMatch(page, /conversationStatusLabel/);
  assert.doesNotMatch(page, /activeJob\?\.kind === "activity_setup" \|\| activeJob\?\.kind === "workspace_refresh"/);
  assert.doesNotMatch(page, /Done — I added oranges to your breakfast list/);
  assert.doesNotMatch(page, /maps cleanly to an approved component/);
  assert.match(page, /Mark Complete/);
  assert.match(page, /Skip for Today/);
  assert.match(page, /Mark incomplete/);
  assert.match(page, /!isComplete \? <button className={`skip-activity-button/);
  assert.match(page, /Start My Day/);
  assert.match(page, /Start Early/);
  assert.match(page, /Day Timeline/);
  assert.match(page, /fetch\("\/api\/settings"/);
  assert.match(page, /dayMode\.showStartGate && hasLoaded && !isDayStarted/);
  assert.match(page, /<DurationControl/);
  assert.match(durationControl, /<div className="duration-control" aria-label={`Length for \$\{item\.title\}`}>/);
  assert.match(page, /Your day is a flexible checklist/);
  assert.match(page, /mode: "start-day"/);
  assert.match(page, /completedBeforeLaunchIds/);
  assert.match(page, /displayedScheduledItems/);
  assert.match(page, /timestampTimeParts/);
  assert.match(page, /consumesScheduleTime/);
  assert.match(page, /mode: "reset-today"/);
  assert.match(page, /Reset Today/);
  assert.match(page, /Your routine and Luna history stay put/);
  assert.match(page, /resetActivityTimingState/);
  assert.match(page, /currentMinutes: displayedMinutes/);
  assert.match(page, /function ControlTooltip/);
  assert.match(page, /role="tooltip"/);
  assert.match(page, /skippedAt/);
  assert.match(page, /item\.skippedAt \? 0 : item\.duration/);
  assert.match(page, /captureActivityTimingSnapshot/);
  assert.match(page, /\/api\/activity\/run/);
  assert.match(page, /Fake time of day/);
  assert.match(page, /Follow clock-selected activity/);
  assert.match(page, /const DEFAULT_DEV_MINUTES = 7 \* 60 \+ 30/);
  assert.match(page, /useState<number \| null>\(DEFAULT_DEV_MINUTES\)/);
  assert.match(page, /idealized-day-dev-time-v1/);
  assert.match(page, /value === null \? "actual" : String\(value\)/);
  assert.match(page, /completedIds/);
  assert.doesNotMatch(page, /COMPLETE_KEY/);
  assert.doesNotMatch(workspace, /Nothing to manage here yet/);
  assert.match(workspace, /Building your \$\{activity\.title\} setup/);
  assert.match(workspace, /orderWorkspaceDisplayItems/);
  assert.match(workspace, /workState\?: "building" \| "waiting" \| null/);
  assert.match(workspace, /hasVisibleWorkspace && !workState && !recordError/);
  assert.match(workspace, /hasUsefulActivityRecordData/);
  assert.match(workspace, /function TimerComponent/);
  assert.match(workspace, /function CountdownComponent/);
  assert.match(workspace, /<StreakTrack/);
  assert.match(workspace, /completedSubjectKeys/);
  assert.match(workspace, /dailyCompletionStreak/);
  assert.match(workspace, /supportsStarterStreak/);
  assert.match(workspace, /Want something else here\?/);
  assert.match(workspace, /onTalkWithLuna/);
  assert.match(workspace, /function RoutineComponent/);
  assert.match(workspace, /ideal-day-timer:/);
  assert.match(workspace, /ideal-day-countdown:/);
  assert.match(workspace, /component\.durationSeconds/);
  assert.match(workspace, /component\.durationSource === "timeline"/);
  assert.match(workspace, /activity\.timelineEnabled/);
  assert.match(workspace, /captureActivityTimingSnapshot/);
  assert.match(workspace, /export function resetActivityTimingState/);
  assert.doesNotMatch(workspace, /RESUPPLY_WORKSPACE|LIFT_WORKSPACE|HAIR_SERUM_WORKSPACE|breakfastWorkspace|Toothpaste|Bench press|Multi-peptide|Oranges|Mock|Preview/);
  assert.doesNotMatch(workspace, /dangerouslySetInnerHTML|\beval\s*\(|new Function/);
  assert.match(css, /--bg: #0a0c0f/);
  assert.match(css, /--type-sans: ui-sans-serif, system-ui/);
  assert.doesNotMatch(css, /--font-geist-/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /\.page-shell:has\(\.routine-card\.is-expanded\).*padding: 0/);
  assert.match(css, /\.routine-card\.is-expanded \{ background: #101416;[^}]*margin: 0;[^}]*padding: 0;[^}]*position: fixed;/);
  assert.match(css, /\.routine-card\.is-expanded \.activity-header-flip \{ min-height: max\(88px, calc\(80px \+ env\(safe-area-inset-top\)\)\); \}/);
  assert.match(css, /\.routine-card\.is-expanded \.activity-header-face \{[^}]*padding: max\(8px, env\(safe-area-inset-top\)\) 12px 8px 16px;/);
  assert.match(css, /\.routine-row:has\(\.routine-card\.is-expanded\) \{ padding: 0; \}/);
  assert.match(page, /type MobileActivityTransition/);
  assert.match(page, /getBoundingClientRect\(\)/);
  assert.match(page, /is-mobile-\$\{transitionGeometry\.phase\}/);
  assert.match(page, /prefers-reduced-motion: reduce/);
  assert.match(css, /@keyframes mobile-activity-open/);
  assert.match(css, /@keyframes mobile-activity-close/);
  assert.match(css, /@keyframes mobile-activity-content-in/);
  assert.match(css, /transform: translate\(var\(--activity-origin-left\), var\(--activity-origin-top\)\)/);
  assert.match(css, /\.routine-card\.is-expanded\.is-mobile-opening \.activity-expansion/);
  assert.match(css, /is-drawer-collapsed/);
  assert.match(css, /--conversation-dock-height: 58px/);
  assert.match(css, /translateY\(calc\(100% - var\(--conversation-dock-height\)\)\)/);
  assert.match(css, /grid-template-rows: minmax\(0, 1fr\) auto var\(--conversation-dock-height\)/);
  assert.match(css, /\.activity-footer \{[^}]*grid-row: 2;[^}]*z-index: 4;/s);
  assert.match(css, /\.activity-conversation \{[^}]*z-index: 10;/s);
  assert.match(page, /className="global-luna-dock"/);
  assert.match(page, /hasLoaded && !expandedActivityId/);
  assert.match(css, /\.luna-shell-trigger \{ display: none; \}/);
  assert.match(css, /\.global-luna-dock \{[^}]*bottom: 0;[^}]*position: fixed;/s);
  assert.match(css, /\.activity-conversation\.has-workspace-peek \{ top: 96px; \}/);
  assert.match(css, /\.activity-conversation\.has-workspace-work-peek \{ top: 112px; \}/);
  assert.match(css, /\.activity-workspace\.workspace-building \{ justify-content: flex-start; padding-top: 12px; \}/);
  assert.match(css, /\.activity-opening-state/);
  assert.match(css, /@keyframes activity-opening-sweep/);
  assert.match(css, /\.message-luna \.message-meta \{ justify-content: flex-start; \}/);
  assert.match(css, /conversation-composer textarea:focus/);
  assert.match(css, /\.drop-indicator/);
  assert.match(page, /className="touch-drop-slot"/);
  assert.match(page, /className="touch-drag-origin-slot"/);
  assert.match(page, /data-drag-group={dragGroupForItem\(item\.id\)}/);
  assert.match(page, /window\.addEventListener\("pointermove", handleWindowPointerMove, \{ passive: false \}\)/);
  assert.match(page, /window\.addEventListener\("pointerup", handleWindowPointerUp, \{ passive: false \}\)/);
  assert.match(page, /mobile browser declines delayed pointer capture/);
  assert.match(css, /\.routine-row\.is-touch-dragging \.routine-card/);
  assert.match(css, /\.touch-drop-slot, \.touch-drag-origin-slot/);
  assert.match(css, /\.duration-control/);
  assert.match(css, /--type-micro: \.6875rem/);
  assert.match(css, /--type-label: \.75rem/);
  assert.match(css, /--type-body: \.875rem/);
  assert.match(css, /--type-body-lg: 1rem/);
  assert.match(css, /\.now-chip, \.category-chip \{[^}]*font-size: var\(--type-micro\);[^}]*font-weight: 590;[^}]*height: 18px;[^}]*letter-spacing: \.055em;[^}]*line-height: 16px;[^}]*padding: 0 6px/s);
  assert.match(css, /\.add-block-form/);
  assert.match(css, /\.planner-menu-popover/);
  assert.match(css, /\.planner-menu-trigger/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.planner-menu-trigger \{ height: 40px; width: 40px; \}/);
  assert.match(css, /\.dev-clock-popover/);
  assert.match(css, /\.settings-trigger/);
  assert.match(css, /\.settings-modal/);
  assert.match(css, /\.settings-toggle-row/);
  assert.match(page, /celebratingActivityId === item\.id \? <span className="completion-sweep"/);
  assert.doesNotMatch(page, /onCompletionIntent/);
  assert.match(page, /function handleCompletionSaved/);
  assert.match(page, /if \(collapseAfterCelebration\) setSelectedActivityId\(id\);[\s\S]*?toggleComplete\(id, completedAt\);[\s\S]*?celebrateCompletion\(id\);/);
  assert.match(page, /function scheduleCompletedActivityPlacement/);
  assert.match(page, /function collapseCompletedActivity/);
  assert.match(page, /mobileActivitySlotRectsRef/);
  assert.match(page, /completionActionRef\.current = action/);
  assert.match(page, /if \(isExpanded && expandedCompletionActionRef\.current\)/);
  assert.match(page, /expandedCompletionActionRef\.current\(\)/);
  assert.match(page, /completionActionRef=\{expandedCompletionActionRef\}/);
  assert.match(page, /captureActivityTimingSnapshot\(workspaceActivity, workspace\)/);
  assert.match(page, /completion-full-view-wash/);
  assert.match(page, /setSettlingCompletedIds/);
  assert.match(page, /}, 560\);/);
  assert.match(page, /duration: 440/);
  assert.match(page, /scheduledItems[\s\S]*?\.find\(\(item\) => item\.id !== excludedId/);
  assert.doesNotMatch(page, /remainingInDayOrder/);
  assert.match(page, /collapseAfterCelebration \? 780 : shouldAnimatePlacement \? 1_080 : 760/);
  assert.match(page, /collapseCompletedActivity\(id, nextId\)/);
  assert.match(page, /visibleItems = scheduledItems\.filter\(\(item\) => !completedIds\.has\(item\.id\)/);
  assert.match(page, /settledCompletedItems/);
  assert.match(css, /@keyframes day-highlight-icon-land/);
  assert.doesNotMatch(css, /\.day-highlight-icon::after/);
  assert.match(css, /\.day-highlights-copy > strong[^}]*text-transform: uppercase/);
  assert.match(css, /\.day-highlights-copy > span[^}]*-webkit-line-clamp: 2/);
  assert.match(css, /\.day-highlights-overview[^}]*min-height: 78px/);
  assert.match(page, /completedItems\.length === 1 \? "is-single"/);
  assert.match(page, /highlight\.body \|\| fallbackDayHighlight/);
  assert.match(page, /\{completedActivities\}\/\{totalSelectedActivities\}/);
  assert.doesNotMatch(page, /day-highlight-thinking/);
  assert.match(page, /const settledEssentialsComplete = activeItemCount > 0 && dayProgress\.essentialResolved >= activeItemCount/);
  assert.match(page, /const dayAchievementReady = settledEssentialsComplete && unfinishedChosenExtras\.length === 0/);
  assert.match(page, /isDayBloom \? "Today complete" : "Completed"/);
  assert.match(page, /firstVisibleChosenExtraId === item\.id \? <h3 className="going-further-heading">Going further<\/h3>/);
  assert.match(page, /Still going strong\? Here are some stretch goals\./);
  assert.match(page, /dayAchievementReady \? <DayVictory isArriving=\{isDayBloom\} skippedEssentials=\{skippedEssentialCount\}/);
  assert.match(page, /setShowAllExtras\(false\)/);
  assert.match(page, /window\.setTimeout\(\(\) => cueNextActivity\(item\.id\), 80\)/);
  assert.match(page, /setExtraPromotionError\(`\$\{item\.title\} wasn’t added\. Try it again\.`\)/);
  assert.match(page, /Today’s achievement/);
  assert.match(page, /The rest of today is yours\./);
  assert.match(page, /type: "deactivate_extra"/);
  assert.match(page, /Return to More for today/);
  assert.match(page, /This removes the activity from today only\. Your routine will not change\./);
  assert.match(page, /className="go-further-add"/);
  assert.match(css, /\.day-victory \{[^}]*min-height: 92px/);
  assert.match(css, /@keyframes day-victory-arrive/);
  assert.match(css, /@keyframes day-highlight-border-trace/);
  assert.match(css, /@keyframes day-highlight-check-flash/);
  assert.match(css, /@keyframes day-highlight-icon-illuminate/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*\.day-highlights\.is-day-bloom/);
  assert.match(page, /function cueNextActivity/);
  assert.match(page, /window\.scrollBy\(\{/);
  assert.match(page, /nextActivityCueId === item\.id \? "is-next-cue"/);
  assert.match(css, /@keyframes completion-gradient-sweep/);
  assert.match(css, /@keyframes completion-full-view-sweep/);
  assert.match(css, /\.routine-card\.is-expanded \.completion-full-view-wash/);
  assert.match(css, /@keyframes next-activity-cue/);
  assert.match(css, /\.routine-row\.is-next-cue \.routine-card:not\(\.is-expanded\)/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*\.completion-sweep::before/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*\.routine-row\.is-next-cue/);
  assert.match(page, /skippingActivityId === item\.id \? <span className="skip-sweep"/);
  assert.match(page, /function beginSkipMotion/);
  assert.match(page, /function handleSkipSaved/);
  assert.match(page, /function collapseSkippedActivity/);
  assert.match(page, /onSkipStart=\{\(\) => beginSkipMotion\(item\.id\)\}/);
  assert.match(page, /handleSkipSaved\(item\.id, result\.skipped[\s\S]*?, false\)/);
  assert.match(page, /onSkip=\{\(skippedAt\) => handleSkipSaved\(item\.id, skippedAt, true\)\}/);
  assert.match(css, /@keyframes skip-gradient-sweep/);
  assert.match(css, /@keyframes skip-icon-settle/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*\.skip-sweep::before/);
  assert.match(css, /\.routine-row\.is-skipped \.routine-card:not\(\.is-expanded\)[^}]*opacity: \.68/);
  assert.match(css, /\.reset-today-button/);
  assert.match(css, /\.dev-reset-confirm/);
  assert.match(css, /\.now-line/);
  assert.match(css, /\.activity-expansion/);
  assert.match(css, /\.activity-workbench-grid/);
  assert.doesNotMatch(page, /Activity context|Live activity/);
  assert.doesNotMatch(workspace, /workspace-header|workspace-version|The useful parts of this activity/);
  assert.match(css, /\.activity-workspace/);
  assert.match(css, /\.workspace-luna-invitation/);
  assert.match(css, /grid-auto-rows: max-content/);
  assert.match(css, /\.record-item-list/);
  assert.match(css, /\.workout-plan/);
  assert.match(css, /\.protocol-steps/);
  assert.match(css, /\.component-request/);
  assert.match(css, /\.activity-workbench-grid\.is-conversation-only/);
  assert.match(css, /\.activity-workspace\.workspace-building/);
  assert.match(css, /\.time-component-display/);
  assert.match(css, /\.streak-step\.is-waiting \.streak-dot/);
  assert.match(css, /@keyframes streak-complete-pop/);
  assert.match(css, /\.routine-component-summary/);
  assert.match(css, /\.prototype-typing/);
  assert.match(css, /\.workspace-working/);
  assert.match(css, /\.activity-conversation/);
  assert.match(css, /\.complete-activity-button/);
  assert.match(css, /\.skip-activity-button/);
  assert.match(css, /\.closed-status-button/);
  assert.match(css, /\.closed-status-button \{[^}]*border: 0;[^}]*height: 24px;[^}]*width: 24px/s);
  assert.match(css, /\.complete-status-button\.is-active \{[^}]*background: transparent;[^}]*color: var\(--accent-bright\)/s);
  assert.match(css, /\.control-tooltip-bubble/);
  assert.match(css, /\.day-launch/);
  assert.match(css, /\.routine-row\.is-past:not\(\.is-current\) \.routine-card:not\(\.is-expanded\)/);
  assert.match(css, /\.category-picker-options/);
  assert.match(css, /\.category-picker-trigger svg/);
  assert.match(css, /\.edit-item-button/);
  assert.doesNotMatch(page, /GripVertical/);
  assert.match(page, /handleActivityPointerDown/);
  assert.match(page, /aria-keyshortcuts="Alt\+ArrowUp Alt\+ArrowDown"/);
  assert.match(page, /Pencil/);
  assert.match(page, /Trash2/);
  assert.match(page, /item-meta/);
  assert.match(css, /\.delete-item-button/);
  assert.match(css, /\.routine-row > \.time-label \{ display: none; \}/);
  assert.match(css, /\.mobile-time-label/);
  assert.match(css, /\.now-chip, \.category-chip .*line-height: 16px; padding: 0 6px/);
  assert.doesNotMatch(css, /\.now-chip[^\n]*padding: 1px 6px 0/);
  assert.match(css, /\.duration-value \{[^}]*min-width: 78px/s);
  assert.match(css, /\.duration-control input \{[^}]*field-sizing: content;[^}]*min-width: 1ch;/s);
  assert.match(css, /\.hero, \.summary-rail \{ display: none; \}/);
  assert.match(css, /--summary-rail-width: 294px/);
  assert.match(css, /\.day-overview \{[^}]*width: var\(--summary-rail-width\)/s);
  assert.match(css, /\.main-grid \{[^}]*grid-template-columns: minmax\(0, 1fr\) var\(--summary-rail-width\)/s);
  assert.match(css, /\.item-copy \{[^}]*grid-template-columns: minmax\(0, 1fr\) 32px 32px/s);
  assert.match(page, /mobile-activity-menu/);
  assert.match(page, /activity-header-flip-inner/);
  assert.match(page, /activity-header-face activity-header-front/);
  assert.match(page, /activity-header-face activity-header-back inline-edit-form/);
  assert.match(page, /className="front-duration-label"><span className="front-duration-value">\{item\.duration\}<\/span><span className="front-duration-unit">minutes<\/span>/);
  assert.match(page, /className="activity-edit-trigger"/);
  assert.match(page, /className="activity-back-duration"/);
  assert.match(page, /className=\{`activity-back-skip/);
  assert.match(page, /aria-label="Save and return"/);
  assert.match(page, /Dev reset activity/);
  assert.match(page, /fetch\("\/api\/activity\/reset"/);
  assert.match(page, /More options for/);
  assert.match(page, /Edit activity/);
  assert.match(page, /<span>\{isSkipped \? "Restore" : "Skip"\}<\/span>/);
  assert.match(page, /mobile-day-nav/);
  assert.match(page, /function PastDayReview/);
  assert.match(page, /View previous day/);
  assert.match(page, /View next day/);
  assert.match(page, /isReviewingPastDay \? "Earlier" : "Yesterday"/);
  assert.match(page, /mobile-day-nav-today/);
  assert.match(page, /refreshHighlight: false/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.app-header \{ display: none; \}/s);
  assert.match(css, /\.mobile-day-nav \{[^}]*display: flex;[^}]*gap: 14px/s);
  assert.match(css, /\.planner-actions \{[^}]*align-self: center;[^}]*margin-top: 0/s);
  assert.match(page, /mobile-schedule-title/);
  assert.match(page, /formatDuration\(totalMinutes\).*total/s);
  assert.match(activityPresentation, /function activityIconFor/);
  assert.match(activityPresentation, /CATEGORY_ICONS: Record<ActivityCategory, AppIcon>/);
  assert.match(page, /"--item-color": CATEGORY_META\[item\.category\]\.color/);
  assert.match(page, /const ItemIcon = isSkipped \? SkipForward : isComplete \? Check : ActivityIcon/);
  assert.match(page, /className=\{`activity-title-icon \$\{itemIconState\}`\}/);
  assert.match(css, /\.activity-title-icon\.is-complete \{ color: var\(--accent-bright\); \}/);
  assert.match(css, /\.activity-title-icon\.is-skipped \{ color: #7d8782; \}/);
  assert.doesNotMatch(page, /className="complete-chip"/);
  assert.doesNotMatch(page, /className="skipped-chip"/);
  assert.doesNotMatch(page, /className="item-icon"/);
  assert.doesNotMatch(css, /\.drag-button/);
  assert.match(page, /className="mobile-top-meta">\s*<ActivityAgenda item=\{item\}/s);
  assert.match(page, /aria-label=\{`\$\{statusLabel\}: \$\{actionLabel\}`\}/);
  assert.match(page, /className="activity-agenda-dot"/);
  assert.doesNotMatch(page, /className="activity-agenda-status"/);
  assert.match(css, /\.item-title \{[^}]*grid-column: 1;[^}]*padding-right: 0/s);
  assert.match(css, /\.mobile-top-meta \{[^}]*display: flex;[^}]*grid-column: 1 \/ 4;[^}]*grid-row: 2;[^}]*max-width: min\(55%, 180px\)/s);
  assert.match(css, /\.item-meta \{ display: none; \}/);
  assert.match(css, /\.item-state \{ display: none; \}/);
  assert.match(css, /\.item-controls \{[^}]*grid-column: 1 \/ -1;[^}]*grid-row: 1 \/ 3/s);
  assert.match(css, /\.item-controls \{[^}]*grid-template-columns: minmax\(0, 1fr\) 32px 32px/s);
  assert.match(css, /\.activity-edit-done \{[^}]*grid-column: 2;[^}]*grid-row: 1/s);
  assert.match(css, /\.activity-header-back > \.mobile-activity-menu \{[^}]*grid-column: 3;[^}]*grid-row: 1/s);
  assert.match(css, /\.item-controls > \.control-tooltip \{[^}]*grid-column: 3;[^}]*grid-row: 1/s);
  assert.match(css, /\.front-duration-label \{[^}]*grid-column: 1;[^}]*grid-row: 2/s);
  assert.match(css, /\.activity-edit-trigger \{[^}]*grid-column: 2;[^}]*grid-row: 1/s);
  assert.match(css, /\.activity-header-back\.inline-edit-form \{[^}]*grid-template-columns: minmax\(0, 1fr\) 32px 32px;[^}]*grid-template-rows: 32px 32px/s);
  assert.match(css, /\.activity-back-duration \{[^}]*grid-column: 1;[^}]*grid-row: 2/s);
  assert.match(css, /\.activity-back-skip \{[^}]*grid-column: 2 \/ 4;[^}]*grid-row: 2/s);
  assert.match(css, /\.duration-inline-meta \{[^}]*margin-left: auto;/);
  assert.match(css, /\.routine-card\.is-expanded \.collapse-activity-button \{ display: none; \}/);
  assert.match(css, /\.activity-footer-tools \{ display: none; \}/);
  assert.match(css, /\.now-line span \{ font-size: var\(--type-micro\); justify-self: start; \}/);
  assert.match(css, /\.routine-card\.is-expanded \{[^}]*overflow: hidden;[^}]*padding-left: 0;[^}]*padding-right: 0/s);
  assert.match(css, /\.routine-card\.is-expanded \.activity-header-face \{[^}]*border-bottom: 0;[^}]*box-shadow: inset 0 -1px #293033;[^}]*padding:/s);
  assert.match(css, /\.routine-card\.is-expanded \.item-copy \{[^}]*background: transparent;[^}]*padding: 0/s);
  assert.match(css, /\.activity-expansion \{[^}]*grid-row: 2;[^}]*height: 100%;[^}]*margin: 0/s);
  assert.match(css, /\.control-tooltip-bubble \{ display: none; \}/);
  assert.match(css, /\.planner \{[^}]*background: transparent;[^}]*border: 0;[^}]*box-shadow: none;[^}]*overflow: visible/s);
  assert.match(css, /\.planner-help \{ display: none; \}/);
  assert.match(css, /\.schedule \{ padding: 8px 0 16px; \}/);
  assert.match(css, /\.routine-card\.is-editing \.activity-header-front \{[^}]*opacity: 0;[^}]*transform: scaleY\(\.04\)/s);
  assert.match(css, /\.routine-card\.is-editing \.activity-header-back \{[^}]*opacity: 1;[^}]*transform: scaleY\(1\)/s);
  assert.match(css, /\.duration-control \{[^}]*justify-self: start;[^}]*width: auto/s);
  assert.match(css, /\.duration-control button \{[^}]*border: 1px solid #2c3336;[^}]*height: 32px;[^}]*width: 32px/s);
  assert.match(css, /\.inline-edit-form/);
  assert.match(css, /\.schedule-loading-row/);
  assert.match(css, /\.message-bubble,[\s\S]*?font-size: var\(--type-body\);[\s\S]*?line-height: var\(--leading-body\);/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?input,[\s\S]*?font-size: var\(--type-body-lg\);[\s\S]*?line-height: var\(--leading-body-lg\);/);
  for (const declaration of css.matchAll(/(?:font-size|font)\s*:\s*([^;]+)/g)) {
    const pixels = declaration[1].match(/(\d+(?:\.\d+)?)px/);
    if (pixels) assert.ok(Number(pixels[1]) >= 11, `found sub-11px type: ${declaration[0]}`);
  }
});

test("keeps universal scheduling behind typed, auditable boundaries", async () => {
  const [model, store, scheduleRoute, occurrenceRoute, occurrenceActions, proposalService, lunaRoute, manager, page, css, migration] = await Promise.all([
    readFile(new URL("../app/schedule-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/schedule-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/schedule/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/occurrences/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/schedule-actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/schedule-proposal-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/luna/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/schedule-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0011_faulty_human_robot.sql", import.meta.url), "utf8"),
  ]);

  assert.match(model, /type ScheduleCadence/);
  assert.match(model, /type: "set_activity"/);
  assert.match(store, /INSERT OR IGNORE INTO daily_plan_items/);
  assert.match(store, /occurrenceKey/);
  assert.match(store, /previous\.schedule_pattern_step_id = dpi\.schedule_pattern_step_id/);
  assert.match(store, /previous\.source_date < dpi\.source_date/);
  assert.match(store, /SET activated_at = COALESCE\(activated_at, CURRENT_TIMESTAMP\)/);
  assert.match(store, /previous\.completed_at IS NOT NULL/);
  assert.match(store, /dueStepsByActivity/);
  assert.match(store, /record_type = 'recurring_step'/);
  assert.match(store, /AND activity_id IN/);
  assert.doesNotMatch(page, /dueStepLabel/);
  assert.doesNotMatch(css, /due-step-chip/);
  assert.match(scheduleRoute, /includeArchived: true/);
  assert.match(scheduleRoute, /record\.record_type = 'recurring_step'/);
  assert.match(scheduleRoute, /recurringStepRepresentsParentActivity/);
  assert.match(scheduleRoute, /nestedScheduledSteps/);
  assert.match(scheduleRoute, /mode === "restore"/);
  assert.match(occurrenceRoute, /applyOccurrenceAction/);
  assert.match(occurrenceActions, /parseOccurrenceAction/);
  assert.match(occurrenceActions, /action\.status === "completed"[\s\S]*plan_role = 'extra'[\s\S]*COALESCE\(activated_at, CURRENT_TIMESTAMP\)/);
  assert.match(proposalService, /schedule_action_events/);
  assert.match(proposalService, /stale_revision/);
  assert.match(proposalService, /unresolvedPlanRoleStatements/);
  assert.match(proposalService, /AND plan_role <> \?/);
  assert.match(proposalService, /completed_at IS NULL AND skipped_at IS NULL AND removed_at IS NULL/);
  assert.ok(
    proposalService.indexOf("unresolvedPlanRoleStatements(db, action.patternId, pattern)")
      < proposalService.indexOf('patternStatements(db, userId, routine.id, action.patternId, "", pattern, "replace"'),
    "dated role snapshots must update before replacement removes their original step ids",
  );
  assert.match(lunaRoute, /ensureGlobalConversation/);
  assert.match(manager, /Manage routine/);
  assert.match(manager, /Your plan/);
  assert.match(manager, /essentialActivityCount/);
  assert.match(manager, /in All Activities/);
  assert.match(manager, /Adjust with Luna/);
  assert.match(manager, /openPlanSection/);
  assert.match(manager, /routine-plan-accordions/);
  assert.match(manager, /Essentials/);
  assert.match(manager, /All Activities/);
  assert.doesNotMatch(manager, /Core set/);
  assert.doesNotMatch(manager, /Activity library/);
  assert.match(manager, /Custom days & rotations/);
  assert.match(manager, /No custom activity days or rotations yet/);
  assert.match(manager, /Within activities/);
  assert.match(manager, /Scheduled steps/);
  assert.match(manager, /nestedScheduledSteps/);
  assert.match(manager, /routine-rule-upcoming/);
  assert.match(manager, /Upcoming ·/);
  assert.match(manager, /Help me adjust a scheduled step/);
  assert.match(manager, /routine-nested-step/);
  assert.match(manager, /scheduled \$\{data\.nestedScheduledSteps\.length === 1 \? "step" : "steps"\}/);
  assert.doesNotMatch(manager, /Weekly steps within an activity still live inside that activity/);
  assert.doesNotMatch(manager, /Daily activities/);
  assert.match(manager, /routine-rule-menu[\s\S]*routine-rule-disclosure/);
  assert.match(css, /\.routine-rule-menu \{[^}]*display: flex;[^}]*align-items: center;[^}]*flex: 0 0 40px;[^}]*justify-content: center/s);
  assert.match(css, /\.routine-plan-accordions \{/);
  assert.match(css, /\.routine-plan-toggle\[aria-expanded="true"\] > span svg/);
  assert.match(css, /\.routine-rule-disclosure \{[^}]*flex: 0 0 40px/s);
  assert.match(css, /\.routine-rule-copy small\.routine-rule-upcoming \{[^}]*color: var\(--accent\)/s);
  assert.match(css, /\.routine-nested-step::before/);
  assert.match(manager, /Future routine/);
  assert.match(manager, /Advanced options/);
  assert.match(manager, /Pause future days/);
  assert.match(manager, /Restore to routine/);
  assert.match(manager, /Starts with/);
  assert.match(manager, /Begins/);
  assert.match(migration, /INSERT INTO `schedule_patterns`/);
  assert.match(migration, /DROP INDEX `activity_runs_user_activity_date_unique`/);
  assert.match(migration, /CREATE UNIQUE INDEX `daily_plan_items_plan_occurrence_key_unique`/);
});

test("schedule proposals preserve historical step identities when updating a rule", async () => {
  const service = await readFile(new URL("../app/api/schedule-proposal-service.ts", import.meta.url), "utf8");
  assert.doesNotMatch(service, /DELETE FROM schedule_pattern_steps WHERE pattern_id/);
  assert.match(service, /UPDATE schedule_pattern_steps[\s\S]*WHERE id = \? AND pattern_id = \?/);
  assert.match(service, /changes the structure of an existing schedule/);
});

test("applies explicit one-activity cadence changes without fake typing or hidden failures", async () => {
  const [jobRoute, agentStore, scheduleActions, bridge, surface, page] = await Promise.all([
    readFile(new URL("../app/api/agent/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/schedule-actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/ideal-day-bridge.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/agent-surface-state.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(jobRoute, /applyDirectScheduleAction/);
  assert.match(jobRoute, /direct-schedule:\$\{job\.id\}/);
  assert.match(scheduleActions, /Number\(pattern\.stepCount\) !== 1/);
  assert.match(scheduleActions, /action_type, action_json, source, actor, idempotency_key/);
  assert.match(agentStore, /'workspace_refresh', 'variant_setup', 'follow_up', 'global_message', 'global_refresh'/);
  assert.match(agentStore, /Luna couldn’t update the schedule/);
  assert.match(bridge, /DirectScheduleAction/);
  assert.match(bridge, /Reviewing your activities and deciding what should change/);
  assert.match(surface, /kind === "workspace_refresh" \|\| kind === "variant_setup" \|\| kind === "global_refresh"/);
  assert.match(page, /scheduleSummary=\{scheduleSummary\}/);
});

test("keeps Luna, setup blueprints, runs, and workspace writes behind durable typed boundaries", async () => {
  const [schema, activityRoute, resetActivityRoute, runRoute, dayRoute, settingsRoute, jobRoute, store, workspaceModel, bridge, startup, watchdog, watchdogLauncher, taskInstaller, agents, productSpec, smartFlowGuide, packageJson] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/activity/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/activity/reset/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/activity/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/day/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/settings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/ideal-day-bridge.mjs", import.meta.url), "utf8"),
    readFile(new URL("../bridge/start-ideal-day.ps1", import.meta.url), "utf8"),
    readFile(new URL("../bridge/watch-ideal-day.ps1", import.meta.url), "utf8"),
    readFile(new URL("../bridge/watch-ideal-day.vbs", import.meta.url), "utf8"),
    readFile(new URL("../bridge/install-ideal-day-task.ps1", import.meta.url), "utf8"),
    readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
    readFile(new URL("../PRODUCT_SPEC.md", import.meta.url), "utf8"),
    readFile(new URL("../SMART_FLOW_USER_TESTING.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /export const conversations/);
  assert.match(schema, /export const conversationMessages/);
  assert.match(schema, /export const conversationArtifacts/);
  assert.match(schema, /export const activityVisits/);
  assert.match(schema, /contextJson/);
  assert.match(schema, /export const agentJobs/);
  assert.match(schema, /idempotencyKey/);
  assert.match(schema, /export const agentSessionBindings/);
  assert.match(schema, /export const agentWorkers/);
  assert.match(schema, /export const activityWorkspaces/);
  assert.match(schema, /export const workspaceRevisions/);
  assert.match(schema, /export const activityProfiles/);
  assert.match(schema, /export const activityRuns/);
  assert.match(schema, /dayTimelineEnabled/);
  assert.match(schema, /export const activityRecords/);
  assert.match(schema, /export const activityRecordRevisions/);
  assert.match(schema, /export const recordRelations/);
  assert.match(schema, /startedAt: text\("started_at"\)/);
  assert.match(schema, /skippedAt: text\("skipped_at"\)/);
  assert.doesNotMatch(activityRoute, /OPENING_COOLDOWN_MS|Math\.floor\(Date\.now/);
  assert.match(activityRoute, /INSERT OR IGNORE INTO activity_visits/);
  assert.doesNotMatch(activityRoute, /'activity_opened'/);
  assert.doesNotMatch(activityRoute, /queueActivitySetup/);
  assert.match(activityRoute, /safeActivityContext/);
  assert.match(activityRoute, /mode === "view_artifact"/);
  assert.match(resetActivityRoute, /requestIdentity/);
  assert.match(resetActivityRoute, /findActivity\(userId, activityKey\)/);
  assert.match(resetActivityRoute, /DELETE FROM activity_records WHERE user_id = \? AND activity_id = \?/);
  assert.match(resetActivityRoute, /DELETE FROM conversations WHERE user_id = \? AND activity_id = \?/);
  assert.match(resetActivityRoute, /queueActivitySetup\(userId, activity\)/);
  assert.match(runRoute, /INSERT INTO activity_runs/);
  assert.match(runRoute, /actual_elapsed_seconds/);
  assert.match(runRoute, /allotted_duration_seconds/);
  assert.match(runRoute, /planned_duration_seconds/);
  assert.match(runRoute, /dayTimelineEnabled \? dayItem\.duration \* 60 : null/);
  assert.match(runRoute, /UPDATE daily_plan_items SET completed_at/);
  assert.match(runRoute, /mode === "skip" \|\| mode === "unskip"/);
  assert.match(runRoute, /skipped_at/);
  assert.match(dayRoute, /mode === "start-day"/);
  assert.match(dayRoute, /mode === "reset-today"/);
  assert.match(dayRoute, /started_at = NULL/);
  assert.match(dayRoute, /status = 'planned'/);
  assert.match(dayRoute, /started_at = CURRENT_TIMESTAMP/);
  assert.match(dayRoute, /preferredStartMinutes/);
  assert.match(dayRoute, /dayTimelineEnabled/);
  assert.match(settingsRoute, /UPDATE settings/);
  assert.match(settingsRoute, /day_timeline_enabled/);
  assert.match(dayRoute, /prepareActivitySetups/);
  assert.match(dayRoute, /readResolvedDay/);
  assert.match(jobRoute, /lease_expires_at/);
  assert.match(jobRoute, /status = 'retryable_failure' AND updated_at < datetime\('now', '-1 minute'\)/);
  assert.match(jobRoute, /request\.headers\.get\("origin"\)/);
  assert.match(jobRoute, /IDEAL_DAY_BRIDGE_TOKEN/);
  assert.match(jobRoute, /INSERT INTO agent_workers/);
  assert.match(jobRoute, /mode === "heartbeat"/);
  assert.match(jobRoute, /mode === "progress"/);
  assert.match(jobRoute, /progress_title/);
  assert.match(jobRoute, /highlightSource\.body\.trim\(\)\.slice\(0, 80\)/);
  assert.match(jobRoute, /completed\?\.count \?\? 0\) >= 5/);
  assert.match(jobRoute, /CASE kind WHEN 'user_message' THEN 0 WHEN 'global_message' THEN 0 WHEN 'global_refresh' THEN 1 WHEN 'day_highlight' THEN 2 ELSE 3 END/);
  assert.match(jobRoute, /ORDER BY created_at DESC/);
  assert.match(jobRoute, /Could not release an incomplete agent lease/);
  assert.match(jobRoute, /activityContext/);
  assert.match(jobRoute, /INSERT OR IGNORE INTO conversation_messages/);
  assert.match(jobRoute, /INSERT OR IGNORE INTO conversation_artifacts/);
  assert.match(jobRoute, /activityWorkReceipt/);
  assert.match(jobRoute, /scheduleWorkReceipt/);
  assert.match(jobRoute, /validateWorkspaceActions/);
  assert.match(jobRoute, /validateRecordActions/);
  assert.match(jobRoute, /persistRecordActions/);
  assert.match(jobRoute, /persistWorkspaceActions/);
  assert.match(jobRoute, /workspaceFollowup/);
  assert.match(jobRoute, /usesReplyFirstProtocol/);
  assert.match(jobRoute, /usesReplyFirstProtocol \? \[\] : payload\.workspaceActions/);
  assert.match(jobRoute, /'workspace_refresh'/);
  assert.match(store, /SELECT plan_date AS planDate, status, completed_at AS completedAt/);
  assert.match(jobRoute, /workspace-refresh:\$\{job\.id\}/);
  assert.match(jobRoute, /hermes-activity-blueprint-v2/);
  assert.match(jobRoute, /completeActivitySetup/);
  assert.match(jobRoute, /markActivitySetupAnswered/);
  assert.match(jobRoute, /const response = job\.kind === "workspace_refresh"/);
  assert.match(jobRoute, /messageRequestsResearch\(sourceMessage\?\.body\) \? suppliedResponse : workspaceClarification/);
  assert.match(store, /requestIdentity/);
  assert.match(store, /request-identity/);
  assert.match(bridge, /profiles", "ideal-day"/);
  assert.match(bridge, /readHermesKey/);
  assert.match(bridge, /Title already in use by session/);
  assert.match(bridge, /IDEAL_DAY_SITES_BYPASS_TOKEN/);
  assert.match(bridge, /OAI-Sites-Authorization/);
  assert.match(store, /persistWorkspaceActions/);
  assert.match(store, /persistRecordActions/);
  assert.match(store, /applyUserRecordMutation/);
  assert.match(store, /queueActivitySetup/);
  assert.match(store, /setup_status = 'preparing'/);
  assert.match(workspaceModel, /type: "timer"/);
  assert.match(workspaceModel, /type: "countdown"/);
  assert.match(workspaceModel, /type: "routine"/);
  assert.match(workspaceModel, /defaultCountdownSeconds/);
  assert.match(workspaceModel, /durationSource/);
  assert.match(bridge, /This is a silent editorial review/);
  assert.match(bridge, /Choose one dominant fact in this order/);
  assert.match(bridge, /at most 10 words and 64 characters/);
  assert.match(bridge, /Five or more completions qualifies/);
  assert.match(bridge, /compactDayHighlightBody/);
  assert.match(bridge, /Cardio without a described form\/goal/);
  assert.match(bridge, /Day Timeline/);
  assert.match(bridge, /five-minute chin-up visualization/);
  assert.match(bridge, /Never default them for supplements/);
  assert.match(bridge, /workspaceActions/);
  assert.match(bridge, /recordActions/);
  assert.match(bridge, /activityMoves/);
  assert.match(bridge, /workspaceFollowup/);
  assert.match(bridge, /const replyFirst = leased\.job\.kind === "user_message"/);
  assert.match(bridge, /recordActions: replyFirst \? \[\] : agentResult\.recordActions/);
  assert.match(bridge, /activityMoves: replyFirst \? \[\] : agentResult\.activityMoves/);
  assert.match(bridge, /parseAgentResult/);
  assert.match(bridge, /jsonrepair/);
  assert.match(bridge, /researchEvidenceForMessage/);
  assert.match(bridge, /sendHeartbeat/);
  assert.match(bridge, /function visibleProgress/);
  assert.match(bridge, /mode: "progress"/);
  assert.match(bridge, /runJobWithHeartbeat/);
  assert.match(bridge, /heartbeatIntervalMs = 5_000/);
  assert.match(bridge, /activity-blueprint-v3/);
  assert.match(bridge, /runtimeSessionId\(leased\.job\)/);
  assert.doesNotMatch(bridge, /existingSessionId \|\|/);
  assert.match(bridge, /This is the fast conversational pass/);
  assert.match(bridge, /Answer direct questions naturally/);
  assert.match(bridge, /Never research in this pass or pretend research is complete/);
  assert.match(bridge, /When fetched source evidence is supplied/);
  assert.match(bridge, /No durable activity records yet/);
  assert.match(bridge, /Suggested starting recipe/);
  assert.doesNotMatch(bridge, /api[_-]?key\s*=\s*["'][A-Za-z0-9_-]{20,}/i);
  assert.match(startup, /Start-Process[\s\S]*-WindowStyle Hidden/);
  assert.match(startup, /Import-Clixml/);
  assert.match(startup, /bridge-worker\.err\.log/);
  assert.match(watchdog, /ideal-day-bridge\\\.mjs/);
  assert.match(watchdog, /if \(\$bridgeRunning\) \{ exit 0 \}/);
  assert.match(watchdog, /Start-Process[\s\S]*-WindowStyle Hidden/);
  assert.match(watchdogLauncher, /watch-ideal-day\.ps1/);
  assert.match(watchdogLauncher, /shell\.Run command, 0, False/);
  assert.match(taskInstaller, /watch-ideal-day\.vbs/);
  assert.match(taskInstaller, /wscript\.exe/);
  assert.match(taskInstaller, /RepetitionInterval \(New-TimeSpan -Minutes 5\)/);
  assert.match(taskInstaller, /MultipleInstances IgnoreNew/);
  assert.match(taskInstaller, /-Hidden/);
  assert.match(agents, /Production data source of truth/);
  assert.match(agents, /Terra low \+ standard tier for durable record\/workspace compilation/);
  assert.match(agents, /activityMoves/);
  assert.match(agents, /Ideal Day Hermes Bridge/);
  assert.match(agents, /Never run a bare `git push` to `sites`/);
  assert.match(productSpec, /Opening an activity is a deterministic UI event/);
  assert.match(productSpec, /ordinary opens enqueue no conversational agent job/);
  assert.match(productSpec, /Activity creation is the primary workspace-design moment/);
  assert.match(productSpec, /actual elapsed time remains unknown/);
  assert.match(productSpec, /count-up timers, and countdowns/);
  assert.match(productSpec, /Timers and countdowns are ordinary optional components/);
  assert.match(smartFlowGuide, /Question product semantics, not only visual polish/);
  assert.match(smartFlowGuide, /Does an activity-level component remain when the activity is reopened and on future days/);
  assert.match(packageJson, /"bridge": "node bridge\/ideal-day-bridge\.mjs"/);
});
