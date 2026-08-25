import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { eventPrompt, parseAgentResult } from "../bridge/ideal-day-bridge.mjs";

const RETINOL_REQUEST = "I just got this today. https://plainleaf.example/products/retinol-night-serum Can you check how I'm supposed to use vitamin A like this and add it to my skin routine based on what you learn";

function globalJob(kind) {
  return {
    job: { kind },
    context: {
      scope: "global",
      localDate: "2026-08-24",
      timeZone: "America/Phoenix",
      routine: { revision: 4 },
      settings: {},
      activities: [{ id: "activity-skin", title: "Skin routine", category: "Care" }],
      activityKnowledge: [{
        id: "activity-skin",
        title: "Skin routine",
        category: "Care",
        records: [{ key: "castile-soap", type: "product", title: "Castile Soap" }],
        workspaces: [],
      }],
      variants: [],
      patterns: [],
      today: [],
      pendingProposals: [],
      recentMessages: [],
      sourceMessage: { body: RETINOL_REQUEST },
    },
  };
}

test("global Luna acknowledges first, then coordinates researched activity work", () => {
  const immediate = eventPrompt(globalJob("global_message"));
  assert.match(immediate, /Respond immediately and naturally/);
  assert.match(immediate, /set workspaceFollowup:true/);
  assert.doesNotMatch(immediate, /Fetched source evidence/);

  const durable = eventPrompt(globalJob("global_refresh"), {
    researchEvidence: "Official product directions: apply a few drops in the evening and use sun protection.",
  });
  assert.match(durable, /Whole-day activity knowledge/);
  assert.match(durable, /activity-skin/);
  assert.match(durable, /Fetched source evidence/);
  assert.match(durable, /few drops in the evening/);
  assert.match(durable, /add it to my skin routine/);
});

test("the coordinator result carries a bounded typed activity handoff", () => {
  const result = parseAgentResult(JSON.stringify({
    message: null,
    workspaceFollowup: false,
    recordActions: [],
    workspaceActions: [],
    activityMoves: [],
    activityWorkRequests: [{
      activityId: "activity-skin",
      instruction: "Add the researched retinol product and safe manufacturer directions to Skin routine.",
    }],
    captureActions: [],
    followUpActions: [],
    followUpQuestion: null,
    scheduleActions: [],
    scheduleProposal: null,
    occurrenceActions: [],
    dayHighlight: null,
  }));
  assert.deepEqual(result.activityWorkRequests, [{
    activityId: "activity-skin",
    instruction: "Add the researched retinol product and safe manufacturer directions to Skin routine.",
  }]);
});

test("the app validates coordinator destinations and queues an activity-scoped compiler", async () => {
  const route = await readFile(new URL("../app/api/agent/jobs/route.ts", import.meta.url), "utf8");
  assert.match(route, /validateActivityWorkRequests/);
  assert.match(route, /ownedActivityIds\.has\(activityId\)/);
  assert.match(route, /'global_refresh'/);
  assert.match(route, /'activity', \?, \?, 'workspace_refresh'/);
  assert.match(route, /delegation_instruction/);
  assert.match(route, /const finalResponse = activityWorkRequests\.length \? ""/);
});

test("root receipts can open long delegated artifact IDs and transition into their activity", async () => {
  const [lunaRoute, activityRoute, agentStore, drawer, page] = await Promise.all([
    readFile(new URL("../app/api/luna/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/activity/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/global-luna.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(lunaRoute, /artifactId\.trim\(\)\.slice\(0, 1024\)/);
  assert.match(activityRoute, /artifactId\.trim\(\)\.slice\(0, 1024\)/);
  assert.match(drawer, /global-luna-typing/);
  assert.doesNotMatch(drawer, /global-luna-working/);
  assert.match(drawer, /Opening…/);
  assert.match(drawer, /getBoundingClientRect\(\)/);
  assert.match(agentStore, /activity\.client_key AS activityClientKey/);
  assert.match(drawer, /activityClientKey: artifact\.activityClientKey/);
  assert.match(page, /candidate\.activityId === target\.activityClientKey/);
  assert.match(page, /openActivity\(item\.id, origin\)/);
});
