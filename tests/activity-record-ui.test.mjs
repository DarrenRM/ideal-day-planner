import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatActivityRecordDate } from "../app/activity-record-format.ts";
import { parseActivityRecord, recurringStepIsDue } from "../app/activity-record-model.ts";
import { compactRecurringTitle, nextRecurringDate, recurringStepScheduleStatus } from "../app/recurring-step-schedule.ts";

test("formats record dates for people without narrow machine-date strings", () => {
  const today = new Date(2026, 7, 20, 12);
  assert.equal(formatActivityRecordDate("2026-08-20", today), "Today");
  assert.equal(formatActivityRecordDate("2026-08-03", today), "Aug 3");
  assert.equal(formatActivityRecordDate("2025-12-31", today), "Dec 31, 2025");
  assert.equal(formatActivityRecordDate("Recently", today), "Recently");
  assert.equal(formatActivityRecordDate(undefined, today), "Recent");
});

test("keeps checklist rows and their checkbox visual in one deliberate control", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /className={`record-item-row/);
  assert.match(component, /aria-pressed={completedToday\(item\)}/);
  assert.match(component, /className="record-item-check"/);
  assert.doesNotMatch(css, /\.generic-checklist button/);
  assert.match(css, /\.record-item-row \{[^}]*min-height: 42px/s);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.record-item-row \{ min-height: 44px; \}/);
});

test("renders daily subset selection, copy, inline add, and derived history as one component", async () => {
  const [component, css, store, dayRoute] = await Promise.all([
    readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/day/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /function DailySelectionRecord/);
  assert.match(component, /Same as yesterday/);
  assert.match(component, /Add supplement/);
  assert.match(component, /Recent days/);
  assert.match(component, /<details className="daily-selection-history">/);
  assert.match(component, /daily-selection-history-entries/);
  assert.match(component, /set_daily_selection/);
  assert.match(css, /\.daily-selection-items > button \{[^}]*min-height: 42px/s);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.daily-selection-items > button \{ min-height: 44px; \}/);
  assert.match(store, /backfillDailySelections/);
  assert.match(store, /migrateLegacyDailySelection/);
  assert.match(dayRoute, /backfillDailySelections/);
});

test("renders concise meal entries with optional collapsed recipe details", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /function MealLogRecord/);
  assert.match(component, /Recipe details/);
  assert.match(component, /meal-log-history/);
  assert.match(component, /mealEntriesForDate/);
  assert.doesNotMatch(component.match(/function MealLogRecord[\s\S]*?\n}/)?.[0] || "", /input|textarea|toggle/);
  assert.match(css, /\.meal-log-entry/);
  assert.match(css, /\.meal-log-details > summary/);
});

test("renders history as its own responsive recap rather than a timeline grid", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /record-history-entry/);
  assert.match(component, /formatActivityRecordDate\(entry\.date\)/);
  assert.match(css, /\.record-history-entry time \{[^}]*white-space: nowrap/s);
  assert.doesNotMatch(css, /\.record-history-list \.timeline-entry/);
});

test("keeps product cards focused on identity instead of generated subfields", async () => {
  const [component, workspace, css] = await Promise.all([
    readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const productRenderer = component.match(/function ProductRecord[\s\S]*?\n}/)?.[0] || "";
  assert.match(productRenderer, /<small className="workspace-overline">\{kindLabel\}<\/small>/);
  assert.doesNotMatch(productRenderer, /usefulFields|record-field-grid/);
  assert.match(productRenderer, /product-supporting-records/);
  assert.match(productRenderer, /<div><small className="workspace-overline">\{kindLabel\}<\/small><strong>\{data\.name\}<\/strong>/);
  assert.match(productRenderer, /<span className="product-mark">/);
  assert.match(component, /eyebrow="Resources"/);
  assert.doesNotMatch(component, /Pinned resources/);
  assert.match(workspace, /nestedSupportingComponents/);
  assert.match(workspace, /record\.subjectKey === product\.key/);
  assert.doesNotMatch(workspace, /productComponents\.length === 1/);
  assert.match(css, /\.product-heading \{[^}]*justify-content: space-between/s);

  const record = parseActivityRecord({
    id: "product-1",
    recordKey: "hair-serum",
    recordType: "product",
    title: "Hair serum",
    scope: "activity",
    scopeDate: null,
    version: 1,
    payloadJson: JSON.stringify({
      kind: "product",
      name: "LL-01",
      manufacturer: "Lumen Lab",
      variant: "Hair serum",
      fields: [{ label: "Use", value: "Daily" }],
    }),
    updatedAt: "2026-08-20T12:00:00Z",
  });
  assert.deepEqual(record?.data, {
    kind: "product",
    name: "LL-01",
    manufacturer: "Lumen Lab",
    variant: "Hair serum",
    notes: "",
  });
});

test("preserves explicit resource ownership at both record and entry level", () => {
  const record = parseActivityRecord({
    id: "resources-1",
    recordKey: "roller-resources",
    subjectKey: "beard-roller",
    recordType: "resources",
    title: "Beard roller resources",
    scope: "activity",
    scopeDate: null,
    version: 1,
    payloadJson: JSON.stringify({
      entries: [{
        id: "official-guide",
        label: "Official guide",
        url: "https://example.com/guide",
        note: "Directions",
        itemKey: "beard-roller",
      }],
    }),
    updatedAt: "2026-08-21T12:00:00Z",
  });
  assert.equal(record?.subjectKey, "beard-roller");
  assert.equal(record?.data.entries[0].itemKey, "beard-roller");
});

test("keeps mobile composer focus from changing footer layout and follows drawer geometry", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(css, /textarea:focus\) \.activity-footer/);
  assert.match(css, /\.activity-expansion\.is-software-keyboard-open \.activity-footer \{ display: none; \}/);
  assert.match(page, /\[isConversationDrawerOpen, scrollConversationToBottom\]/);
  assert.match(page, /window\.visualViewport\?\.addEventListener\("resize"/);
  assert.match(page, /setWorkspaceReadyLabel\(null\)[\s\S]*setIsViewingWorkspace\(false\)/);
});

test("lets the mobile activity row receive bottom-half taps around the duration controls", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.routine-card \.item-controls > \.duration-control \{[^}]*pointer-events: none;/s);
  assert.match(css, /\.routine-card \.item-controls > \.duration-control button \{[^}]*pointer-events: auto;/s);
});

test("renders reusable cadence, equipment, mode, event, and open-workout states", async () => {
  const component = await readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8");
  assert.match(component, /function RecurringStepRecord/);
  assert.match(component, /function ActivityEventRecord/);
  assert.match(component, /function EquipmentRecord/);
  assert.match(component, /function SessionChoiceRecord/);
  assert.match(component, /function SessionLogRecord/);
  assert.match(component, /See all options/);
  assert.match(component, /save_session_log/);
  assert.match(component, /workout-open-choices/);
  assert.match(component, /Planned through/);
  assert.match(component, /equipment-groups/);
});

test("renders measured sessions as a canonical log, recap, and conditional choice flow", async () => {
  const [component, workspace, css, runRoute, dayRoute] = await Promise.all([
    readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/activity/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/day/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /Last session/);
  assert.match(component, /This week/);
  assert.match(component, /Four-week rhythm/);
  assert.match(component, /Machine settings/);
  assert.match(component, /Update session/);
  assert.match(workspace, /measuredSessionItem/);
  assert.match(workspace, /measuredOptionId/);
  assert.match(workspace, /renderMeasuredItem\(measuredChoiceItem, "default"\)/);
  assert.match(workspace, /renderMeasuredItem\(measuredChoiceItem, "compact"\)/);
  assert.match(css, /\.session-log-record input[^}]*height: 40px/s);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.session-log-record input, \.session-log-record form > button \{ min-height: 44px;/s);
  assert.match(runRoute, /save_session_log/);
  assert.match(runRoute, /elapsedSeconds/);
  assert.match(dayRoute, /backfillMeasuredSessionLogs/);
});

test("renders strength plans and dated sets as one specialized workout flow", async () => {
  const [component, workspace, css, store, dayRoute, runRoute, catalog] = await Promise.all([
    readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/day/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/activity/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/component-catalog.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(component, /function StrengthSessionRecord/);
  assert.match(component, /function StrengthWorkoutPhase/);
  assert.match(component, /workoutRecordKey === workout\.key/);
  assert.match(component, /<StrengthWorkoutPhase onMutate=\{onMutate\} record=\{warmup\}/);
  assert.match(component, /!hasLoggedSets && !firstSetReady/);
  assert.match(component, />Exercises</);
  assert.match(component, /Log first set/);
  assert.match(component, /Last time/);
  assert.match(component, /Today’s target/);
  assert.match(component, /log_strength_set/);
  assert.match(component, /remove_strength_set/);
  assert.match(component, /Reps left \(optional\)/);
  assert.match(component, /Recent workouts/);
  assert.match(workspace, /linkedWorkoutKey/);
  assert.match(workspace, /renderStrengthItem/);
  assert.match(css, /\.strength-set-table/);
  assert.match(css, /\.strength-first-session/);
  assert.match(css, /\.strength-first-set-form/);
  assert.match(css, /\.strength-rest/);
  assert.match(store, /backfillStrengthSessions/);
  assert.match(store, /backfillStrengthWorkoutPhases/);
  assert.match(store, /finish_strength_session/);
  assert.match(dayRoute, /backfillStrengthSessions/);
  assert.match(runRoute, /strength-finish:/);
  assert.match(catalog, /Canonical dated strength history/);
});

test("normalizes dated strength sessions without mixing them into the plan", () => {
  const record = parseActivityRecord({
    id: "lift-sessions", recordKey: "strength-session-log", recordType: "strength_session",
    title: "Lift sessions", scope: "activity", scopeDate: null, version: 1,
    payloadJson: JSON.stringify({
      workoutRecordKey: "leg-day",
      sessions: [{
        id: "strength-2026-08-21-leg-day", date: "2026-08-21", workoutTitle: "Leg Day",
        exercises: [{
          id: "performed-lunges", exerciseId: "walking-lunges", name: "Walking lunges",
          sets: [{ id: "set-1", ordinal: 1, type: "working", load: "25 lb", reps: 10, rir: 2, completedAt: "2026-08-21T12:00:00Z" }],
        }],
      }],
    }),
    updatedAt: "2026-08-21T12:00:00Z",
  });
  assert.equal(record?.data.workoutRecordKey, "leg-day");
  assert.equal(record?.data.sessions[0].exercises[0].sets[0].reps, 10);
  assert.equal(record?.data.sessions[0].exercises[0].sets[0].rir, 2);
});

test("normalizes a measured-session record without losing its history", () => {
  const record = parseActivityRecord({
    id: "cardio-log", recordKey: "measured-session-log", recordType: "session_log",
    title: "Cardio sessions", scope: "activity", scopeDate: null, version: 3,
    payloadJson: JSON.stringify({
      choiceRecordKey: "cardio-choice",
      fields: [
        { id: "duration", label: "Duration", input: "number", kind: "duration", unit: "min" },
        { id: "elliptical-level", label: "Level", input: "number", kind: "setting", optionIds: ["elliptical"] },
      ],
      entries: [{
        id: "2026-08-21-elliptical", date: "2026-08-21", optionId: "elliptical",
        values: [{ field: "duration", value: "15" }, { field: "elliptical-level", value: "7" }],
        note: "Felt good", createdAt: "2026-08-21T12:00:00Z",
      }],
    }),
    updatedAt: "2026-08-21T12:00:00Z",
  });
  assert.equal(record?.data.choiceRecordKey, "cardio-choice");
  assert.equal(record?.data.fields.length, 2);
  assert.equal(record?.data.entries[0].values[1].value, "7");
  assert.equal(record?.data.entries[0].note, "Felt good");
});

test("keeps a bounded session choice active through its review date", () => {
  const record = parseActivityRecord({
    id: "cardio-choice", recordKey: "cardio-session-choice", recordType: "session_choice",
    title: "Cardio option", scope: "activity", scopeDate: null, version: 1,
    payloadJson: JSON.stringify({
      prompt: "Choose your cardio machine",
      options: [{ id: "elliptical", label: "Elliptical" }, { id: "bike", label: "Bike" }],
      selections: [{ id: "today", date: "2026-08-21", optionId: "elliptical" }],
      activeSelection: { optionId: "elliptical", startDate: "2026-08-21", endDate: "2026-08-28", reason: "One-week trial" },
    }),
    updatedAt: "2026-08-21T12:00:00Z",
  });
  assert.deepEqual(record?.data.activeSelection, {
    optionId: "elliptical", startDate: "2026-08-21", endDate: "2026-08-28", reason: "One-week trial",
  });
});

test("presents pending check-ins as upcoming commitments rather than date forms", async () => {
  const workspace = await readFile(new URL("../app/activity-workspace.tsx", import.meta.url), "utf8");
  const followUpRenderer = workspace.match(/\{followUps\.map[\s\S]*?\)\)\}/)?.[0] || "";
  assert.match(followUpRenderer, /Upcoming check-in/);
  assert.match(followUpRenderer, /Luna will check back in with you on/);
  assert.match(followUpRenderer, /EllipsisVertical/);
  assert.match(followUpRenderer, /Remove check-in/);
  assert.doesNotMatch(followUpRenderer, /type="date"/);
  assert.doesNotMatch(followUpRenderer, /activity-follow-up-actions/);
});

test("uses one activity-colored overline primitive across workspace components", async () => {
  const [records, workspace, css] = await Promise.all([
    readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(records, /className="workspace-overline">\{eyebrow\}/);
  assert.match(records, /className="workspace-overline">Equipment/);
  assert.match(records, /small className="workspace-overline">\{kindLabel\}/);
  assert.match(workspace, /className="workspace-overline">Streak/);
  assert.match(workspace, /className="workspace-overline">Schedule/);
  assert.match(workspace, /className="workspace-overline">\{followUp\.status/);
  assert.match(css, /\.workspace-overline \{[^}]*color: var\(--item-color\)[^}]*font: 720 var\(--type-micro\)\/var\(--leading-micro\)[^}]*letter-spacing: \.09em[^}]*text-transform: uppercase/s);
  assert.doesNotMatch(css, /\.equipment-heading > div > span \{/);
  assert.doesNotMatch(css, /\.activity-schedule-summary span, \.activity-follow-up-heading span/);
});

test("normalizes recurring substeps and only exposes them on due dates", () => {
  const record = parseActivityRecord({
    id: "roller-step", recordKey: "weekly-roller", recordType: "recurring_step",
    title: "Grooming roller", scope: "activity", scopeDate: null, version: 1,
    payloadJson: JSON.stringify({
      label: "Use the grooming roller", note: "Once weekly", anchorDate: "2026-08-21",
      cadence: { kind: "weekly", every: 1 }, completedDates: ["2026-08-21"],
    }),
    updatedAt: "2026-08-21T12:00:00Z",
  });
  assert.ok(record);
  assert.equal(recurringStepIsDue(record, "2026-08-21"), true);
  assert.equal(recurringStepIsDue(record, "2026-08-22"), false);
  assert.equal(recurringStepIsDue(record, "2026-08-28"), true);
});

test("derives recurring-step history and next due dates from the shared cadence schedule", () => {
  const weekly = { anchorDate: "2026-08-21", cadence: { kind: "weekly", every: 1 }, completedDates: ["2026-08-21"] };
  assert.deepEqual(recurringStepScheduleStatus(weekly, "2026-08-21"), {
    completedToday: true, dueToday: false, lastCompleted: "2026-08-21", nextDue: "2026-08-28",
  });
  assert.deepEqual(recurringStepScheduleStatus({ ...weekly, completedDates: [] }, "2026-08-21"), {
    completedToday: false, dueToday: true, lastCompleted: null, nextDue: "2026-08-21",
  });
  assert.equal(nextRecurringDate("2026-08-21", { kind: "interval_days", every: 3 }, "2026-08-22"), "2026-08-24");
  assert.equal(nextRecurringDate("2026-08-21", { kind: "weekdays", weekdays: [1, 3] }, "2026-08-21"), "2026-08-24");
  assert.equal(compactRecurringTitle("Weekly Beard Grooming Roller", "Weekly"), "Beard Grooming Roller");
});
