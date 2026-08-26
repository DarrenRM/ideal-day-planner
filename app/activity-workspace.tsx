"use client";

import { CalendarClock, Check, EllipsisVertical, Hourglass, MessageCircle, Pause, Play, RotateCcw, Sparkles, Timer as TimerIcon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivityRecordComponent, type RecordMutation } from "./activity-record-components";
import { hasUsefulActivityRecordData, type ActivityRecord } from "./activity-record-model";
import { hasUsefulRoutineComponent, type CountdownWorkspaceComponent, type DataWorkspaceComponent, type RoutineWorkspaceComponent, type TimerWorkspaceComponent, type WorkspaceDocument } from "./workspace-model";
import { orderWorkspaceDisplayItems, type WorkspaceDisplayRole } from "./workspace-order";
import type { ActivityFollowUp } from "./follow-up-model";
import { selectedSessionOptionId, type SessionChoiceData, type SessionLogData } from "./session-log-model";
import { formatScheduleOccurrenceDate, scheduleOccurrenceDetail } from "./schedule-summary";
import { dailyCompletionStreak, normalizedCompletionDates, recurringCompletionStreak } from "./streak-model";
import { StreakTrack } from "./streak-track";
import { recurringStepScheduleStatus, type RecurringCadence } from "./recurring-step-schedule";

export type ActivityScheduleSummary = {
  patternId: string;
  name: string;
  referenceDate: string;
  cadenceLabel: string;
  upcoming: Array<{ date: string; title: string }>;
};

export type WorkspaceActivity = {
  id: string;
  title: string;
  duration: number;
  category: string;
  color: string;
  timelineEnabled: boolean;
  completedToday?: boolean;
  recentRuns?: Array<{ planDate: string; status: string; completedAt?: string | null; completedSubjectKeys?: string[] }>;
};

type ActivityWorkspaceProps = {
  activity: WorkspaceActivity;
  workspace: WorkspaceDocument;
  records: ActivityRecord[];
  onRecordMutation: RecordMutation;
  onTalkWithLuna: () => void;
  recordError?: string | null;
  workState?: "building" | "waiting" | null;
  workTitle?: string | null;
  workDetail?: string | null;
  followUps?: ActivityFollowUp[];
  scheduleSummary?: ActivityScheduleSummary | null;
  showEmptyState?: boolean;
  onFollowUpMutation?: (id: string, operation: "reschedule" | "dismiss", dueDate?: string) => void;
  onManageSchedule?: () => void;
};

export function hasVisibleActivityWorkspace(activity: WorkspaceActivity, workspace: WorkspaceDocument, records: ActivityRecord[]) {
  const recordsByKey = new Map(records.map((record) => [record.key, record]));
  return supportsStarterStreak(activity) || workspace.components.some((component) => {
    if (component.type === "timer" || component.type === "countdown") return true;
    if (component.type === "routine") return hasUsefulRoutineComponent(component);
    const record = recordsByKey.get((component as DataWorkspaceComponent).recordKey);
    return Boolean(record && hasUsefulActivityRecordData(record, {
      activityTitle: activity.title,
      plannedDurationMinutes: activity.timelineEnabled ? activity.duration : undefined,
    }));
  });
}

function supportsStarterStreak(activity: Pick<WorkspaceActivity, "title" | "category">) {
  const identity = `${activity.title} ${activity.category}`.toLowerCase();
  return /skin|hair|serum|daily routine|morning routine|evening routine/.test(identity);
}

function localDateKey() {
  return new Date().toLocaleDateString("en-CA");
}

function followUpReason(title: string) {
  const normalized = title.trim().replace(/[.!?]+$/, "");
  if (!normalized) return "what you wanted to revisit";
  const reason = `${normalized.charAt(0).toLowerCase()}${normalized.slice(1)}`;
  return /^(your|the|a|an)\b/i.test(reason) ? reason : `your ${reason}`;
}

function formatFollowUpDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    ...(year !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
}

function activityCompletionDates(activity: WorkspaceActivity) {
  const today = localDateKey();
  const completedDates = (activity.recentRuns ?? [])
    .filter((run) => run.status === "completed")
    .map((run) => run.planDate);
  if (activity.completedToday) completedDates.push(today);
  return normalizedCompletionDates(completedDates);
}

function productCompletionDates(activity: WorkspaceActivity, subjectKey: string) {
  return normalizedCompletionDates((activity.recentRuns ?? [])
    .filter((run) => run.status === "completed" && run.completedSubjectKeys?.includes(subjectKey))
    .map((run) => run.planDate));
}

function subjectRhythmSignature(record: ActivityRecord) {
  if (record.type === "adherence") {
    const effectiveDate = typeof record.data.effectiveDate === "string" ? record.data.effectiveDate : "";
    return effectiveDate ? `daily:${effectiveDate}` : null;
  }
  if (record.type !== "recurring_step") return null;
  const anchorDate = typeof record.data.anchorDate === "string" ? record.data.anchorDate : "";
  const cadence = record.data.cadence && typeof record.data.cadence === "object" ? record.data.cadence : null;
  return anchorDate && cadence ? `recurring:${anchorDate}:${JSON.stringify(cadence)}` : null;
}

type ProductIdentity = {
  kind?: "product" | "device";
  name?: string;
  manufacturer?: string;
  variant?: string;
  notes?: string;
  routineAction?: string;
};

function productRoutineAction(record: ActivityRecord) {
  const data = record.data as ProductIdentity;
  if (data.routineAction?.trim()) return data.routineAction.trim();
  const identity = [data.name, data.manufacturer, data.variant, data.notes, record.title].filter(Boolean).join(" ").toLowerCase();
  if (/tooth|oral|dental|brightbrush|brisk/.test(identity)) return "Brush teeth";
  if (/retinol|face serum|facial serum/.test(identity)) return "Face serum";
  if (/hair|scalp|shampoo|conditioner/.test(identity)) return "Hair care";
  if (/cleanser|cleansing|soap/.test(identity)) return "Cleanse";
  if (/moisturi[sz]|face cream|facial cream/.test(identity)) return "Moisturize";
  if (/razor|shav/.test(identity)) return "Shave";
  return `Use ${data.name?.trim() || record.title}`;
}

export type ActivityTimingSnapshot = {
  componentId: string;
  mode: "timer" | "countdown";
  plannedSeconds: number | null;
  elapsedSeconds: number;
  startedAt: string;
};

type TimerState = { running: boolean; baseSeconds: number; startedAt: number; firstStartedAt: number; plannedSeconds: number | null };
type CountdownState = { running: boolean; remainingSeconds: number; endsAt: number; startedAt: number; plannedSeconds: number };

function clockDisplay(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function readStoredState<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? { ...fallback, ...JSON.parse(value) } : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredState(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* device-only timer state is optional */ }
}

export function resetActivityTimingState(activityIds: string[]) {
  try {
    const prefixes = activityIds.flatMap((activityId) => [
      `ideal-day-timer:${activityId}:`,
      `ideal-day-countdown:${activityId}:`,
    ]);
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) window.localStorage.removeItem(key);
    }
  } catch { /* device-only timer state is optional */ }
}

export function TimerComponent({ activity, component }: { activity: WorkspaceActivity; component: TimerWorkspaceComponent }) {
  const storageKey = `ideal-day-timer:${activity.id}:${component.id}`;
  const initialPlannedSeconds = activity.timelineEnabled ? activity.duration * 60 : null;
  const [timer, setTimer] = useState(() => readStoredState<TimerState>(storageKey, { running: false, baseSeconds: 0, startedAt: 0, firstStartedAt: 0, plannedSeconds: initialPlannedSeconds }));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!timer.running) return;
    const interval = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [timer.running]);

  const elapsed = timer.baseSeconds + (timer.running && tick ? Math.floor((tick - timer.startedAt) / 1000) : 0);

  function update(next: typeof timer) {
    setTimer(next);
    setTick(Date.now());
    writeStoredState(storageKey, next);
  }

  function toggle() {
    if (timer.running) update({ ...timer, running: false, baseSeconds: elapsed, startedAt: 0 });
    else {
      const now = Date.now();
      update({
        running: true,
        baseSeconds: timer.baseSeconds,
        startedAt: now,
        firstStartedAt: timer.firstStartedAt || now,
        plannedSeconds: timer.firstStartedAt ? timer.plannedSeconds : initialPlannedSeconds,
      });
    }
  }

  return (
    <section className="workspace-block time-component" aria-label={component.title}>
      <div className="workspace-block-heading"><div><span className="workspace-overline">Stopwatch</span><strong>{component.title}</strong></div><TimerIcon size={16} /></div>
      <output className="time-component-display" aria-live="off">{clockDisplay(elapsed)}</output>
      <div className="time-component-actions">
        <button type="button" onClick={toggle}>{timer.running ? <Pause size={14} /> : <Play size={14} />}{timer.running ? "Pause" : elapsed ? "Resume" : "Start"}</button>
        <button type="button" onClick={() => update({ running: false, baseSeconds: 0, startedAt: 0, firstStartedAt: 0, plannedSeconds: initialPlannedSeconds })}><RotateCcw size={13} /> Reset</button>
      </div>
    </section>
  );
}

export function CountdownComponent({ activity, component }: { activity: WorkspaceActivity; component: CountdownWorkspaceComponent }) {
  const storageKey = `ideal-day-countdown:${activity.id}:${component.id}`;
  const usesTimelineDuration = component.durationSource === "timeline" && activity.timelineEnabled;
  const configuredSeconds = usesTimelineDuration ? activity.duration * 60 : component.durationSeconds;
  const [countdown, setCountdown] = useState(() => readStoredState<CountdownState>(storageKey, {
    running: false,
    remainingSeconds: configuredSeconds,
    endsAt: 0,
    startedAt: 0,
    plannedSeconds: configuredSeconds,
  }));
  const [tick, setTick] = useState(0);
  const isUntouched = !countdown.running && !countdown.startedAt && countdown.remainingSeconds === countdown.plannedSeconds;
  const plannedSeconds = isUntouched ? configuredSeconds : countdown.plannedSeconds;
  const remaining = countdown.running && tick
    ? Math.max(0, Math.ceil((countdown.endsAt - tick) / 1000))
    : isUntouched ? configuredSeconds : countdown.remainingSeconds;

  useEffect(() => {
    if (!countdown.running) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setTick(now);
      if (countdown.endsAt <= now) {
        setCountdown((current) => {
          const next = { ...current, running: false, remainingSeconds: 0, endsAt: 0 };
          writeStoredState(storageKey, next);
          return next;
        });
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [countdown.endsAt, countdown.running, storageKey]);

  function update(next: typeof countdown) {
    setCountdown(next);
    setTick(Date.now());
    writeStoredState(storageKey, next);
  }

  function toggle() {
    if (countdown.running) update({ ...countdown, running: false, remainingSeconds: remaining, endsAt: 0 });
    else {
      const startsNewRun = !countdown.startedAt || remaining === 0;
      const nextRemaining = startsNewRun ? configuredSeconds : remaining;
      update({
        running: true,
        remainingSeconds: nextRemaining,
        endsAt: Date.now() + nextRemaining * 1000,
        startedAt: startsNewRun ? Date.now() : countdown.startedAt,
        plannedSeconds: startsNewRun ? configuredSeconds : plannedSeconds,
      });
    }
  }

  const displayTitle = component.durationSource === "timeline"
    ? component.title.replace(/\s*[—-]\s*\d+\s*minutes?$/i, "")
    : component.title;

  return (
    <section className={`workspace-block time-component ${remaining === 0 ? "is-finished" : ""}`} aria-label={displayTitle}>
      <div className="workspace-block-heading"><div><span className="workspace-overline">{usesTimelineDuration ? "Today’s countdown" : "Countdown"}</span><strong>{displayTitle}</strong></div>{remaining === 0 ? <Check size={16} /> : <Hourglass size={16} />}</div>
      <output className="time-component-display" aria-live="off">{clockDisplay(remaining)}</output>
      <div className="time-component-actions">
        <button type="button" onClick={toggle}>{countdown.running ? <Pause size={14} /> : <Play size={14} />}{countdown.running ? "Pause" : countdown.startedAt && remaining ? "Resume" : "Start"}</button>
        <button type="button" onClick={() => update({ running: false, remainingSeconds: configuredSeconds, endsAt: 0, startedAt: 0, plannedSeconds: configuredSeconds })}><RotateCcw size={13} /> Reset</button>
      </div>
    </section>
  );
}

export function RoutineComponent({ component }: { component: RoutineWorkspaceComponent }) {
  return (
    <section className="workspace-block routine-component" aria-label={component.title}>
      <div className="workspace-block-heading"><div><span className="workspace-overline">Saved routine</span><strong>{component.title}</strong></div><Sparkles size={15} /></div>
      {component.summary ? <p className="routine-component-summary">{component.summary}</p> : null}
      {component.steps?.length ? <ol>{component.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
      {component.facts?.length ? <dl>{component.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl> : null}
    </section>
  );
}

export function ActivityScheduleSummaryComponent({ activity, scheduleSummary, onManageSchedule }: {
  activity: Pick<WorkspaceActivity, "title">;
  scheduleSummary: ActivityScheduleSummary;
  onManageSchedule?: () => void;
}) {
  return <section className="workspace-block activity-schedule-summary" aria-label={`${activity.title} schedule`}>
    <div className="activity-schedule-summary-copy">
      <span className="workspace-overline">Schedule</span>
      <strong>{scheduleSummary.cadenceLabel}</strong>
      {scheduleSummary.name.trim().toLocaleLowerCase() !== activity.title.trim().toLocaleLowerCase() ? <small>{scheduleSummary.name}</small> : null}
      {scheduleSummary.upcoming.length ? (
        <div className="activity-schedule-upcoming">
          <span className="workspace-overline">Upcoming</span>
          <div className="activity-schedule-upcoming-list">
            {scheduleSummary.upcoming.map((occurrence, index) => {
              const detail = scheduleOccurrenceDetail(occurrence.title, activity.title);
              return <span className="activity-schedule-occurrence" key={`${occurrence.date}-${index}`}><b>{formatScheduleOccurrenceDate(occurrence.date, scheduleSummary.referenceDate)}</b>{detail ? <small>{detail}</small> : null}</span>;
            })}
          </div>
        </div>
      ) : null}
    </div>
    {onManageSchedule ? <button type="button" onClick={onManageSchedule}>Manage</button> : <CalendarClock aria-hidden="true" size={17} />}
  </section>;
}

export function ActivityFollowUpComponent({ followUp, onFollowUpMutation }: {
  followUp: ActivityFollowUp;
  onFollowUpMutation?: (id: string, operation: "reschedule" | "dismiss", dueDate?: string) => void;
}) {
  return <section className={`workspace-block activity-follow-up ${followUp.status === "due" || followUp.status === "asked" ? "is-due" : ""}`}>
    <div className="activity-follow-up-heading">
      <div><span className="workspace-overline">{followUp.status === "asked" ? "Check-in asked" : followUp.status === "due" ? "Check-in due" : "Upcoming check-in"}</span><strong>{followUp.title}</strong></div>
      <div className="activity-follow-up-tools">
        <details className="activity-follow-up-menu">
          <summary aria-label={`More options for ${followUp.title}`} title="Check-in options"><EllipsisVertical aria-hidden="true" size={17} /></summary>
          <div className="activity-follow-up-menu-panel" role="menu">
            <button role="menuitem" type="button" onClick={() => onFollowUpMutation?.(followUp.id, "dismiss")}><Trash2 aria-hidden="true" size={15} /> Remove check-in</button>
          </div>
        </details>
        <CalendarClock aria-hidden="true" size={17} />
      </div>
    </div>
    <p>Luna will check back in with you on <time dateTime={followUp.dueDate}>{formatFollowUpDate(followUp.dueDate)}</time> about {followUpReason(followUp.title)}.</p>
  </section>;
}

export function WorkspaceWorkingComponent({ activity, workState, hasVisibleWorkspace = false, workTitle, workDetail }: {
  activity: Pick<WorkspaceActivity, "title">;
  workState: "building" | "waiting";
  hasVisibleWorkspace?: boolean;
  workTitle?: string | null;
  workDetail?: string | null;
}) {
  return <div className={`workspace-working ${workState === "waiting" ? "is-waiting" : ""} ${hasVisibleWorkspace ? "is-updating" : ""}`} role="status">
    <span className="workspace-working-mark"><Sparkles size={15} /></span>
    <div>
      <strong>{workTitle || (workState === "waiting" ? `${activity.title} is queued` : hasVisibleWorkspace ? `Updating ${activity.title}` : `Building your ${activity.title} setup`)}</strong>
      <p>{workDetail || (workState === "waiting" ? "Your message is saved, and Luna will pick it up shortly." : "Turning your latest details into something useful here.")}</p>
    </div>
    {workState !== "waiting" ? <span className="workspace-working-dots" aria-hidden="true"><i /><i /><i /></span> : null}
  </div>;
}

export function WorkspaceLunaInvitation({ onTalkWithLuna }: { onTalkWithLuna: () => void }) {
  return <button className="workspace-luna-invitation" type="button" onClick={onTalkWithLuna}>
    <MessageCircle aria-hidden="true" size={16} />
    <span><strong>Want something else here?</strong> Talk with Luna.</span>
  </button>;
}

export function WorkspaceEmptyGuidance() {
  return <div className="workspace-empty-guidance">
    <span aria-hidden="true"><MessageCircle size={17} /></span>
    <div>
      <strong>Shape this with Luna</strong>
      <p>Talk with Luna about this activity, and she’ll keep useful notes and tools here.</p>
    </div>
  </div>;
}

export function captureActivityTimingSnapshot(activity: WorkspaceActivity, workspace: WorkspaceDocument): ActivityTimingSnapshot | null {
  const now = Date.now();
  const candidates = workspace.components.flatMap((component): ActivityTimingSnapshot[] => {
    if (component.type === "timer") {
      const key = `ideal-day-timer:${activity.id}:${component.id}`;
      const state = readStoredState<TimerState>(key, { running: false, baseSeconds: 0, startedAt: 0, firstStartedAt: 0, plannedSeconds: activity.timelineEnabled ? activity.duration * 60 : null });
      if (!state.firstStartedAt && !state.startedAt && !state.baseSeconds) return [];
      const elapsedSeconds = state.baseSeconds + (state.running ? Math.max(0, Math.floor((now - state.startedAt) / 1000)) : 0);
      writeStoredState(key, { ...state, running: false, baseSeconds: elapsedSeconds, startedAt: 0, firstStartedAt: state.firstStartedAt || state.startedAt });
      return [{
        componentId: component.id,
        mode: "timer",
        plannedSeconds: state.plannedSeconds ?? (activity.timelineEnabled ? activity.duration * 60 : null),
        elapsedSeconds,
        startedAt: new Date(state.firstStartedAt || state.startedAt || now).toISOString(),
      }];
    }
    if (component.type === "countdown") {
      const configuredSeconds = component.durationSource === "timeline" && activity.timelineEnabled ? activity.duration * 60 : component.durationSeconds;
      const key = `ideal-day-countdown:${activity.id}:${component.id}`;
      const state = readStoredState<CountdownState>(key, { running: false, remainingSeconds: configuredSeconds, endsAt: 0, startedAt: 0, plannedSeconds: configuredSeconds });
      if (!state.startedAt) return [];
      const remainingSeconds = state.running ? Math.max(0, Math.ceil((state.endsAt - now) / 1000)) : state.remainingSeconds;
      const planned = state.plannedSeconds || configuredSeconds;
      const elapsedSeconds = Math.max(0, planned - remainingSeconds);
      writeStoredState(key, { ...state, running: false, remainingSeconds, endsAt: 0 });
      return [{
        componentId: component.id,
        mode: "countdown",
        plannedSeconds: planned,
        elapsedSeconds,
        startedAt: new Date(state.startedAt).toISOString(),
      }];
    }
    return [];
  });
  return candidates.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0] ?? null;
}

export function ActivityWorkspace({ activity, workspace, records, onRecordMutation, onTalkWithLuna, recordError = null, workState = null, workTitle = null, workDetail = null, followUps = [], scheduleSummary = null, showEmptyState = false, onFollowUpMutation, onManageSchedule }: ActivityWorkspaceProps) {
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);
  const recordsByKey = new Map(records.map((record) => [record.key, record]));
  const visibleRecordKeys = new Set<string>();
  const visibleComponents = workspace.components.filter((component) => {
    if (component.type === "timer" || component.type === "countdown") return true;
    if (component.type === "routine") return hasUsefulRoutineComponent(component);
    const record = recordsByKey.get((component as DataWorkspaceComponent).recordKey);
    if (!record || visibleRecordKeys.has(record.key) || !hasUsefulActivityRecordData(record, {
      activityTitle: activity.title,
      plannedDurationMinutes: activity.timelineEnabled ? activity.duration : undefined,
    })) return false;
    visibleRecordKeys.add(record.key);
    return true;
  });
  const productComponents = visibleComponents.flatMap((component) => {
    if (component.type !== "product") return [];
    const record = recordsByKey.get((component as DataWorkspaceComponent).recordKey);
    return record ? [{ component, record }] : [];
  });
  const hasProductSwitcher = productComponents.length > 1;
  const selectedProduct = productComponents.find(({ record }) => record.key === selectedProductKey) ?? productComponents[0] ?? null;
  const nestedSupportingComponents = new Map<string, ActivityRecord[]>();
  const nestedComponentIds = new Set<string>();
  for (const component of visibleComponents) {
    if (component.type !== "adherence" && component.type !== "recurring_step" && component.type !== "protocol" && component.type !== "resources") continue;
    const record = recordsByKey.get((component as DataWorkspaceComponent).recordKey);
    if (!record) continue;
    // Product composition is semantic, not positional. Unowned legacy records stay
    // independent until a migration or Luna assigns an explicit subject owner.
    const owner = productComponents.find(({ record: product }) => record.subjectKey === product.key);
    if (!owner) continue;
    const supporting = nestedSupportingComponents.get(owner.record.key) ?? [];
    supporting.push(record);
    const priority = (candidate: ActivityRecord) => candidate.type === "adherence" || candidate.type === "recurring_step" ? 0 : candidate.type === "protocol" ? 1 : 2;
    supporting.sort((left, right) => priority(left) - priority(right));
    nestedSupportingComponents.set(owner.record.key, supporting);
    nestedComponentIds.add(component.id);
  }
  const trackersByProduct = new Map(productComponents.map(({ record }) => [
    record.key,
    (nestedSupportingComponents.get(record.key) ?? []).filter((candidate) => candidate.type === "adherence" || candidate.type === "recurring_step"),
  ]));
  function productDueLabel(record: ActivityRecord) {
    const today = localDateKey();
    const tracker = trackersByProduct.get(record.key)?.[0];
    const runCompletionDates = productCompletionDates(activity, record.key);
    if (tracker?.type === "adherence") {
      const data = tracker.data as { effectiveDate?: string; entries?: Array<{ date: string; completed?: boolean }> };
      const completedDates = normalizedCompletionDates([
        ...(data.entries ?? []).filter((entry) => entry.completed).map((entry) => entry.date),
        ...runCompletionDates,
      ]);
      if (completedDates.includes(today)) return "Done Today";
      if (data.effectiveDate && data.effectiveDate > today) return `Due ${formatScheduleOccurrenceDate(data.effectiveDate, today)}`;
      return "Due Today";
    }
    if (tracker?.type === "recurring_step") {
      const data = tracker.data as { anchorDate?: string; cadence?: RecurringCadence; completedDates?: string[] };
      const status = recurringStepScheduleStatus({
        ...data,
        completedDates: normalizedCompletionDates([...(data.completedDates ?? []), ...runCompletionDates]),
      }, today);
      if (status.completedToday) return "Done Today";
      if (status.dueToday) return "Due Today";
      if (status.nextDue) return `Due ${formatScheduleOccurrenceDate(status.nextDue, today)}`;
    }
    return "Ready Anytime";
  }
  const routineActionGroups = [...productComponents.reduce((groups, item) => {
    const label = productRoutineAction(item.record);
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || item.record.key;
    const group = groups.get(key) ?? { key, label, items: [] as typeof productComponents };
    group.items.push(item);
    groups.set(key, group);
    return groups;
  }, new Map<string, { key: string; label: string; items: typeof productComponents }>()).values()];
  const selectedRoutineAction = routineActionGroups.find((group) => group.items.some(({ record }) => record.key === selectedProduct?.record.key)) ?? routineActionGroups[0] ?? null;
  function routineActionDueLabel(group: typeof routineActionGroups[number]) {
    const labels = group.items.map(({ record }) => productDueLabel(record));
    if (labels.every((label) => label === "Done Today")) return "Done Today";
    if (labels.includes("Due Today")) return "Due Today";
    return labels.find((label) => label.startsWith("Due ")) ?? labels.find((label) => label !== "Ready Anytime") ?? "Ready Anytime";
  }
  const trackerSignatures = productComponents.map(({ record }) => {
    const trackers = trackersByProduct.get(record.key) ?? [];
    return trackers.length === 1 ? subjectRhythmSignature(trackers[0]) : null;
  });
  const sharedProductRhythm = productComponents.length > 1
    && trackerSignatures.every((signature) => Boolean(signature) && signature === trackerSignatures[0])
    ? trackersByProduct.get(productComponents[0].record.key)?.[0] ?? null
    : null;
  const sharedProductCompletionDates = sharedProductRhythm
    ? productComponents.map(({ record }) => new Set(productCompletionDates(activity, record.key))).reduce<string[]>((intersection, dates, index) => index === 0 ? [...dates] : intersection.filter((date) => dates.has(date)), [])
    : [];
  const showStarterStreak = supportsStarterStreak(activity) && productComponents.length === 0 && !visibleComponents.some((component) => component.type === "adherence");
  const hasVisibleWorkspace = visibleComponents.length > 0 || showStarterStreak || followUps.length > 0 || Boolean(scheduleSummary);
  const orderedItems = orderWorkspaceDisplayItems([
    ...visibleComponents.filter((component) => !nestedComponentIds.has(component.id)).map((component) => ({
      displayRole: (component.type === "adherence" ? "streak" : component.type === "recurring_step" ? "recurring" : component.type === "countdown" ? "countdown" : component.type === "resources" ? "resource" : component.type === "equipment" ? "reference" : "primary") as WorkspaceDisplayRole,
      id: component.id,
      component,
    })),
    ...(showStarterStreak ? [{ displayRole: "streak" as const, id: "starter-streak", component: null }] : []),
  ]);
  const measuredSessionItem = orderedItems.find(({ component }) => component?.type === "session_log");
  const measuredSessionRecord = measuredSessionItem?.component
    ? recordsByKey.get((measuredSessionItem.component as DataWorkspaceComponent).recordKey)
    : undefined;
  const measuredSessionData = measuredSessionRecord?.data as SessionLogData | undefined;
  const measuredChoiceItem = measuredSessionData?.choiceRecordKey
    ? orderedItems.find(({ component }) => component?.type === "session_choice" && (component as DataWorkspaceComponent).recordKey === measuredSessionData.choiceRecordKey)
    : undefined;
  const measuredChoiceRecord = measuredSessionData?.choiceRecordKey ? recordsByKey.get(measuredSessionData.choiceRecordKey) : undefined;
  const measuredOptionId = measuredChoiceRecord?.type === "session_choice"
    ? selectedSessionOptionId(measuredChoiceRecord.data as SessionChoiceData, localDateKey())
    : measuredSessionData?.defaultOption?.id;
  const measuredIds = new Set([measuredSessionItem?.id, measuredChoiceItem?.id].filter((id): id is string => Boolean(id)));
  const strengthSessionItem = orderedItems.find(({ component }) => component?.type === "strength_session");
  const strengthSessionRecord = strengthSessionItem?.component
    ? recordsByKey.get((strengthSessionItem.component as DataWorkspaceComponent).recordKey)
    : undefined;
  const linkedWorkoutKey = strengthSessionRecord?.type === "strength_session" && typeof strengthSessionRecord.data.workoutRecordKey === "string"
    ? strengthSessionRecord.data.workoutRecordKey
    : null;
  const linkedWorkoutItem = linkedWorkoutKey
    ? orderedItems.find(({ component }) => component?.type === "workout" && (component as DataWorkspaceComponent).recordKey === linkedWorkoutKey)
    : undefined;
  const linkedWorkoutPhaseItems = linkedWorkoutKey
    ? orderedItems.filter(({ component }) => {
        if (component?.type !== "protocol") return false;
        const phaseRecord = recordsByKey.get((component as DataWorkspaceComponent).recordKey);
        return phaseRecord?.type === "protocol" && phaseRecord.data.workoutRecordKey === linkedWorkoutKey
          && (phaseRecord.data.phase === "warmup" || phaseRecord.data.phase === "cooldown");
      })
    : [];
  const groupedIds = new Set([
    strengthSessionItem?.id,
    linkedWorkoutItem?.id,
    ...linkedWorkoutPhaseItems.map(({ id }) => id),
  ].filter((id): id is string => Boolean(id)));
  const remainingItems = orderedItems.filter(({ id }) => !measuredIds.has(id) && !groupedIds.has(id));

  function renderMeasuredItem(item: typeof measuredSessionItem, presentation?: "default" | "compact" | "featured") {
    if (!item?.component || item.component.type === "timer" || item.component.type === "countdown" || item.component.type === "routine") return null;
    const dataComponent = item.component as DataWorkspaceComponent;
    const record = recordsByKey.get(dataComponent.recordKey);
    return record ? <ActivityRecordComponent key={item.id} onMutate={onRecordMutation} presentation={presentation ?? dataComponent.presentation} record={record} relatedRecords={records} /> : null;
  }
  function renderStrengthItem() {
    if (!strengthSessionItem?.component || strengthSessionItem.component.type !== "strength_session") return null;
    const dataComponent = strengthSessionItem.component as DataWorkspaceComponent;
    const record = recordsByKey.get(dataComponent.recordKey);
    return record ? <ActivityRecordComponent key={strengthSessionItem.id} onMutate={onRecordMutation} onTalkWithLuna={onTalkWithLuna} presentation="featured" record={record} relatedRecords={records} /> : null;
  }
  if (!hasVisibleWorkspace && !workState && !recordError && !showEmptyState) return null;
  return (
    <section className={`activity-workspace ${hasVisibleWorkspace ? "workspace-live" : showEmptyState && !workState && !recordError ? "workspace-empty" : "workspace-building"}`} id={`activity-workspace-${activity.id}`} aria-label={`Workspace for ${activity.title}`}>
      {workState ? <WorkspaceWorkingComponent activity={activity} hasVisibleWorkspace={hasVisibleWorkspace} workDetail={workDetail} workState={workState} workTitle={workTitle} /> : null}
      {recordError ? <p className="record-action-error" role="alert">{recordError}</p> : null}

      {hasVisibleWorkspace ? (
        <>
          <div className="workspace-stack">
            {hasProductSwitcher ? (
              <nav className="subject-action-nav" aria-label={`${activity.title} steps`}>
                <div aria-label={`Choose a ${activity.title} step to view`} className="subject-action-tabs" role="tablist">
                  {routineActionGroups.map((group) => {
                    const isSelected = group.key === selectedRoutineAction?.key;
                    return <button
                      aria-controls={`subject-action-panel-${group.key}`}
                      aria-selected={isSelected}
                      className={isSelected ? "is-selected" : ""}
                      id={`subject-action-tab-${group.key}`}
                      key={group.key}
                      onClick={() => setSelectedProductKey(group.items[0]?.record.key ?? null)}
                      role="tab"
                      type="button"
                    >
                      <span><strong>{group.label}</strong><small>{routineActionDueLabel(group)}</small></span>
                    </button>;
                  })}
                </div>
              </nav>
            ) : null}
            {hasProductSwitcher && selectedRoutineAction ? (
              <div aria-labelledby={`subject-action-tab-${selectedRoutineAction.key}`} className="subject-action-panel" id={`subject-action-panel-${selectedRoutineAction.key}`} role="tabpanel">
                {selectedRoutineAction.items.map(({ component, record }) => {
                  const dataComponent = component as DataWorkspaceComponent;
                  return <div className="subject-panel" key={component.id}><ActivityRecordComponent
                    completionDates={productCompletionDates(activity, record.key)}
                    onMutate={onRecordMutation}
                    onTalkWithLuna={onTalkWithLuna}
                    presentation={dataComponent.presentation}
                    record={record}
                    supportingRecords={(nestedSupportingComponents.get(record.key) ?? []).filter((supporting) => !sharedProductRhythm || supporting.type !== "adherence" && supporting.type !== "recurring_step")}
                  /></div>;
                })}
              </div>
            ) : null}
            {sharedProductRhythm ? (() => {
              const today = localDateKey();
              const rhythm = sharedProductRhythm.type === "recurring_step"
                ? recurringCompletionStreak({
                    anchorDate: typeof sharedProductRhythm.data.anchorDate === "string" ? sharedProductRhythm.data.anchorDate : undefined,
                    cadence: sharedProductRhythm.data.cadence as RecurringCadence | undefined,
                    completedDates: sharedProductCompletionDates,
                    today,
                  })
                : dailyCompletionStreak(sharedProductCompletionDates, today);
              return <StreakTrack ariaLabel={`${activity.title} shared streak`} completedToday={rhythm.completedToday} count={rhythm.count} />;
            })() : null}
            {orderedItems.filter(({ displayRole }) => displayRole === "streak").map(({ component, id }) => {
              if (!component) {
                const streak = dailyCompletionStreak(activityCompletionDates(activity), localDateKey());
                return <StreakTrack ariaLabel={`${activity.title} streak`} completedToday={streak.completedToday} count={streak.count} key={id} />;
              }
              const dataComponent = component as DataWorkspaceComponent;
              const record = recordsByKey.get(dataComponent.recordKey);
              return record ? <ActivityRecordComponent key={component.id} onMutate={onRecordMutation} presentation={dataComponent.presentation} record={record} /> : null;
            })}
            {orderedItems.filter(({ displayRole }) => displayRole === "recurring").map(({ component }) => {
              if (!component) return null;
              const dataComponent = component as DataWorkspaceComponent;
              const record = recordsByKey.get(dataComponent.recordKey);
              return record ? <ActivityRecordComponent key={component.id} onMutate={onRecordMutation} presentation={dataComponent.presentation} record={record} /> : null;
            })}
            {scheduleSummary ? <ActivityScheduleSummaryComponent activity={activity} onManageSchedule={onManageSchedule} scheduleSummary={scheduleSummary} /> : null}
            {measuredSessionItem && measuredChoiceItem && !measuredOptionId ? renderMeasuredItem(measuredChoiceItem, "default") : null}
            {measuredSessionItem && measuredOptionId ? renderMeasuredItem(measuredSessionItem, "featured") : null}
            {renderStrengthItem()}
            {followUps.map((followUp) => <ActivityFollowUpComponent followUp={followUp} key={followUp.id} onFollowUpMutation={onFollowUpMutation} />)}
            {measuredSessionItem && measuredChoiceItem && measuredOptionId ? renderMeasuredItem(measuredChoiceItem, "compact") : null}
            {remainingItems.filter(({ displayRole }) => displayRole !== "streak" && displayRole !== "recurring").map(({ component }) => {
              if (!component) return null;
              if (component.type === "timer") return <TimerComponent activity={activity} component={component} key={component.id} />;
              if (component.type === "countdown") return <CountdownComponent activity={activity} component={component} key={component.id} />;
              if (component.type === "routine") return <RoutineComponent component={component} key={component.id} />;
              const dataComponent = component as DataWorkspaceComponent;
              const record = recordsByKey.get(dataComponent.recordKey);
              if (!record || record.type === "product" && hasProductSwitcher) return null;
              const renderedRecord = <ActivityRecordComponent
                    completionDates={record.type === "product" ? productCompletionDates(activity, record.key) : undefined}
                    onMutate={onRecordMutation}
                    onTalkWithLuna={onTalkWithLuna}
                    presentation={dataComponent.presentation}
                    record={record}
                    relatedRecords={record.type === "session_log" || record.type === "strength_session" ? records : undefined}
                    supportingRecords={record.type === "product" ? (nestedSupportingComponents.get(record.key) ?? []).filter((supporting) => !sharedProductRhythm || supporting.type !== "adherence" && supporting.type !== "recurring_step") : undefined}
                  />;
              return <div className="workspace-record-slot" key={component.id}>{renderedRecord}</div>;
            })}
          </div>
          <WorkspaceLunaInvitation onTalkWithLuna={onTalkWithLuna} />
        </>
      ) : null}
      {showEmptyState && !hasVisibleWorkspace && !workState && !recordError ? <WorkspaceEmptyGuidance /> : null}
    </section>
  );
}
