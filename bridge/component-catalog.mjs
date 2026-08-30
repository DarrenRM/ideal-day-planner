import { activityLibraryEntryFor } from "./activity-library.mjs";

export const CATALOG_VERSION = "workspace-catalog-v14";

export const COMPONENT_CATALOG = [
  ["summary", "Stable decision-relevant facts that have no natural home in a more specific component; never a restatement of the activity title, purpose, modality, or schedule", "summary, fields[{label,value}]"],
  ["product", "One named product or device identity card and subject root", "subjectKey(same as record key); kind(product|device), name, manufacturer, variant, notes(product-specific facts only; omit relationship-only filler), routineAction(the concrete activity step this item supports, such as Brush teeth)"],
  ["protocol", "Repeatable ordered instructions", "either optional subjectKey for a product/device, or workoutRecordKey plus phase(warmup|cooldown) for an explicitly linked workout phase; summary, steps[{id,label,note,completed}]"],
  ["checklist", "Repeatable actions to check during the current activity", "items[{id,label,detail,completed}]"],
  ["item_list", "Open shopping, queue, inventory, or supply items", "items[{id,label,detail,completed,urgency,source}]"],
  ["daily_selection", "A reusable roster where any subset may be selected on each date, with history derived from the same entries", "items[{id,label,detail,active,source}], entries[{id,date,itemIds[]}]"],
  ["meal_log", "Canonical meals, shakes, and food-prep outcomes with optional reusable recipe details kept behind the concise entry", "kind(meal|shake|food_prep), recipes[{id,name,sourceUrl,sourceLabel,summary,ingredients[{id,label,amount}],instructions[],servings,notes}], entries[{id,date,title,recipeId,detail,ingredients[{id,label,amount}],quantity,servings,storage,sourceUrl,sourceLabel,createdAt}]"],
  ["workout", "Durable strength workout plan or variant with ordered exercises, targets, rest guidance, and intentional open exercise slots", "focus, exercises[{id,name,note,targetSets,targetReps,targetLoad,restSeconds}], openChoices[{id,label,guidance,equipment[]}]"],
  ["recurring_step", "A substep with its own cadence inside a broader activity; it is only visible when due", "label,note,itemKey,anchorDate,cadence{kind(weekly|interval_days|weekdays),every?,weekdays?},completedDates[]"],
  ["activity_event", "Dated activity facts that do not imply the whole occurrence was completed", "entries[{id,date,label,detail,itemKey}]"],
  ["equipment", "Durable available or preferred equipment shared across activity variants", "items[{id,name,kind,location,status(available|preferred|unknown),note}]"],
  ["session_choice", "A small set of modes or options selected for today's session when full schedule variants are unnecessary", "prompt,options[{id,label,detail}],selections[{id,date,optionId}], optional activeSelection{optionId,startDate,endDate,reason}"],
  ["session_log", "One canonical repeated measured-session log used by both conversation extraction and the interactive session form", "optional choiceRecordKey or defaultOption{id,label}; fields[{id,label,unit,input(number|text),kind(duration|distance|effort|heart_rate|setting|result),optionIds[]}], entries[{id,date,optionId,values[{field,value}],note,createdAt}]"],
  ["strength_session", "Canonical dated strength history linked to one workout plan; the app derives previous values and progress from its performed sets", "workoutRecordKey, sessions[{id,date,workoutTitle,startedAt,completedAt,note,exercises[{id,exerciseId,name,sets[{id,ordinal,type(working|warmup|drop|failure),load,reps,rir,completedAt}]}]}]"],
  ["quick_log", "A compact repeated entry form", "fields[{id,label,unit,input}], entries[{id,values[{field,value}],note,createdAt}]"],
  ["history", "Read-only dated recaps when a more structured tracker does not fit", "entries[{id,title,detail,date,value,tone}]"],
  ["comparison", "Previous-versus-current values", "entries[{id,label,previous,current,change}]"],
  ["metric", "One important current metric and target", "label,unit,current,target,entries[{id,value,date}]"],
  ["trend", "A metric series where change over time matters", "label,unit,current,target,entries[{id,value,date}]"],
  ["adherence", "Daily dated completion history; subject-owned trackers begin at an explicit effective date", "optional subjectKey; optional effectiveDate; entries[{id,date,completed,note}]"],
  ["timeline", "Progress, milestones, or scheduled comparisons", "entries[{id,title,detail,date,value,tone}]"],
  ["goal", "A durable outcome and progress", "statement,current,target,unit,note"],
  ["attention", "A real warning, decision, or unresolved issue", "body,tone(info|warning|important),actions[]"],
  ["resources", "Authoritative links", "subjectKey for item-owned sources; entries[{id,label,url,note,itemKey}]"],
  ["timer", "Count-up elapsed time", "No record; workspace component only"],
  ["countdown", "Visible time remaining", "No record; workspace component only"],
];

export const ACTIVITY_RECIPES = [
  "Strength session: one workout plan plus one linked strength_session log and an activity-scoped equipment record when known. The workout owns the reusable exercise order and targets; strength_session owns every dated performed set. A movement-preparation or recovery protocol is not an exercise: link its protocol explicitly with workoutRecordKey and phase warmup or cooldown so it renders inside the strength flow before or after the numbered exercises. Use workout openChoices for a purposeful gym-selected slot. Never copy set history into workout, comparison, metric, history, or activity_event records because the app derives it from strength_session.",
  "Measured session: use session_log when the whole session is the unit of tracking: one modality plus duration and a small number of supported measurements or settings. Link it to session_choice when today’s modality is selected from options. Use this for cardio, running, walking, hiking, rucking, cycling, swimming, rowing, stair work, simple conditioning, and similar sessions. Do not add a summary merely to restate the modality, purpose, or ordinary session description; keep a summary only when it contains a distinct target, constraint, route, or other fact that changes how the person performs the session. Use workout instead when exercises, sets, reps, and loads are the units.",
  "Cardio session: session_choice when the modality is open, then one linked session_log. Keep fields minimal and modality-aware. Preserve every existing entry when updating fields or adding today’s session. Do not maintain separate metric/history copies of session-log values; the app derives progress and averages. Timer or countdown is optional and only useful when the modality or user intent makes time useful.",
  "Bounded trial: when the user commits to one session_choice option for a stated date range or until a check-in, set activeSelection for that inclusive range and create the matching follow-up. Exact dated selections remain one-day overrides.",
  "Product/device care: one product subject root per named item, plus subject-owned adherence or recurring_step, protocol, and resources. Give each product root a concrete routineAction that describes what the person does rather than what they own; items used in the same action share the exact routineAction, such as toothpaste and an electric toothbrush both supporting Brush teeth. Use adherence with effectiveDate for a daily item and recurring_step for an independently scheduled item. A new item never inherits the parent activity's earlier completions. Share one activity-level rhythm only when every item's cadence, start, and completion history are genuinely synchronized. Use activity_event for a dated use and session_choice for modes that do not need schedule variants. Give all item-owned records the product record's subjectKey. Timed devices may also use countdown.",
  "Body routine: protocol or checklist plus goal; optionally quick_log/history and a deliberately chosen timer.",
  "Preparation workflow: checklist or protocol for concrete repeatable steps; named products/devices use Product/device care ownership; timer/countdown only when fixed time defines the practice.",
  "Connection practice: use history for meaningful dated contact only when the person wants a record; item_list for people or open follow-ups; goal only for a durable relationship intention. Keep a simple check-in quiet when no tracking need exists.",
  "Supplement routine: use one activity-scoped daily_selection as the canonical roster and dated use history. A confirmed stable supplement adds an active item; only explicit use/taken-today language adds it to today's itemIds. Preserve all prior entries. Never duplicate its history into checklist, history, adherence, or activity_event. Products, protocols, or resources may supplement it when independently useful. No timer merely because the activity occupies schedule time.",
  "Meal, shake, or food-prep routine: use one activity-scoped meal_log as the canonical source. Record the concise thing the person actually ate, drank, made, or prepped. Preserve ingredient, quantity, batch, storage, and recipe-link detail only when supplied or supported by fetched evidence; recipes are reusable details referenced by dated entries and stay collapsed in the UI. Do not force ingredients into daily_selection or duplicate meal history into history, item_list, protocol, or resources.",
  "Supply manager: item_list plus history; preserve urgency and source.",
  "Focus/creative session: goal, checklist/item_list, resources, history; timer only when requested or already part of the practice.",
  "Media queue: item_list plus history; add summary only when stable facts change a decision and are not already represented by the queue.",
  "Simple timed practice: concise protocol plus countdown when the fixed duration defines the practice.",
];

export function catalogInstructions() {
  const components = COMPONENT_CATALOG.map(([type, purpose, data]) => `- ${type}: ${purpose}. Data: ${data}.`).join("\n");
  const recipes = ACTIVITY_RECIPES.map((recipe) => `- ${recipe}`).join("\n");
  return `Approved catalog (${CATALOG_VERSION}):\n${components}\n\nComposition guidance:\n${recipes}`;
}

export function activityRecipeHint(title = "", category = "") {
  const libraryEntry = activityLibraryEntryFor(title);
  if (libraryEntry) return libraryEntry.recipe;
  const value = `${title} ${category}`.toLowerCase();
  if (/lift|kettlebell|strength|weights?/.test(value)) return "Strength session";
  if (/cardio|walk|run|cycle|rowing|swim|hike|ruck|elliptical|stair|conditioning/.test(value)) return "Measured session";
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
