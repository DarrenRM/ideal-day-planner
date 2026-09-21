"use client";

import { createElement, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "./icons";
import { activityIconFor, CATEGORY_META, normalizeCategory } from "./activity-presentation";
import { historyDates, historyDayLabel, historyDayState, historyPeriod, shiftHistoryDate, type HistoryDay, type HistoryDetail, type TrackRecord } from "./track-record-model";
import { HistoryDayRow, historyDateLabel as formatDate } from "./history-day";

type Overview = TrackRecord & { activityId: string | null; activityOptions: Array<{ id: string; title: string; category: string }> };
type HistoryFrame = { activityId: string; anchor: string; mode: "month" | "year"; selectedDate: string | null; openWeeks: string[]; scroll: number; title: string };
const localToday = () => new Date().toLocaleDateString("en-CA");
const blankDay = (date: string): HistoryDay => ({ date, known: false, planned: 0, completed: 0, skipped: 0, entries: 0 });
function ActivityMark({ title, category }: { title: string; category: string }) {
  const normalized = normalizeCategory(category) ?? "Logistics";
  return <span className="track-activity-icon" style={{ "--item-color": CATEGORY_META[normalized].color } as CSSProperties}>{createElement(activityIconFor({ title, category: normalized }), { size: 20, "aria-hidden": true })}</span>;
}

export function TrackRecordView({ initialActivityId, onClose, onChanged }: { initialActivityId: string | null; onClose: () => void; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [tab, setTab] = useState<"activities" | "calendar">("activities");
  const [mode, setMode] = useState<"month" | "year">("month");
  const [anchor, setAnchor] = useState(localToday);
  const [activityId, setActivityId] = useState(initialActivityId ?? "");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<HistoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [today, setToday] = useState(localToday);
  const [options, setOptions] = useState<Overview["activityOptions"]>([]);
  const [openWeeks, setOpenWeeks] = useState<string[]>([]);
  const [activityCalendar, setActivityCalendar] = useState(false);
  const navigation = useRef({ session: "", level: 0, rootScroll: 0, focusId: "", rootAnchor: "", rootMode: "month" as "month" | "year", restoreScroll: false });
  const originActivity = useRef(initialActivityId);
  const frames = useRef<HistoryFrame[]>([]);
  const [parentLabel, setParentLabel] = useState(initialActivityId ? "Back to activity" : "Today");
  const closeRef = useRef(onClose);
  const period = historyPeriod(anchor, activityId ? "month" : mode);
  const end = period.end > today ? today : period.end;
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const node = dialog.current, previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; node?.showModal();
    const session = crypto.randomUUID(); navigation.current.session = session;
    window.history.pushState({ ...window.history.state, trackRecord: { session, level: 0 } }, "");
    function pop(event: PopStateEvent) {
      if (node?.querySelector('.history-editor, .history-day-row[aria-busy="true"]')) {
        window.history.pushState({ ...window.history.state, trackRecord: { session, level: navigation.current.level, activityId: navigation.current.focusId } }, "");
        setError("Save or cancel the open day before leaving."); return;
      }
      const state = event.state?.trackRecord;
      if (state?.session !== session) { closeRef.current(); return; }
      const frame = frames.current[state.level];
      if (frame) {
        navigation.current.level = state.level; setActivityId(frame.activityId); setOverview(null); setActivityCalendar(false); setError(null);
        setAnchor(frame.anchor); setMode(frame.mode); setSelectedDate(frame.selectedDate); setOpenWeeks(frame.openWeeks);
        setParentLabel(state.level ? frames.current[state.level - 1]?.title || "Activities" : originActivity.current ? "Back to activity" : "Today");
        navigation.current.rootScroll = frame.scroll; navigation.current.restoreScroll = true;
      }
    }
    window.addEventListener("popstate", pop);
    return () => { window.removeEventListener("popstate", pop); node?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ start: period.start, end }); if (activityId) params.set("activityId", activityId);
    void fetch(`/api/history?${params}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Your track record could not load.");
      if (controller.signal.aborted) return;
      setOverview(data); setOptions(data.activityOptions); setToday(data.today); setError(null);
      if (navigation.current.restoreScroll) requestAnimationFrame(() => {
        if (dialog.current) dialog.current.scrollTop = navigation.current.rootScroll;
        if (!activityId) document.getElementById(`history-activity-${navigation.current.focusId}`)?.focus({ preventScroll: true });
        navigation.current.restoreScroll = false;
      });
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Your track record could not load."); });
    return () => controller.abort();
  }, [period.start, end, activityId, revision]);
  useEffect(() => {
    if (!selectedDate || activityId) return;
    const controller = new AbortController();
    void fetch(`/api/history?date=${selectedDate}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "This day could not load.");
      if (!controller.signal.aborted) setDayDetail(data);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [selectedDate, activityId, revision]);
  function back() { window.history.back(); }
  function chooseActivity(id: string, date = selectedDate) {
    const level = navigation.current.level;
    const title = activityId ? options.find((item) => item.id === canonicalId)?.title || "Activity history" : tab === "calendar" ? "Calendar" : "Activities";
    frames.current[level] = { activityId, anchor, mode, selectedDate, openWeeks, scroll: dialog.current?.scrollTop ?? 0, title };
    frames.current = frames.current.slice(0, level + 1);
    frames.current.push({ activityId: id, anchor: date || anchor, mode: "month", selectedDate: date, openWeeks: [], scroll: 0, title: options.find((item) => item.id === id)?.title || "Activity history" });
    navigation.current = { ...navigation.current, rootScroll: 0, focusId: id, level: level + 1, rootAnchor: anchor, rootMode: mode };
    window.history.pushState({ ...window.history.state, trackRecord: { session: navigation.current.session, level: level + 1, activityId: id } }, "");
    setParentLabel(title); setSelectedDate(date);
    setActivityId(id); setOverview(null); setError(null); setOpenWeeks(date ? [shiftHistoryDate(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7))] : []); setActivityCalendar(false);
    if (date) setAnchor(date);
    requestAnimationFrame(() => { if (dialog.current) dialog.current.scrollTop = 0; heading.current?.focus(); });
  }
  function changePeriod(date: string, nextMode = mode) {
    setOverview(null); setError(null); setAnchor(date); setMode(nextMode); setSelectedDate(null); setDayDetail(null); setOpenWeeks([]);
  }
  function selectDay(date: string) {
    setSelectedDate(date); setDayDetail(null);
    if (activityId) {
      const monday = shiftHistoryDate(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
      setOpenWeeks((values) => [...new Set([...values.filter((value) => value !== `closed:${monday}`), monday])]); setActivityCalendar(false);
    }
  }
  const changed = () => { setRevision((value) => value + 1); onChanged(); };
  const daysByDate = new Map(overview?.days.map((day) => [day.date, day]));
  const dates = historyDates(period.start, period.end);
  const offset = (new Date(`${period.start}T12:00:00Z`).getUTCDay() + 6) % 7;
  const canonicalId = overview?.activityId || activityId, activity = options.find((item) => item.id === canonicalId);
  const previous = mode === "year" && !activityId ? `${Number(anchor.slice(0, 4)) - 1}-01-01` : shiftHistoryDate(period.start, -1), next = shiftHistoryDate(period.end, 1);
  const weekMap = new Map<string, HistoryDay[]>();
  for (const day of overview?.days ?? []) {
    const start = shiftHistoryDate(day.date, -((new Date(`${day.date}T12:00:00Z`).getUTCDay() + 6) % 7)); weekMap.set(start, [...(weekMap.get(start) ?? []), day]);
  }
  const weeks = [...weekMap.entries()].reverse();
  const calendar = <><div className="track-month" aria-label="Daily completion calendar">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span className="track-weekday" key={day}>{day}</span>)}{Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}{dates.map((date) => { const day = daysByDate.get(date) ?? blankDay(date); return <button key={date} type="button" className={`track-day track-${historyDayState(day)} ${date === today ? "is-today" : ""}`} aria-label={historyDayLabel(day, today)} aria-pressed={selectedDate === date} disabled={date > today} onClick={() => selectDay(date)}><span>{Number(date.slice(-2))}</span><small>{date > today ? "—" : day.planned ? `${day.completed}/${day.planned}` : day.entries ? "•" : day.known ? "—" : "?"}</small></button>; })}</div><div className="track-legend"><span><i className="track-zero" />None</span><span><i className="track-some" />Some</span><span><i className="track-complete" />All</span><span>— Not scheduled</span><span>? No saved day</span></div></>;
  return <dialog className="track-record-dialog" ref={dialog} aria-labelledby="track-record-title" onClickCapture={(event) => {
    const target = event.target as HTMLElement;
    const active = dialog.current?.querySelector('.history-editor, .history-day-row[aria-busy="true"]');
    if (active && !target.closest('.history-editor, .track-error')) { event.preventDefault(); event.stopPropagation(); setError("Save or cancel the open day before leaving."); }
  }} onCancel={(event) => { event.preventDefault(); back(); }}><div className="track-record-shell history-shell">
    <button type="button" className="track-back" onClick={back}><ArrowLeft size={18} aria-hidden="true" />{parentLabel}</button>
    <header className="history-header"><p className="history-eyebrow">{activityId ? "Activity history" : "Your progress"}</p><h1 ref={heading} tabIndex={-1} id="track-record-title">{activityId ? activity?.title || "Activity history" : "Track record"}</h1>{!activityId ? <p>See what you’ve been showing up for.</p> : null}</header>
    {!activityId ? <div className="history-tabs" aria-label="Track record views"><button type="button" aria-pressed={tab === "activities"} onClick={() => setTab("activities")}>Activities</button><button type="button" aria-pressed={tab === "calendar"} onClick={() => setTab("calendar")}>Calendar</button></div> : null}
    <div className="track-period"><button type="button" aria-label="Previous period" onClick={() => changePeriod(previous)}><ChevronLeft size={18} aria-hidden="true" /></button><h2>{formatDate(anchor, mode === "year" && !activityId ? { year: "numeric" } : { month: "long", year: "numeric" })}</h2><button type="button" aria-label="Next period" disabled={next > today} onClick={() => changePeriod(next)}><ChevronRight size={18} aria-hidden="true" /></button></div>
    {error ? <div className="track-error" role="alert">{error}<button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></div> : null}
    {!overview ? <p role="status">Loading your track record…</p> : <>
      <div className="track-summary history-summary"><p><strong>{overview.totals.completed}</strong> of {overview.totals.planned} planned {activityId ? "completed" : "activities completed"}</p><small>{overview.totals.skipped ? `${overview.totals.skipped} skipped · ` : ""}{end === today ? "Today is still in progress" : "Based on saved days"}</small></div>
      {!activityId && tab === "activities" ? <section className="history-library"><label className="history-search">Find an activity<input type="search" placeholder="Search activities" value={search} onChange={(event) => setSearch(event.target.value)} /></label><ul>{options.filter((item) => item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((item) => {
        const stats = overview.activities.find((value) => value.id === item.id);
        return <li key={item.id}><button id={`history-activity-${item.id}`} type="button" onClick={() => chooseActivity(item.id)}><ActivityMark title={item.title} category={item.category} /><span className="track-row-copy"><strong>{item.title}</strong><small>{stats?.lastCompletedDate ? `Last completed ${formatDate(stats.lastCompletedDate, { month: "short", day: "numeric" })}` : "No completions in this period"}</small></span><span className="history-library-count">{stats?.completed ?? 0}<small>of {stats?.planned ?? 0}</small></span><ChevronRight size={16} aria-hidden="true" /></button></li>;
      })}</ul>{!options.some((item) => item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ? <p className="track-coverage">No matching activities.</p> : null}</section> : activityId ? <>
        <div className="history-week-strip" aria-label="Latest week">{weeks[0]?.[1].map((day) => <button type="button" key={day.date} onClick={() => selectDay(day.date)} aria-label={historyDayLabel(day, today)} aria-pressed={selectedDate === day.date}><small>{formatDate(day.date, { weekday: "short" })}</small><span className={day.planned && day.completed === day.planned ? "history-check" : ""}>{day.planned && day.completed === day.planned ? "✓" : day.skipped ? "／" : day.planned ? "○" : "—"}</span><small>{Number(day.date.slice(-2))}</small></button>)}</div>
        <div className="track-section-heading history-week-heading"><h2>History by week</h2><button type="button" aria-expanded={activityCalendar} onClick={() => setActivityCalendar((value) => !value)}>{activityCalendar ? "Hide calendar" : "Browse calendar"}</button></div>
        {activityCalendar ? calendar : null}
        <div className="history-weeks">{weeks.map(([week, days], index) => {
          const open = openWeeks.includes(week) || index === 0 && !openWeeks.includes(`closed:${week}`);
          const completed = days.reduce((sum, day) => sum + day.completed, 0), planned = days.reduce((sum, day) => sum + day.planned, 0), skipped = days.reduce((sum, day) => sum + day.skipped, 0);
          return <section className="history-week" key={week}><button className="history-week-toggle" type="button" aria-expanded={open} onClick={() => setOpenWeeks((values) => open ? [...values.filter((value) => value !== week), `closed:${week}`] : [...values.filter((value) => value !== `closed:${week}`), week])}><ChevronRight size={18} aria-hidden="true" /><span><strong>{formatDate(days[0].date, { month: "short", day: "numeric" })} – {formatDate(days[days.length - 1].date, { month: "short", day: "numeric" })}</strong><small>{planned ? `${completed} of ${planned} completed${skipped ? ` · ${skipped} skipped` : ""}` : "No saved commitments"}{days.some((day) => day.date === today) ? " · Today in progress" : ""}</small></span></button>{open ? <div className="history-week-days">{[...days].reverse().map((day) => <HistoryDayRow key={`${day.date}:${selectedDate === day.date}`} day={day} activityId={canonicalId} today={today} onChanged={changed} onOpenActivity={chooseActivity} initiallyOpen={selectedDate === day.date} />)}</div> : null}</section>;
        })}</div><button className="history-earlier" type="button" onClick={() => changePeriod(previous)}>Earlier weeks <ChevronLeft size={16} aria-hidden="true" /></button>
      </> : <>
        <div className="track-mode history-calendar-mode"><button type="button" aria-pressed={mode === "month"} onClick={() => changePeriod(anchor, "month")}>Month</button><button type="button" aria-pressed={mode === "year"} onClick={() => changePeriod(anchor, "year")}>Year</button></div>
        {mode === "month" ? calendar : <div className="track-year-months">{Array.from({ length: 12 }, (_, i) => { const date = `${anchor.slice(0, 4)}-${String(i + 1).padStart(2, "0")}-01`; const month = historyPeriod(date, "month"); const days = overview.days.filter((day) => day.date >= month.start && day.date <= month.end); return <button key={date} type="button" disabled={date > today} onClick={() => changePeriod(date, "month")}><span>{formatDate(date, { month: "short" })}</span><small>{days.reduce((sum, day) => sum + day.completed, 0)}/{days.reduce((sum, day) => sum + day.planned, 0)}</small><span className="track-mini-month" aria-hidden="true">{historyDates(month.start, month.end).map((value) => <span key={value} className={`track-year-day track-${historyDayState(daysByDate.get(value) ?? blankDay(value))}`} />)}</span></button>; })}</div>}
        {selectedDate ? <section className="history-calendar-day"><h2>{formatDate(selectedDate, { weekday: "long", month: "long", day: "numeric" })}</h2>{!dayDetail ? <p role="status">Loading day…</p> : <><p className="track-coverage">{dayDetail.known ? "Select an activity to see or correct its details." : "No plan was saved for this day."}</p><div className="history-library"><ul>{[...new Set([...dayDetail.occurrences.map((item) => item.activityId), ...dayDetail.entries.map((entry) => entry.activityId)])].map((id) => { const item = options.find((value) => value.id === id); return <li key={id}><button id={`history-activity-${id}`} type="button" onClick={() => chooseActivity(id)}>{item ? <ActivityMark title={item.title} category={item.category} /> : null}<span>{item?.title || "Activity"}</span><ChevronRight size={16} aria-hidden="true" /></button></li>; })}</ul></div></>}</section> : null}
      </>}
      <p className="track-coverage history-footnote">Saved activity days and recorded details. Unscheduled and missing days are never counted as missed.</p>
    </>}
  </div></dialog>;
}
