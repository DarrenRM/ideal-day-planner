import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { activitySetupKey, activitySetupKeyMatches } from "../app/activity-setup-policy.ts";

test("renaming an activity does not make Luna rebuild an established setup", () => {
  const legacyHairSerum = "workspace-catalog-v2_3Ahair_20serum_3Acare";
  assert.equal(activitySetupKeyMatches(legacyHairSerum, { category: "Care" }), true);
  assert.equal(activitySetupKeyMatches(legacyHairSerum, { category: "Training" }), false);
  assert.equal(activitySetupKeyMatches("workspace-catalog-v3_3Acare", { category: "Care" }), false);
  assert.equal(activitySetupKeyMatches("workspace-catalog-v4_3Acare", { category: "Care" }), true);
  assert.equal(
    activitySetupKeyMatches(activitySetupKey({ category: "Care" }), { category: "Care" }),
    true,
  );
});

test("collapsed and expanded activities share a stable two-faced editing header", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.activity-header-flip \{[^}]*min-height: 44px;[^}]*perspective: 900px/s);
  assert.match(css, /\.routine-card\.is-editing \.activity-header-flip-inner \{ transform: rotateX\(180deg\); \}/);
  assert.match(css, /\.activity-header-back\.inline-edit-form \{[^}]*grid-template-columns: minmax\(0, 1fr\) 32px 32px;[^}]*grid-template-rows: 32px 32px/s);
  assert.match(css, /\.routine-card\.is-expanded \.activity-header-flip \{ min-height: max\(86px, calc\(78px \+ env\(safe-area-inset-top\)\)\); \}/);
});
