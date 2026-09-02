import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateRecordActions } from "../app/activity-record-model.ts";

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
