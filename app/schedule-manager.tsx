"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronRight, MessageCircle, MoreVertical, Plus, RotateCcw, X } from "lucide-react";
import { previewPattern, type AdvancementPolicy, type ScheduleCadence, type SchedulePattern } from "./schedule-model";
import { groupRoutinePatterns, isRotationPattern, isSimpleDailyPattern, type RoutinePatternView } from "./routine-schedule-view";

type Activity = { id: string; clientKey: string; title: string; category: string };
type Variant = { id: string; activityId: string; clientKey: string; name: string; defaultDurationMinutes: number | null };
type PatternView = RoutinePatternView & { preview: Array<{ date: string; activityId: string; activityVariantId: string | null; durationMinutes: number }> };
type NestedScheduledStep = {
  id: string;
  activityId: string;
  activityTitle: string;
  title: string;
  cadence: string;
  completedThisCycle: boolean;
  dueToday: boolean;
  nextDue: string | null;
};
type Props = { open: boolean; initialActivityId?: string | null; onAskLuna: (draft: string) => void; onClose: () => void; onSaved: () => void };
type LoadState = { revision: number; patterns: PatternView[]; nestedScheduledSteps: NestedScheduledStep[]; activities: Activity[]; variants: Variant[] };
type EditorKind = "simple" | "rotation";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

function relativeDateLabel(dateKey: string | null) {
  if (!dateKey) return null;
  const target = new Date(`${dateKey}T12:00:00`);
  const todayKey = localDate();
  const today = new Date(`${todayKey}T12:00:00`);
  const dayOffset = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  if (dayOffset > 1 && dayOffset < 7) return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(target);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(target);
}

function upcomingPatternLabel(pattern: PatternView) {
  const labels = pattern.preview
    .slice(0, 3)
    .map((entry) => relativeDateLabel(entry.date))
    .filter((label): label is string => Boolean(label));
  return labels.length ? `Upcoming · ${labels.join(", ")}` : null;
}

function patternForEditing(pattern: SchedulePattern) {
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

function emptyPattern(position: number, firstActivity?: Activity, name = "New rotation"): SchedulePattern {
  const today = localDate();
  return {
    id: `schedule:${crypto.randomUUID()}`,
    name: firstActivity && name === "New rotation" ? firstActivity.title : name,
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
  const [editorKind, setEditorKind] = useState<EditorKind>("simple");
  const [isCreating, setIsCreating] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [essentialsOpen, setEssentialsOpen] = useState(false);
  const [allActivitiesOpen, setAllActivitiesOpen] = useState(false);
  const [pausedOpen, setPausedOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/schedule?from=${localDate()}`, { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/activities", { cache: "no-store" }).then((response) => response.json()),
    ]).then(([schedule, catalog]) => {
      if (cancelled) return;
      const nextData: LoadState = {
        revision: schedule.revision,
        patterns: schedule.patterns,
        nestedScheduledSteps: schedule.nestedScheduledSteps ?? [],
        activities: catalog.activities,
        variants: catalog.variants,
      };
      setData(nextData);
      if (!initialActivityId) return;
      const existing = nextData.patterns.find((pattern) => !pattern.archived && pattern.steps.some((step) => step.activityId === initialActivityId));
      if (existing) {
        setEditing(patternForEditing(existing));
        setEditorKind(isRotationPattern(existing) ? "rotation" : "simple");
        setIsCreating(false);
      } else {
        const activity = nextData.activities.find((candidate) => candidate.id === initialActivityId);
        if (activity) {
          setEditing(emptyPattern(nextData.patterns.filter((pattern) => !pattern.archived).length, activity));
          setEditorKind("simple");
          setIsCreating(true);
        }
      }
    }).catch(() => {
      if (!cancelled) setSaveState("error");
    });
    return () => { cancelled = true; };
  }, [initialActivityId, open]);

  const activityMap = useMemo(() => new Map(data?.activities.map((activity) => [activity.id, activity]) ?? []), [data]);
  const variantMap = useMemo(() => new Map(data?.variants.map((variant) => [variant.id, variant]) ?? []), [data]);
  const groups = useMemo(() => groupRoutinePatterns(data?.patterns ?? []), [data]);
  const essentialPatterns = useMemo(() => groups.active.filter((pattern) => pattern.steps.some((step) => step.planRole === "essential")), [groups]);
  const essentialActivityCount = useMemo(() => new Set(essentialPatterns.flatMap((pattern) => pattern.steps.filter((step) => step.planRole === "essential").map((step) => step.activityId))).size, [essentialPatterns]);
  const draftPreview = useMemo(() => editing?.steps.length ? previewPattern(editing, localDate(), 3).map((entry) => ({
    date: entry.triggerDate,
    title: activityMap.get(entry.step.activityId)?.title ?? "Activity",
    variant: entry.step.activityVariantId ? variantMap.get(entry.step.activityVariantId)?.name : null,
  })) : [], [activityMap, editing, variantMap]);
  const nestedScheduleGroups = useMemo(() => {
    const grouped = new Map<string, { activityId: string; activityTitle: string; parentSchedule: string; steps: NestedScheduledStep[] }>();
    for (const step of data?.nestedScheduledSteps ?? []) {
      const parentPatterns = data?.patterns.filter((pattern) => !pattern.archived && pattern.steps.some((candidate) => candidate.activityId === step.activityId)) ?? [];
      const parentSchedule = parentPatterns.length === 1
        ? isRotationPattern(parentPatterns[0])
          ? `${cadenceLabel(parentPatterns[0].cadence)} rotation`
          : cadenceLabel(parentPatterns[0].cadence)
        : parentPatterns.length > 1 ? `${parentPatterns.length} routine rules` : "In your routine";
      const current = grouped.get(step.activityId) ?? { activityId: step.activityId, activityTitle: step.activityTitle, parentSchedule, steps: [] };
      current.steps.push(step);
      grouped.set(step.activityId, current);
    }
    return [...grouped.values()];
  }, [data]);

  if (!open) return null;

  function closeEditor() {
    setEditing(null);
    setIsCreating(false);
    setSaveState("idle");
    setAdvancedOpen(false);
  }

  function beginEditing(pattern: PatternView) {
    setEditing(patternForEditing(pattern));
    setEditorKind(isRotationPattern(pattern) ? "rotation" : "simple");
    setIsCreating(false);
    setAdvancedOpen(false);
  }

  function beginRotation() {
    if (!data?.activities.length) return;
    const pattern = emptyPattern(groups.active.length, data.activities[0], "New rotation");
    pattern.steps.push({ ...pattern.steps[0], id: `step:${crypto.randomUUID()}`, position: 1 });
    pattern.name = "New rotation";
    setEditing(pattern);
    setEditorKind("rotation");
    setIsCreating(true);
    setAdvancedOpen(false);
  }

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
    if (editorKind === "rotation" && editing.steps.length < 2) return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: isCreating ? "create" : "update", baseRevision: data.revision, pattern: editing }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The routine could not be saved.");
      const wasArchived = data.patterns.find((pattern) => pattern.id === editing.id)?.archived ?? false;
      const savedPattern = { ...editing, archived: wasArchived, revision: isCreating ? 1 : result.patternRevision, preview: [] } as PatternView;
      setData((current) => current ? {
        ...current,
        revision: result.revision,
        patterns: isCreating ? [...current.patterns, savedPattern] : current.patterns.map((pattern) => pattern.id === editing.id ? savedPattern : pattern),
      } : current);
      closeEditor();
      onSaved();
    } catch {
      setSaveState("error");
    }
  }

  async function setPatternPaused(pattern: PatternView, paused: boolean) {
    if (!data || saveState === "saving") return;
    setSaveState("saving");
    try {
      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: paused ? "archive" : "restore", baseRevision: data.revision, patternId: pattern.id, expectedRevision: pattern.revision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The routine could not be updated.");
      setData((current) => current ? {
        ...current,
        revision: result.revision,
        patterns: current.patterns.map((candidate) => candidate.id === pattern.id ? { ...candidate, archived: paused, revision: candidate.revision + 1, preview: [] } : candidate),
      } : current);
      setSaveState("idle");
      onSaved();
    } catch {
      setSaveState("error");
    }
  }

  function patternTitle(pattern: PatternView) {
    if (isRotationPattern(pattern)) return pattern.name;
    return activityMap.get(pattern.steps[0]?.activityId)?.title ?? pattern.name;
  }

  function rotationSteps(pattern: PatternView) {
    return pattern.steps.map((step) => {
      const activity = activityMap.get(step.activityId)?.title ?? "Activity";
      const variant = step.activityVariantId ? variantMap.get(step.activityVariantId)?.name : null;
      return variant ? `${activity} — ${variant}` : activity;
    }).join(" → ");
  }

  function RuleRow({ pattern, paused = false }: { pattern: PatternView; paused?: boolean }) {
    const rotation = isRotationPattern(pattern);
    const title = patternTitle(pattern);
    const upcoming = !paused && !rotation && !isSimpleDailyPattern(pattern) ? upcomingPatternLabel(pattern) : null;
    return <article className={`routine-rule-row ${paused ? "is-paused" : ""}`}>
      <button className="routine-rule-open" type="button" onClick={() => beginEditing(pattern)}>
        <span className="routine-rule-icon" aria-hidden="true">{rotation ? <RotateCcw size={17} /> : <CalendarDays size={17} />}</span>
        <span className="routine-rule-copy">
          <strong>{title}</strong>
          <span>{paused ? `Paused · ${cadenceLabel(pattern.cadence)}` : rotation ? `${cadenceLabel(pattern.cadence)} · ${pattern.steps.length}-step rotation` : cadenceLabel(pattern.cadence)}</span>
          {rotation ? <small>{rotationSteps(pattern)}</small> : null}
          {upcoming ? <small className="routine-rule-upcoming">{upcoming}</small> : null}
        </span>
      </button>
      <details className="routine-rule-menu">
        <summary aria-label={`More options for ${title}`}><MoreVertical aria-hidden="true" size={17} /></summary>
        <div>{paused
          ? <button type="button" onClick={() => void setPatternPaused(pattern, false)}><RotateCcw aria-hidden="true" size={15} /> Restore to routine</button>
          : <button type="button" onClick={() => void setPatternPaused(pattern, true)}><Archive aria-hidden="true" size={15} /> Pause future days</button>}
        </div>
      </details>
      <button aria-label={`Edit ${title}`} className="routine-rule-disclosure" type="button" onClick={() => beginEditing(pattern)}><ChevronRight aria-hidden="true" size={17} /></button>
    </article>;
  }

  const scheduleSummaryParts = [
    groups.custom.length ? `${groups.custom.length} custom ${groups.custom.length === 1 ? "schedule" : "schedules"}` : null,
    data?.nestedScheduledSteps.length ? `${data.nestedScheduledSteps.length} scheduled ${data.nestedScheduledSteps.length === 1 ? "step" : "steps"}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="settings-modal-backdrop schedule-manager-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-labelledby="schedule-manager-title" aria-modal="true" className="settings-modal schedule-manager-modal" role="dialog">
        <header className="settings-modal-header">
          <div><span>Routine</span><h2 id="schedule-manager-title">Manage routine</h2></div>
          <button aria-label="Close routine manager" type="button" onClick={onClose}><X aria-hidden="true" size={18} /></button>
        </header>
        <div className="schedule-manager-body">
          {!data ? <div className="schedule-manager-loading"><RotateCcw aria-hidden="true" size={17} /> Loading your routine…</div> : editing ? (
            <div className={`routine-editor is-${editorKind}`}>
              <div className="routine-editor-heading">
                <button type="button" onClick={closeEditor}><ChevronRight aria-hidden="true" size={16} /> Back</button>
                <div><span>{editorKind === "rotation" ? "Rotation" : "Activity routine"}</span><h3>{editorKind === "rotation" ? editing.name : activityMap.get(editing.steps[0]?.activityId)?.title ?? editing.name}</h3></div>
              </div>
              <div className="routine-scope-note"><CalendarDays aria-hidden="true" size={17} /><span><strong>Future routine</strong>Changes here affect future days. Today stays as it is.</span></div>

              {editorKind === "rotation" ? <label className="routine-field"><span>Rotation name</span><input maxLength={80} value={editing.name} onChange={(event) => updateEditing((current) => ({ ...current, name: event.target.value }))} /></label> : null}

              <section className="routine-editor-section" aria-labelledby="routine-repeat-heading">
                <div className="routine-editor-section-heading"><span>Schedule</span><h4 id="routine-repeat-heading">When it appears</h4></div>
                <div className="routine-field-grid">
                  <label className="routine-field"><span>Repeats</span><select value={editing.cadence.kind} onChange={(event) => updateCadence(event.target.value as ScheduleCadence["kind"])}><option value="daily">Every day</option><option value="weekdays">Selected weekdays</option><option value="interval_days">Every N days</option></select></label>
                  {editing.cadence.kind === "interval_days" ? <label className="routine-field"><span>Every</span><span className="schedule-inline-number"><input min="1" max="365" type="number" value={editing.cadence.every} onChange={(event) => updateEditing((current) => current.cadence.kind === "interval_days" ? { ...current, cadence: { ...current.cadence, every: Math.max(1, event.target.valueAsNumber || 1) } } : current)} /> days</span></label> : null}
                </div>
                {editing.cadence.kind === "weekdays" ? <fieldset className="weekday-picker"><legend>Days</legend>{WEEKDAYS.map((day, index) => <label key={day}><input checked={editing.cadence.kind === "weekdays" && editing.cadence.weekdays.includes(index)} type="checkbox" onChange={() => updateEditing((current) => {
                  if (current.cadence.kind !== "weekdays") return current;
                  const weekdays = current.cadence.weekdays.includes(index) ? current.cadence.weekdays.filter((value) => value !== index) : [...current.cadence.weekdays, index].sort();
                  return weekdays.length ? { ...current, cadence: { ...current.cadence, weekdays } } : current;
                })} /><span>{day}</span></label>)}</fieldset> : null}
              </section>

              {editorKind === "rotation" ? <section className="routine-editor-section" aria-labelledby="rotation-steps-heading">
                <div className="routine-editor-section-heading is-action"><div><span>Rotation</span><h4 id="rotation-steps-heading">What comes next</h4></div><button type="button" onClick={() => updateEditing((current) => ({ ...current, steps: [...current.steps, { ...current.steps[current.steps.length - 1], id: `step:${crypto.randomUUID()}`, position: current.steps.length, activityVariantId: null }] }))}><Plus aria-hidden="true" size={15} /> Add step</button></div>
                <div className="routine-rotation-steps">{editing.steps.map((step, index) => {
                  const variants = data.variants.filter((variant) => variant.activityId === step.activityId);
                  return <div className="routine-rotation-step" key={step.id}>
                    <span className="sequence-step-number">{index + 1}</span>
                    <label className="routine-field"><span>Activity</span><select value={step.activityId} onChange={(event) => updateStep(index, { activityId: event.target.value, activityVariantId: null })}>{data.activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label>
                    {variants.length ? <label className="routine-field"><span>Variation</span><select value={step.activityVariantId ?? ""} onChange={(event) => updateStep(index, { activityVariantId: event.target.value || null })}><option value="">Standard</option>{variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.name}</option>)}</select></label> : null}
                    <div className="routine-step-actions"><button aria-label="Move step up" disabled={index === 0} type="button" onClick={() => moveStep(index, -1)}><ArrowUp size={15} /></button><button aria-label="Move step down" disabled={index === editing.steps.length - 1} type="button" onClick={() => moveStep(index, 1)}><ArrowDown size={15} /></button><button aria-label="Remove step" disabled={editing.steps.length <= 2} type="button" onClick={() => updateEditing((current) => { const next = current.steps.filter((_, stepIndex) => stepIndex !== index).map((candidate, position) => ({ ...candidate, position })); return { ...current, initialStepPosition: Math.min(current.initialStepPosition, next.length - 1), steps: next }; })}><X size={15} /></button></div>
                  </div>;
                })}</div>
                <label className="routine-field routine-advance-field"><span>Move to the next step</span><select value={editing.advancement.kind === "calendar" ? "calendar" : editing.advancement.advanceOnSkip ? "completion-skip" : "completion"} onChange={(event) => updateEditing((current) => ({ ...current, advancement: event.target.value === "calendar" ? { kind: "calendar" } : { kind: "completion", advanceOnSkip: event.target.value === "completion-skip" } as AdvancementPolicy }))}><option value="calendar">On each scheduled day</option><option value="completion">After I complete it</option><option value="completion-skip">After I complete or skip it</option></select></label>
              </section> : null}

              <button aria-expanded={advancedOpen} className="routine-advanced-toggle" type="button" onClick={() => setAdvancedOpen((current) => !current)}><span>Advanced options</span><ChevronDown aria-hidden="true" size={16} /></button>
              {advancedOpen ? <div className="routine-advanced-fields">
                <label className="routine-field"><span>Begins</span><input type="date" value={editing.effectiveDate} onChange={(event) => updateEditing((current) => ({ ...current, effectiveDate: event.target.value, anchorDate: event.target.value, cadence: current.cadence.kind === "interval_days" ? { ...current.cadence, anchorDate: event.target.value } : current.cadence }))} /></label>
                <label className="routine-field"><span>Ends</span><input min={editing.effectiveDate} type="date" value={editing.endDate ?? ""} onChange={(event) => updateEditing((current) => ({ ...current, endDate: event.target.value || null }))} /></label>
                {editorKind === "rotation" ? <label className="routine-field"><span>Starts with</span><select value={editing.initialStepPosition} onChange={(event) => updateEditing((current) => ({ ...current, initialStepPosition: Number(event.target.value) }))}>{editing.steps.map((step, index) => <option value={index} key={step.id}>{index + 1}. {activityMap.get(step.activityId)?.title ?? "Activity"}{step.activityVariantId ? ` — ${variantMap.get(step.activityVariantId)?.name ?? "Variation"}` : ""}</option>)}</select></label> : null}
              </div> : null}

              {editorKind === "rotation" ? <div className="routine-preview"><span>Next three</span><div>{draftPreview.map((entry) => <div key={`${entry.date}-${entry.title}`}><time>{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${entry.date}T12:00:00`))}</time><strong>{entry.title}{entry.variant ? ` — ${entry.variant}` : ""}</strong></div>)}</div></div> : null}
              {saveState === "error" ? <p className="settings-save-error">That routine didn’t save. Reload if it changed somewhere else, then try again.</p> : null}
              <div className="routine-editor-actions"><button type="button" onClick={closeEditor}>Cancel</button><button className="confirm-add-button" disabled={!editing.name.trim() || editorKind === "rotation" && editing.steps.length < 2 || saveState === "saving"} type="button" onClick={() => void savePattern()}>{saveState === "saving" ? "Saving…" : "Save future routine"}</button></div>
            </div>
          ) : (
            <div className="routine-manager">
              <div className="routine-manager-overview">
                <div><span>Your plan</span><strong>{essentialActivityCount} {essentialActivityCount === 1 ? "essential" : "essentials"}</strong><p>{groups.activityCount} {groups.activityCount === 1 ? "activity" : "activities"} in All Activities</p>{scheduleSummaryParts ? <small>{scheduleSummaryParts}</small> : null}</div>
                <button type="button" onClick={() => onAskLuna("Help me adjust my plan, including which activities are essential and how future activities are scheduled. Ask only what you need before proposing changes.")}><MessageCircle aria-hidden="true" size={16} /> Adjust with Luna</button>
              </div>

              <section className="routine-group is-collapsible" aria-labelledby="essential-routines-heading">
                <button aria-expanded={essentialsOpen} className="routine-group-toggle" type="button" onClick={() => setEssentialsOpen((current) => !current)}><span><small>Core set</small><strong id="essential-routines-heading">Essentials</strong></span><span>{essentialActivityCount}<ChevronDown aria-hidden="true" size={17} /></span></button>
                {essentialsOpen ? <div className="routine-rule-list">{essentialPatterns.map((rule) => <RuleRow pattern={rule as PatternView} key={rule.id} />)}</div> : null}
              </section>

              <section className="routine-group is-collapsible" aria-labelledby="all-routines-heading">
                <button aria-expanded={allActivitiesOpen} className="routine-group-toggle" type="button" onClick={() => setAllActivitiesOpen((current) => !current)}><span><small>Activity library</small><strong id="all-routines-heading">All Activities</strong></span><span>{groups.activityCount}<ChevronDown aria-hidden="true" size={17} /></span></button>
                {allActivitiesOpen ? <div className="routine-rule-list">{groups.active.map((rule) => <RuleRow pattern={rule as PatternView} key={rule.id} />)}</div> : null}
              </section>

              <section className="routine-group" aria-labelledby="custom-routines-heading">
                <div className="routine-group-heading"><div><span>Custom</span><h3 id="custom-routines-heading">Custom days & rotations</h3></div><button type="button" onClick={beginRotation}><Plus aria-hidden="true" size={15} /> New rotation</button></div>
                {groups.custom.length ? <div className="routine-rule-list">{groups.custom.map((rule) => <RuleRow pattern={rule as PatternView} key={rule.id} />)}</div> : <div className="routine-group-empty"><CalendarDays aria-hidden="true" size={18} /><span><strong>No custom activity days or rotations yet.</strong></span></div>}
              </section>

              {nestedScheduleGroups.length ? <section className="routine-group" aria-labelledby="nested-routines-heading">
                <div className="routine-group-heading"><div><span>Within activities</span><h3 id="nested-routines-heading">Scheduled steps</h3></div><button type="button" onClick={() => {
                  const onlyGroup = nestedScheduleGroups.length === 1 ? nestedScheduleGroups[0] : null;
                  const onlyStep = onlyGroup?.steps.length === 1 ? onlyGroup.steps[0] : null;
                  onAskLuna(onlyGroup && onlyStep
                    ? `Help me adjust the ${onlyStep.title} schedule inside ${onlyGroup.activityTitle}. Ask only what you need before proposing a change to future occurrences.`
                    : "Help me adjust a scheduled step inside one of my activities. Start by asking which activity or step I mean, then prepare any future change for confirmation.");
                }}><MessageCircle aria-hidden="true" size={15} /> Adjust</button></div>
                <div className="routine-nested-list">{nestedScheduleGroups.map((group) => <article className="routine-nested-row" key={group.activityId}>
                  <span className="routine-rule-icon" aria-hidden="true"><CalendarDays size={17} /></span>
                  <div className="routine-nested-copy">
                    <strong>{group.activityTitle}</strong>
                    <span>{group.parentSchedule}</span>
                    <div>{group.steps.map((step) => {
                      const next = relativeDateLabel(step.nextDue);
                      const status = step.dueToday ? "Due today" : next ? `Next ${next}` : step.completedThisCycle ? "Done this cycle" : null;
                      return <p className="routine-nested-step" key={step.id}><b>{step.title}</b><small><span>{step.cadence}</span>{status ? <><i aria-hidden="true">·</i><em>{status}</em></> : null}</small></p>;
                    })}</div>
                  </div>
                </article>)}</div>
              </section> : null}

              {groups.paused.length ? <section className="routine-group is-collapsible" aria-labelledby="paused-routines-heading">
                <button aria-expanded={pausedOpen} className="routine-group-toggle" type="button" onClick={() => setPausedOpen((current) => !current)}><span><small>Not appearing</small><strong id="paused-routines-heading">Paused</strong></span><span>{groups.paused.length}<ChevronDown aria-hidden="true" size={17} /></span></button>
                {pausedOpen ? <div className="routine-rule-list">{groups.paused.map((rule) => <RuleRow paused pattern={rule as PatternView} key={rule.id} />)}</div> : null}
              </section> : null}
              {saveState === "error" ? <p className="settings-save-error">Your routine changed somewhere else. Close this view and try again.</p> : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
