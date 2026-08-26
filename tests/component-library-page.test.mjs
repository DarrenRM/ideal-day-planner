import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { COMPONENT_CATALOG } from "../bridge/component-catalog.mjs";
import { buildComponentLibraryFixtures, COMPONENT_SPECIMENS } from "../app/components/component-library-fixtures.ts";

test("the component workbench covers every production primitive plus the retained routine", () => {
  const catalogTypes = COMPONENT_CATALOG.map(([type]) => type);
  const specimenTypes = COMPONENT_SPECIMENS.map((entry) => entry.type);
  const catalogSpecimens = COMPONENT_SPECIMENS.filter((entry) => entry.layer === "record-backed" || entry.layer === "workspace-only").map((entry) => entry.type);
  assert.deepEqual(catalogSpecimens.sort(), [...catalogTypes].sort());
  assert.equal(specimenTypes.filter((type) => type === "routine").length, 1);
  assert.equal(new Set(specimenTypes).size, specimenTypes.length);
});

test("the workbench includes every app-owned activity workspace surface without duplicating presentation states", () => {
  const types = new Set(COMPONENT_SPECIMENS.map((entry) => entry.type));
  for (const type of ["activity_streak", "activity_schedule", "activity_follow_up", "product_action_tabs", "workspace_working", "workspace_empty", "workspace_invitation"]) {
    assert.ok(types.has(type), `${type} is missing from the workbench`);
  }
  assert.equal(COMPONENT_SPECIMENS.filter((entry) => entry.type === "session_choice").length, 1);
});

test("every record-backed specimen has hydrated mock data and valid links", () => {
  const fixtures = buildComponentLibraryFixtures("2026-08-25");
  const keys = new Set(fixtures.records.map((record) => record.key));
  for (const specimen of COMPONENT_SPECIMENS.filter((entry) => entry.layer === "record-backed")) {
    assert.ok(specimen.recordKey && keys.has(specimen.recordKey), `${specimen.type} is missing its fixture`);
    for (const key of [...(specimen.supportingRecordKeys ?? []), ...(specimen.relatedRecordKeys ?? [])]) {
      assert.ok(keys.has(key), `${specimen.type} points to missing fixture ${key}`);
    }
  }
  assert.ok(fixtures.timer.title);
  assert.ok(fixtures.countdown.durationSeconds > 0);
  assert.ok(fixtures.routine.steps?.length);
  assert.ok(fixtures.scheduleSummary.upcoming.length);
  assert.equal(fixtures.followUp.status, "pending");
  assert.ok(fixtures.productWorkspace.components.length >= 3);
});

test("the workbench is Sites-only and uses the production renderers", async () => {
  const [route, client, workspace, usage] = await Promise.all([
    readFile(new URL("../app/components/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/component-library-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/component-usage.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /VERCEL_GATEWAY_PRINCIPAL_HEADER/);
  assert.match(route, /redirect\("\/"\)/);
  assert.match(route, /COMPONENT_CATALOG/);
  assert.match(route, /ACTIVITY_RECIPES/);
  assert.match(route, /readComponentUsage\(user\.userId\)/);
  assert.match(client, /<ActivityRecordComponent/);
  assert.match(client, /<TimerComponent/);
  assert.match(client, /<CountdownComponent/);
  assert.match(client, /<RoutineComponent/);
  assert.match(client, /<ActivityScheduleSummaryComponent/);
  assert.match(client, /<ActivityFollowUpComponent/);
  assert.match(client, /<StreakTrack/);
  assert.match(client, /<ActivityWorkspace/);
  assert.match(client, /Session choice state/);
  assert.match(client, />Choosing</);
  assert.match(client, />Selected</);
  assert.match(client, /Selection map/);
  assert.match(client, /data-width={previewWidth}/);
  assert.ok(client.indexOf(">Good fits<") < client.indexOf(">Used on<"));
  assert.ok(client.indexOf(">Used on<") < client.indexOf(">Hierarchy<"));
  assert.match(client, /Not currently used by an activity/);
  assert.match(workspace, /export function TimerComponent/);
  assert.match(workspace, /export function CountdownComponent/);
  assert.match(workspace, /export function RoutineComponent/);
  assert.match(workspace, /export function ActivityScheduleSummaryComponent/);
  assert.match(workspace, /export function ActivityFollowUpComponent/);
  assert.match(workspace, /export function WorkspaceWorkingComponent/);
  assert.match(workspace, /export function WorkspaceEmptyGuidance/);
  assert.match(workspace, /export function WorkspaceLunaInvitation/);
  assert.match(usage, /JOIN activity_workspaces/);
  assert.match(usage, /JOIN activity_follow_ups/);
  assert.match(usage, /JOIN schedule_patterns/);
  assert.match(usage, /hasUsefulActivityRecordData/);
  assert.match(usage, /siblingRecordTypes/);
  assert.doesNotMatch(usage, /session_choice_compact/);
  assert.match(usage, /product_action_tabs/);
});
