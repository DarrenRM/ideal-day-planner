import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ACTIVITY_RECIPES, CATALOG_VERSION, COMPONENT_CATALOG, activityRecipeHint } from "../bridge/component-catalog.mjs";

const expected = [
  "summary", "product", "protocol", "checklist", "item_list", "daily_selection", "meal_log", "workout",
  "recurring_step", "activity_event", "equipment", "session_choice", "session_log", "strength_session", "quick_log",
  "history", "comparison", "metric", "trend", "adherence", "timeline", "goal",
  "attention", "resources", "timer", "countdown",
];

test("the production catalog contains every approved v13 component exactly once", () => {
  assert.equal(CATALOG_VERSION, "workspace-catalog-v13");
  const types = COMPONENT_CATALOG.map(([type]) => type);
  assert.deepEqual(types, expected);
  assert.equal(new Set(types).size, types.length);
});

test("catalog record components stay synchronized with the server validators", async () => {
  const [recordModel, workspaceModel] = await Promise.all([
    readFile(new URL("../app/activity-record-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-model.ts", import.meta.url), "utf8"),
  ]);
  for (const type of expected.filter((entry) => entry !== "timer" && entry !== "countdown")) {
    assert.match(recordModel, new RegExp(`"${type}"`), `${type} is missing from record validation`);
    assert.match(workspaceModel, new RegExp(`"${type}"`), `${type} is missing from workspace validation`);
  }
});

test("product records distinguish products from devices", async () => {
  const [catalogSource, recordModelSource] = await Promise.all([
    readFile(new URL("../bridge/component-catalog.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-record-model.ts", import.meta.url), "utf8"),
  ]);
  assert.match(catalogSource, /kind\(product\|device\)/);
  assert.doesNotMatch(COMPONENT_CATALOG.find(([type]) => type === "product")?.[2] || "", /fields/);
  assert.match(recordModelSource, /kind: source\.kind === "device" \? "device" : "product"/);
  assert.doesNotMatch(recordModelSource.match(/if \(type === "product"\)[\s\S]*?\n\s{2}}/)?.[0] || "", /fields:/);
});

test("recipe hints cover the live activity families without treating schedule duration as intent", () => {
  assert.equal(activityRecipeHint("Lift", "Training"), "Strength session");
  assert.equal(activityRecipeHint("Cardio", "Training"), "Measured session");
  assert.equal(activityRecipeHint("Morning walk", "Light"), "Measured session");
  assert.equal(activityRecipeHint("Red light", "Care"), "Product/device care");
  assert.equal(activityRecipeHint("Shake / Supplements", "Fuel"), "Meal/supplement routine");
  assert.equal(activityRecipeHint("Breakfast", "Fuel"), "Meal, shake, or food-prep routine");
  assert.equal(activityRecipeHint("Dinner", "Fuel"), "Meal/supplement routine");
  assert.equal(activityRecipeHint("Food Prep", "Logistics"), "Meal/supplement routine");
  assert.equal(activityRecipeHint("Resupply", "Logistics"), "Supply manager");
  assert.equal(activityRecipeHint("Build / Create", "Creativity"), "Focus/creative session");
  assert.ok(ACTIVITY_RECIPES.some((recipe) => recipe.toLowerCase().includes("no timer merely")));
  assert.ok(ACTIVITY_RECIPES.some((recipe) => recipe.includes("Use workout instead")));
  assert.ok(ACTIVITY_RECIPES.some((recipe) => recipe.includes("meal_log")));
});
