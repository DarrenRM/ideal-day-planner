"use client";

import { AlertTriangle, CalendarCheck, Check, ExternalLink, Package, Plus, Sparkles, Target, TrendingUp, Wrench } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { formatActivityRecordDate } from "./activity-record-format";
import type { ActivityRecord } from "./activity-record-model";
import { compactRecurringTitle, recurringCadenceLabel, recurringStepScheduleStatus, type RecurringCadence } from "./recurring-step-schedule";

export type RecordMutation = (recordKey: string, operation: string, payload: Record<string, unknown>) => Promise<void>;

type Props = { record: ActivityRecord; onMutate: RecordMutation; presentation?: "default" | "compact" | "featured"; supportingRecords?: ActivityRecord[] };
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

function SessionChoiceRecord({ record, onMutate }: Props) {
  const data = record.data as {
    prompt?: string;
    options?: Array<{ id: string; label: string; detail?: string }>;
    selections?: Array<{ date: string; optionId: string }>;
    activeSelection?: { optionId: string; startDate: string; endDate: string; reason?: string };
  };
  const today = localDateKey();
  const exactSelection = data.selections?.find((entry) => entry.date === today)?.optionId;
  const plannedSelection = data.activeSelection && data.activeSelection.startDate <= today && today <= data.activeSelection.endDate
    ? data.activeSelection.optionId
    : undefined;
  const selected = exactSelection ?? plannedSelection;
  return <section className="workspace-block session-choice-record"><Heading eyebrow="Today" title={record.title} />
    {data.prompt ? <p>{data.prompt}</p> : null}<div>{data.options?.map((option) => <button aria-pressed={selected === option.id} className={selected === option.id ? "is-selected" : ""} key={option.id} type="button" onClick={() => void onMutate(record.key, "select_session_choice", { optionId: option.id })}><span>{selected === option.id ? <Check size={12} /> : null}</span><div><strong>{option.label}</strong>{option.detail ? <small>{option.detail}</small> : null}{data.activeSelection?.optionId === option.id ? <em>Planned through {formatActivityRecordDate(data.activeSelection.endDate)}</em> : null}</div></button>)}</div>
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
