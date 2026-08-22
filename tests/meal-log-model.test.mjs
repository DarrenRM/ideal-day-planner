import assert from "node:assert/strict";
import test from "node:test";
import { mealEntriesForDate, mealEntryHasDetails, mergeMealLogData, recipeForMealEntry } from "../app/meal-log-model.ts";

test("merges a conversational meal update without dropping recipes or history", () => {
  const merged = mergeMealLogData({
    kind: "shake",
    recipes: [{ id: "usual-shake", name: "Usual shake", ingredients: [{ id: "berries", label: "Berries" }] }],
    entries: [{ id: "shake-2026-08-21", date: "2026-08-21", title: "Strawberry shake", recipeId: "usual-shake" }],
  }, {
    kind: "shake",
    recipes: [],
    entries: [{ id: "shake-2026-08-22", date: "2026-08-22", title: "Chocolate shake" }],
  });

  assert.equal(merged.recipes.length, 1);
  assert.deepEqual(merged.entries.map((entry) => entry.id), ["shake-2026-08-21", "shake-2026-08-22"]);
});

test("resolves optional recipe details without requiring ingredient tracking", () => {
  const data = {
    recipes: [{ id: "dinner", name: "Lentil soup", sourceUrl: "https://example.com/soup" }],
    entries: [
      { id: "simple", date: "2026-08-22", title: "Turkey sandwich" },
      { id: "linked", date: "2026-08-22", title: "Lentil soup", recipeId: "dinner" },
    ],
  };
  assert.equal(mealEntriesForDate(data, "2026-08-22").length, 2);
  assert.equal(mealEntryHasDetails(data, data.entries[0]), false);
  assert.equal(mealEntryHasDetails(data, data.entries[1]), true);
  assert.equal(recipeForMealEntry(data, data.entries[1])?.name, "Lentil soup");
});
