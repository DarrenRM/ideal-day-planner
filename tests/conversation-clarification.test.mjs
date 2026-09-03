import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { eventPrompt } from "../bridge/ideal-day-bridge.mjs";

import { parseConversationClarificationDraft, parseStoredClarificationOptions } from "../app/conversation-clarification-model.ts";

test("accepts a bounded inline clarification with actionable replies", () => {
  const result = parseConversationClarificationDraft({
    body: "How should this routine work?",
    options: [
      { id: "every-step", label: "Every step", detail: "Keep one completion.", response: "I do every step." },
      { id: "choose-daily", label: "Choose daily", detail: "Track items separately.", response: "I choose what fits each day." },
    ],
  });
  assert.equal(result?.options.length, 2);
  assert.equal(result?.options[1].response, "I choose what fits each day.");
  assert.deepEqual(parseStoredClarificationOptions(JSON.stringify(result?.options)), result?.options);
});

test("rejects unclear or unsafe option sets", () => {
  assert.equal(parseConversationClarificationDraft({ body: "Choose", options: [{ id: "one", label: "One", response: "One" }] }), null);
  assert.equal(parseConversationClarificationDraft({ body: "Choose", options: [
    { id: "same", label: "One", response: "One" },
    { id: "same", label: "Two", response: "Two" },
  ] }), null);
});

test("persists answers as user messages and renders cards in both conversations", async () => {
  const [route, activityPage, globalLuna, lunaRoute, jobs, store, styles] = await Promise.all([
    readFile(new URL("../app/api/clarifications/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/global-luna.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/luna/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(route, /saveClarificationAnswer/);
  assert.match(activityPage, /ConversationClarificationCard/);
  assert.match(globalLuna, /ConversationClarificationCard/);
  assert.match(lunaRoute, /SELECT clarification\.source_agent_job_id AS event_key/);
  assert.match(jobs, /conversation_clarifications/);
  assert.match(store, /seedFaceCareRoutineLayoutClarification/);
  assert.match(store, /INSERT INTO workspace_revisions[\s\S]*restoredRevisionId/);
  assert.match(styles, /\.daily-selection-items > button > span:first-child/);
  assert.doesNotMatch(styles, /\.daily-selection-items > button > span \{/);
});

test("clarification answers atomically resume one responsible worker, including retries and global-chat delegation", () => {
  const result = spawnSync(process.execPath, [
    "--experimental-sqlite", "--experimental-strip-types",
    fileURLToPath(new URL("./fixtures/clarification-answer-sqlite.mjs", import.meta.url)),
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("both durable workers receive the original clarification even outside recent history", () => {
  for (const kind of ["workspace_refresh", "global_refresh"]) {
    const prompt = eventPrompt({ job: { kind }, context: {
      sourceMessage: { body: "Use the second option." }, recentMessages: [],
      answeredClarification: { question: "Which Face Care layout fits?", response: "Use the second option." },
    } });
    assert.match(prompt, /Which Face Care layout fits\?/);
    assert.match(prompt, /Use the second option/);
  }
});
