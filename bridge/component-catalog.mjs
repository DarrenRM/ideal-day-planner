export const CATALOG_VERSION = "workspace-catalog-v2";

export const COMPONENT_CATALOG = [
  ["summary", "Concise facts or current state", "summary, fields[{label,value}]"],
  ["product", "A named product or device", "kind(product|device), name, manufacturer, variant, notes, fields[{label,value}]"],
  ["protocol", "Repeatable ordered instructions", "summary, steps[{id,label,note,completed}]"],
  ["checklist", "Repeatable actions to check during the current activity", "items[{id,label,detail,completed}]"],
  ["item_list", "Open shopping, queue, inventory, or supply items", "items[{id,label,detail,completed,urgency,source}]"],
  ["workout", "Exercise plan plus targets and completed sets", "focus, exercises[{id,name,note,targetSets,targetReps,targetLoad,lastPerformance,completed,sets[{id,load,reps,effort,completedAt}]}]"],
  ["quick_log", "A compact repeated entry form", "fields[{id,label,unit,input}], entries[{id,values[{field,value}],note,createdAt}]"],
  ["history", "Read-only dated recaps when a more structured tracker does not fit", "entries[{id,title,detail,date,value,tone}]"],
  ["comparison", "Previous-versus-current values", "entries[{id,label,previous,current,change}]"],
  ["metric", "One important current metric and target", "label,unit,current,target,entries[{id,value,date}]"],
  ["trend", "A metric series where change over time matters", "label,unit,current,target,entries[{id,value,date}]"],
  ["adherence", "Dated completion history", "entries[{id,date,completed,note}]"],
  ["timeline", "Progress, milestones, or scheduled comparisons", "entries[{id,title,detail,date,value,tone}]"],
  ["goal", "A durable outcome and progress", "statement,current,target,unit,note"],
  ["attention", "A real warning, decision, or unresolved issue", "body,tone(info|warning|important),actions[]"],
  ["resources", "Pinned authoritative links", "entries[{id,label,url,note}]"],
  ["timer", "Count-up elapsed time", "No record; workspace component only"],
  ["countdown", "Visible time remaining", "No record; workspace component only"],
];

export const ACTIVITY_RECIPES = [
  "Strength session: workout; optionally comparison/history/metric. Never replace sets and targets with a prose routine.",
  "Cardio session: goal or summary plus quick_log/metric/history; timer or countdown only when modality or user intent makes time useful.",
  "Product/device care: product plus protocol; optionally adherence/timeline/attention. Timed devices may also use countdown.",
  "Body routine: protocol or checklist plus goal; optionally quick_log/history and a deliberately chosen timer.",
  "Meal/supplement routine: protocol/checklist/product or item_list; no timer merely because it occupies schedule time.",
  "Supply manager: item_list plus history; preserve urgency and source.",
  "Focus/creative session: goal, checklist/item_list, resources, history; timer only when requested or already part of the practice.",
  "Media queue: item_list plus summary/history.",
  "Simple timed practice: concise protocol plus countdown when the fixed duration defines the practice.",
];

export function catalogInstructions() {
  const components = COMPONENT_CATALOG.map(([type, purpose, data]) => `- ${type}: ${purpose}. Data: ${data}.`).join("\n");
  const recipes = ACTIVITY_RECIPES.map((recipe) => `- ${recipe}`).join("\n");
  return `Approved catalog (${CATALOG_VERSION}):\n${components}\n\nComposition guidance:\n${recipes}`;
}

export function activityRecipeHint(title = "", category = "") {
  const value = `${title} ${category}`.toLowerCase();
  if (/lift|kettlebell|strength|weights?/.test(value)) return "Strength session";
  if (/cardio|walk|run|cycle|rowing|swim/.test(value)) return "Cardio session";
  if (/skin|serum|red light|laser|device|hair/.test(value)) return "Product/device care";
  if (/stretch|yoga|massage|mobility|vibe/.test(value)) return "Body routine";
  if (/breakfast|lunch|dinner|meal|shake|supplement|food prep/.test(value)) return "Meal/supplement routine";
  if (/resupply|shopping|errand|inventory/.test(value)) return "Supply manager";
  if (/build|create|write|focus|project/.test(value)) return "Focus/creative session";
  if (/consume|entertain|watch|read|listen/.test(value)) return "Media queue";
  if (/meditat|visualization|breath/.test(value)) return "Simple timed practice";
  if (/bed|shower|routine|prep/.test(value)) return "Preparation workflow using protocol/checklist and only supported details";
  return "Choose the smallest useful combination from the catalog based on the evidence; category alone is not enough.";
}
