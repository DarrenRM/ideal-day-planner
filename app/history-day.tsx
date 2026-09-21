"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "./icons";
import { HistoryEditor, occurrenceStatus, StatusOptions } from "./history-editor";
import type { HistoryCorrection, HistoryRecord, StatusCorrection } from "./history-edit-model";
import { historyRecordSummary } from "./history-edit-model";
import type { HistoryDay, HistoryDetail } from "./track-record-model";

type Detail = HistoryDetail & { activityId: string; records: HistoryRecord[]; hasMoreEntries: boolean; correctedAt: string | null };
export const historyDateLabel = (date: string, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) => new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export function HistoryDayRow({ day, activityId, today, onChanged, onOpenActivity, initiallyOpen = false }: { day: HistoryDay; activityId: string; today: string; onChanged: () => void; onOpenActivity: (id: string, date: string) => void; initiallyOpen?: boolean }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [open, setOpen] = useState(initiallyOpen);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [undo, setUndo] = useState<HistoryCorrection | null>(null);
  const [retry, setRetry] = useState<HistoryCorrection | null>(null);
  const [saved, setSaved] = useState(false);
  const [statusMenu, setStatusMenu] = useState(false);
  const date = day.date;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/history?${new URLSearchParams({ date, activityId })}`, { signal: controller.signal }).then(async (response) => {
      const value = await response.json(); if (!response.ok) throw new Error(value.error || "This day could not load.");
      if (!controller.signal.aborted) { setDetail(value); setError(null); }
    }).catch((reason) => { if (!controller.signal.aborted) setError(String(reason.message || reason)); });
    return () => controller.abort();
  }, [date, activityId, reload]);
  useEffect(() => {
    if (!editing) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [editing]);
  async function save(input: HistoryCorrection) {
    if (busy) return;
    setBusy(true); setError(null); setRetry(input); setSaved(false);
    try {
      const response = await fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const value = await response.json();
      if (!response.ok) { if (response.status === 409) setRetry(null); throw new Error(value.error || "The correction could not be saved."); }
      setUndo(input.undoOf ? null : value.undo); setRetry(null); setSaved(true); setEditing(false); setReload((value) => value + 1); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The correction could not be saved. Retry uses the same correction safely."); }
    finally { setBusy(false); }
  }
  function setStatus(id: string, status: StatusCorrection["status"]) {
    const item = detail?.occurrences.find((value) => value.id === id);
    if (!item || !detail || status === occurrenceStatus(item)) return;
    setStatusMenu(false);
    void save({ actionId: crypto.randomUUID(), activityId: detail.activityId, date, statuses: [{ id, revision: item.revision, status }], records: [] });
  }
  const only = detail?.occurrences.length === 1 ? detail.occurrences[0] : null;
  const totalSeconds = detail?.occurrences.reduce((total, item) => total + (item.actualSeconds ?? 0), 0);
  const typedSummary = detail?.records.map((record) => historyRecordSummary(record, date)).filter(Boolean).join(" · ");
  const summary = typedSummary || (totalSeconds ? `${Math.round(totalSeconds / 60)} min recorded` : detail?.entries.length ? detail.entries.map((entry) => entry.lines[0] || entry.title).slice(0, 2).join(" · ") : "");
  const status = !day.known && !day.entries ? "No saved day" : !day.planned ? day.entries ? "Recorded details" : "Not scheduled" : day.completed === day.planned ? "Completed" : day.skipped === day.planned ? "Skipped" : date === today ? "In progress" : day.planned > 1 ? `${day.completed}/${day.planned} completed` : "Not marked complete";
  return <article className={`history-day-row ${open ? "is-open" : ""}`} aria-busy={busy}>
    <div className="history-day-heading"><button className="history-day-disclosure" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} disabled={busy || editing}><span><strong>{date === today ? "Today" : historyDateLabel(date)}</strong>{summary ? <small>{summary}</small> : null}</span><ChevronRight size={16} aria-hidden="true" /></button>
      {only && !editing ? <button type="button" className={`history-status ${only.completedAt ? "is-complete" : ""}`} aria-label={`Change status for ${historyDateLabel(date)}: ${only.completedAt ? "Completed" : only.skippedAt ? "Skipped" : "Not marked complete"}`} aria-expanded={statusMenu} disabled={busy} onClick={() => setStatusMenu((value) => !value)}>{only.completedAt ? "✓ Completed" : only.skippedAt ? "Skipped" : date === today ? "In progress" : "Not complete"}</button> : <small className="history-day-status">{busy ? "Saving…" : status}</small>}
    </div>
    {statusMenu && only ? <div className="history-status-menu" aria-label={`Set status for ${date}`}>{([['completed', 'Completed'], ['skipped', 'Skipped'], ['unmarked', 'Not marked complete']] as const).map(([value, label]) => <button type="button" key={value} disabled={busy} aria-pressed={occurrenceStatus(only) === value} onClick={() => { setStatusMenu(false); setStatus(only.id, value); }}>{label}</button>)}</div> : null}
    {busy ? <p role="status" className="track-coverage">Saving correction…</p> : null}
    {error ? <div className="track-error" role="alert">{error}{retry ? <button disabled={busy} type="button" onClick={() => void save(retry)}>Retry save</button> : <button disabled={busy} type="button" onClick={() => { setEditing(false); setReload((value) => value + 1); }}>Reload day</button>}</div> : null}
    {saved && !error ? <p className="history-saved" role="status">Changes saved for {historyDateLabel(date)}.{undo ? <button type="button" disabled={busy} onClick={() => { setSaved(false); void save(undo); }}>Undo</button> : null}</p> : null}
    {open ? <div className="history-day-content">
      {!detail ? <p role="status">Loading this day…</p> : editing ? <HistoryEditor date={date} activityId={detail.activityId} records={detail.records} occurrences={detail.occurrences} busy={busy} onSave={(input) => void save(input)} onCancel={() => setEditing(false)} /> : <>
        {detail.correctedAt ? <p className="track-coverage">Edited {new Date(`${detail.correctedAt.replace(' ', 'T')}Z`).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p> : null}
        {detail.occurrences.map((item) => <div className="history-occurrence-detail" key={item.id}><span>{item.title}{item.variantName ? ` · ${item.variantName}` : ""}{item.actualSeconds != null ? <small>{Math.round(item.actualSeconds / 60)} min measured</small> : null}</span>{!only ? <select aria-label={`Status of ${item.title}${item.variantName ? ` ${item.variantName}` : ""}`} disabled={busy} value={occurrenceStatus(item)} onChange={(event) => setStatus(item.id, event.target.value as StatusCorrection["status"])}><StatusOptions /></select> : null}</div>)}
        {detail.entries.length ? <div className="history-recorded">{detail.entries.map((entry) => <section key={entry.id}><h4>{entry.title}</h4><ul>{entry.lines.map((line, i) => <li key={i}>{line}</li>)}</ul>{entry.activityId !== detail.activityId ? <button type="button" onClick={() => onOpenActivity(entry.activityId, date)}>View in {entry.activityTitle}</button> : null}</section>)}</div> : <p className="track-coverage">No additional details recorded.</p>}
        {detail.records.some((record) => record.archived) ? <p className="track-coverage">Archived records are retained here for reference.</p> : null}
        {detail.records.some((record) => !record.archived) || detail.occurrences.length ? <button type="button" onClick={() => setEditing(true)} disabled={busy}>Edit this day</button> : <p className="track-coverage">{day.known ? "This activity was not scheduled." : "No plan was saved for this date."}</p>}
        {!detail.occurrences.length ? <details className="history-backfill"><summary>Record an activity for this date</summary><p className="track-coverage">Mark this activity completed on {historyDateLabel(date)}. This adds only that occurrence, with no assumed duration or product choices.</p><button type="button" disabled={busy} onClick={() => void save({ actionId: crypto.randomUUID(), date, activityId: detail.activityId, statuses: [], records: [], backfill: true })}>Record completed activity</button></details> : null}
      </>}
    </div> : null}
  </article>;
}
