import assert from "node:assert/strict";
import test from "node:test";

import { validateActivityMoveActions } from "../app/activity-transfer-model.ts";
import { eventPrompt, parseAgentResult } from "../bridge/ideal-day-bridge.mjs";
import { extractResearchUrls } from "../bridge/source-research.mjs";

test("validates bounded cross-activity record moves", () => {
  assert.deepEqual(validateActivityMoveActions([{
    op: "move_records",
    targetActivityId: "activity:hair-routine",
    recordKeys: ["beard-roller", "beard-roller", "weekly-beard-roller"],
  }], "activity:skin-routine"), [{
    op: "move_records",
    targetActivityId: "activity:hair-routine",
    recordKeys: ["beard-roller", "weekly-beard-roller"],
  }]);
  assert.deepEqual(validateActivityMoveActions([{
    op: "move_records",
    targetActivityId: "activity:skin-routine",
    recordKeys: ["beard-roller"],
  }], "activity:skin-routine"), []);
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
  assert.match(prompt, /use activityMoves instead of recreating it/);
});

test("repairs a missing object terminator without rerunning research", () => {
  const parsed = parseAgentResult('{"message":"Saved","workspaceFollowup":false,"recordActions":[{"op":"upsert","record":{"key":"roller","type":"product","title":"Roller","scope":"activity","data":{"kind":"device","name":"Roller","manufacturer":"","variant":"","notes":""}}],"workspaceActions":[],"activityMoves":[],"followUpQuestion":null,"scheduleProposal":null,"occurrenceActions":[],"dayHighlight":null}');
  assert.equal(parsed.message, "Saved");
  assert.equal(parsed.recordActions.length, 1);
});

test("extracts unique public research links from the triggering message", () => {
  assert.deepEqual(extractResearchUrls("See https://example.com/item, then https://example.com/item."), ["https://example.com/item"]);
});
