import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { validateRecordActions } from "../app/activity-record-model.ts";
import { configureSelectionModes, mergeDailySelectionData, selectionItemUsed, selectionItemLabel, withSelectionForDate } from "../app/daily-selection-model.ts";

test("mode configuration is atomic, preserves history, and safely retries lost responses", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--experimental-sqlite", fileURLToPath(new URL("./fixtures/routine-modes-sqlite.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(result.status, 0, (result.stderr || result.stdout).slice(-6000));
});

test("mode configuration preserves unlabelled history and independent counts/cadence", () => {
  const original = { kind: "routine", items: [{ id: "mask", label: "Light mask", subjectKey: "device", allowMultiple: true }], entries: [{ id: "old", date: "2026-09-03", itemIds: ["mask"], counts: { mask: 2 } }] };
  const modes = [{ id: "red", label: "Red" }, { id: "green", label: "Green" }, { id: "amber", label: "Amber" }];
  const configured = configureSelectionModes(original, "mask", modes);
  assert.deepEqual(configured.entries, original.entries);
  assert.equal(original.items.length, 1);
  assert.deepEqual(configureSelectionModes(configured, "mask", modes), configured);
  const used = withSelectionForDate(configured, "2026-09-04", ["red", "green"], { red: 2 });
  assert.deepEqual(used.entries[1].itemIds, ["red", "green"], "parent is never added for a child use");
  assert.equal(selectionItemUsed(used, ["red"], "mask"), true);
  assert.equal(selectionItemUsed(used, ["red"], "green"), false);
  assert.equal(selectionItemUsed(used, ["mask"], "red"), false, "old unspecified use does not satisfy a color cadence");
  assert.equal(selectionItemLabel(used, "red"), "Light mask — Red");
  assert.equal(selectionItemLabel(used, "mask"), "Light mask — mode not recorded");
  const adjusted = mergeDailySelectionData(used, { kind: "routine", items: [{ id: "red", label: "Red setting" }], entries: [] });
  assert.equal(adjusted.items.find((item) => item.id === "red").parentItemId, "mask");
  assert.deepEqual(adjusted.entries, used.entries);
  assert.throws(() => configureSelectionModes(configured, "red", modes), /routine item/);
  assert.throws(() => configureSelectionModes(configured, "mask", [{ id: "mask", label: "Red" }]), /unique stable/);
  assert.throws(() => configureSelectionModes(configured, "mask", [modes[0], modes[0]]), /unique stable/);
});

test("roster validation rejects orphaned, recursive, and cross-subject mode groups", () => {
  const validate = (items) => validateRecordActions([{ op: "upsert", record: { key: "choices", type: "daily_selection", title: "Choices", data: { kind: "routine", items, entries: [] } } }]);
  const root = { id: "mask", label: "Mask", subjectKey: "device" };
  const child = { id: "red", label: "Red", parentItemId: "mask", subjectKey: "device", allowMultiple: true };
  assert.equal(validate([root, child])[0].record.data.items[1].parentItemId, "mask");
  for (const invalid of [[child], [root, { ...child, subjectKey: "another-device" }], [root, child, { ...child, id: "nested", parentItemId: "red" }], [root, { ...child, parentItemId: "red" }], [root, child, child]]) {
    assert.equal(validate(invalid).length, 0);
  }
});

test("a variable routine replaces stale product tabs while keeping cadence, repeat controls and product references", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL("./fixtures/variable-routine-render.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(result.status, 0, (result.stderr || result.stdout).slice(-6000));
});

test("validates a variable routine with product ownership, cadence, and repeat counts", () => {
  const [action] = validateRecordActions([{ op: "upsert", record: {
    key: "face-care-daily-choices",
    type: "daily_selection",
    title: "Face care choices",
    scope: "activity",
    data: {
      kind: "routine",
      prompt: "What fits your skin today?",
      items: [
        { id: "retinol", label: "Retinol", subjectKey: "retinol", cadenceRecordKey: "retinol-every-four-days" },
        { id: "mask", label: "LED mask", subjectKey: "mask", allowMultiple: true, unitLabel: "session" },
      ],
      entries: [{ id: "selection-2026-09-02", date: "2026-09-02", itemIds: ["retinol", "mask"], counts: { retinol: 3, mask: 2 } }],
    },
  } }]);

  assert.equal(action.record.data.kind, "routine");
  assert.equal(action.record.data.items[0].cadenceRecordKey, "retinol-every-four-days");
  assert.equal(action.record.data.items[1].allowMultiple, true);
  assert.deepEqual(action.record.data.entries[0].counts, { mask: 2 });
});

test("variable routine mutations synchronize linked cadence and completion ownership", async () => {
  const [store, runRoute, workspace, maintenanceRoute] = await Promise.all([
    readFile(new URL("../app/api/agent-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/activity/run/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/maintenance/variable-routine/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(store, /set_daily_selection_count/);
  assert.match(store, /item\.cadenceRecordKey/);
  assert.match(store, /migrateFaceCareToVariableRoutine/);
  assert.match(runRoute, /selectedSubjectKeys/);
  assert.match(runRoute, /variableSubjectKeys/);
  assert.match(workspace, /record\.type === "daily_selection" \? records/);
  assert.match(maintenanceRoute, /IDEAL_DAY_BRIDGE_TOKEN/);
  assert.match(maintenanceRoute, /face-care-variable-routine-v1/);
});
