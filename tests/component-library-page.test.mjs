import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { COMPONENT_CATALOG } from "../bridge/component-catalog.mjs";
import { buildComponentLibraryFixtures, COMPONENT_SPECIMENS } from "../app/components/component-library-fixtures.ts";

test("the component workbench covers every production primitive plus the retained routine", () => {
  const catalogTypes = COMPONENT_CATALOG.map(([type]) => type);
  const specimenTypes = COMPONENT_SPECIMENS.map((entry) => entry.type);
  assert.deepEqual(specimenTypes.filter((type) => type !== "routine").sort(), [...catalogTypes].sort());
  assert.equal(specimenTypes.filter((type) => type === "routine").length, 1);
  assert.equal(new Set(specimenTypes).size, specimenTypes.length);
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
});

test("the workbench is Sites-only and uses the production renderers", async () => {
  const [route, client, workspace] = await Promise.all([
    readFile(new URL("../app/components/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/component-library-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-workspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /VERCEL_GATEWAY_PRINCIPAL_HEADER/);
  assert.match(route, /redirect\("\/"\)/);
  assert.match(route, /COMPONENT_CATALOG/);
  assert.match(route, /ACTIVITY_RECIPES/);
  assert.match(client, /<ActivityRecordComponent/);
  assert.match(client, /<TimerComponent/);
  assert.match(client, /<CountdownComponent/);
  assert.match(client, /<RoutineComponent/);
  assert.match(client, /Selection map/);
  assert.match(client, /data-width={previewWidth}/);
  assert.match(workspace, /export function TimerComponent/);
  assert.match(workspace, /export function CountdownComponent/);
  assert.match(workspace, /export function RoutineComponent/);
});
