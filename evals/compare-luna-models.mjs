import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eventPrompt, lunaInstructions, parseAgentResult } from "../bridge/ideal-day-bridge.mjs";
import { hasUsefulActivityRecordData, validateRecordActions } from "../app/activity-record-model.ts";
import { applyWorkspaceActions, hasUsefulRoutineComponent, validateWorkspaceActions } from "../app/workspace-model.ts";
import { orderWorkspaceDisplayItems } from "../app/workspace-order.ts";
import { researchEvidenceForMessage } from "../bridge/source-research.mjs";
import { fixture } from "./fixtures/skin-routine-beard-roller.mjs";

const HERMES_URL = (process.env.IDEAL_DAY_HERMES_URL || "http://127.0.0.1:8643").replace(/\/$/, "");
const PROFILE_HOME = process.env.IDEAL_DAY_HERMES_HOME
  || join(process.env.LOCALAPPDATA || "", "hermes", "profiles", "ideal-day");

const configurations = [
  { id: "luna-medium-fast", label: "Luna medium · Fast", model: "gpt-5.6-luna", reasoning: "medium", fast: true },
  { id: "luna-xhigh-fast", label: "Luna xhigh · Fast", model: "gpt-5.6-luna", reasoning: "xhigh", fast: true },
  { id: "terra-none", label: "Terra none (instant)", model: "gpt-5.6-terra", reasoning: "none", fast: false },
  { id: "terra-low", label: "Terra low", model: "gpt-5.6-terra", reasoning: "low", fast: false },
  { id: "terra-low-fast", label: "Terra low · Fast", model: "gpt-5.6-terra", reasoning: "low", fast: true },
  { id: "terra-medium", label: "Terra medium", model: "gpt-5.6-terra", reasoning: "medium", fast: false },
  { id: "sol-none", label: "Sol none (instant)", model: "gpt-5.6-sol", reasoning: "none", fast: false },
];
const RUNS_PER_CONFIGURATION = Math.max(1, Math.min(5, Number.parseInt(process.env.IDEAL_DAY_EVAL_RUNS || "1", 10) || 1));
const CONFIGURATION_FILTER = new Set(
  (process.env.IDEAL_DAY_EVAL_CONFIGS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const selectedConfigurations = CONFIGURATION_FILTER.size > 0
  ? configurations.filter((config) => CONFIGURATION_FILTER.has(config.id))
  : configurations;

if (selectedConfigurations.length === 0) {
  throw new Error(`No eval configurations matched IDEAL_DAY_EVAL_CONFIGS=${[...CONFIGURATION_FILTER].join(",")}`);
}

function cleanYamlScalar(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
}

async function readHermesKey() {
  const config = await readFile(join(PROFILE_HOME, "config.yaml"), "utf8");
  const match = config.match(/^\s+key:\s*(.+)$/m);
  if (!match) throw new Error("The ideal-day Hermes profile has no API-server key.");
  return cleanYamlScalar(match[1]);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { error: text }; }
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `${response.status} ${response.statusText}`);
  return payload;
}

function modelOptions(config) {
  return config.reasoning === "none"
    ? { reasoning: { enabled: false }, reasoning_effort: "none", service_tier: config.fast ? "priority" : null, fast: config.fast }
    : {
        reasoning: { enabled: true, effort: config.reasoning },
        reasoning_effort: config.reasoning,
        service_tier: config.fast ? "priority" : null,
        fast: config.fast,
      };
}

function validationSummary(agentResult) {
  const validatedRecords = validateRecordActions(agentResult.recordActions, fixture.leased.context.schedule.planDate);
  const validatedWorkspace = validateWorkspaceActions(agentResult.workspaceActions, 300);
  const available = new Map(fixture.leased.context.records.map((record) => [record.key, record]));
  for (const action of validatedRecords) {
    if (action.op === "remove") available.delete(action.recordKey);
    else available.set(action.record.key, action.record);
  }
  const safeWorkspace = validatedWorkspace.filter((action) => {
    if (action.op === "remove") return true;
    const component = action.component;
    if (component.type === "timer") return true;
    if (component.type === "countdown") return component.durationSource === "fixed";
    if (component.type === "routine") return hasUsefulRoutineComponent(component);
    const record = available.get(component.recordKey);
    return record?.type === component.type && hasUsefulActivityRecordData(record, { activityTitle: "Skin routine" });
  });
  const finalWorkspace = applyWorkspaceActions(fixture.leased.context.workspace.document, safeWorkspace);
  const displayedComponents = orderWorkspaceDisplayItems(finalWorkspace.components.map((component) => ({
    ...component,
    displayRole: component.type === "adherence"
      ? "streak"
      : component.type === "countdown"
        ? "countdown"
        : component.type === "resources"
          ? "resource"
          : "primary",
  })));
  const upserts = validatedRecords.filter((action) => action.op === "upsert").map((action) => action.record);
  const product = upserts.find((record) => record.type === "product" && /roller|kestrel grooming/i.test(`${record.title} ${record.data.name || ""}`));
  const recurring = upserts.find((record) => record.type === "recurring_step");
  const event = upserts.find((record) => record.type === "activity_event");
  const resources = upserts.find((record) => record.type === "resources");
  const resourceComponentIndex = displayedComponents.findIndex((component) => component.type === "resources");
  const message = agentResult.message || "";
  const acknowledgesMismatch = (/skin routine/i.test(message) && /hair routine/i.test(message))
    || /wrong activity|different activity|belongs (?:under|in|with)|move (?:this|it)/i.test(message);
  return {
    rawRecordActions: agentResult.recordActions.length,
    acceptedRecordActions: validatedRecords.length,
    rawWorkspaceActions: agentResult.workspaceActions.length,
    acceptedWorkspaceActions: safeWorkspace.length,
    finalComponentOrder: displayedComponents.map((component) => `${component.type}:${component.id}`),
    checks: {
      durableProductOrDevice: Boolean(product),
      binaryKind: product?.data.kind || null,
      weeklyRecurringStep: Boolean(recurring),
      usedTodayEvent: Boolean(event),
      authoritativeResource: Boolean(resources),
      sourceResearchSucceeded: Boolean(resources) && !/couldn(?:'|’)?t (?:verify|retrieve|access)|could not (?:verify|retrieve|access)|research failed/i.test(message),
      resourcesLast: resourceComponentIndex >= 0
        && displayedComponents.slice(resourceComponentIndex).every((component) => component.type === "resources"),
      acknowledgedActivityMismatch: acknowledgesMismatch,
      noUnnecessaryFollowup: agentResult.followUpQuestion === null,
    },
  };
}

async function runConfiguration(key, config, researchEvidence) {
  const sessionId = `ideal-day-eval-${config.id}-${randomUUID().slice(0, 8)}`;
  const options = modelOptions(config);
  await requestJson(`${HERMES_URL}/api/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      id: sessionId,
      source: "api_server",
      title: `Ideal Day isolated eval · ${config.label} · ${sessionId.slice(-8)}`,
      provider: "openai-codex",
      model: config.model,
      model_options: options,
      require_model_lock: true,
    }),
  });

  const startedAt = performance.now();
  let response;
  let rawContent = "";
  let agentResult = null;
  let parseError = null;
  try {
    response = await requestJson(`${HERMES_URL}/api/sessions/${encodeURIComponent(sessionId)}/chat`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: eventPrompt(fixture.leased, { researchEvidence }),
        instructions: lunaInstructions,
        provider: "openai-codex",
        model: config.model,
        model_options: options,
        require_model_lock: true,
      }),
    });
    rawContent = response?.message?.content || response?.message || "";
    agentResult = parseAgentResult(rawContent);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  const latencyMs = Math.round(performance.now() - startedAt);
  return {
    config,
    sessionId,
    latencyMs,
    runtime: response?.runtime || null,
    parseOk: Boolean(agentResult),
    parseError,
    rawContent,
    agentResult,
    validation: agentResult ? validationSummary(agentResult) : null,
  };
}

function markdownReport(results) {
  const lines = [
    "# Ideal Day model replay: Kestrel Grooming beard roller",
    "",
    `Captured: ${new Date().toISOString()}`,
    "",
    "## Exact user message",
    "",
    `> ${fixture.leased.context.sourceMessage.body}`,
    "",
    "Production data was read-only. Each candidate ran in a fresh Hermes API session using the app's real workspace-refresh prompt and parser; no result was written back to D1.",
    "",
    "## Results",
    "",
    "| Run | Configuration | Latency | JSON | Records accepted | Components accepted | Key checks |",
    "|---:|---|---:|:---:|---:|---:|---|",
  ];
  for (const result of results) {
    const checks = result.validation?.checks;
    const passed = checks ? Object.entries(checks).filter(([, value]) => Boolean(value)).map(([key]) => key).join(", ") : "—";
    lines.push(`| ${result.round} | ${result.config.label} | ${(result.latencyMs / 1000).toFixed(1)}s | ${result.parseOk ? "pass" : "FAIL"} | ${result.validation?.acceptedRecordActions ?? 0} | ${result.validation?.acceptedWorkspaceActions ?? 0} | ${passed || "none"} |`);
  }
  for (const result of results) {
    lines.push("", `## ${result.config.label} · run ${result.round}`, "", `- Latency: ${(result.latencyMs / 1000).toFixed(1)} seconds`, `- JSON/parser: ${result.parseOk ? "pass" : `fail — ${result.parseError}`}`);
    if (result.runtime) lines.push(`- Runtime: \`${JSON.stringify(result.runtime)}\``);
    if (result.agentResult) {
      lines.push(`- Luna message: ${result.agentResult.message || "(silent)"}`, `- Accepted durable records: ${result.validation.acceptedRecordActions}/${result.validation.rawRecordActions}`, `- Accepted workspace actions: ${result.validation.acceptedWorkspaceActions}/${result.validation.rawWorkspaceActions}`, `- Final component order: ${result.validation.finalComponentOrder.join(" → ") || "empty"}`, "", "```json", JSON.stringify(result.agentResult, null, 2), "```");
    } else {
      lines.push("", "```text", result.rawContent || "(no response body)", "```");
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const key = await readHermesKey();
  await requestJson(`${HERMES_URL}/health`, { headers: { authorization: `Bearer ${key}` } });
  const researchEvidence = await researchEvidenceForMessage(fixture.leased.context.sourceMessage.body);
  const results = [];
  for (let round = 1; round <= RUNS_PER_CONFIGURATION; round += 1) {
    for (const config of selectedConfigurations) {
      console.log(`Running ${config.label} (round ${round}/${RUNS_PER_CONFIGURATION})...`);
      const result = { round, ...await runConfiguration(key, config, researchEvidence) };
      results.push(result);
      console.log(`${config.label} · run ${round}: ${(result.latencyMs / 1000).toFixed(1)}s, ${result.parseOk ? "valid JSON" : result.parseError}`);
    }
  }
  const outputDir = join(process.cwd(), "evals", "results");
  await mkdir(outputDir, { recursive: true });
  const stem = `skin-routine-beard-roller-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const jsonPath = join(outputDir, `${stem}.json`);
  const markdownPath = join(outputDir, `${stem}.md`);
  await writeFile(jsonPath, `${JSON.stringify({ fixture: { source: fixture.source, expectedTensions: fixture.expectedTensions, exactMessage: fixture.leased.context.sourceMessage.body }, results }, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, markdownReport(results), "utf8");
  console.log(`JSON: ${jsonPath}`);
  console.log(`Report: ${markdownPath}`);
}

await main();
