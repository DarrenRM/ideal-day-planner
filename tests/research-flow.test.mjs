import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { researchAcknowledgement, userMessageRequestsResearch } from "../bridge/job-policy.mjs";
import { messageRequestsResearch as appMessageRequestsResearch } from "../app/research-intent.ts";

test("treats pasted links and explicit lookup requests as research work", () => {
  assert.equal(userMessageRequestsResearch("https://lumenlab.example/"), true);
  assert.equal(userMessageRequestsResearch("Can you look up the manufacturer directions?"), true);
  assert.equal(userMessageRequestsResearch("Can you look into this and advise?"), true);
  assert.equal(appMessageRequestsResearch("Can you look into this and advise?"), true);
  assert.equal(userMessageRequestsResearch("I use this after showering."), false);
});

test("acknowledges research immediately in the activity's language", () => {
  assert.equal(
    researchAcknowledgement("Hair serum"),
    "I’ll take a look and keep the useful details with your hair serum.",
  );
});

test("research is acknowledged synchronously and compiled through one final response path", async () => {
  const [bridge, route, messageJobs] = await Promise.all([
    readFile(new URL("../bridge/ideal-day-bridge.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/activity-message-jobs.ts", import.meta.url), "utf8"),
  ]);

  assert.match(bridge, /leased\.job\.kind === "user_message" && userMessageRequestsResearch\(sourceMessage\)/);
  assert.match(bridge, /workspaceFollowup: true/);
  assert.match(bridge, /IDEAL_DAY_WORKSPACE_MODEL \|\| "gpt-5\.6-terra"/);
  assert.match(bridge, /reasoning_effort: "low"/);
  assert.match(bridge, /researchEvidenceForMessage\(sourceMessage\)/);
  assert.match(bridge, /jsonrepair\(cleaned\)/);
  assert.match(bridge, /Do not leave a learned product, device, cadence, usage event, direction, or protocol only in conversation/);
  assert.match(bridge, /create one product record and card for each named item/);
  assert.match(bridge, /Put item-specific directions and resources in records with that item's subjectKey/);
  assert.match(bridge, /Every item-owned resource entry also uses that item's itemKey/);
  assert.match(bridge, /never emit fields or usage subfields/);
  assert.match(route, /'agent-job:workspace-recovery:' \|\| source\.id/);
  assert.match(route, /payload\.workspaceFollowup === true \|\| messageRequestsResearch\(sourceMessage\?\.body\)/);
  assert.match(messageJobs, /researchAcknowledgement\(input\.activityTitle\)/);
  assert.match(messageJobs, /researchRequested \? "workspace_refresh" : "user_message"/);
  assert.match(route, /job\.kind === "workspace_refresh"[\s\S]*messageRequestsResearch\(sourceMessage\?\.body\) \? suppliedResponse : workspaceClarification/);
  assert.match(bridge, /Only researched findings belong in message; ordinary workspace compilation must return message:null/);
  assert.match(bridge, /sendHeartbeat\(leased\)/);
  assert.match(route, /SET lease_expires_at = datetime\('now', '\+3 minutes'\)/);
});
