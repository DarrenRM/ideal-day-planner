"use client";

import { AlertTriangle, CalendarCheck, Check, ChevronDown, Dumbbell, ExternalLink, HeartPulse, Package, Plus, Sparkles, Target, TrendingUp, Wrench } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { formatActivityRecordDate } from "./activity-record-format";
import type { ActivityRecord } from "./activity-record-model";
import { compactRecurringTitle, recurringCadenceLabel, recurringStepScheduleStatus, type RecurringCadence } from "./recurring-step-schedule";
import { selectedSessionOptionId, sessionEntryValues, sessionFieldsForOption, sessionFieldValue, summarizeSessionLog, type SessionChoiceData, type SessionLogData, type SessionLogEntry, type SessionLogField } from "./session-log-model";
import { priorExerciseResult, strengthSessionForDate, strengthSessionProgress, strengthWeekSummary, summarizeStrengthSets, type StrengthSessionData, type StrengthSet, type WorkoutPlanData, type WorkoutPlanExercise } from "./strength-session-model";

export type RecordMutation = (recordKey: string, operation: string, payload: Record<string, unknown>) => Promise<void>;

type Props = { record: ActivityRecord; onMutate: RecordMutation; onTalkWithLuna?: () => void; presentation?: "default" | "compact" | "featured"; supportingRecords?: ActivityRecord[]; relatedRecords?: ActivityRecord[] };
type Item = { id: string; label: string; detail?: string; completed?: boolean; completedDates?: string[]; urgency?: string; source?: string };
type Step = { id: string; label: string; note?: string; completed?: boolean; completedDates?: string[] };
type Entry = { id: string; title: string; detail?: string; date?: string; value?: string; tone?: string };
type Field = { id?: string; label: string; value?: string; unit?: string; input?: string };
type ExerciseSet = { id: string; load?: string; reps?: number | null; effort?: string; completedAt?: string };
type Exercise = {
  id: string; name: string; note?: string; targetSets?: number | null; targetReps?: string;
  targetLoad?: string; lastPerformance?: string; completed?: boolean; completedDates?: string[]; sets?: ExerciseSet[];
};
type OpenChoice = { id: string; label: string; guidance?: string; equipment?: string[] };

function localDateKey() { return new Date().toLocaleDateString("en-CA"); }
function completedToday(entry: { completed?: boolean; completedDates?: string[] }) { return entry.completedDates?.includes(localDateKey()) ?? entry.completed === true; }

function Heading({ eyebrow, title, icon }: { eyebrow: string; title: string; icon?: ReactNode }) {
  return <div className="workspace-block-heading"><div><span className="workspace-overline">{eyebrow}</span><strong>{title}</strong></div>{icon}</div>;
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="record-empty-line">{children}</p>;
}

function CheckButton({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return <button aria-label={`${checked ? "Uncheck" : "Check"} ${label}`} className={`workspace-check ${checked ? "is-checked" : ""}`} type="button" onClick={onClick}>{checked ? <Check size={11} strokeWidth={3} /> : null}</button>;
}

function SummaryRecord({ record }: { record: ActivityRecord }) {
  const data = record.data as { summary?: string; fields?: Field[] };
  return <section className="workspace-block generic-summary">
    <Heading eyebrow="Current state" title={record.title} icon={<Sparkles size={15} />} />
    {data.summary ? <p>{data.summary}</p> : null}
    {data.fields?.length ? <dl>{data.fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl> : null}
  </section>;
}

function ProductRecord({ record, onMutate, supportingRecords = [] }: Props) {
  const data = record.data as { kind?: "product" | "device"; name: string; manufacturer?: string; variant?: string; notes?: string };
  const kindLabel = data.kind === "device" ? "Device" : "Product";
  const identityDetail = [data.manufacturer, data.variant].filter(Boolean).join(" · ");
  return <section className="workspace-block protocol-block product-record">
    <div className="product-heading"><div><small className="workspace-overline">{kindLabel}</small><strong>{data.name}</strong>{identityDetail ? <span>{identityDetail}</span> : null}</div><span className="product-mark"><Package size={16} /></span></div>
    {data.notes ? <p className="record-description">{data.notes}</p> : null}
    {supportingRecords.length ? <div className="product-supporting-records">{supportingRecords.map((supportingRecord) => supportingRecord.type === "protocol"
      ? <ProtocolContent key={supportingRecord.id} nested onMutate={onMutate} record={supportingRecord} />
      : supportingRecord.type === "resources" ? <ResourcesContent key={supportingRecord.id} nested record={supportingRecord} /> : null)}</div> : null}
  </section>;
}

function ProtocolContent({ record, onMutate, nested = false }: Props & { nested?: boolean }) {
  const data = record.data as { summary?: string; steps?: Step[] };
  return <div className={nested ? "product-supporting-section product-protocol" : "protocol-content"}>
    <Heading eyebrow="Protocol" title={record.title} />
    {data.summary ? <p className="record-description">{data.summary}</p> : null}
    {data.steps?.length ? <div className="protocol-steps interactive-protocol">{data.steps.map((step, index) => <div className={completedToday(step) ? "is-complete" : ""} key={step.id}>
      <CheckButton checked={completedToday(step)} label={step.label} onClick={() => void onMutate(record.key, "toggle_item", { itemId: step.id })} />
      <p><b>{index + 1}.</b> {step.label}{step.note ? <small>{step.note}</small> : null}</p>
    </div>)}</div> : <EmptyLine>Add the known steps when the routine is clear.</EmptyLine>}
  </div>;
}

function ProtocolRecord(props: Props) {
  return <section className="workspace-block protocol-block"><ProtocolContent {...props} /></section>;
}

function ItemListRecord({ record, onMutate }: Props) {
  const data = record.data as { items?: Item[] };
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!label.trim() || saving) return;
    setSaving(true);
    try { await onMutate(record.key, "add_item", { label: label.trim() }); setLabel(""); } finally { setSaving(false); }
  }
  const eyebrow = record.type === "item_list" ? "List" : "Today";
  return <section className={`workspace-block item-list-record is-${record.type.replace("_", "-")}`}>
    <Heading eyebrow={eyebrow} title={record.title} />
    {data.items?.length ? <div className="record-item-list">{data.items.map((item) => <button aria-pressed={completedToday(item)} className={`record-item-row ${completedToday(item) ? "is-checked" : ""}`} key={item.id} type="button" onClick={() => void onMutate(record.key, "toggle_item", { itemId: item.id })}>
      <span className="record-item-check" aria-hidden="true">{completedToday(item) ? <Check size={12} strokeWidth={3} /> : null}</span>
      <span className="record-item-copy"><strong>{item.label}</strong>{item.detail || item.source ? <small>{[item.detail, item.source ? `From ${item.source}` : ""].filter(Boolean).join(" · ")}</small> : null}</span>
      {item.urgency ? <span className={`urgency-badge urgency-${item.urgency.replace("_", "-")}`}>{item.urgency.replace("_", " ")}</span> : null}
    </button>)}</div> : <EmptyLine>No items yet.</EmptyLine>}
    <form className="workspace-inline-form" onSubmit={add}><input aria-label={`Add to ${record.title}`} disabled={saving} placeholder="Add an item…" value={label} onChange={(event) => setLabel(event.target.value)} /><button disabled={!label.trim() || saving} type="submit"><Plus size={11} /> Add</button></form>
  </section>;
}

function WorkoutRecord({ record, onMutate }: Props) {
  const data = record.data as { focus?: string; exercises?: Exercise[]; openChoices?: OpenChoice[] };
  const [drafts, setDrafts] = useState<Record<string, { load: string; reps: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  async function addSet(exercise: Exercise) {
    const draft = drafts[exercise.id] ?? { load: "", reps: "" };
    if (!draft.reps || saving) return;
    setSaving(exercise.id);
    try {
      await onMutate(record.key, "add_workout_set", { exerciseId: exercise.id, load: draft.load, reps: Number(draft.reps) });
      setDrafts((current) => ({ ...current, [exercise.id]: { load: "", reps: "" } }));
    } finally { setSaving(null); }
  }
  return <section className="workspace-block workout-session-record">
    <Heading eyebrow="Today’s workout" title={record.title} icon={<Target size={15} />} />
    {data.focus ? <p className="record-description">{data.focus}</p> : null}
    {data.exercises?.length ? <div className="workout-exercises">{data.exercises.map((exercise) => {
      const draft = drafts[exercise.id] ?? { load: "", reps: "" };
      const target = [exercise.targetSets ? `${exercise.targetSets} sets` : "", exercise.targetReps ? `${exercise.targetReps} reps` : "", exercise.targetLoad || ""].filter(Boolean).join(" · ");
      const todaySets = (exercise.sets ?? []).filter((set) => !set.completedAt || set.completedAt.slice(0, 10) === localDateKey());
      return <article className={`exercise-card ${completedToday(exercise) ? "is-complete" : ""}`} key={exercise.id}>
        <header><CheckButton checked={completedToday(exercise)} label={exercise.name} onClick={() => void onMutate(record.key, "toggle_item", { itemId: exercise.id })} /><div><strong>{exercise.name}</strong>{exercise.note ? <small>{exercise.note}</small> : null}</div></header>
        <div className="exercise-targets"><span><small>Last time</small><b>{exercise.lastPerformance || "No history yet"}</b></span><span><small>Today</small><b>{target || "Targets not set"}</b></span></div>
        {todaySets.length ? <div className="logged-sets">{todaySets.map((set, index) => <span key={set.id}><Check size={10} /> Set {index + 1}: {[set.load, set.reps !== null && set.reps !== undefined ? `${set.reps} reps` : ""].filter(Boolean).join(" × ")}</span>)}</div> : null}
        <div className="set-logger"><label>Weight<input inputMode="decimal" placeholder="—" value={draft.load} onChange={(event) => setDrafts((current) => ({ ...current, [exercise.id]: { ...draft, load: event.target.value } }))} /></label><span className="set-symbol">×</span><label>Reps<input inputMode="numeric" min="0" type="number" placeholder="—" value={draft.reps} onChange={(event) => setDrafts((current) => ({ ...current, [exercise.id]: { ...draft, reps: event.target.value } }))} /></label><button disabled={!draft.reps || saving === exercise.id} type="button" onClick={() => void addSet(exercise)}><Plus size={11} /> Log set</button></div>
      </article>;
    })}</div> : null}
    {data.openChoices?.length ? <div className="workout-open-choices">{data.openChoices.map((choice) => <article key={choice.id}><span><Plus size={13} /></span><div><strong>{choice.label}</strong>{choice.guidance ? <p>{choice.guidance}</p> : null}{choice.equipment?.length ? <small>{choice.equipment.join(" · ")}</small> : null}</div></article>)}</div> : null}
  </section>;
}

type StrengthDraft = { load: string; reps: string; rir: string; setType: "working" | "warmup" | "drop" | "failure" };

function compactDate(date: string) {
  return formatActivityRecordDate(date);
}

function formatRest(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function strengthTarget(exercise: WorkoutPlanExercise) {
  return [exercise.targetSets ? `${exercise.targetSets} sets` : "", exercise.targetReps ? `${exercise.targetReps} reps` : "", exercise.targetLoad || ""].filter(Boolean).join(" · ");
}

function StrengthSessionRecord({ record, onMutate, onTalkWithLuna, relatedRecords = [] }: Props) {
  const data = record.data as StrengthSessionData;
  const workout = relatedRecords.find((entry) => entry.key === data.workoutRecordKey && entry.type === "workout");
  const plan = (workout?.data ?? {}) as WorkoutPlanData;
  const exercises = useMemo(() => plan.exercises ?? [], [plan.exercises]);
  const today = localDateKey();
  const session = strengthSessionForDate(data, today);
  const progress = strengthSessionProgress(session, exercises.map((exercise) => exercise.id));
  const week = strengthWeekSummary(data, today);
  const hasLoggedSets = (data.sessions ?? []).some((entry) => entry.exercises.some((exercise) => exercise.sets.length));
  const [expandedExerciseId, setExpandedExerciseId] = useState(exercises[0]?.id ?? "");
  const [firstSetReady, setFirstSetReady] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, StrengthDraft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [restUntil, setRestUntil] = useState<number | null>(null);
  const [restTick, setRestTick] = useState(() => Date.now());
  const effectiveExpandedExerciseId = exercises.some((exercise) => exercise.id === expandedExerciseId) ? expandedExerciseId : exercises[0]?.id ?? "";
  const savedNote = session?.note ?? "";
  const note = noteDraft ?? savedNote;
  const restRemaining = restUntil ? Math.max(0, Math.ceil((restUntil - restTick) / 1000)) : 0;

  useEffect(() => {
    if (!restUntil) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setRestTick(now);
      if (now >= restUntil) setRestUntil(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restUntil]);

  function performedSets(exerciseId: string) {
    return session?.exercises.find((entry) => entry.exerciseId === exerciseId)?.sets ?? [];
  }

  function draftFor(exercise: WorkoutPlanExercise) {
    const existingSets = performedSets(exercise.id);
    const previous = priorExerciseResult(data, exercise.id, today)?.sets[existingSets.length]
      ?? priorExerciseResult(data, exercise.id, today)?.sets.at(-1);
    return drafts[exercise.id] ?? {
      load: previous?.load || exercise.targetLoad || "",
      reps: previous ? String(previous.reps) : "",
      rir: "",
      setType: "working",
    };
  }

  async function logSet(exercise: WorkoutPlanExercise) {
    const draft = draftFor(exercise);
    if (!draft.reps || saving) return;
    setSaving(exercise.id);
    try {
      await onMutate(record.key, "log_strength_set", {
        exerciseId: exercise.id,
        load: draft.load,
        reps: Number(draft.reps),
        rir: draft.rir,
        setType: draft.setType,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[exercise.id];
        return next;
      });
      const now = Date.now();
      setRestTick(now);
      setRestUntil(now + (exercise.restSeconds ?? 90) * 1000);
    } finally { setSaving(null); }
  }

  async function removeSet(exerciseId: string, set: StrengthSet) {
    if (saving) return;
    setSaving(set.id);
    try { await onMutate(record.key, "remove_strength_set", { exerciseId, setId: set.id }); }
    finally { setSaving(null); }
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving("note");
    try { await onMutate(record.key, "save_strength_note", { note }); setNoteDraft(null); }
    finally { setSaving(null); }
  }

  if (!workout || !exercises.length) return null;
  const recentSessions = [...(data.sessions ?? [])]
    .filter((entry) => entry.date < today && entry.exercises.some((exercise) => exercise.sets.length))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 3);
  const firstExercise = exercises[0];
  const firstTarget = strengthTarget(firstExercise);

  return <section className="workspace-block strength-session-record">
    <div className="strength-session-heading">
      <div><span className="workspace-overline">Today’s workout</span><strong>{workout.title}</strong>{plan.focus ? <p>{plan.focus}</p> : null}</div>
      <span className="strength-session-mark"><Dumbbell aria-hidden="true" size={17} /></span>
    </div>
    {!hasLoggedSets && !firstSetReady ? <div className="strength-first-session">
      <div className="strength-first-copy"><span className="workspace-overline">First workout</span><strong>Start with {firstExercise.name}</strong><p>{firstTarget ? `Today’s plan starts with ${firstTarget}.` : "Record your first set to establish a useful baseline."}</p></div>
      <div className="strength-plan-preview" aria-label="Today’s planned exercises">{exercises.map((exercise, index) => <span key={exercise.id}><b>{index + 1}</b><span><strong>{exercise.name}</strong>{strengthTarget(exercise) ? <small>{strengthTarget(exercise)}</small> : null}</span></span>)}</div>
      <button className="strength-first-action" type="button" onClick={() => { setExpandedExerciseId(firstExercise.id); setFirstSetReady(true); }}>Log first set</button>
    </div> : <>
      {hasLoggedSets ? <div className="strength-progress" aria-label={`${progress.completedExercises} of ${progress.totalExercises} exercises and ${progress.completedSets} sets logged`}>
        <span><strong>{progress.completedExercises}/{progress.totalExercises}</strong><small>exercises</small></span>
        <span><strong>{progress.completedSets}</strong><small>sets today</small></span>
        <span><strong>{week.sessions}</strong><small>workouts this week</small></span>
      </div> : null}
      {restUntil && restRemaining > 0 ? <div className="strength-rest" role="timer"><span>Rest</span><strong>{formatRest(restRemaining)}</strong><button type="button" onClick={() => setRestUntil(null)}>Skip</button></div> : null}
      <div className="strength-exercises">{exercises.map((exercise, exerciseIndex) => {
      const isExpanded = effectiveExpandedExerciseId === exercise.id;
      const sets = performedSets(exercise.id);
      const prior = priorExerciseResult(data, exercise.id, today);
      const target = strengthTarget(exercise);
      const draft = draftFor(exercise);
      const nextSetIndex = sets.length;
      const previousSet = prior?.sets[nextSetIndex] ?? prior?.sets.at(-1);
      return <article className={`strength-exercise ${isExpanded ? "is-expanded" : ""}`} key={exercise.id}>
        <button aria-expanded={isExpanded} className="strength-exercise-toggle" type="button" onClick={() => setExpandedExerciseId(isExpanded ? "" : exercise.id)}>
          <span className="strength-exercise-number">{exerciseIndex + 1}</span>
          <span><strong>{exercise.name}</strong><small>{sets.length ? `${sets.length}${exercise.targetSets ? ` of ${exercise.targetSets}` : ""} sets logged` : target || "Ready when you are"}</small></span>
          <ChevronDown aria-hidden="true" size={16} />
        </button>
        {isExpanded ? <div className="strength-exercise-body">
          {exercise.note ? <p className="strength-exercise-note">{exercise.note}</p> : null}
          {prior || target ? <div className={`strength-comparison ${prior && target ? "" : "is-single"}`}>{prior ? <span><small>Last time</small><strong>{summarizeStrengthSets(prior.sets)}</strong></span> : null}{target ? <span><small>Today’s target</small><strong>{target}</strong></span> : null}</div> : null}
          {!hasLoggedSets ? <div className="strength-first-set-form">
            <label>Weight<input aria-label={`Weight for the first set of ${exercise.name}`} inputMode="decimal" placeholder="Bodyweight" value={draft.load} onChange={(event) => setDrafts((current) => ({ ...current, [exercise.id]: { ...draft, load: event.target.value } }))} /></label>
            <label>Reps<input aria-label={`Reps for the first set of ${exercise.name}`} inputMode="numeric" min="1" placeholder="—" type="number" value={draft.reps} onChange={(event) => setDrafts((current) => ({ ...current, [exercise.id]: { ...draft, reps: event.target.value } }))} /></label>
            <button disabled={!draft.reps || saving === exercise.id} type="button" onClick={() => void logSet(exercise)}>Log set</button>
          </div> : <div className={`strength-set-table ${prior ? "" : "has-no-previous"}`}>
            <div className="strength-set-head" aria-hidden="true"><span>Set</span>{prior ? <span>Previous</span> : null}<span>Weight</span><span>Reps</span><span>Done</span></div>
            {sets.map((set, index) => <div className="strength-set-row is-logged" key={set.id}>
              <span>{index + 1}</span>{prior ? <span>{prior.sets[index] ? `${prior.sets[index].load || "BW"} × ${prior.sets[index].reps}` : "—"}</span> : null}<strong>{set.load || "BW"}</strong><strong>{set.reps}</strong>
              <button aria-label={`Remove set ${index + 1} from ${exercise.name}`} className="workspace-check is-checked" disabled={saving === set.id} type="button" onClick={() => void removeSet(exercise.id, set)}><Check size={11} strokeWidth={3} /></button>
            </div>)}
            <div className="strength-set-row is-entry">
              <span>{sets.length + 1}</span>{prior ? <span>{previousSet ? `${previousSet.load || "BW"} × ${previousSet.reps}` : "—"}</span> : null}
              <input aria-label={`Weight for set ${sets.length + 1} of ${exercise.name}`} inputMode="decimal" placeholder="BW" value={draft.load} onChange={(event) => setDrafts((current) => ({ ...current, [exercise.id]: { ...draft, load: event.target.value } }))} />
              <input aria-label={`Reps for set ${sets.length + 1} of ${exercise.name}`} inputMode="numeric" min="1" placeholder="—" type="number" value={draft.reps} onChange={(event) => setDrafts((current) => ({ ...current, [exercise.id]: { ...draft, reps: event.target.value } }))} />
              <button aria-label={`Log set ${sets.length + 1} for ${exercise.name}`} className="workspace-check" disabled={!draft.reps || saving === exercise.id} type="button" onClick={() => void logSet(exercise)}><Check size={11} strokeWidth={3} /></button>
            </div>
          </div>}
          <details className="strength-set-options"><summary>Set details</summary><div><label>Type<select value={draft.setType} onChange={(event) => setDrafts((current) => ({ ...current, [exercise.id]: { ...draft, setType: event.target.value as StrengthDraft["setType"] } }))}><option value="working">Working</option><option value="warmup">Warm-up</option><option value="drop">Drop set</option><option value="failure">To failure</option></select></label><label>Reps left (optional)<input inputMode="numeric" max="10" min="0" placeholder="—" type="number" value={draft.rir} onChange={(event) => setDrafts((current) => ({ ...current, [exercise.id]: { ...draft, rir: event.target.value } }))} /></label></div></details>
        </div> : null}
      </article>;
      })}</div>
      {plan.openChoices?.length ? <div className="strength-open-choices"><span className="workspace-overline">Choose at the gym</span>{plan.openChoices.map((choice) => <button key={choice.id} type="button" onClick={onTalkWithLuna}><Plus aria-hidden="true" size={15} /><span><strong>{choice.label}</strong>{choice.guidance ? <small>{choice.guidance}</small> : null}{choice.equipment?.length ? <em>{choice.equipment.join(" · ")}</em> : null}</span></button>)}</div> : null}
      <form className="strength-note" onSubmit={saveNote}><label>Workout note<textarea placeholder="Anything worth remembering from today?" value={note} onChange={(event) => setNoteDraft(event.target.value)} /></label><button disabled={saving === "note" || note === savedNote} type="submit">Save note</button></form>
      {recentSessions.length ? <div className="strength-history"><div className="strength-history-heading"><span><small className="workspace-overline">Recent workouts</small><strong>Your lifting history</strong></span><TrendingUp aria-hidden="true" size={16} /></div>{recentSessions.map((entry) => {
      const setCount = entry.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
      const repCount = entry.exercises.reduce((total, exercise) => total + exercise.sets.reduce((sum, set) => sum + set.reps, 0), 0);
      return <div className="strength-history-row" key={entry.id}><time dateTime={entry.date}>{compactDate(entry.date)}</time><span><strong>{entry.workoutTitle || workout.title}</strong><small>{setCount} sets · {repCount} reps</small></span></div>;
      })}</div> : null}
    </>}
  </section>;
}

function RecurringStepRecord({ record, onMutate }: Props) {
  const data = record.data as { label: string; note?: string; anchorDate?: string; completedDates?: string[]; cadence?: RecurringCadence };
  const today = localDateKey();
  const status = recurringStepScheduleStatus(data, today);
  const cadence = recurringCadenceLabel(data.cadence);
  const lastValue = status.completedToday ? "Today" : status.lastCompleted ? formatActivityRecordDate(status.lastCompleted) : "Not yet";
  const nextValue = status.dueToday ? "Due today" : status.nextDue ? formatActivityRecordDate(status.nextDue) : "Not scheduled";
  return <section className="workspace-block recurring-step-record"><Heading eyebrow={cadence} title={compactRecurringTitle(record.title, cadence)} icon={<CalendarCheck size={15} />} />
    <div className="recurring-step-status" aria-label={`Last completed: ${lastValue}. ${status.dueToday ? "Status" : "Next due"}: ${nextValue}.`}>
      <span><small>{status.completedToday ? "Completed" : "Last completed"}</small><strong>{lastValue}</strong></span>
      <span><small>{status.dueToday ? "Status" : "Next due"}</small><strong className={status.dueToday ? "is-due" : ""}>{nextValue}</strong></span>
    </div>
    <button className={status.completedToday ? "is-complete" : ""} type="button" onClick={() => void onMutate(record.key, "toggle_recurring_step", {})}><span>{status.completedToday ? <Check size={14} strokeWidth={3} /> : null}</span><div><strong>{data.label}</strong>{data.note ? <small>{data.note}</small> : null}</div></button>
  </section>;
}

function ActivityEventRecord({ record }: { record: ActivityRecord }) {
  const data = record.data as { entries?: Array<{ id: string; date: string; label: string; detail?: string }> };
  return <section className="workspace-block activity-event-record"><Heading eyebrow="Recent activity" title={record.title} />
    <div>{data.entries?.slice(-5).reverse().map((entry) => <article key={entry.id}><time>{formatActivityRecordDate(entry.date)}</time><p><strong>{entry.label}</strong>{entry.detail ? <small>{entry.detail}</small> : null}</p></article>)}</div>
  </section>;
}

function EquipmentRecord({ record }: { record: ActivityRecord }) {
  const data = record.data as { items?: Array<{ id: string; name: string; kind?: string; location?: string; status?: string; note?: string }> };
  const groups = Array.from((data.items ?? []).reduce((result, item) => {
    const location = item.location || "Other";
    result.set(location, [...(result.get(location) ?? []), item]);
    return result;
  }, new Map<string, NonNullable<typeof data.items>>()).entries());
  return <section aria-label={record.title} className="workspace-block equipment-record">
    <div className="equipment-heading"><div><span className="workspace-overline">Equipment</span><strong>Available to you</strong></div><span className="equipment-mark"><Wrench aria-hidden="true" size={15} /></span></div>
    <div className="equipment-groups">{groups.map(([location, items]) => <section key={location}>
      <h4>{location}</h4>
      <div>{items.map((item) => <span className="equipment-item" key={item.id}>{item.name}{item.status && item.status !== "available" ? <small>{item.status}</small> : null}</span>)}</div>
    </section>)}</div>
  </section>;
}

function SessionChoiceRecord({ record, onMutate, presentation }: Props) {
  const data = record.data as SessionChoiceData & { prompt?: string };
  const today = localDateKey();
  const savedSelection = selectedSessionOptionId(data, today);
  const [optimisticSelection, setOptimisticSelection] = useState<{ version: number; optionId: string } | null>(null);
  const [expanded, setExpanded] = useState(!savedSelection || presentation !== "compact");
  const [saving, setSaving] = useState<string | null>(null);
  const selected = optimisticSelection?.version === record.version ? optimisticSelection.optionId : savedSelection;
  const options = [...(data.options ?? [])].sort((left, right) => Number(right.id === selected) - Number(left.id === selected));
  const collapsed = Boolean(selected && !expanded);

  async function choose(optionId: string) {
    if (saving) return;
    setSaving(optionId);
    setOptimisticSelection({ version: record.version, optionId });
    try {
      await onMutate(record.key, "select_session_choice", { optionId });
      setExpanded(false);
    } catch {
      setOptimisticSelection(null);
    } finally { setSaving(null); }
  }

  return <section className={`workspace-block session-choice-record ${collapsed ? "is-collapsed" : "is-expanded"}`}><Heading eyebrow="Today" title={record.title} />
    {data.prompt && !collapsed ? <p>{data.prompt}</p> : null}<div className="session-choice-options">{options.map((option) => <button aria-pressed={selected === option.id} className={selected === option.id ? "is-selected" : ""} disabled={Boolean(saving)} key={option.id} type="button" onClick={() => void choose(option.id)}><span>{selected === option.id ? <Check size={12} /> : null}</span><div><strong>{option.label}</strong>{option.detail ? <small>{option.detail}</small> : null}{data.activeSelection?.optionId === option.id ? <em>Planned through {formatActivityRecordDate(data.activeSelection.endDate)}</em> : null}</div></button>)}</div>
    {collapsed && options.length > 1 ? <button className="session-choice-expand" type="button" onClick={() => setExpanded(true)}>See all options <ChevronDown aria-hidden="true" size={14} /></button> : null}
  </section>;
}

function sessionValueLabel(field: SessionLogField, value: string) {
  return `${value}${field.unit && !field.unit.startsWith("/") && field.unit !== "%" ? ` ${field.unit}` : field.unit || ""}`;
}

function compactSessionEntry(entry: SessionLogEntry, fields: SessionLogField[]) {
  return fields.flatMap((field) => {
    const value = sessionFieldValue(entry, field);
    return value ? [`${field.label} ${sessionValueLabel(field, value)}`] : [];
  }).slice(0, 4).join(" · ");
}

function formatSessionNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function SessionLogRecord({ record, onMutate, relatedRecords = [] }: Props) {
  const data = record.data as SessionLogData;
  const today = localDateKey();
  const choiceRecord = data.choiceRecordKey
    ? relatedRecords.find((entry) => entry.key === data.choiceRecordKey && entry.type === "session_choice")
    : undefined;
  const choiceData = choiceRecord?.data as SessionChoiceData | undefined;
  const optionId = choiceData ? selectedSessionOptionId(choiceData, today) : data.defaultOption?.id;
  const option = choiceData?.options?.find((entry) => entry.id === optionId) ?? (data.defaultOption?.id === optionId ? data.defaultOption : undefined);
  const fields = optionId ? sessionFieldsForOption(data, optionId) : [];
  const todayEntry = data.entries?.find((entry) => entry.date === today && entry.optionId === optionId);
  const draftKey = `${record.version}:${optionId ?? "none"}:${todayEntry?.id ?? "new"}`;
  const [draft, setDraft] = useState(() => ({ key: draftKey, values: sessionEntryValues(todayEntry), note: todayEntry?.note ?? "" }));
  const [saving, setSaving] = useState(false);
  const summary = useMemo(() => optionId ? summarizeSessionLog(data, optionId, today) : null, [data, optionId, today]);
  if (!optionId || !option || !fields.length || !summary) return null;

  const currentDraft = draft.key === draftKey
    ? draft
    : { key: draftKey, values: sessionEntryValues(todayEntry), note: todayEntry?.note ?? "" };
  const values = currentDraft.values;
  const note = currentDraft.note;

  function updateField(fieldId: string, value: string) {
    setDraft((existing) => {
      const base = existing.key === draftKey
        ? existing
        : { key: draftKey, values: sessionEntryValues(todayEntry), note: todayEntry?.note ?? "" };
      return { ...base, values: { ...base.values, [fieldId]: value } };
    });
  }

  function updateNote(value: string) {
    setDraft((existing) => {
      const base = existing.key === draftKey
        ? existing
        : { key: draftKey, values: sessionEntryValues(todayEntry), note: todayEntry?.note ?? "" };
      return { ...base, note: value };
    });
  }

  const coreFields = fields.filter((field) => field.kind !== "setting");
  const settingFields = fields.filter((field) => field.kind === "setting");
  const maximumDay = Math.max(...summary.weekDays.map((day) => day.value), 1);
  const maximumWeek = Math.max(...summary.recentWeeks.map((week) => week.duration || week.sessions), 1);
  const hasDraft = Object.values(values).some((value) => value.trim()) || note.trim();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!hasDraft || saving) return;
    setSaving(true);
    try {
      await onMutate(record.key, "save_session_log", {
        optionId,
        values: fields.flatMap((field) => values[field.id]?.trim() ? [{ field: field.id, value: values[field.id].trim() }] : []),
        note: note.trim(),
      });
    } finally { setSaving(false); }
  }

  return <section className="workspace-block session-log-record">
    <Heading eyebrow="Today’s session" title={option.label} icon={<HeartPulse aria-hidden="true" size={16} />} />
    {summary.latestPrior ? <div className="session-last-time"><span>Last session</span><strong>{formatActivityRecordDate(summary.latestPrior.date)}</strong><p>{compactSessionEntry(summary.latestPrior, fields)}</p></div> : null}
    <form onSubmit={save}>
      <div className="session-field-grid">{coreFields.map((field) => <label key={field.id}><span>{field.label}{field.unit ? <small>{field.unit}</small> : null}</span><input inputMode={field.input === "text" ? "text" : "decimal"} max={field.kind === "effort" ? 10 : undefined} min={field.kind === "effort" ? 1 : field.input === "number" ? 0 : undefined} placeholder="—" step="any" type={field.input === "text" ? "text" : "number"} value={values[field.id] ?? ""} onChange={(event) => updateField(field.id, event.target.value)} /></label>)}</div>
      {settingFields.length ? <fieldset><legend>Machine settings</legend><div className="session-field-grid">{settingFields.map((field) => <label key={field.id}><span>{field.label}{field.unit ? <small>{field.unit}</small> : null}</span><input inputMode={field.input === "text" ? "text" : "decimal"} min={field.input === "number" ? 0 : undefined} placeholder="—" step="any" type={field.input === "text" ? "text" : "number"} value={values[field.id] ?? ""} onChange={(event) => updateField(field.id, event.target.value)} /></label>)}</div></fieldset> : null}
      <label className="session-note"><span>Notes <small>optional</small></span><input placeholder="How did it feel?" value={note} onChange={(event) => updateNote(event.target.value)} /></label>
      <button disabled={!hasDraft || saving} type="submit">{saving ? "Saving…" : todayEntry ? "Update session" : "Save session"}</button>
    </form>
    <div className="session-progress">
      <div className="session-progress-heading"><span className="workspace-overline">Progress</span><strong>This week</strong></div>
      {summary.weekEntries.length ? <>
        <div className="session-stats">
          <span><small>Sessions</small><strong>{summary.weekEntries.length}</strong></span>
          <span><small>Minutes</small><strong>{formatSessionNumber(summary.totalDuration)}</strong></span>
          {summary.totalDistance !== null && summary.distanceField ? <span><small>Distance</small><strong>{formatSessionNumber(summary.totalDistance)} <em>{summary.distanceField.unit}</em></strong></span> : null}
          {summary.averageEffort !== null ? <span><small>Avg effort</small><strong>{formatSessionNumber(summary.averageEffort)} <em>/10</em></strong></span> : null}
        </div>
        <div className="session-week-chart" aria-label={`${summary.weekEntries.length} ${option.label} sessions this week`}>{summary.weekDays.map((day) => <span className={day.value ? "has-session" : ""} key={day.date} title={`${formatActivityRecordDate(day.date)}: ${day.value ? `${formatSessionNumber(day.value)} minutes` : "No session"}`}><i style={{ height: `${day.value ? Math.max(18, (day.value / maximumDay) * 100) : 5}%` }} /><small>{day.label}</small></span>)}</div>
        <div className="session-month-trend">
          <div><small>Four-week rhythm</small><strong>{summary.recentWeeks.reduce((sum, week) => sum + week.sessions, 0)} sessions</strong></div>
          <div aria-label={`${option.label} sessions across the last four weeks`}>{summary.recentWeeks.map((week, index) => {
            const value = week.duration || week.sessions;
            return <span className={week.sessions ? "has-session" : ""} key={week.startDate} title={`${formatActivityRecordDate(week.startDate)}–${formatActivityRecordDate(week.endDate)}: ${week.sessions} sessions, ${formatSessionNumber(week.duration)} minutes`}><i style={{ width: `${value ? Math.max(10, (value / maximumWeek) * 100) : 3}%` }} /><small>{index === summary.recentWeeks.length - 1 ? "Now" : formatActivityRecordDate(week.startDate)}</small></span>;
          })}</div>
        </div>
      </> : <p className="session-progress-empty">Your first saved session will start the comparison.</p>}
    </div>
  </section>;
}

function QuickLogRecord({ record, onMutate }: Props) {
  const data = record.data as { fields?: Field[]; entries?: Array<{ id: string; values?: Array<{ field: string; value: string }>; createdAt?: string }> };
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fields = data.fields ?? [];
  async function submit(event: FormEvent) {
    event.preventDefault();
    const pairs = fields.flatMap((field) => values[field.id || ""] ? [{ field: field.id, value: values[field.id || ""] }] : []);
    if (!pairs.length || saving) return;
    setSaving(true);
    try { await onMutate(record.key, "add_quick_log", { values: pairs }); setValues({}); } finally { setSaving(false); }
  }
  return <section className="workspace-block quick-log-record"><Heading eyebrow="Quick log" title={record.title} />
    <form onSubmit={submit}>{fields.map((field) => <label key={field.id}><span>{field.label}{field.unit ? ` · ${field.unit}` : ""}</span><input inputMode={field.input === "text" ? "text" : "decimal"} type={field.input === "text" ? "text" : "number"} value={values[field.id || ""] || ""} onChange={(event) => setValues((current) => ({ ...current, [field.id || ""]: event.target.value }))} /></label>)}<button disabled={saving || !Object.values(values).some(Boolean)} type="submit">Save entry</button></form>
    {data.entries?.length ? <small className="record-footnote">{data.entries.length} saved {data.entries.length === 1 ? "entry" : "entries"}</small> : null}
  </section>;
}

function HistoryRecord({ record }: { record: ActivityRecord }) {
  const data = record.data as { entries?: Entry[] };
  const entries = data.entries ?? [];
  return <section className={`workspace-block ${record.type === "timeline" ? "timeline-record" : "history-record"}`}><Heading eyebrow={record.type === "timeline" ? "Timeline" : "Recent history"} title={record.title} />
    {entries.length ? record.type === "timeline"
      ? <div className="progress-timeline">{entries.map((entry) => <div className={`timeline-entry tone-${entry.tone || "default"}`} key={entry.id}><span /><time dateTime={entry.date}>{formatActivityRecordDate(entry.date)}</time><p><strong>{entry.title}</strong>{entry.detail ? <small>{entry.detail}</small> : null}</p>{entry.value ? <b>{entry.value}</b> : null}</div>)}</div>
      : <div className="record-history-list">{entries.map((entry) => <article className={`record-history-entry tone-${entry.tone || "default"}`} key={entry.id}><header><time dateTime={entry.date}>{formatActivityRecordDate(entry.date)}</time>{entry.value ? <b>{entry.value}</b> : null}</header><div><strong>{entry.title}</strong>{entry.detail ? <p>{entry.detail}</p> : null}</div></article>)}</div>
      : <EmptyLine>No history yet.</EmptyLine>}
  </section>;
}

function ComparisonRecord({ record }: { record: ActivityRecord }) {
  const data = record.data as { entries?: Array<{ id: string; label: string; previous?: string; current?: string; change?: string }> };
  return <section className="workspace-block"><Heading eyebrow="Comparison" title={record.title} icon={<TrendingUp size={15} />} />
    {data.entries?.length ? <div className="comparison-grid">{data.entries.map((entry) => <div key={entry.id}><span>{entry.label}</span><small>{entry.previous || "No previous value"}</small><strong>{entry.current || "—"}</strong>{entry.change ? <b>{entry.change}</b> : null}</div>)}</div> : <EmptyLine>A comparison will appear after there is history.</EmptyLine>}
  </section>;
}

function MetricRecord({ record }: { record: ActivityRecord }) {
  const data = record.data as { label: string; unit?: string; current?: number | null; target?: number | null; entries?: Array<{ id: string; value: number; date?: string }> };
  const values = data.entries?.map((entry) => entry.value) ?? [];
  const maximum = Math.max(...values, data.target ?? 0, 1);
  return <section className="workspace-block metric-record"><Heading eyebrow={record.type === "trend" ? "Trend" : "Metric"} title={record.title} icon={<TrendingUp size={15} />} />
    <div className="metric-current"><span>{data.label}</span><strong>{data.current ?? "—"}<small>{data.unit}</small></strong>{data.target !== null && data.target !== undefined ? <p>Target {data.target} {data.unit}</p> : null}</div>
    {values.length ? <div className="metric-bars" aria-label={`${data.label} history`}>{data.entries?.slice(-12).map((entry) => <i key={entry.id} style={{ height: `${Math.max(8, (entry.value / maximum) * 100)}%` }} title={`${entry.date || ""}: ${entry.value} ${data.unit || ""}`} />)}</div> : <EmptyLine>No measurements yet.</EmptyLine>}
  </section>;
}

function AdherenceRecord({ record, onMutate }: Props) {
  const data = record.data as { entries?: Array<{ id: string; date: string; completed?: boolean }> };
  const today = new Date().toLocaleDateString("en-CA");
  const byDate = new Map((data.entries ?? []).map((entry) => [entry.date, entry]));
  const days = useMemo(() => Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - offset));
    return { date: date.toLocaleDateString("en-CA"), label: date.toLocaleDateString(undefined, { weekday: "narrow" }) };
  }), []);
  return <section className="workspace-block"><Heading eyebrow="Adherence" title={record.title} />
    <div className="adherence-row">{days.map((day) => { const complete = byDate.get(day.date)?.completed === true; return <div key={day.date}><button aria-label={`${complete ? "Undo" : "Mark"} ${day.date}`} className={complete ? "is-complete" : ""} disabled={day.date !== today} type="button" onClick={() => void onMutate(record.key, "set_adherence", { date: day.date })}>{complete ? <Check size={12} /> : null}</button><small>{day.label}</small></div>; })}</div>
  </section>;
}

function GoalRecord({ record }: { record: ActivityRecord }) {
  const data = record.data as { statement: string; current?: number | null; target?: number | null; unit?: string; note?: string };
  const progress = data.current !== null && data.current !== undefined && data.target ? Math.min(100, Math.max(0, (data.current / data.target) * 100)) : null;
  return <section className="workspace-block goal-record"><Heading eyebrow="Goal" title={record.title} icon={<Target size={15} />} /><strong>{data.statement}</strong>{data.note ? <p>{data.note}</p> : null}{progress !== null ? <><div className="goal-track"><span style={{ width: `${progress}%` }} /></div><small>{data.current} / {data.target} {data.unit}</small></> : null}</section>;
}

function AttentionRecord({ record }: { record: ActivityRecord }) {
  const data = record.data as { body: string; tone?: string; actions?: string[] };
  return <section className={`workspace-block attention-record tone-${data.tone || "info"}`}><Heading eyebrow="Keep in mind" title={record.title} icon={<AlertTriangle size={15} />} /><p>{data.body}</p>{data.actions?.length ? <ul>{data.actions.map((action) => <li key={action}>{action}</li>)}</ul> : null}</section>;
}

function ResourcesContent({ record, nested = false }: { record: ActivityRecord; nested?: boolean }) {
  const data = record.data as { entries?: Array<{ id: string; label: string; url: string; note?: string }> };
  return <div className={nested ? "product-supporting-section product-resources" : "resources-content"}><Heading eyebrow="Resources" title={record.title} /><div className="resource-list">{data.entries?.map((entry) => <a href={entry.url} key={entry.id} rel="noreferrer" target="_blank"><span><strong>{entry.label}</strong>{entry.note ? <small>{entry.note}</small> : null}</span><ExternalLink size={13} /></a>)}</div></div>;
}

function ResourcesRecord({ record }: { record: ActivityRecord }) {
  return <section className="workspace-block"><ResourcesContent record={record} /></section>;
}

export function ActivityRecordComponent(props: Props) {
  const { record } = props;
  if (record.type === "summary") return <SummaryRecord record={record} />;
  if (record.type === "product") return <ProductRecord {...props} />;
  if (record.type === "protocol") return <ProtocolRecord {...props} />;
  if (record.type === "checklist" || record.type === "item_list") return <ItemListRecord {...props} />;
  if (record.type === "workout") return <WorkoutRecord {...props} />;
  if (record.type === "recurring_step") return <RecurringStepRecord {...props} />;
  if (record.type === "activity_event") return <ActivityEventRecord record={record} />;
  if (record.type === "equipment") return <EquipmentRecord record={record} />;
  if (record.type === "session_choice") return <SessionChoiceRecord {...props} />;
  if (record.type === "session_log") return <SessionLogRecord {...props} />;
  if (record.type === "strength_session") return <StrengthSessionRecord {...props} />;
  if (record.type === "quick_log") return <QuickLogRecord {...props} />;
  if (record.type === "history" || record.type === "timeline") return <HistoryRecord record={record} />;
  if (record.type === "comparison") return <ComparisonRecord record={record} />;
  if (record.type === "metric" || record.type === "trend") return <MetricRecord record={record} />;
  if (record.type === "adherence") return <AdherenceRecord {...props} />;
  if (record.type === "goal") return <GoalRecord record={record} />;
  if (record.type === "attention") return <AttentionRecord record={record} />;
  if (record.type === "resources") return <ResourcesRecord record={record} />;
  return null;
}
