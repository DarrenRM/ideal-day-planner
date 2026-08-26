import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ACTIVITY_CHOICE_SETS, ACTIVITY_LIBRARY, ACTIVITY_LIBRARY_VERSION, activityChoiceSet, activityLibraryEntryFor } from "../bridge/activity-library.mjs";
import { activityRecipeHint } from "../bridge/component-catalog.mjs";

const categories = new Set(["Light", "Recharge", "Training", "Fuel", "Care", "Logistics", "Creativity", "Spirit"]);
const priorities = new Set(["energy", "strength", "focus", "sleep", "calm", "nourishment", "self-care", "home", "creativity", "connection"]);
const rhythms = new Set(["morning", "midday", "evening", "movement", "flexible"]);

test("the core activity library has stable, complete starter definitions", () => {
  assert.equal(ACTIVITY_LIBRARY_VERSION, "activity-library-v1");
  assert.equal(ACTIVITY_LIBRARY.length, 12);
  assert.equal(new Set(ACTIVITY_LIBRARY.map((entry) => entry.key)).size, ACTIVITY_LIBRARY.length);
  assert.equal(new Set(ACTIVITY_LIBRARY.map((entry) => entry.title.toLowerCase())).size, ACTIVITY_LIBRARY.length);
  for (const entry of ACTIVITY_LIBRARY) {
    assert.match(entry.key, /^[a-z0-9][a-z0-9-]+$/);
    assert.ok(entry.title && entry.outcome && entry.recipe && entry.setup.guidance);
    assert.ok(categories.has(entry.category));
    assert.ok(entry.durationMinutes >= 5);
    assert.ok(entry.components.starting.length > 0);
    assert.ok(entry.onboarding.priorities.every((value) => priorities.has(value)));
    assert.ok(entry.onboarding.rhythms.every((value) => rhythms.has(value)));
    assert.equal(activityRecipeHint(entry.title, entry.category), entry.recipe);
    if (entry.onboarding.choiceSet) assert.ok(activityChoiceSet(entry.onboarding.choiceSet));
  }
});

test("preference forks contain three concrete, valid alternatives", () => {
  for (const [key, set] of Object.entries(ACTIVITY_CHOICE_SETS)) {
    assert.equal(set.choices.length, 3, `${key} must have three choices`);
    assert.equal(new Set(set.choices.map((choice) => choice.key)).size, 3);
    for (const choice of set.choices) {
      assert.ok(choice.title && choice.recipe && choice.components.length);
      assert.ok(categories.has(choice.category));
      assert.ok(choice.durationMinutes >= 5);
    }
  }
  assert.equal(activityLibraryEntryFor("Sun walk")?.key, "morning-walk");
  assert.equal(activityLibraryEntryFor("Skincare routine")?.key, "skin-routine");
  assert.equal(activityLibraryEntryFor("Not a core activity"), null);
});

test("onboarding and Luna consume the canonical activity library", async () => {
  const [onboarding, bridge] = await Promise.all([
    readFile(new URL("../app/onboarding-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../bridge/ideal-day-bridge.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(onboarding, /ACTIVITY_LIBRARY\.map/);
  assert.doesNotMatch(onboarding, /const ACTIVITY_CHOICE_SETS/);
  assert.match(bridge, /activityLibraryInstructions\(\)/);
});
