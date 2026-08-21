import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { activitySetupKey, activitySetupKeyMatches } from "../app/activity-setup-policy.ts";

test("renaming an activity does not make Luna rebuild an established setup", () => {
  const legacyHairSerum = "workspace-catalog-v2_3Ahair_20serum_3Acare";
  assert.equal(activitySetupKeyMatches(legacyHairSerum, { category: "Care" }), true);
  assert.equal(activitySetupKeyMatches(legacyHairSerum, { category: "Training" }), false);
  assert.equal(
    activitySetupKeyMatches(activitySetupKey({ category: "Care" }), { category: "Care" }),
    true,
  );
});

test("the expanded mobile editor owns its header without overlapping activity controls", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.routine-card\.is-expanded\.is-editing > \.item-controls \{ display: none; \}/);
  assert.match(css, /\.routine-card\.is-expanded\.is-editing \.inline-edit-form \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*?min-height: 104px;/);
  assert.match(css, /\.routine-card\.is-expanded\.is-editing \.inline-edit-form > input \{ grid-column: 1 \/ -1; grid-row: 1; \}/);
});
