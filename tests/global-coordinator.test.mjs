import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { eventPrompt, globalInstructions, globalMessageInstructions, parseAgentResult } from "../bridge/ideal-day-bridge.mjs";

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
      requestPlan: {
        kind: "durable_work",
        outcomes: ["Research the retinol product", "Add it to Skin routine"],
      },
    },
  };
}

test("global Luna acknowledges first, then coordinates researched activity work", () => {
  const immediate = eventPrompt(globalJob("global_message"));
  assert.match(immediate, /Acknowledge the complete latest message/);
  assert.match(immediate, /Latest user message \(primary and complete\)/);
  assert.doesNotMatch(immediate, /Whole-day activity knowledge|Owned activities/);
  assert.doesNotMatch(immediate, /Fetched source evidence/);

  const durable = eventPrompt(globalJob("global_refresh"), {
    researchEvidence: "Official product directions: apply a few drops in the evening and use sun protection.",
  });
  assert.match(durable, /Durable ownership index/);
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
    handledOutcomes: [{ index: 1, via: "activity_work" }],
  }));
  assert.deepEqual(result.activityWorkRequests, [{
    activityId: "activity-skin",
    instruction: "Add the researched retinol product and safe manufacturer directions to Skin routine.",
  }]);
  assert.deepEqual(result.handledOutcomes, [{ index: 1, via: "activity_work" }]);
});

test("the acknowledgement preserves compound intent without receiving the routine dump", () => {
  const result = parseAgentResult(JSON.stringify({
    message: "Sure—I’ll pull up both routines and handle both changes.",
    workspaceFollowup: true,
    requestPlan: {
      kind: "durable_work",
      outcomes: [
        "Move the retinol product from Skin routine to Bed Routine",
        "Make Bed Routine essential",
      ],
    },
  }));
  assert.deepEqual(result.requestPlan, {
    kind: "durable_work",
    outcomes: [
      "Move the retinol product from Skin routine to Bed Routine",
      "Make Bed Routine essential",
    ],
  });
  assert.match(globalMessageInstructions, /acknowledgement pass/);
  assert.match(globalMessageInstructions, /one concise entry for every separate/);
});

test("the coordinator is instructed to preserve every part of a combined request", () => {
  const durable = eventPrompt({
    ...globalJob("global_refresh"),
    context: {
      ...globalJob("global_refresh").context,
      activities: [
        { id: "activity-skin", title: "Skin routine", category: "Care" },
        { id: "activity-bed", title: "Bed Routine", category: "Care" },
      ],
      sourceMessage: {
        body: "Can you move the retinol over to my bed routine and put the bed routine in my essentials list?",
      },
      requestPlan: {
        kind: "durable_work",
        outcomes: ["Move retinol to Bed Routine", "Make Bed Routine essential"],
      },
    },
  });
  assert.match(globalInstructions, /Satisfy every explicit clause/);
  assert.match(globalInstructions, /activityWorkRequests and a direct schedule action together/);
  assert.match(globalInstructions, /Do not turn an explicit user instruction into a proposal/);
  assert.match(globalInstructions, /set_pattern_step_role/);
  assert.match(globalInstructions, /currently owns the subject/);
  assert.match(globalInstructions, /every numbered outcome must be resolved/);
  assert.match(globalMessageInstructions, /Preserve compound intent/);
  assert.match(durable, /move the retinol over to my bed routine/);
});

test("a firm cadence on an extra is promoted atomically unless it is explicitly optional", () => {
  assert.match(globalInstructions, /firm ongoing cadence/);
  assert.match(globalInstructions, /planRole:"essential" on that same set_pattern_cadence action/);
  assert.match(globalInstructions, /optional, tentative, a trial, or a reminder\/offer/);
  assert.match(globalInstructions, /completion message must mention both cadence and promotion/);
});

test("global prompts keep the latest message intact and stay below Hermes' content cap", () => {
  const latest = "Move the retinol to Bed Routine and make Bed Routine essential.";
  const oversized = {
    ...globalJob("global_refresh"),
    context: {
      ...globalJob("global_refresh").context,
      sourceMessage: { body: latest },
      recentMessages: Array.from({ length: 30 }, (_, index) => ({
        author: index % 2 ? "luna" : "user",
        body: `history-${index}-${"x".repeat(4_000)}`,
      })),
      activityKnowledge: [{
        id: "activity-skin",
        records: Array.from({ length: 100 }, (_, index) => ({
          key: `record-${index}`,
          subjectKey: `subject-${index}`,
          type: "protocol",
          title: `Record ${index}`,
          data: { oversizedPayloadThatMustNotReachTerra: "z".repeat(4_000) },
        })),
      }],
    },
  };
  const prompt = eventPrompt(oversized);
  assert.ok(prompt.length < 60_000, `prompt was ${prompt.length} characters`);
  assert.ok(prompt.includes(latest));
  assert.ok(prompt.indexOf(latest) < prompt.indexOf("Owned activities"));
  assert.doesNotMatch(prompt, /oversizedPayloadThatMustNotReachTerra/);
});

test("the app validates coordinator destinations and queues an activity-scoped compiler", async () => {
  const route = await readFile(new URL("../app/api/agent/jobs/route.ts", import.meta.url), "utf8");
  assert.match(route, /validateActivityWorkRequests/);
  assert.match(route, /ownedActivityIds\.has\(activityId\)/);
  assert.match(route, /'global_refresh'/);
  assert.match(route, /'activity', \?, \?, 'workspace_refresh'/);
  assert.match(route, /delegation_instruction/);
  assert.match(route, /const finalResponse = activityWorkRequests\.length \? ""/);
  assert.match(route, /const globalFollowup = job\.kind === "global_message"/);
  assert.match(route, /Terra did not account for every outcome/);
  assert.match(route, /marked a request outcome handled without producing/);
  assert.match(route, /delegation_instruction/);
  assert.match(globalInstructions, /Semantically review every latest user message/);
  assert.match(globalInstructions, /no keyword gate/);
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
  assert.match(drawer, /artifact\.meta\?\.targetActivityId/);
  assert.match(drawer, /artifact\.meta\.targetActivityClientKey/);
  assert.match(lunaRoute, /markConversationArtifactViewed\(\{ userId, conversationId, artifactId \}\)/);
  assert.match(page, /receiptPreviewActivityId/);
  assert.match(page, /candidate\.activityId === target\.activityClientKey/);
  assert.match(page, /openActivity\(item\.id, origin\)/);
});
