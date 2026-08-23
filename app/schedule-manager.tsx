"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, CalendarDays, MessageCircle, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { previewPattern, type AdvancementPolicy, type ScheduleCadence, type SchedulePattern } from "./schedule-model";

type Activity = { id: string; clientKey: string; title: string; category: string };
type Variant = { id: string; activityId: string; clientKey: string; name: string; defaultDurationMinutes: number | null };
type PatternView = SchedulePattern & { preview: Array<{ date: string; activityId: string; activityVariantId: string | null; durationMinutes: number }> };

type Props = { open: boolean; initialActivityId?: string | null; onAskLuna: (draft: string) => void; onClose: () => void; onSaved: () => void };
type LoadState = { revision: number; patterns: PatternView[]; activities: Activity[]; variants: Variant[] };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CATEGORIES = ["Light", "Recharge", "Training", "Fuel", "Care", "Logistics", "Creativity", "Spirit"];
const LEGACY_EFFECTIVE_DATE = "1970-01-01";

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function cadenceLabel(cadence: ScheduleCadence) {
  if (cadence.kind === "daily") return "Every day";
  if (cadence.kind === "interval_days") return cadence.every === 2 ? "Every other day" : `Every ${cadence.every} days`;
  const days = cadence.weekdays.map((day) => WEEKDAYS[day]).join(", ");
  return cadence.intervalWeeks > 1 ? `${days}, every ${cadence.intervalWeeks} weeks` : days;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function patternForEditing(pattern: SchedulePattern): SchedulePattern {
  if (pattern.effectiveDate !== LEGACY_EFFECTIVE_DATE) return { ...pattern, steps: pattern.steps.map((step) => ({ ...step })) };
  const today = localDate();
  return {
    ...pattern,
    effectiveDate: today,
    anchorDate: today,
    cadence: pattern.cadence.kind === "interval_days" ? { ...pattern.cadence, anchorDate: today } : pattern.cadence,
    steps: pattern.steps.map((step) => ({ ...step })),
  };
}

function emptyPattern(position: number, firstActivity?: Activity): SchedulePattern {
  const today = localDate();
  const id = `schedule:${crypto.randomUUID()}`;
  return {
    id,
    name: "New schedule",
    position,
    cadence: { kind: "daily" },
    advancement: { kind: "calendar" },
    anchorDate: today,
    initialStepPosition: 0,
    effectiveDate: today,
    endDate: null,
    revision: 1,
    steps: firstActivity ? [{
      id: `step:${crypto.randomUUID()}`,
      activityId: firstActivity.id,
      activityVariantId: null,
      position: 0,
      durationMinutes: 15,
      displayLabelOverride: null,
      planRole: "essential",
    }] : [],
  };
}

export function ScheduleManager({ open, initialActivityId, onAskLuna, onClose, onSaved }: Props) {
  const [data, setData] = useState<LoadState | null>(null);
  const [editing, setEditing] = useState<SchedulePattern | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [newVariantStep, setNewVariantStep] = useState<number | null>(null);
  const [newVariantName, setNewVariantName] = useState("");
  const [isAddingActivity, setIsAddingActivity] = useState(false);
  const [newActivityName, setNewActivityName] = useState("");
  const [newActivityCategory, setNewActivityCategory] = useState("Care");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/schedule?from=${localDate()}`, { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/activities", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([schedule, catalog]) => {
      if (!cancelled) {
        const nextData = { revision: schedule.revision, patterns: schedule.patterns, activities: catalog.activities, variants: catalog.variants };
        setData(nextData);
        if (initialActivityId) {
          const activity = nextData.activities.find((candidate: Activity) => candidate.id === initialActivityId);
          if (activity) {
            setIsCreating(true);
            setEditing(emptyPattern(nextData.patterns.length, activity));
          }
        }
      }
    }).catch(() => {
      if (!cancelled) setSaveState("error");
    });
    return () => { cancelled = true; };
  }, [initialActivityId, open]);

  const activityMap = useMemo(() => new Map(data?.activities.map((activity) => [activity.id, activity]) ?? []), [data]);
  const variantMap = useMemo(() => new Map(data?.variants.map((variant) => [variant.id, variant]) ?? []), [data]);
  const draftPreview = useMemo(() => editing?.steps.length ? previewPattern(editing, localDate(), 6).map((entry) => ({
    date: entry.triggerDate,
    title: activityMap.get(entry.step.activityId)?.title ?? "Activity",
    variant: entry.step.activityVariantId ? variantMap.get(entry.step.activityVariantId)?.name : null,
  })) : [], [activityMap, editing, variantMap]);

  if (!open) return null;

  function updateEditing(update: (pattern: SchedulePattern) => SchedulePattern) {
    setEditing((current) => current ? update(current) : current);
  }

  function updateCadence(kind: ScheduleCadence["kind"]) {
    updateEditing((pattern) => ({
      ...pattern,
      cadence: kind === "daily"
        ? { kind: "daily" }
        : kind === "interval_days"
          ? { kind: "interval_days", every: 2, anchorDate: pattern.anchorDate }
          : { kind: "weekdays", weekdays: [1, 3, 5], intervalWeeks: 1 },
    }));
  }

  function updateStep(index: number, patch: Partial<SchedulePattern["steps"][number]>) {
    updateEditing((pattern) => ({
      ...pattern,
      steps: pattern.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step),
    }));
  }

  function moveStep(index: number, delta: -1 | 1) {
    updateEditing((pattern) => {
      const next = [...pattern.steps];
      const target = index + delta;
      if (target < 0 || target >= next.length) return pattern;
      const initialStepId = pattern.steps[pattern.initialStepPosition]?.id;
      [next[index], next[target]] = [next[target], next[index]];
      return {
        ...pattern,
        initialStepPosition: Math.max(0, next.findIndex((step) => step.id === initialStepId)),
        steps: next.map((step, position) => ({ ...step, position })),
      };
    });
  }

  async function savePattern() {
    if (!data || !editing || !editing.steps.length || saveState === "saving") return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: isCreating ? "create" : "update", baseRevision: data.revision, pattern: editing }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The schedule could not be saved.");
      setData((current) => current ? {
        ...current,
        revision: result.revision,
        patterns: isCreating
          ? [...current.patterns, { ...editing, revision: 1, preview: [] }]
          : current.patterns.map((pattern) => pattern.id === editing.id ? { ...editing, revision: result.patternRevision, preview: [] } : pattern),
      } : current);
      setEditing(null);
      setIsCreating(false);
      setSaveState("idle");
      onSaved();
    } catch {
      setSaveState("error");
    }
  }

  async function archivePattern(pattern: PatternView) {
    if (!data) return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "archive", baseRevision: data.revision, patternId: pattern.id, expectedRevision: pattern.revision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData((current) => current ? { ...current, revision: result.revision, patterns: current.patterns.filter((candidate) => candidate.id !== pattern.id) } : current);
      setSaveState("idle");
      onSaved();
    } catch {
      setSaveState("error");
    }
  }

  async function createVariant(stepIndex: number) {
    if (!data || !editing || !newVariantName.trim()) return;
    const step = editing.steps[stepIndex];
    const activity = data.activities.find((candidate) => candidate.id === step.activityId);
    if (!activity) return;
    setSaveState("saving");
    try {
      const clientKey = `variant-${crypto.randomUUID()}`;
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "create-variant", activityId: activity.id, clientKey, name: newVariantName.trim(), defaultDurationMinutes: step.durationMinutes }),
      });
      const result = await response.json() as { variantId?: string; error?: string };
      if (!response.ok || !result.variantId) throw new Error(result.error || "The variant could not be created.");
      const variant = { id: result.variantId, activityId: activity.id, clientKey, name: newVariantName.trim(), defaultDurationMinutes: step.durationMinutes };
      setData((current) => current ? { ...current, variants: [...current.variants, variant] } : current);
      updateStep(stepIndex, { activityVariantId: result.variantId });
      setNewVariantStep(null);
      setNewVariantName("");
      setSaveState("idle");
    } catch {
      setSaveState("error");
    }
  }

  async function createActivity() {
    if (!data || !editing || !newActivityName.trim()) return;
    setSaveState("saving");
    try {
      const clientKey = `custom-${crypto.randomUUID()}`;
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientKey, title: newActivityName.trim(), category: newActivityCategory,
          duration: 15, icon: "✦", color: "#a8c96d", date: localDate(),
          schedule: { kind: "none" }, includeToday: false,
        }),
      });
      const result = await response.json() as { activity?: Activity; error?: string };
      if (!response.ok || !result.activity) throw new Error(result.error || "The activity could not be created.");
      setData((current) => current ? { ...current, activities: [...current.activities, result.activity!] } : current);
      updateEditing((pattern) => ({ ...pattern, steps: [...pattern.steps, { id: `step:${crypto.randomUUID()}`, activityId: result.activity!.id, activityVariantId: null, position: pattern.steps.length, durationMinutes: 15, displayLabelOverride: null, planRole: "essential" }] }));
      setIsAddingActivity(false);
      setNewActivityName("");
      setSaveState("idle");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="settings-modal-backdrop schedule-manager-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-labelledby="schedule-manager-title" aria-modal="true" className="settings-modal schedule-manager-modal" role="dialog">
        <header className="settings-modal-header">
          <div><span>Routine</span><h2 id="schedule-manager-title">Manage schedule</h2></div>
          <button aria-label="Close schedule manager" type="button" onClick={onClose}><X aria-hidden="true" size={18} /></button>
        </header>
        <div className="schedule-manager-body">
          {!data ? <div className="schedule-manager-loading"><RotateCcw aria-hidden="true" size={17} /> Loading your schedule…</div> : editing ? (
            <div className="schedule-editor">
              <div className="schedule-editor-heading">
                <div><span>{isCreating ? "New sequence" : "Edit schedule"}</span><h3>{editing.name}</h3></div>
                <button type="button" onClick={() => { setEditing(null); setIsCreating(false); setSaveState("idle"); }}>Back to schedules</button>
              </div>
              <div className="schedule-editor-grid">
                <label><span>Name</span><input maxLength={80} value={editing.name} onChange={(event) => updateEditing((pattern) => ({ ...pattern, name: event.target.value }))} /></label>
                <label><span>Repeats</span><select value={editing.cadence.kind} onChange={(event) => updateCadence(event.target.value as ScheduleCadence["kind"])}><option value="daily">Every day</option><option value="weekdays">Selected weekdays</option><option value="interval_days">Every N days</option></select></label>
                {editing.cadence.kind === "weekdays" ? <fieldset className="weekday-picker"><legend>Days</legend>{WEEKDAYS.map((day, index) => <label key={day}><input checked={editing.cadence.kind === "weekdays" && editing.cadence.weekdays.includes(index)} type="checkbox" onChange={() => updateEditing((pattern) => {
                  if (pattern.cadence.kind !== "weekdays") return pattern;
                  const weekdays = pattern.cadence.weekdays.includes(index) ? pattern.cadence.weekdays.filter((value) => value !== index) : [...pattern.cadence.weekdays, index].sort();
                  return weekdays.length ? { ...pattern, cadence: { ...pattern.cadence, weekdays } } : pattern;
                })} /><span>{day}</span></label>)}</fieldset> : null}
                {editing.cadence.kind === "interval_days" ? <label><span>Every</span><span className="schedule-inline-number"><input min="1" max="365" type="number" value={editing.cadence.every} onChange={(event) => updateEditing((pattern) => pattern.cadence.kind === "interval_days" ? { ...pattern, cadence: { ...pattern.cadence, every: Math.max(1, event.target.valueAsNumber || 1) } } : pattern)} /> days</span></label> : null}
                <label><span>Begins</span><input type="date" value={editing.effectiveDate} onChange={(event) => updateEditing((pattern) => ({ ...pattern, effectiveDate: event.target.value, anchorDate: event.target.value, cadence: pattern.cadence.kind === "interval_days" ? { ...pattern.cadence, anchorDate: event.target.value } : pattern.cadence }))} /></label>
                <label><span>Ends</span><input min={editing.effectiveDate} type="date" value={editing.endDate ?? ""} onChange={(event) => updateEditing((pattern) => ({ ...pattern, endDate: event.target.value || null }))} /></label>
                <label><span>Sequence moves</span><select value={editing.advancement.kind === "calendar" ? "calendar" : editing.advancement.advanceOnSkip ? "completion-skip" : "completion"} onChange={(event) => updateEditing((pattern) => ({ ...pattern, advancement: event.target.value === "calendar" ? { kind: "calendar" } : { kind: "completion", advanceOnSkip: event.target.value === "completion-skip" } as AdvancementPolicy }))}><option value="calendar">With the calendar</option><option value="completion">When completed</option><option value="completion-skip">When completed or skipped</option></select></label>
                {editing.steps.length > 1 ? <label><span>Starts with</span><select value={editing.initialStepPosition} onChange={(event) => updateEditing((pattern) => ({ ...pattern, initialStepPosition: Number(event.target.value) }))}>{editing.steps.map((step, index) => <option value={index} key={step.id}>Step {index + 1} · {activityMap.get(step.activityId)?.title ?? "Activity"}{step.activityVariantId ? ` — ${variantMap.get(step.activityVariantId)?.name ?? "Variant"}` : ""}</option>)}</select></label> : null}
              </div>
              <div className="sequence-steps">
                <div className="sequence-section-heading"><div><span>Sequence</span><p>One step appears each time this schedule runs.</p></div><div><button type="button" onClick={() => setIsAddingActivity(true)}><Plus size={15} /> New activity</button><button type="button" disabled={!data.activities.length} onClick={() => updateEditing((pattern) => ({ ...pattern, steps: [...pattern.steps, { id: `step:${crypto.randomUUID()}`, activityId: data.activities[0].id, activityVariantId: null, position: pattern.steps.length, durationMinutes: 15, displayLabelOverride: null, planRole: "essential" }] }))}><Plus size={15} /> Add step</button></div></div>
                {editing.steps.map((step, index) => {
                  const variants = data.variants.filter((variant) => variant.activityId === step.activityId);
                  return <div className="sequence-step" key={step.id}>
                    <span className="sequence-step-number">{index + 1}</span>
                    <label><span>Activity</span><select value={step.activityId} onChange={(event) => updateStep(index, { activityId: event.target.value, activityVariantId: null })}>{data.activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label>
                    <label className="sequence-variant-field"><span>Variant</span><select value={step.activityVariantId ?? ""} onChange={(event) => updateStep(index, { activityVariantId: event.target.value || null })}><option value="">None</option>{variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.name}</option>)}</select><button type="button" onClick={() => { setNewVariantStep(index); setNewVariantName(""); }}>New variant</button></label>
                    <label><span>Minutes</span><input min="5" max="480" type="number" value={step.durationMinutes} onChange={(event) => updateStep(index, { durationMinutes: Math.max(5, event.target.valueAsNumber || 5) })} /></label>
                    <label><span>Daily role</span><select value={step.planRole} onChange={(event) => updateStep(index, { planRole: event.target.value === "extra" ? "extra" : "essential" })}><option value="essential">Essential</option><option value="extra">Go Further</option></select></label>
                    <label className="sequence-label-field"><span>Display label</span><input maxLength={60} placeholder="Optional for this step" value={step.displayLabelOverride ?? ""} onChange={(event) => updateStep(index, { displayLabelOverride: event.target.value || null })} /></label>
                    <div className="sequence-step-actions"><button aria-label="Move step up" disabled={index === 0} type="button" onClick={() => moveStep(index, -1)}><ArrowUp size={15} /></button><button aria-label="Move step down" disabled={index === editing.steps.length - 1} type="button" onClick={() => moveStep(index, 1)}><ArrowDown size={15} /></button><button aria-label="Remove step" disabled={editing.steps.length === 1} type="button" onClick={() => updateEditing((pattern) => { const initialStepId = pattern.steps[pattern.initialStepPosition]?.id; const next = pattern.steps.filter((_, stepIndex) => stepIndex !== index).map((candidate, position) => ({ ...candidate, position })); const retainedInitial = next.findIndex((step) => step.id === initialStepId); return { ...pattern, initialStepPosition: retainedInitial >= 0 ? retainedInitial : Math.min(index, next.length - 1), steps: next }; })}><Trash2 size={15} /></button></div>
                  </div>;
                })}
                {newVariantStep !== null ? <form className="sequence-new-variant" onSubmit={(event) => { event.preventDefault(); void createVariant(newVariantStep); }}><label htmlFor="new-sequence-variant">New variant for {activityMap.get(editing.steps[newVariantStep]?.activityId)?.title}<input id="new-sequence-variant" maxLength={60} placeholder="e.g. Leg day" value={newVariantName} onChange={(event) => setNewVariantName(event.target.value)} /></label><div><button type="button" onClick={() => setNewVariantStep(null)}>Cancel</button><button disabled={!newVariantName.trim() || saveState === "saving"} type="submit">Add variant</button></div></form> : null}
                {isAddingActivity ? <form className="sequence-new-variant" onSubmit={(event) => { event.preventDefault(); void createActivity(); }}><label htmlFor="new-sequence-activity">New activity<input id="new-sequence-activity" maxLength={60} placeholder="e.g. Cardio" value={newActivityName} onChange={(event) => setNewActivityName(event.target.value)} /></label><label>Category<select value={newActivityCategory} onChange={(event) => setNewActivityCategory(event.target.value)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><div><button type="button" onClick={() => setIsAddingActivity(false)}>Cancel</button><button disabled={!newActivityName.trim() || saveState === "saving"} type="submit">Create and add</button></div></form> : null}
              </div>
              <div className="schedule-preview"><span>Coming up</span><div>{draftPreview.map((entry) => <div key={`${entry.date}-${entry.title}`}><time>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${entry.date}T12:00:00`))}</time><strong>{entry.title}{entry.variant ? ` — ${entry.variant}` : ""}</strong></div>)}</div></div>
              {saveState === "error" ? <p className="settings-save-error">That schedule didn’t save. Reload if it changed somewhere else, then try again.</p> : null}
              <div className="schedule-editor-actions"><button type="button" onClick={() => setEditing(null)}>Cancel</button><button className="confirm-add-button" disabled={!editing.name.trim() || !editing.steps.length || saveState === "saving"} type="button" onClick={() => void savePattern()}>{saveState === "saving" ? "Saving…" : "Save schedule"}</button></div>
            </div>
          ) : (
            <>
              <div className="schedule-manager-intro"><div><CalendarDays aria-hidden="true" size={18} /><div><strong>Your recurring rhythm</strong><p>Simple repeats and rotating sequences live together here. Today-only changes stay in Today.</p></div></div><button type="button" onClick={() => { setIsCreating(true); setEditing(emptyPattern(data.patterns.length, data.activities[0])); }}><Plus size={16} /> Create sequence</button></div>
              <div className="schedule-pattern-list">{data.patterns.map((pattern) => <article className="schedule-pattern-card" key={pattern.id}>
                <div className="schedule-pattern-summary"><div><span>{cadenceLabel(pattern.cadence)}</span><h3>{pattern.name}</h3><p>{pattern.steps.map((step) => `${activityMap.get(step.activityId)?.title ?? "Activity"}${step.activityVariantId ? ` — ${variantMap.get(step.activityVariantId)?.name ?? "Variant"}` : ""}`).join(" → ")}</p><small>{pattern.effectiveDate === LEGACY_EFFECTIVE_DATE ? "Active now" : `Begins ${dateLabel(pattern.effectiveDate)}`}{pattern.endDate ? ` · Ends ${dateLabel(pattern.endDate)}` : ""}</small></div><strong>{pattern.advancement.kind === "calendar" ? "Calendar sequence" : "Moves when done"}</strong></div>
                <div className="schedule-pattern-preview">{pattern.preview.slice(0, 4).map((entry) => <span key={`${entry.date}-${entry.activityId}`}><time>{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${entry.date}T12:00:00`))}</time>{activityMap.get(entry.activityId)?.title}{entry.activityVariantId ? ` — ${variantMap.get(entry.activityVariantId)?.name}` : ""}</span>)}</div>
                <footer><button type="button" onClick={() => { setIsCreating(false); setEditing(patternForEditing(pattern)); }}>Edit</button><button type="button" onClick={() => onAskLuna(`Help me adjust the “${pattern.name}” schedule. Ask only what you need before proposing a change.`)}><MessageCircle size={14} /> Ask Luna</button><button type="button" onClick={() => void archivePattern(pattern)}><Archive size={14} /> Pause</button></footer>
              </article>)}</div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
