"use client";

import { Check, Hourglass, Pause, Play, RotateCcw, Sparkles, Timer as TimerIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivityRecordComponent, type RecordMutation } from "./activity-record-components";
import { hasUsefulActivityRecordData, type ActivityRecord } from "./activity-record-model";
import { hasUsefulRoutineComponent, type CountdownWorkspaceComponent, type DataWorkspaceComponent, type RoutineWorkspaceComponent, type TimerWorkspaceComponent, type WorkspaceDocument } from "./workspace-model";

export type WorkspaceActivity = {
  id: string;
  title: string;
  duration: number;
  category: string;
  color: string;
};

type ActivityWorkspaceProps = {
  activity: WorkspaceActivity;
  workspace: WorkspaceDocument;
  records: ActivityRecord[];
  onRecordMutation: RecordMutation;
  recordError?: string | null;
  workState?: "message" | "waiting" | null;
};

export function hasVisibleActivityWorkspace(activity: WorkspaceActivity, workspace: WorkspaceDocument, records: ActivityRecord[]) {
  const recordsByKey = new Map(records.map((record) => [record.key, record]));
  return workspace.components.some((component) => {
    if (component.type === "timer" || component.type === "countdown") return true;
    if (component.type === "routine") return hasUsefulRoutineComponent(component);
    const record = recordsByKey.get((component as DataWorkspaceComponent).recordKey);
    return Boolean(record && hasUsefulActivityRecordData(record, {
      activityTitle: activity.title,
      plannedDurationMinutes: activity.duration,
    }));
  });
}

export type ActivityTimingSnapshot = {
  componentId: string;
  mode: "timer" | "countdown";
  plannedSeconds: number;
  elapsedSeconds: number;
  startedAt: string;
};

type TimerState = { running: boolean; baseSeconds: number; startedAt: number; firstStartedAt: number; plannedSeconds: number };
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

function TimerComponent({ activity, component }: { activity: WorkspaceActivity; component: TimerWorkspaceComponent }) {
  const storageKey = `ideal-day-timer:${activity.id}:${component.id}`;
  const [timer, setTimer] = useState(() => readStoredState<TimerState>(storageKey, { running: false, baseSeconds: 0, startedAt: 0, firstStartedAt: 0, plannedSeconds: activity.duration * 60 }));
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
        plannedSeconds: timer.firstStartedAt ? timer.plannedSeconds : activity.duration * 60,
      });
    }
  }

  return (
    <section className="workspace-block time-component" aria-label={component.title}>
      <div className="workspace-block-heading"><div><span>Stopwatch</span><strong>{component.title}</strong></div><TimerIcon size={16} /></div>
      <output className="time-component-display" aria-live="off">{clockDisplay(elapsed)}</output>
      <div className="time-component-actions">
        <button type="button" onClick={toggle}>{timer.running ? <Pause size={14} /> : <Play size={14} />}{timer.running ? "Pause" : elapsed ? "Resume" : "Start"}</button>
        <button type="button" onClick={() => update({ running: false, baseSeconds: 0, startedAt: 0, firstStartedAt: 0, plannedSeconds: activity.duration * 60 })}><RotateCcw size={13} /> Reset</button>
      </div>
    </section>
  );
}

function CountdownComponent({ activity, component }: { activity: WorkspaceActivity; component: CountdownWorkspaceComponent }) {
  const storageKey = `ideal-day-countdown:${activity.id}:${component.id}`;
  const configuredSeconds = component.durationSource === "activity" ? activity.duration * 60 : component.durationSeconds;
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

  const displayTitle = component.durationSource === "activity"
    ? component.title.replace(/\s*[—-]\s*\d+\s*minutes?$/i, "")
    : component.title;

  return (
    <section className={`workspace-block time-component ${remaining === 0 ? "is-finished" : ""}`} aria-label={displayTitle}>
      <div className="workspace-block-heading"><div><span>{component.durationSource === "activity" ? "Today’s countdown" : "Countdown"}</span><strong>{displayTitle}</strong></div>{remaining === 0 ? <Check size={16} /> : <Hourglass size={16} />}</div>
      <output className="time-component-display" aria-live="off">{clockDisplay(remaining)}</output>
      <div className="time-component-actions">
        <button type="button" onClick={toggle}>{countdown.running ? <Pause size={14} /> : <Play size={14} />}{countdown.running ? "Pause" : countdown.startedAt && remaining ? "Resume" : "Start"}</button>
        <button type="button" onClick={() => update({ running: false, remainingSeconds: configuredSeconds, endsAt: 0, startedAt: 0, plannedSeconds: configuredSeconds })}><RotateCcw size={13} /> Reset</button>
      </div>
    </section>
  );
}

function RoutineComponent({ component }: { component: RoutineWorkspaceComponent }) {
  return (
    <section className="workspace-block routine-component" aria-label={component.title}>
      <div className="workspace-block-heading"><div><span>Saved routine</span><strong>{component.title}</strong></div><Sparkles size={15} /></div>
      {component.summary ? <p className="routine-component-summary">{component.summary}</p> : null}
      {component.steps?.length ? <ol>{component.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
      {component.facts?.length ? <dl>{component.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl> : null}
    </section>
  );
}

export function captureActivityTimingSnapshot(activity: WorkspaceActivity, workspace: WorkspaceDocument): ActivityTimingSnapshot | null {
  const now = Date.now();
  const candidates = workspace.components.flatMap((component): ActivityTimingSnapshot[] => {
    if (component.type === "timer") {
      const key = `ideal-day-timer:${activity.id}:${component.id}`;
      const state = readStoredState<TimerState>(key, { running: false, baseSeconds: 0, startedAt: 0, firstStartedAt: 0, plannedSeconds: activity.duration * 60 });
      if (!state.firstStartedAt && !state.startedAt && !state.baseSeconds) return [];
      const elapsedSeconds = state.baseSeconds + (state.running ? Math.max(0, Math.floor((now - state.startedAt) / 1000)) : 0);
      writeStoredState(key, { ...state, running: false, baseSeconds: elapsedSeconds, startedAt: 0, firstStartedAt: state.firstStartedAt || state.startedAt });
      return [{
        componentId: component.id,
        mode: "timer",
        plannedSeconds: state.plannedSeconds || activity.duration * 60,
        elapsedSeconds,
        startedAt: new Date(state.firstStartedAt || state.startedAt || now).toISOString(),
      }];
    }
    if (component.type === "countdown") {
      const configuredSeconds = component.durationSource === "activity" ? activity.duration * 60 : component.durationSeconds;
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

export function ActivityWorkspace({ activity, workspace, records, onRecordMutation, recordError = null, workState = null }: ActivityWorkspaceProps) {
  const recordsByKey = new Map(records.map((record) => [record.key, record]));
  const visibleComponents = workspace.components.filter((component) => {
    if (component.type === "timer" || component.type === "countdown") return true;
    if (component.type === "routine") return hasUsefulRoutineComponent(component);
    const record = recordsByKey.get((component as DataWorkspaceComponent).recordKey);
    return Boolean(record && hasUsefulActivityRecordData(record, {
      activityTitle: activity.title,
      plannedDurationMinutes: activity.duration,
    }));
  });
  const hasVisibleWorkspace = visibleComponents.length > 0;
  if (!hasVisibleWorkspace && !workState && !recordError) return null;
  return (
    <section className={`activity-workspace ${hasVisibleWorkspace ? "workspace-live" : "workspace-building"}`} aria-label={`Workspace for ${activity.title}`}>
      {workState ? (
        <div className={`workspace-working ${workState === "waiting" ? "is-waiting" : ""} ${hasVisibleWorkspace ? "is-updating" : ""}`} role="status">
          <span className="workspace-working-mark"><Sparkles size={15} /></span>
          <div>
            <strong>{workState === "waiting" ? "Luna will pick this up shortly" : hasVisibleWorkspace ? "Luna is updating this section" : "Luna is building this section"}</strong>
            <p>{workState === "waiting" ? "Your message is saved, and nothing will be lost." : "She’ll add the useful details here when they’re ready."}</p>
          </div>
          {workState !== "waiting" ? <span className="workspace-working-dots" aria-hidden="true"><i /><i /><i /></span> : null}
        </div>
      ) : null}
      {recordError ? <p className="record-action-error" role="alert">{recordError}</p> : null}

      {hasVisibleWorkspace ? (
        <div className="workspace-stack">
          {visibleComponents.map((component) => {
            if (component.type === "timer") return <TimerComponent activity={activity} component={component} key={component.id} />;
            if (component.type === "countdown") return <CountdownComponent activity={activity} component={component} key={component.id} />;
            if (component.type === "routine") return <RoutineComponent component={component} key={component.id} />;
            const dataComponent = component as DataWorkspaceComponent;
            const record = recordsByKey.get(dataComponent.recordKey);
            return record
              ? <ActivityRecordComponent key={component.id} onMutate={onRecordMutation} presentation={dataComponent.presentation} record={record} />
              : null;
          })}
        </div>
      ) : null}
    </section>
  );
}
