import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { variableRoutineWorkspace } from "../../app/variable-routine-workspace.ts";
import { configureSelectionModes } from "../../app/daily-selection-model.ts";

// Render the real component tree with React. Glyphs are inert stand-ins; all
// layout, data, controls and ownership decisions use production components.
const require = createRequire(import.meta.url);
const cache = new Map();
function load(path) {
  if (path.endsWith("icons.ts")) return new Proxy({}, { get: (_, name) => name === "__esModule" ? true : () => React.createElement("svg", { "aria-hidden": true }) });
  if (cache.has(path)) return cache.get(path);
  const exports = {};
  cache.set(path, exports);
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function("require", "exports", code)((specifier) => {
    if (!specifier.startsWith(".")) return require(specifier);
    const base = resolve(dirname(path), specifier);
    const source = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate) && [".ts", ".tsx"].includes(extname(candidate)));
    return source ? load(source) : require(base);
  }, exports);
  return exports;
}
const { ActivityWorkspace } = load(fileURLToPath(new URL("../../app/activity-workspace.tsx", import.meta.url)));
const make = (key, type, data, subjectKey = null) => ({ id: key, key, type, data, subjectKey, title: key, scope: "activity", scopeDate: null, version: 1, updatedAt: "2026-09-03" });
const records = [
  make("serum", "product", { name: "Serum", routineAction: "Apply serums" }, "serum"),
  make("mask", "product", { name: "LED mask", kind: "device", routineAction: "Use LED mask" }, "mask"),
  make("mask-log", "session_log", { defaultOption: { id: "mask", label: "LED mask" }, fields: [{ id: "color", label: "Color", input: "text", kind: "setting" }], entries: [] }, "mask"),
  make("mask-cadence", "recurring_step", { cadence: { kind: "interval_days", every: 2 }, anchorDate: "2026-09-03", completedDates: [] }, "mask"),
  make("serum-source", "resources", { entries: [{ id: "official", label: "Official directions", url: "https://example.com/serum", itemKey: "serum" }] }, "serum"),
  make("choices", "daily_selection", { kind: "routine", prompt: "What fits your skin today?", items: [
    { id: "serum", label: "Serum", active: true, subjectKey: "serum" },
    { id: "mask", label: "LED mask", active: true, subjectKey: "mask", allowMultiple: true, unitLabel: "sessions", cadenceRecordKey: "mask-cadence" },
  ], entries: [] }),
];
const stale = { version: 1, components: records.map((record) => ({ id: `${record.key}-card`, recordKey: record.key, type: record.type, title: record.title })) };
const before = JSON.stringify(records);
const repaired = variableRoutineWorkspace(stale, records).workspace;
assert.deepEqual(repaired.components.map((component) => component.recordKey), ["choices"]);
assert.deepEqual(variableRoutineWorkspace(repaired, records).workspace, repaired);
assert.equal(JSON.stringify(records), before, "composition must preserve products, cadence and histories");
assert.equal(variableRoutineWorkspace(stale, records.filter((record) => record.key !== "choices")).workspace, stale, "ordinary product routines stay unchanged");
const html = renderToStaticMarkup(React.createElement(ActivityWorkspace, {
  activity: { id: "face-care", title: "Face Care", category: "Care", duration: 15, color: "#cc92b8", timelineEnabled: false },
  workspace: stale, records, onRecordMutation: async () => true, onTalkWithLuna: () => {},
}));
assert.match(html, /What fits your skin today\?/);
assert.doesNotMatch(html, /role="tablist"/);
assert.ok(html.indexOf("What fits your skin today?") < html.indexOf("Products and details"));
assert.match(html, /<details class="variable-routine-reference workspace-disclosure">/);
assert.match(html, /Official directions/);
assert.match(html, /LED mask/);
assert.match(html, /routine-choice-rows/);
assert.match(html, /aria-label="Add one LED mask session"/);
assert.doesNotMatch(html, /sessionss|daily-selection-add|Want something else here/);
assert.match(html, /Adjust how this activity works/);
assert.match(html, /routine-choice-check/);
assert.match(html, /routine-stepper/);
assert.match(html, /Other choices/);
assert.equal(JSON.stringify(records), before);

const { ActivityRecordComponent } = load(fileURLToPath(new URL("../../app/activity-record-components.tsx", import.meta.url)));
const today = new Date().toLocaleDateString("en-CA");
const scheduled = structuredClone(records);
scheduled.find((record) => record.key === "mask-cadence").data.anchorDate = today;
const choices = scheduled.find((record) => record.key === "choices");
choices.data.entries = [{ id: "today", date: today, itemIds: ["serum", "mask"], counts: { mask: 2 } }];
choices.data.items[0].label = "Apply the entire manufacturer name Serum";
scheduled[0].data.manufacturer = "Brand";
const renderChoices = (record, relatedRecords = scheduled) => renderToStaticMarkup(React.createElement(ActivityRecordComponent, { record, relatedRecords, onMutate: async () => true }));
const withCadence = renderChoices(choices);
assert.match(withCadence, />3 uses</);
assert.match(withCadence, />1 of 1 done</);
assert.match(withCadence, />2 sessions</);
assert.match(withCadence, /Due today/);
assert.match(withCadence, /Independent recurring steps/);
assert.match(withCadence, /<strong>Serum<\/strong><small>Brand<\/small>/);
assert.ok(withCadence.indexOf("Due today") < withCadence.indexOf("Other choices"));
const noCadence = renderChoices(choices, scheduled.filter((record) => record.type !== "recurring_step"));
assert.doesNotMatch(noCadence, /Due today|Independent recurring steps|Cadence decides/);
assert.match(noCadence, /Each choice is optional/);
const supplements = renderChoices({ ...choices, data: { ...choices.data, kind: "supplements" } });
assert.match(supplements, /daily-selection-items/);
assert.match(supplements, /Add supplement/);
assert.doesNotMatch(supplements, /routine-choice-rows|routine-today-heading/);

const grouped = structuredClone(choices);
grouped.data = configureSelectionModes(grouped.data, "mask", [{ id: "red", label: "Red" }, { id: "green", label: "Green" }, { id: "amber", label: "Amber" }]);
delete grouped.data.items.find((item) => item.id === "mask").cadenceRecordKey;
grouped.data.items.find((item) => item.id === "red").cadenceRecordKey = "mask-cadence";
grouped.data.entries[0].itemIds.push("red", "green");
grouped.data.entries[0].counts.red = 2;
const modeHtml = renderChoices(grouped);
assert.equal((modeHtml.match(/class="routine-mode-group /g) || []).length, 1, "one parent even with due and optional modes");
assert.match(modeHtml, />5 uses recorded</, "two old uses plus two red and one green");
assert.match(modeHtml, />6 uses</, "includes serum without double counting parent");
assert.match(modeHtml, />1 of 1 done</);
assert.match(modeHtml, /Mode not recorded/);
for (const color of ["Red", "Green", "Amber"]) assert.match(modeHtml, new RegExp(`aria-label="Add one ${color} session"`));
assert.doesNotMatch(modeHtml, /Blue|Machine settings|Add one LED mask session/);
assert.match(modeHtml, /Instructions and details/);
const modeWorkspace = renderToStaticMarkup(React.createElement(ActivityWorkspace, {
  activity: { id: "face-care", title: "Face Care", category: "Care", duration: 15, color: "#cc92b8" },
  workspace: stale, records: scheduled.map((record) => record.key === "choices" ? grouped : record), onRecordMutation: async () => true,
}));
assert.doesNotMatch(modeWorkspace.slice(modeWorkspace.indexOf("Products and details")), /LED mask|Machine settings/, "device never appears among consumable references");
const checkboxDevice = structuredClone(choices);
checkboxDevice.data.items[1].allowMultiple = false;
assert.match(renderChoices(checkboxDevice), /aria-pressed="true" class="routine-choice-row is-selected"/);
assert.doesNotMatch(renderChoices(checkboxDevice), /routine-mode-group|routine-stepper/);
