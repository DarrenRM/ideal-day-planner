import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { productCompositionIssues, validateRecordActions } from "../app/activity-record-model.ts";
import { completeWithCorrection, JsonResponseError } from "../bridge/result-correction.mjs";
import { bridgeSourceFingerprint, SOURCE_REFRESH_EXIT_CODE } from "../bridge/runtime-version.mjs";
import { eventPrompt, lunaInstructions, parseAgentResult, runtimeSessionId } from "../bridge/ideal-day-bridge.mjs";
import { CATALOG_VERSION } from "../bridge/component-catalog.mjs";

const deviceKey = "stridewell-tremora-pro-vibration-plate";
const original = {
  message: null, workspaceFollowup: false,
  recordActions: [
    { op: "upsert", record: { key: deviceKey, subjectKey: deviceKey, type: "product", title: "Stridewell Tremora Pro", scope: "activity", data: { kind: "device", name: "Tremora Pro", manufacturer: "Stridewell", routineAction: "Vibration plate session" } } },
    { op: "upsert", record: { key: "tremora-resources", subjectKey: deviceKey, type: "resources", title: "Tremora Pro resources", scope: "activity", data: { entries: [{ id: "official", label: "Official product page", url: "https://stridewell.example/products/tremora-pro-vibration-plate", itemKey: deviceKey }] } } },
  ],
  workspaceActions: [
    { op: "upsert", component: { id: "tremora-card", type: "product", title: "Tremora Pro", recordKey: deviceKey } },
    { op: "upsert", component: { id: "tremora-resources", type: "resources", title: "Resources", recordKey: "tremora-resources" } },
  ],
};

function reject(issues = [{ productKey: deviceKey, kind: "missing_subject_rhythm" }]) {
  return new JsonResponseError(400, { code: "invalid_product_composition", correctionAllowed: true, error: "Each visible product card needs its own rhythm.", issues });
}

test("corrects the exact device-link omission once before saving a complete bundle", async () => {
  const fixed = structuredClone(original);
  fixed.recordActions.push({ op: "upsert", record: { key: "tremora-adherence", subjectKey: deviceKey, type: "adherence", title: "Vibration plate", scope: "activity", data: { effectiveDate: "2026-08-30", entries: [] } } });
  fixed.workspaceActions.push({ op: "upsert", component: { id: "tremora-adherence", type: "adherence", title: "Vibration plate", recordKey: "tremora-adherence" } });
  let submissions = 0;
  let corrections = 0;
  const committed = [];
  await completeWithCorrection({
    content: JSON.stringify(original), parse: parseAgentResult,
    submit: async (result) => {
      submissions++;
      const records = validateRecordActions(result.recordActions, "2026-08-30").map((action) => action.record);
      const tracked = result.workspaceActions.filter((action) => action.component.type === "product").map((action) => action.component.recordKey);
      const issues = productCompositionIssues(records, [deviceKey], tracked);
      if (issues.length) throw reject(issues);
      committed.push(result);
    },
    correct: async (prompt) => {
      corrections++;
      assert.equal(committed.length, 0);
      assert.match(prompt, /missing_subject_rhythm/);
      assert.match(prompt, /stridewell-tremora-pro-vibration-plate/);
      assert.match(prompt, /Do not repeat research or use tools/);
      // Fixture represents a user-confirmed daily routine, not inferred use.
      return JSON.stringify(fixed);
    },
  });
  assert.equal(submissions, 2);
  assert.equal(corrections, 1);
  assert.equal(committed.length, 1);
  assert.deepEqual(committed[0].recordActions[2].record.data.entries, []);
});

test("unknown cadence can save the identity and sources without fabricating a tracked card", async () => {
  const fixed = structuredClone(original);
  fixed.workspaceActions = fixed.workspaceActions.filter((action) => action.component.type !== "product");
  fixed.followUpQuestion = { body: "Do you use the plate each time you do this routine, or on particular days?" };
  await completeWithCorrection({
    content: JSON.stringify(original), parse: parseAgentResult,
    submit: async (result) => {
      const records = validateRecordActions(result.recordActions, "2026-08-30").map((action) => action.record);
      const tracked = result.workspaceActions.filter((action) => action.component.type === "product").map((action) => action.component.recordKey);
      const issues = productCompositionIssues(records, [deviceKey], tracked);
      if (issues.length) throw reject(issues);
      assert.equal(records.length, 2);
      assert.ok(result.followUpQuestion.body);
    },
    correct: async () => JSON.stringify(fixed),
  });
});

test("one correction budget covers both JSON and semantic failures", async () => {
  let corrections = 0;
  await assert.rejects(completeWithCorrection({
    content: "null", parse: parseAgentResult,
    submit: async () => { throw reject(); },
    correct: async () => { corrections++; return JSON.stringify(original); },
  }), /rhythm/);
  assert.equal(corrections, 1);
});

test("a second rejection ends the attempt instead of an unbounded correction loop", async () => {
  let corrections = 0;
  let submissions = 0;
  await assert.rejects(completeWithCorrection({
    content: JSON.stringify(original), parse: parseAgentResult,
    submit: async () => { submissions++; throw reject(); },
    correct: async () => { corrections++; return JSON.stringify(original); },
  }), /missing_subject_rhythm/);
  assert.equal(corrections, 1);
  assert.equal(submissions, 2);
});

test("does not replay uncertain failures, expired leases, authentication failures, or mixed move updates", async () => {
  for (const error of [
    new Error("Network response lost"),
    new JsonResponseError(500, { error: "Write response failed" }),
    new JsonResponseError(409, { error: "Lease lost" }),
    new JsonResponseError(403, { error: "Not authorized" }),
    new JsonResponseError(400, { error: "Unknown rejection" }),
    new JsonResponseError(400, { code: "invalid_product_composition", correctionAllowed: false, error: "A move already committed" }),
  ]) {
    await assert.rejects(completeWithCorrection({
      content: "{}", parse: JSON.parse,
      submit: async () => { throw error; },
      correct: async () => assert.fail("Must not replay this result"),
    }), (thrown) => thrown === error);
  }
});

test("successful output needs no extra model call and manual retries get isolated sessions", async () => {
  await completeWithCorrection({ content: "{}", parse: JSON.parse, submit: async () => true, correct: async () => assert.fail("Not needed") });
  const job = { id: "same-job", attempts: 1, leaseToken: "first-lease" };
  assert.equal(runtimeSessionId(job), runtimeSessionId(job));
  assert.notEqual(runtimeSessionId(job), runtimeSessionId({ ...job, leaseToken: "manual-retry-lease" }));
});

test("activity compilers receive saved cadence evidence and cannot confuse owning with scheduled use", () => {
  const prompt = eventPrompt({ job: { kind: "workspace_refresh" }, context: { activity: { title: "Massage Gun / Vibe Plate" }, localDate: "2026-08-30", activityPatterns: [{ cadence: { kind: "daily" } }] } });
  assert.match(prompt, new RegExp(CATALOG_VERSION));
  assert.match(prompt, /Saved parent schedule patterns/);
  assert.match(prompt, /"kind":"daily"/);
  assert.match(lunaInstructions, /Every visible product\/device card MUST/);
  assert.match(lunaInstructions, /Owning an item or a manufacturer's recommendation alone does not establish/);
});

test("a stale catalog is refused before database work and safe correction metadata is explicit", async () => {
  const route = await readFile(new URL("../app/api/agent/jobs/route.ts", import.meta.url), "utf8");
  const get = route.slice(route.indexOf("export async function GET"));
  assert.ok(get.indexOf("bridge_catalog_mismatch") < get.indexOf("await ensureAgentSchema()"));
  assert.match(route, /code: "invalid_product_composition"/);
  assert.match(route, /correctionAllowed: activityMoves.length === 0/);
  assert.match(route, /clarificationBody \|\| \(messageRequestsResearch/);
  assert.match(route, /structuredClarification/);
});

test("source fingerprints cover content changes and the launcher refreshes only between jobs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ideal-day-bridge-version-"));
  try {
    const url = pathToFileURL(`${directory}/`);
    await writeFile(join(directory, "catalog.mjs"), "version-one");
    const first = await bridgeSourceFingerprint(url);
    assert.equal(await bridgeSourceFingerprint(url), first);
    await writeFile(join(directory, "catalog.mjs"), "version-two");
    assert.notEqual(await bridgeSourceFingerprint(url), first);
    const [bridge, launcher] = await Promise.all([
      readFile(new URL("../bridge/ideal-day-bridge.mjs", import.meta.url), "utf8"),
      readFile(new URL("../bridge/start-ideal-day.ps1", import.meta.url), "utf8"),
    ]);
    const loop = bridge.slice(bridge.indexOf("while (true)"));
    assert.ok(loop.indexOf("bridgeSourceFingerprint()") < loop.indexOf("leased = await requestAppJson"));
    assert.match(loop, /if \(leased\) await runJobWithHeartbeat/);
    assert.equal(SOURCE_REFRESH_EXIT_CODE, 75);
    assert.match(launcher, /while \(\$bridgeExitCode -eq 75\)/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
