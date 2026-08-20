import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ACTIVITY_RECIPES, CATALOG_VERSION, COMPONENT_CATALOG, activityRecipeHint } from "../bridge/component-catalog.mjs";

const expected = [
  "summary", "product", "protocol", "checklist", "item_list", "workout", "quick_log",
  "history", "comparison", "metric", "trend", "adherence", "timeline", "goal",
  "attention", "resources", "timer", "countdown",
];

test("the production catalog contains every approved v2 component exactly once", () => {
  assert.equal(CATALOG_VERSION, "workspace-catalog-v2");
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

test("recipe hints cover the live activity families without treating schedule duration as intent", () => {
  assert.equal(activityRecipeHint("Lift", "Training"), "Strength session");
  assert.equal(activityRecipeHint("Red light", "Care"), "Product/device care");
  assert.equal(activityRecipeHint("Resupply", "Logistics"), "Supply manager");
  assert.equal(activityRecipeHint("Build / Create", "Creativity"), "Focus/creative session");
  assert.ok(ACTIVITY_RECIPES.some((recipe) => recipe.includes("no timer merely")));
});

