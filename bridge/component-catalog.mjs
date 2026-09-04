import { activityLibraryEntryFor } from "./activity-library.mjs";

export const CATALOG_VERSION = "workspace-catalog-v17";

export const COMPONENT_CATALOG = [
  ["summary", "Stable decision-relevant facts that have no natural home in a more specific component; never a restatement of the activity title, purpose, modality, or schedule", "summary, fields[{label,value}]"],
  ["product", "One named product or device identity card and subject root", "subjectKey(same as record key); kind(product|device), name, manufacturer, variant, notes(product-specific facts only; omit relationship-only filler), routineAction(the concrete activity step this item supports, such as Brush teeth)"],
  ["protocol", "Repeatable ordered instructions", "either optional subjectKey for a product/device, or workoutRecordKey plus phase(warmup|cooldown) for an explicitly linked workout phase; summary, steps[{id,label,note,completed}]"],
  ["checklist", "Repeatable actions to check during the current activity", "items[{id,label,detail,completed}]"],
  ["item_list", "Open shopping, queue, inventory, or supply items", "items[{id,label,detail,completed,urgency,source}]"],
  ["daily_selection", "A reusable roster where any subset may be selected on each date, with history derived from the same entries; use kind routine for a variable routine", "optional kind(supplements|routine), optional prompt, items[{id,label,detail,active,source,subjectKey,cadenceRecordKey,allowMultiple,unitLabel,parentItemId}], entries[{id,date,itemIds[],counts{itemId:number}}]"],
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
  "Repeatable item modes in a variable routine: keep one parent item and add children with parentItemId referencing its stable ID in the same daily_selection. Parent and children share subjectKey; only one nesting level is allowed. Each mode can have allowMultiple and its own cadenceRecordKey. The parent appears once, expands to its modes, and derives its total/check from child use. Log only the performed child ID, never also count its parent for that use. Old parent counts mean mode not recorded; preserve them without guessing a mode. No configured modes means the ordinary checkbox/count interaction remains sufficient. Use only user-confirmed or verified product modes; research the exact model before inferring options, and clarify if unknown. Do not invent cadence from product capabilities. Products and details contains consumable products; device instructions stay within their item. Do not create a parallel session_log/adherence tracker for these mode counts; existing legacy session details remain read-only. Preserve item IDs, parent links, entries, product ownership and sources when adjusting a routine.",
  "Strength session: one workout plan plus one linked strength_session log and an activity-scoped equipment record when known. The workout owns the reusable exercise order and targets; strength_session owns every dated performed set. A movement-preparation or recovery protocol is not an exercise: link its protocol explicitly with workoutRecordKey and phase warmup or cooldown so it renders inside the strength flow before or after the numbered exercises. Use workout openChoices for a purposeful gym-selected slot. Never copy set history into workout, comparison, metric, history, or activity_event records because the app derives it from strength_session.",
  "Measured session: use session_log when the whole session is the unit of tracking: one modality plus duration and a small number of supported measurements or settings. Link it to session_choice when today’s modality is selected from options. Use this for cardio, running, walking, hiking, rucking, cycling, swimming, rowing, stair work, simple conditioning, and similar sessions. Do not add a summary merely to restate the modality, purpose, or ordinary session description; keep a summary only when it contains a distinct target, constraint, route, or other fact that changes how the person performs the session. Use workout instead when exercises, sets, reps, and loads are the units.",
  "Cardio session: session_choice when the modality is open, then one linked session_log. Keep fields minimal and modality-aware. Preserve every existing entry when updating fields or adding today’s session. Do not maintain separate metric/history copies of session-log values; the app derives progress and averages. Timer or countdown is optional and only useful when the modality or user intent makes time useful.",
  "Bounded trial: when the user commits to one session_choice option for a stated date range or until a check-in, set activeSelection for that inclusive range and create the matching follow-up. Exact dated selections remain one-day overrides.",
  "Product/device care: one product subject root per named item, plus the interaction that matches actual use. Use protocol when the person follows the same ordered steps. Use one kind:routine daily_selection when the person explicitly chooses any subset, skips items according to changing needs, rotates items, or repeats an item on one date; item count alone never establishes variability. Each named-product selection item carries its product subjectKey. Set allowMultiple only when repeated same-day use is supported. Use cadenceRecordKey to compose an item-owned recurring_step into that roster; keep the roster when one item gains an every-other-day, every-fourth-day, weekly, or weekday cadence. Bind only the daily_selection for the routine interaction; remove its former product, resource, and standalone session bindings rather than appending the roster beneath them. Keep their durable records; the app exposes consumable product information under Products and details and device instructions within their roster item. Linked cadence is displayed inside the roster, never twice. Put the linked item under due guidance without making other choices unavailable. Suggest a separate activity only when an item has a meaningfully different time, context, or completion boundary. Give each product root a concrete routineAction. A new item never inherits earlier completions. Do not also use adherence for a product whose dated use is canonical in a variable routine. Use activity_event for other dated facts; session_choice is for a single mutually exclusive session outside the variable roster, not repeated routine modes. Give item-owned records the product record's subjectKey. Timed devices may also use countdown.",
  "Variable routine decision: explicit ordered language such as same steps, in order, each step, followed by, or finish with selects protocol. Explicit variable language such as some days, depends on how I feel, depends on what my skin needs, skip some, rotate, choose what fits, either, or double up selects kind:routine daily_selection. Repetition can use allowMultiple and dated counts. When neither behavior is clear and the choice changes completion meaning, ask one behavior question: whether they normally do every step, choose what fits, or want one treatment separate. Never infer variability merely from a long list. Preserve product records, sources, history, and conversation when changing layouts.",
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

export function routineLayoutSignal(value = "") {
  const text = value.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (/\b(separate|own activity|different time|another time)\b/.test(text)) return "separate";
  if (/\b(some days|depending on|depends on|what (?:my|the) (?:skin|body|hair) needs|skip (?:some|certain)|rotate|choose what fits|any combination|either|double up|twice|two (?:colors|sessions))\b/.test(text)) return "variable";
  if (/\b(same steps|every step|each step|in order|followed by|then finish|to finish|daily steps|every day)\b/.test(text)) return "fixed";
  return "unclear";
}
