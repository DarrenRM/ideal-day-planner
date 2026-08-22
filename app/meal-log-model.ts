export type MealIngredient = {
  id: string;
  label: string;
  amount?: string;
};

export type SavedRecipe = {
  id: string;
  name: string;
  sourceUrl?: string;
  sourceLabel?: string;
  summary?: string;
  ingredients?: MealIngredient[];
  instructions?: string[];
  servings?: string;
  notes?: string;
};

export type MealLogEntry = {
  id: string;
  date: string;
  title: string;
  recipeId?: string;
  detail?: string;
  ingredients?: MealIngredient[];
  quantity?: string;
  servings?: string;
  storage?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  createdAt?: string;
};

export type MealLogData = {
  kind?: "meal" | "shake" | "food_prep";
  recipes: SavedRecipe[];
  entries: MealLogEntry[];
};

/** Agent writes are patches: named recipes and dated entries survive omitted updates. */
export function mergeMealLogData(current: MealLogData, incoming: MealLogData): MealLogData {
  const recipes = new Map(current.recipes.map((recipe) => [recipe.id, recipe]));
  for (const recipe of incoming.recipes) recipes.set(recipe.id, { ...recipes.get(recipe.id), ...recipe });

  const entries = new Map(current.entries.map((entry) => [entry.id, entry]));
  for (const entry of incoming.entries) entries.set(entry.id, { ...entries.get(entry.id), ...entry });

  return {
    kind: incoming.kind || current.kind,
    recipes: [...recipes.values()],
    entries: [...entries.values()].sort((left, right) => {
      const byDate = left.date.localeCompare(right.date);
      return byDate || (left.createdAt || left.id).localeCompare(right.createdAt || right.id);
    }),
  };
}

export function mealEntriesForDate(data: Pick<MealLogData, "entries">, date: string) {
  return data.entries.filter((entry) => entry.date === date);
}

export function recipeForMealEntry(data: Pick<MealLogData, "recipes">, entry: MealLogEntry) {
  return entry.recipeId ? data.recipes.find((recipe) => recipe.id === entry.recipeId) : undefined;
}

export function mealEntryHasDetails(data: Pick<MealLogData, "recipes">, entry: MealLogEntry) {
  const recipe = recipeForMealEntry(data, entry);
  return Boolean(
    entry.detail || entry.quantity || entry.servings || entry.storage || entry.sourceUrl
    || entry.ingredients?.length || recipe?.summary || recipe?.ingredients?.length
    || recipe?.instructions?.length || recipe?.servings || recipe?.notes || recipe?.sourceUrl,
  );
}

export function savedRecipeHasDetails(recipe: SavedRecipe) {
  return Boolean(
    recipe.sourceUrl || recipe.summary || recipe.ingredients?.length || recipe.instructions?.length
    || recipe.servings || recipe.notes,
  );
}
