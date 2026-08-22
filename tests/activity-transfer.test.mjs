import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveSubjectMoveRecordKeys, validateActivityMoveActions } from "../app/activity-transfer-model.ts";
import { eventPrompt, parseAgentResult } from "../bridge/ideal-day-bridge.mjs";
import { extractResearchUrls } from "../bridge/source-research.mjs";

test("validates bounded cross-activity subject moves", () => {
  assert.deepEqual(validateActivityMoveActions([{
    op: "move_subject",
    targetActivityId: "activity:hair-routine",
    subjectKey: "beard-roller",
  }], "activity:skin-routine"), [{
    op: "move_subject",
    targetActivityId: "activity:hair-routine",
    subjectKey: "beard-roller",
  }]);
  assert.deepEqual(validateActivityMoveActions([{
    op: "move_subject",
    targetActivityId: "activity:skin-routine",
    subjectKey: "beard-roller",
  }], "activity:skin-routine"), []);
});

test("resolves a complete subject bundle and rejects mixed ownership", () => {
  const resolved = resolveSubjectMoveRecordKeys([
    { key: "beard-roller", subjectKey: "beard-roller", type: "product", data: { kind: "device", name: "Beard roller" } },
    { key: "beard-protocol", subjectKey: "beard-roller", type: "protocol", data: { steps: [{ id: "use", label: "Use it" }] } },
    { key: "beard-history", subjectKey: null, type: "activity_event", data: { entries: [{ id: "today", itemKey: "beard-roller" }] } },
    { key: "shared-history", subjectKey: null, type: "activity_event", data: { entries: [{ id: "one", itemKey: "beard-roller" }, { id: "two", itemKey: "castile-soap" }] } },
    { key: "castile-soap", subjectKey: "castile-soap", type: "product", data: { kind: "product", name: "Castile Soap" } },
  ], "beard-roller");
  assert.deepEqual(resolved.recordKeys, ["beard-roller", "beard-protocol", "beard-history"]);
  assert.deepEqual(resolved.ambiguousRecordKeys, ["shared-history"]);
});

test("the workspace prompt exposes owned move destinations", () => {
  const prompt = eventPrompt({
    job: { kind: "workspace_refresh" },
    context: {
      activity: { title: "Skin routine", category: "care" },
      activities: [
        { id: "activity:skin-routine", title: "Skin routine" },
        { id: "activity:hair-routine", title: "Hair Routine" },
      ],
      records: [],
      recentRuns: [],
      workspace: { document: { version: 1, components: [] } },
      recentMessages: [],
      sourceMessage: { body: "I put this in the wrong spot. Move it to Hair Routine." },
    },
  });
  assert.match(prompt, /activity:hair-routine/);
  assert.match(prompt, /use one move_subject activityMove rooted at its product record/);
});

test("repairs a missing object terminator without rerunning research", () => {
  const parsed = parseAgentResult('{"message":"Saved","workspaceFollowup":false,"recordActions":[{"op":"upsert","record":{"key":"roller","type":"product","title":"Roller","scope":"activity","data":{"kind":"device","name":"Roller","manufacturer":"","variant":"","notes":""}}],"workspaceActions":[],"activityMoves":[],"followUpQuestion":null,"scheduleProposal":null,"occurrenceActions":[],"dayHighlight":null}');
  assert.equal(parsed.message, "Saved");
  assert.equal(parsed.recordActions.length, 1);
});

test("extracts unique public research links from the triggering message", () => {
  assert.deepEqual(extractResearchUrls("See https://example.com/item, then https://example.com/item."), ["https://example.com/item"]);
});

test("later writes keep the durable id of a record that moved activities", async () => {
  const store = await readFile(new URL("../app/api/agent-store.ts", import.meta.url), "utf8");
  assert.match(store, /SELECT id, version,[^\n]+FROM activity_records/);
  assert.match(store, /const persistedRecordId = current\?\.id \?\? recordId/);
  assert.match(store, /revisionId, persistedRecordId, nextVersion/);
});
