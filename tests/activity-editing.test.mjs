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
  const [css, page, durationControl] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-duration-control.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.activity-header-flip \{[^}]*min-height: 44px;[^}]*position: relative/s);
  assert.match(page, /activity-card-surface activity-card-surface-front/);
  assert.match(page, /activity-card-surface activity-card-surface-back/);
  assert.match(css, /\.routine-card\.is-editing \.activity-card-surface-front \{[^}]*opacity: 0;[^}]*transform: scaleY\(\.04\)/s);
  assert.match(css, /\.routine-card\.is-editing \.activity-card-surface-back \{[^}]*opacity: 1;[^}]*transform: scaleY\(1\)/s);
  assert.match(css, /\.routine-row \.routine-card:not\(\.is-expanded\) \{[^}]*background: transparent;[^}]*border-color: transparent/s);
  assert.doesNotMatch(css, /perspective:|backface-visibility:|rotateX\(/);
  assert.match(css, /\.routine-card\.is-editing \.activity-header-front \{[^}]*opacity: 0;[^}]*transform: scaleY\(\.04\)/s);
  assert.match(css, /\.activity-header-front \{[^}]*opacity: 1;[^}]*transform: scaleY\(1\)/s);
  assert.match(css, /\.routine-card\.is-editing \.activity-header-back \{[^}]*opacity: 1;[^}]*transform: scaleY\(1\)/s);
  assert.doesNotMatch(css, /transform-style: preserve-3d/);
  assert.doesNotMatch(css, /\.routine-card\.is-editing \.activity-header-flip-inner \{[^}]*transform:/s);
  assert.match(css, /\.routine-card \{[^}]*grid-template-rows: auto;[^}]*min-height: 90px;[^}]*row-gap: 0/s);
  assert.match(css, /\.activity-header-flip \{ min-height: 72px; \}/);
  assert.match(css, /\.activity-header-front \{[^}]*gap: 8px;[^}]*grid-template-rows: 32px 32px/s);
  assert.match(css, /\.activity-header-back\.inline-edit-form \{[^}]*gap: 8px/s);
  assert.match(css, /\.activity-header-back\.inline-edit-form \{[^}]*grid-template-columns: minmax\(0, 1fr\) 32px 32px;[^}]*grid-template-rows: 32px 32px/s);
  assert.match(css, /\.front-duration-value \{ font-size: var\(--type-body-lg\)/);
  assert.match(css, /\.activity-back-duration \.duration-value \{ min-width: 0; \}/);
  assert.match(durationControl, /style=\{\{ width: `\$\{String\(item\.duration\)\.length\}ch` \}\}/);
  assert.match(page, /document\.activeElement instanceof HTMLElement\) document\.activeElement\.blur\(\)/);
  assert.ok(page.indexOf('aria-label="Save and return"') < page.indexOf('className={`mobile-activity-menu'), "save-and-return precedes the overflow menu");
  assert.match(css, /\.routine-card\.is-expanded \.activity-header-flip \{ min-height: max\(88px, calc\(80px \+ env\(safe-area-inset-top\)\)\); \}/);
});
