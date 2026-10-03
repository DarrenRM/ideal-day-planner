import assert from "node:assert/strict";
import test from "node:test";
import { acknowledgementResult, compactRecentRuns, eventPrompt } from "../bridge/ideal-day-bridge.mjs";

test("large completion snapshots cannot crowd editable Face Care records out of a work packet", () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    id: `run-${i}`, planDate: `2026-09-${String(30 - i).padStart(2, "0")}`,
    status: "completed", actualElapsedSeconds: 300,
    detailsJson: JSON.stringify({
      completedSubjectKeys: ["cleanser"],
      recordVersions: Array.from({ length: 40 }, (_, n) => ({ id: `long-activity-record-id-${"x".repeat(70)}-${n}`, key: `record-${n}`, version: 131 })),
    }),
  }));
  const records = [{ key: "face-care-choices", type: "daily_selection", data: {
    kind: "routine", items: [{ id: "cleanser", label: "Existing cleanser" }],
    entries: Array.from({ length: 60 }, (_, i) => ({ id: `selection-${i}`, date: "2026-09-30", itemIds: ["cleanser"], itemSnapshots: [{ id: "cleanser", label: "Existing cleanser", detail: "x".repeat(150) }] })),
  }}];
  assert.ok(JSON.stringify(history).length > 60_000);
  const prompt = eventPrompt({ job: { kind: "workspace_refresh" }, context: {
    activity: { title: "Face Care", category: "Care" }, records, recentRuns: history,
    sourceMessage: { body: "Add Fernhill as another cleanser option" },
  } });
  assert.ok(prompt.length < 60_000);
  assert.ok(prompt.includes(JSON.stringify(records)), "editable roster and all dated snapshots stay complete");
  assert.match(prompt, /Add Fernhill/);
  assert.doesNotMatch(prompt, /recordVersions/);
  const projected = JSON.parse(compactRecentRuns(history));
  assert.ok(projected.items.length > 0);
  assert.equal(projected.items.length + projected.omitted, history.length);
  assert.equal(projected.items[0].actualElapsedSeconds, 300);
});

test("run projection uses corrected subject attribution and tolerates malformed old snapshots", () => {
  const projected = JSON.parse(compactRecentRuns([
    { id: "corrected", detailsJson: JSON.stringify({ completedSubjectKeys: ["old"], correctedSubjectKeys: [], timingSource: "workspace" }) },
    { id: "legacy", detailsJson: "broken" },
  ]));
  assert.deepEqual(projected.items[0].details.completedSubjectKeys, []);
  assert.equal(projected.items[0].details.timingSource, "workspace");
  assert.equal(projected.items[1].id, "legacy");
});

test("state-free global acknowledgement cannot invent an access limitation or success", () => {
  const result = { message: "I can’t add that here.", requestPlan: { kind: "durable_work", outcomes: ["Add cleanser"], outcomeKinds: ["work"] }, workspaceFollowup: true };
  const leased = { job: { kind: "global_message" }, context: {} };
  const normalized = acknowledgementResult(leased, result);
  assert.equal(normalized.message, "I’ll check and handle this update to your routine.");
  assert.deepEqual(normalized.requestPlan, result.requestPlan);
  assert.equal(normalized.workspaceFollowup, true);
  assert.equal(acknowledgementResult({ ...leased, context: { sourceActivity: { id: "face" } } }, result).message, null);
  const conversation = { message: "You’re welcome!", requestPlan: { kind: "conversation", outcomes: [] } };
  assert.equal(acknowledgementResult(leased, conversation), conversation);
  assert.equal(acknowledgementResult({ job: { kind: "workspace_refresh" }, context: {} }, result), result);
});
