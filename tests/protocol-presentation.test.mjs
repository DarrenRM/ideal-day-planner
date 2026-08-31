import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildSync } from "esbuild";

// Exercise the real React renderers, including workspace filtering and ordering.
const bundle = buildSync({
  stdin: {
    contents: `export { createElement } from "react";
      export { renderToStaticMarkup } from "react-dom/server";
      export { ActivityWorkspace } from "./app/activity-workspace";
      export { ActivityRecordComponent } from "./app/activity-record-components";`,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
  },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  external: ["react", "react-dom/server"], logLevel: "silent",
});
const compiled = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const { createElement, renderToStaticMarkup, ActivityWorkspace, ActivityRecordComponent } = compiled.exports;

function record(key, type, data, extra = {}) {
  return { id: key, key, type, title: key, version: 1, scope: "activity", subjectKey: null, data, ...extra };
}
const protocol = record("Mobility sequence", "protocol", { summary: "Daily mobility and posture.", steps: [{ id: "heel", label: "Left heel and single-leg stand" }] });
const secondProtocol = { ...protocol, id: "second", key: "second", title: "Second sequence" };
const product = record("soap", "product", { name: "Castile Soap", kind: "product", notes: "Wash with warm water.", routineAction: "Wash" }, { subjectKey: "soap" });
const ownedProtocol = { ...protocol, subjectKey: "soap" };
const resources = record("resources", "resources", { entries: [{ id: "source", label: "Reference", url: "https://example.com/mobility" }] });
const activity = { id: "stretch", title: "Stretch / yoga", category: "Recharge", duration: 30, timelineEnabled: false, color: "#67b7ce" };

function render(records, extra = {}) {
  return renderToStaticMarkup(createElement(ActivityWorkspace, {
    activity,
    workspace: { version: 1, components: records.map((entry) => ({ id: entry.id, type: entry.type, recordKey: entry.key, presentation: "default" })) },
    records, onRecordMutation: async () => true, onTalkWithLuna() {}, ...extra,
  }));
}
function protocols(html) {
  return [...html.matchAll(/<details\b([^>]*class="[^"]*\b(?:protocol-content|product-protocol)\b[^"]*"[^>]*)>([\s\S]*?)<\/details>/g)]
    .map((match) => ({ open: /\bopen=""/.test(match[1]), summary: match[2].match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? "", content: match[2] }));
}

test("the first visible standalone protocol opens and groups its overline and title", () => {
  const result = protocols(render([protocol, secondProtocol, resources]));
  assert.deepEqual(result.map((entry) => entry.open), [true, false]);
  assert.match(result[0].summary, /Protocol<\/span><strong>Mobility sequence<\/strong>/);
  assert.equal(result[0].content.split("Mobility sequence").length - 1, 1, "title is not repeated in the body");
});

test("default-open follows rendered order, excluding empty cards and trailing resources", () => {
  const empty = record("empty", "protocol", { steps: [] });
  assert.equal(protocols(render([resources, empty, protocol]))[0].open, true);
  assert.equal(protocols(render([protocol], { workState: "building" }))[0].open, true, "transient feedback does not change the default");
});

test("a protocol below other durable content stays closed", () => {
  const scheduleSummary = { patternId: "pattern", name: "Stretch", referenceDate: "2026-08-31", cadenceLabel: "Daily", upcoming: [] };
  assert.equal(protocols(render([product, protocol]))[0].open, false);
  assert.equal(protocols(render([protocol], { scheduleSummary }))[0].open, false);
  assert.equal(protocols(render([protocol], { activity: { ...activity, title: "Skin routine" } }))[0].open, false, "starter streak is above the protocol");
});

test("product-owned protocols and About retain their compact closed presentation", () => {
  const html = render([product, ownedProtocol, resources]);
  const result = protocols(html);
  assert.equal(result.length, 1, "owned protocol is not duplicated as a standalone card");
  assert.equal(result[0].open, false);
  assert.match(result[0].summary, /Protocol/);
  assert.doesNotMatch(result[0].summary, /Mobility sequence/);
  assert.match(result[0].content, /workspace-disclosure-title">Mobility sequence/);
  const about = html.match(/<details([^>]*product-about[^>]*)>/)?.[1];
  assert.ok(about);
  assert.doesNotMatch(about, /\bopen=/);
});

test("standalone specimens default closed without a leading-workspace hint", () => {
  const html = renderToStaticMarkup(createElement(ActivityRecordComponent, { record: protocol, onMutate: async () => true }));
  assert.equal(protocols(html)[0].open, false);
  assert.match(protocols(html)[0].summary, /Mobility sequence/);
});
