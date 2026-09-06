"use client";

import { createElement, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight } from "./icons";
import { activityIconFor, CATEGORY_META, normalizeCategory } from "./activity-presentation";
import { historyDates, historyDayLabel, historyDayState, historyPeriod, shiftHistoryDate, type HistoryDay, type HistoryDetail, type HistoryOccurrence, type TrackRecord } from "./track-record-model";

type Overview = TrackRecord & { activityOptions: Array<{ id: string; title: string; category: string }> };
type Detail = HistoryDetail & { hasMoreEntries: boolean };
const localToday = () => new Date().toLocaleDateString("en-CA");
const formatDate = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const blankDay = (date: string): HistoryDay => ({ date, known: false, planned: 0, completed: 0, skipped: 0, entries: 0 });

function ActivityMark({ title, category }: { title: string; category: string }) {
  const normalized = normalizeCategory(category) ?? "Logistics";
  const Icon = activityIconFor({ title, category: normalized });
  return <span className="track-activity-icon" style={{ "--item-color": CATEGORY_META[normalized].color } as CSSProperties}> {createElement(Icon, { size: 18, "aria-hidden": true })}</span>;
}

export function TrackRecordView({ initialActivityId, onClose, onChanged }: { initialActivityId: string | null; onClose: () => void; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const detailRegion = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<"month" | "year">("month");
  const [anchor, setAnchor] = useState(localToday);
  const [activityId, setActivityId] = useState(initialActivityId ?? "");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [visibleDays, setVisibleDays] = useState(20);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [today, setToday] = useState(localToday);
  const [activityOptions, setActivityOptions] = useState<Overview["activityOptions"]>([]);
  const period = historyPeriod(anchor, mode);
  const end = period.end > today ? today : period.end;

  useEffect(() => {
    const node = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.showModal();
    return () => { node?.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ start: period.start, end });
    if (activityId) params.set("activityId", activityId);
    void fetch(`/api/history?${params}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your track record could not load.");
      if (controller.signal.aborted) return;
      setOverview(data);
      setActivityOptions(data.activityOptions);
      setToday(data.today);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Your track record could not load."); });
    return () => controller.abort();
  }, [period.start, end, activityId, revision]);

  useEffect(() => {
    if (!selectedDate) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ date: selectedDate });
    if (activityId) params.set("activityId", activityId);
    void fetch(`/api/history?${params}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "This day could not load.");
      if (!controller.signal.aborted) setDetail(data);
    }).catch((reason) => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : "This day could not load."); });
    return () => controller.abort();
  }, [selectedDate, activityId, revision]);

  function selectDay(date: string) {
    if (date !== selectedDate) {
      setDetail(null); setDetailError(null);
      setSelectedDate(date);
      setEditing(false);
    }
    window.requestAnimationFrame(() => detailRegion.current?.scrollIntoView({ block: "start", behavior: "auto" }));
  }

  function changePeriod(date: string, nextMode = mode) {
    if (nextMode === mode && historyPeriod(date, nextMode).start === period.start) return;
    setOverview(null); setError(null); setDetail(null); setDetailError(null);
    setAnchor(date); setMode(nextMode); setSelectedDate(null); setEditing(false); setVisibleDays(20);
  }

  function chooseActivity(id: string) {
    if (id === activityId) return;
    setOverview(null); setError(null); setDetail(null); setDetailError(null);
    setActivityId(id); setSelectedDate(null); setEditing(false); setVisibleDays(20);
  }

  async function correctOccurrence(item: HistoryOccurrence) {
    if (!editing || saving || !selectedDate) return;
    setSaving(item.id); setDetailError(null);
    try {
      const response = await fetch("/api/activity/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ occurrenceId: item.id, date: selectedDate, mode: item.completedAt ? "reopen" : "complete", refreshHighlight: selectedDate === today }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The correction could not be saved.");
      onChanged();
      const query = new URLSearchParams({ start: period.start, end, activityId });
      const dateQuery = new URLSearchParams({ date: selectedDate, activityId });
      const responses = await Promise.all([fetch(`/api/history?${query}`), fetch(`/api/history?${dateQuery}`)]);
      if (responses.some((value) => !value.ok)) throw new Error("The correction was saved, but history could not refresh. Retry to reload it.");
      const [updatedOverview, updatedDetail] = await Promise.all(responses.map((value) => value.json()));
      setOverview(updatedOverview); setDetail(updatedDetail);
    } catch (reason) { setDetailError(reason instanceof Error ? reason.message : "The correction could not be saved."); }
    finally { setSaving(null); }
  }

  const daysByDate = new Map(overview?.days.map((day) => [day.date, day]));
  const monthDates = historyDates(period.start, period.end);
  const dayOffset = (new Date(`${period.start}T12:00:00Z`).getUTCDay() + 6) % 7;
  const knownDays = overview?.days.filter((day) => day.known).length ?? 0;
  const activityName = activityOptions.find((activity) => activity.id === activityId)?.title;
  const recordedDays = overview?.days.filter((day) => day.planned || day.entries).reverse() ?? [];
  const previous = mode === "month" ? shiftHistoryDate(period.start, -1) : `${Number(anchor.slice(0, 4)) - 1}-01-01`;
  const next = shiftHistoryDate(period.end, 1);

  return <dialog className="track-record-dialog" ref={dialog} aria-labelledby="track-record-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
    <div className="track-record-shell">
      <header className="track-record-header">
        <button type="button" className="track-back" onClick={onClose} disabled={Boolean(saving)}><ArrowLeft size={18} aria-hidden="true" /> Back</button>
        <h1 id="track-record-title">Track record</h1>
      </header>
      <div className="track-controls">
        <label>Activity<select value={activityId} onChange={(event) => chooseActivity(event.target.value)} disabled={Boolean(saving)}>
          <option value="">All activities</option>
          {activityOptions.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}
          {activityId && !activityOptions.length ? <option value={activityId}>Selected activity</option> : null}
        </select></label>
        <div className="track-mode" aria-label="Calendar view">
          <button type="button" aria-pressed={mode === "month"} onClick={() => changePeriod(anchor, "month")} disabled={Boolean(saving)}>Month</button>
          <button type="button" aria-pressed={mode === "year"} onClick={() => changePeriod(anchor, "year")} disabled={Boolean(saving)}>Year</button>
        </div>
      </div>
      <div className="track-period">
        <button type="button" aria-label={`Previous ${mode}`} onClick={() => changePeriod(previous)} disabled={Boolean(saving)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <h2>{formatDate(anchor, mode === "year" ? { year: "numeric" } : { month: "long", year: "numeric" })}</h2>
        <button type="button" aria-label={`Next ${mode}`} disabled={next > today || Boolean(saving)} onClick={() => changePeriod(next)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      {error ? <div className="track-error" role="alert">{error}<button type="button" onClick={() => { setError(null); setDetailError(null); setRevision((value) => value + 1); }}>Retry</button></div> : !overview ? <p role="status">Loading your track record…</p> : <>
        <div className="track-summary" aria-live="polite">
          <p>{overview.totals.planned ? <><strong>{overview.totals.completed} of {overview.totals.planned}</strong> planned activities completed{activityName ? ` · ${activityName}` : ""}</> : activityId ? "No saved commitments for this activity in this period." : "No saved commitments in this period."}</p>
          <small>{overview.totals.skipped ? `${overview.totals.skipped} skipped · ` : ""}{knownDays} saved {knownDays === 1 ? "day" : "days"}{end === today ? " · Today is still in progress" : ""}</small>
        </div>
        {mode === "month" ? <div className="track-month" aria-label="Daily completion calendar">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span className="track-weekday" key={day}>{day}</span>)}
          {Array.from({ length: dayOffset }, (_, index) => <span key={`offset-${index}`} />)}
          {monthDates.map((date) => {
            const day = daysByDate.get(date) ?? blankDay(date);
            return <button key={date} type="button" className={`track-day track-${historyDayState(day)} ${date === today ? "is-today" : ""}`} aria-label={date > today ? `${date}: future date` : historyDayLabel(day, today)} aria-pressed={selectedDate === date} disabled={date > today || Boolean(saving)} onClick={() => selectDay(date)}>
              <span>{Number(date.slice(-2))}</span><small>{date > today ? "—" : day.planned ? `${day.completed}/${day.planned}` : day.entries ? "•" : day.known ? "—" : "?"}</small>
            </button>;
          })}
        </div> : <>
          <div className="track-year-chart" role="img" aria-label={`${anchor.slice(0, 4)} completion heatmap. Choose a month below to inspect individual dates.`}>
            {Array.from({ length: dayOffset }, (_, index) => <span key={`offset-${index}`} />)}
            {monthDates.map((date) => { const day = daysByDate.get(date) ?? blankDay(date); return <span className={`track-year-day track-${historyDayState(day)} ${date > today ? "is-future" : ""}`} key={date} title={historyDayLabel(day, today)} />; })}
          </div>
          <div className="track-year-months" aria-label="Choose a month">
            {Array.from({ length: 12 }, (_, index) => {
              const date = `${anchor.slice(0, 4)}-${String(index + 1).padStart(2, "0")}-01`;
              const month = historyPeriod(date, "month");
              const dates = historyDates(month.start, month.end);
              const values = overview.days.filter((day) => day.date >= month.start && day.date <= month.end);
              const completed = values.reduce((sum, day) => sum + day.completed, 0);
              const planned = values.reduce((sum, day) => sum + day.planned, 0);
              return <button type="button" key={date} onClick={() => changePeriod(date, "month")} disabled={date > today || Boolean(saving)} aria-label={`${formatDate(date, { month: "long", year: "numeric" })}: ${completed} of ${planned} completed. View month.`}>
                <span>{formatDate(date, { month: "short" })}</span><small>{planned ? `${completed}/${planned}` : "—"}</small>
                <span className="track-mini-month" aria-hidden="true">{dates.map((value) => <span key={value} className={`track-year-day track-${historyDayState(daysByDate.get(value) ?? blankDay(value))} ${value > today ? "is-future" : ""}`} />)}</span>
              </button>;
            })}
          </div>
        </>}
        <div className="track-legend" aria-label="Calendar legend"><span><i className="track-zero" />None</span><span><i className="track-some" />Some</span><span><i className="track-mostly" />Most</span><span><i className="track-complete" />All</span><span>— Nothing scheduled</span><span>? No saved day</span></div>
        <p className="track-coverage">Based on saved days and entries. Missing days are unknown. Skips count as planned; unchosen extras do not.</p>
        <section className="track-detail" ref={detailRegion} aria-label="Selected day">
          {selectedDate ? <>
            <div className="track-section-heading"><h2>{formatDate(selectedDate, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}</h2>{detail?.occurrences.length ? <button type="button" disabled={Boolean(saving)} aria-pressed={editing} onClick={() => setEditing((value) => !value)}>{editing ? "Done correcting" : "Correct this day"}</button> : null}</div>
            {detailError ? <div className="track-error" role="alert">{detailError}<button type="button" onClick={() => { setError(null); setDetailError(null); setRevision((value) => value + 1); }}>Retry</button></div> : null}
            {!detail && !detailError ? <p role="status">Loading this day…</p> : detail ? <>
              {editing ? <p className="track-coverage">Select an activity to change its completion. Saved session details stay intact when you reopen it.</p> : null}
              {!detail.occurrences.length ? <p>{detail.known ? "Nothing scheduled" : "No saved plan for this day."}{activityId && detail.known ? " for this activity." : ""}</p> : <ul className="track-occurrences">{detail.occurrences.map((item) => {
                const content = <><ActivityMark title={item.title} category={item.category} /><span className="track-row-copy"><strong>{item.title}{item.variantName ? ` — ${item.variantName}` : ""}</strong><small>{saving === item.id ? "Saving…" : item.completedAt ? "Completed" : item.skippedAt ? "Skipped" : "Not recorded complete"}{item.actualSeconds != null ? ` · ${Math.round(item.actualSeconds / 60)} min recorded` : ""}</small></span><span aria-hidden="true">{item.completedAt ? <Check size={18} /> : "—"}</span></>;
                return <li key={item.id}>{editing ? <button type="button" className="track-occurrence" aria-label={`Mark ${item.title} ${item.completedAt ? "incomplete" : "complete"}`} aria-pressed={Boolean(item.completedAt)} disabled={Boolean(saving)} onClick={() => void correctOccurrence(item)}>{content}</button> : <div className="track-occurrence">{content}</div>}</li>;
              })}</ul>}
              {detail.entries.length ? <div className="track-entries"><h3>Recorded details</h3>{detail.entries.map((entry) => <details key={entry.id}><summary><span>{entry.title}<small>{entry.activityTitle}</small></span><ChevronRight aria-hidden="true" size={16} /></summary><ul>{entry.lines.length ? entry.lines.map((line, index) => <li key={index}>{line}</li>) : <li>No additional details recorded.</li>}</ul></details>)}</div> : <p className="track-coverage">No session details recorded for this selection.</p>}
              {detail.hasMoreEntries ? <p className="track-coverage">More entries exist. Choose an individual activity to narrow this day.</p> : null}
            </> : null}
          </> : null}
        </section>
        {!activityId && overview.activities.length ? <section className="track-activities"><h2>By activity</h2><ul>{overview.activities.slice(0, showAllActivities ? undefined : 6).map((activity) => <li key={activity.id}><button type="button" disabled={Boolean(saving)} onClick={() => chooseActivity(activity.id)}><ActivityMark title={activity.title} category={activity.category} /><span className="track-row-copy"><strong>{activity.title}</strong><small>{activity.skipped ? `${activity.skipped} skipped · ` : ""}{activity.lastCompletedDate ? `Last completed ${formatDate(activity.lastCompletedDate, { month: "short", day: "numeric" })}` : "No completions recorded"}</small></span><span>{activity.completed}/{activity.planned}</span><ChevronRight aria-hidden="true" size={16} /></button></li>)}</ul>{overview.activities.length > 6 ? <button type="button" onClick={() => setShowAllActivities((value) => !value)}>{showAllActivities ? "Show fewer" : "See all activities"}</button> : null}</section> : null}
        {activityId && recordedDays.length ? <section className="track-activity-days"><h2>Activity history</h2><p className="track-coverage">Counts follow saved occurrences, including activities scheduled less often than daily.</p><ul>{recordedDays.slice(0, visibleDays).map((day) => <li key={day.date}><button type="button" disabled={Boolean(saving)} onClick={() => selectDay(day.date)}><span>{formatDate(day.date, { month: "short", day: "numeric", year: "numeric" })}</span><small>{day.planned ? `${day.completed}/${day.planned} completed` : "Recorded entries"}{day.entries ? ` · ${day.entries} ${day.entries === 1 ? "entry" : "entries"}` : ""}</small><ChevronRight aria-hidden="true" size={16} /></button></li>)}</ul>{recordedDays.length > visibleDays ? <button type="button" onClick={() => setVisibleDays((value) => value + 20)}>Show earlier dates</button> : null}</section> : null}
      </>}
    </div>
  </dialog>;
}
