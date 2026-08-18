"use client";

import type { CSSProperties, DragEvent } from "react";
import { useEffect, useMemo, useState } from "react";

type Category = "Light" | "Reset" | "Training" | "Fuel" | "Care";

type RoutineItem = {
  id: string;
  title: string;
  detail: string;
  duration: number;
  category: Category;
  icon: string;
  color: string;
};

type DropTarget = {
  id: string;
  position: "before" | "after";
};

const START_MINUTES = 8 * 60;

const INITIAL_ITEMS: RoutineItem[] = [
  { id: "sun-walk", title: "Walk in sun", detail: "Easy pace · outdoor light", duration: 30, category: "Light", icon: "☼", color: "#f2b55b" },
  { id: "shower", title: "Shower", detail: "Reset · get ready for the day", duration: 15, category: "Reset", icon: "◌", color: "#73b9d4" },
  { id: "stretch", title: "Stretch / yoga", detail: "Mobility · breathe and open up", duration: 20, category: "Reset", icon: "⌁", color: "#9d9ae8" },
  { id: "hair-serum", title: "Hair serum", detail: "Care · apply and let it settle", duration: 5, category: "Care", icon: "✦", color: "#d58bb1" },
  { id: "red-light", title: "Red light", detail: "Care · device session", duration: 15, category: "Care", icon: "◉", color: "#dc766a" },
  { id: "hang", title: "Hang from chin-up bar", detail: "Grip · decompression", duration: 5, category: "Training", icon: "↑", color: "#b3cf67" },
  { id: "kettlebells", title: "Kettlebells", detail: "Strength · short focused circuit", duration: 20, category: "Training", icon: "◆", color: "#cb9a67" },
  { id: "cardio", title: "Cardio", detail: "Conditioning · steady effort", duration: 25, category: "Training", icon: "≈", color: "#68b89c" },
  { id: "lift", title: "Lift", detail: "Strength · main session", duration: 45, category: "Training", icon: "▰", color: "#8fb66e" },
  { id: "breakfast", title: "Breakfast", detail: "Energy drink / shake · sit down and eat", duration: 30, category: "Fuel", icon: "◒", color: "#d49561" },
  { id: "massage-gun", title: "Massage gun", detail: "Recovery · quick pass on worked areas", duration: 10, category: "Reset", icon: "∿", color: "#78a6c8" },
  { id: "skin-routine", title: "Skin routine", detail: "Care · cleanse and moisturize", duration: 15, category: "Care", icon: "✧", color: "#d08fb6" },
  { id: "lunch", title: "Lunch", detail: "Fuel · simple, intentional meal", duration: 30, category: "Fuel", icon: "◍", color: "#d29e61" },
  { id: "sun-tan", title: "Sun tan", detail: "Outdoor time · finish the protocol", duration: 20, category: "Light", icon: "☀", color: "#efb65c" },
];

const STORAGE_KEY = "idealized-day-items-v1";
const COMPLETE_KEY = "idealized-day-complete-v1";

function formatTime(totalMinutes: number) {
  const normalized = totalMinutes % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatDuration(duration: number) {
  if (duration < 60) return `${duration} min`;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export default function Home() {
  const [items, setItems] = useState<RoutineItem[]>(INITIAL_ITEMS);
  const [completed, setCompleted] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [editingDurationId, setEditingDurationId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    try {
      const savedItems = window.localStorage.getItem(STORAGE_KEY);
      const savedCompleted = window.localStorage.getItem(COMPLETE_KEY);
      if (savedItems) setItems(JSON.parse(savedItems) as RoutineItem[]);
      if (savedCompleted) setCompleted(JSON.parse(savedCompleted) as string[]);
    } catch {
      // The default routine remains usable if storage is unavailable or corrupt.
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [hasLoaded, items]);

  useEffect(() => {
    if (!hasLoaded) return;
    window.localStorage.setItem(COMPLETE_KEY, JSON.stringify(completed));
  }, [completed, hasLoaded]);

  const totalMinutes = useMemo(
    () => items.reduce((total, item) => total + item.duration, 0),
    [items],
  );
  const completedCount = completed.filter((id) =>
    items.some((item) => item.id === id),
  ).length;
  const progress = items.length ? (completedCount / items.length) * 100 : 0;
  const nextUp = items.find((item) => !completed.includes(item.id));

  function toggleComplete(id: string) {
    setCompleted((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id],
    );
  }

  function updateDuration(id: string, value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const duration = Math.min(480, Math.max(1, Math.round(parsed)));
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, duration } : item)),
    );
  }

  function resetOrder() {
    setItems((current) => {
      const durations = new Map(current.map((item) => [item.id, item.duration]));
      return INITIAL_ITEMS.map((item) => ({
        ...item,
        duration: durations.get(item.id) ?? item.duration,
      }));
    });
  }

  function moveItem(
    sourceId: string,
    targetId: string,
    position: "before" | "after" = "before",
  ) {
    if (sourceId === targetId) return;
    setItems((current) => {
      const next = [...current];
      const sourceIndex = next.findIndex((item) => item.id === sourceId);
      if (sourceIndex < 0 || !next.some((item) => item.id === targetId)) return current;
      const [moved] = next.splice(sourceIndex, 1);
      const targetIndex = next.findIndex((item) => item.id === targetId);
      next.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, moved);
      return next;
    });
  }

  function moveByKeyboard(id: string, direction: -1 | 1) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (draggingId && dropTarget?.id === targetId) {
      moveItem(draggingId, targetId, dropTarget.position);
    }
    setDraggingId(null);
    setDropTarget(null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (!draggingId || draggingId === targetId) {
      setDropTarget(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDropTarget({ id: targetId, position });
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    const relatedTarget = event.relatedTarget as Node | null;
    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
      setDropTarget(null);
    }
  }

  let runningMinutes = START_MINUTES;

  return (
    <main className="app-shell">
      <aside className="side-rail" aria-label="Primary navigation">
        <div className="mark" aria-label="Idealized day home">id</div>
        <nav className="rail-nav">
          <button className="rail-button active" aria-label="Daily protocol" type="button"><span className="rail-icon">▦</span></button>
          <button className="rail-button" aria-label="Insights" type="button"><span className="rail-icon">◒</span></button>
          <button className="rail-button" aria-label="Settings" type="button"><span className="rail-icon">⌘</span></button>
        </nav>
        <div className="rail-bottom"><span className="status-dot" /><span>v1</span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb"><span>Daily protocol</span><span className="crumb-divider">/</span><strong>Idealized day</strong></div>
          <div className="topbar-right"><span className="saved-state"><span className="status-dot" /> Local plan</span><button className="avatar" type="button" aria-label="Profile">D</button></div>
        </header>

        <div className="content-grid">
          <section className="schedule-column" aria-labelledby="page-title">
            <div className="page-heading">
              <div>
                <p className="eyebrow">A repeatable morning</p>
                <h1 id="page-title">Start with sunlight.</h1>
                <p className="lede">Your idealized day, arranged from wake-up through the last block.</p>
              </div>
              <div className="date-card"><span className="date-label">Wake</span><strong>8:00 <small>AM</small></strong><span className="date-label">{items.length} blocks · {formatDuration(totalMinutes)}</span></div>
            </div>

            <div className="schedule-toolbar">
              <div className="view-switcher" role="group" aria-label="View selector"><button className="view-button active" type="button">Day</button><button className="view-button" type="button" disabled>Week</button></div>
              <div className="toolbar-actions"><button className="text-button" type="button" onClick={resetOrder}>Reset order</button><span className="toolbar-hint">Drag to rearrange · tap duration to edit</span></div>
            </div>

            <div className="schedule" aria-label="Idealized day schedule">
              <div className="timeline-start"><span className="timeline-dot" /> 8:00 AM start</div>
              {items.map((item, index) => {
                const start = runningMinutes;
                const end = start + item.duration;
                runningMinutes = end;
                const isComplete = completed.includes(item.id);
                const isDragging = draggingId === item.id;
                const isDropBefore = dropTarget?.id === item.id && dropTarget.position === "before";
                const isDropAfter = dropTarget?.id === item.id && dropTarget.position === "after";
                const itemStyle = { "--accent": item.color } as CSSProperties;
                return (
                  <div className={`routine-row ${isDragging ? "is-dragging" : ""} ${isDropBefore ? "drop-before" : ""} ${isDropAfter ? "drop-after" : ""} ${isComplete ? "is-complete" : ""}`} key={item.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDraggingId(item.id); setDropTarget(null); }} onDragEnd={() => { setDraggingId(null); setDropTarget(null); }} onDragOver={(event) => handleDragOver(event, item.id)} onDragLeave={handleDragLeave} onDrop={(event) => handleDrop(event, item.id)} style={itemStyle}>
                    {isDropBefore || isDropAfter ? <div className="drop-indicator" aria-hidden="true"><span>Drop here</span></div> : null}
                    <div className="time-column"><strong>{formatTime(start)}</strong><span>{formatTime(end)}</span></div>
                    <div className="timeline-track" aria-hidden="true"><span className="track-line" /><span className="timeline-node" /></div>
                    <article className="routine-card">
                      <button className={`complete-button ${isComplete ? "checked" : ""}`} type="button" aria-label={`${isComplete ? "Mark" : "Complete"} ${item.title}`} onClick={() => toggleComplete(item.id)}>{isComplete ? "✓" : ""}</button>
                      <div className="routine-icon" aria-hidden="true">{item.icon}</div>
                      <div className="routine-copy"><div className="routine-title-line"><h2>{item.title}</h2><span className="category-pill">{item.category}</span></div><p>{item.detail}</p></div>
                      <div className="card-actions">
                        {editingDurationId === item.id ? <div className="duration-editor"><label><span>Duration</span><input aria-label={`Duration for ${item.title} in minutes`} type="number" min="1" max="480" step="5" value={item.duration} onChange={(event) => updateDuration(item.id, event.target.value)} /></label><span className="duration-unit">min</span><button className="duration-done" type="button" onClick={() => setEditingDurationId(null)}>Done</button></div> : <button className="duration-button" type="button" aria-label={`Edit duration for ${item.title}`} onClick={() => setEditingDurationId(item.id)}>{formatDuration(item.duration)} <span>↗</span></button>}
                        <button className="move-button" type="button" aria-label={`Move ${item.title} up`} onClick={() => moveByKeyboard(item.id, -1)}>↑</button><button className="move-button" type="button" aria-label={`Move ${item.title} down`} onClick={() => moveByKeyboard(item.id, 1)}>↓</button><span className="drag-handle" aria-hidden="true">⠿</span>
                      </div>
                    </article>
                    {index === items.length - 1 ? <div className="timeline-end"><span className="timeline-dot" /> {formatTime(end)} finish</div> : null}
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="insight-column" aria-label="Day summary">
            <div className="summary-card card-surface">
              <div className="summary-card-top"><div><p className="eyebrow">Today&apos;s flow</p><h2>{completedCount} <span>/ {items.length}</span></h2></div><div className="progress-ring" style={{ "--progress": `${progress}%` } as CSSProperties}><span>{Math.round(progress)}%</span></div></div>
              <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div><p className="summary-caption">{completedCount === items.length ? "Protocol complete." : "Small actions, stacked consistently."}</p><button className="secondary-button" type="button" onClick={() => setCompleted([])}>Reset today</button>
            </div>

            <div className="next-card card-surface"><div className="section-label"><span className="pulse" /> Next up</div>{nextUp ? <div className="next-up-content"><div className="next-icon" style={{ "--accent": nextUp.color } as CSSProperties}>{nextUp.icon}</div><div><h3>{nextUp.title}</h3><p>{formatDuration(nextUp.duration)} · keep it simple</p></div></div> : <div className="next-up-content"><div className="next-icon">✓</div><div><h3>All done</h3><p>You made it through the plan.</p></div></div>}</div>

            <div className="principles-card"><div className="section-label">How to use this</div><div className="principle"><span>01</span><p>Drag a block to change the order.</p></div><div className="principle"><span>02</span><p>Tap the circle when a block is complete.</p></div><div className="principle"><span>03</span><p>Your changes stay on this device.</p></div></div>
            <div className="quote-card"><span className="quote-mark">“</span><p>The day becomes easier when the first decision is already made.</p></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
