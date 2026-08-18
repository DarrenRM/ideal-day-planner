"use client";

import type { CSSProperties, DragEvent, KeyboardEvent } from "react";
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

type ScheduledItem = RoutineItem & { start: number; end: number };
type DropTarget = { id: string; position: "before" | "after" };

const START_MINUTES = 8 * 60;
const DURATION_STEP = 5;
const STORAGE_KEY = "idealized-day-items-v1";

const INITIAL_ITEMS: RoutineItem[] = [
  { id: "sun-walk", title: "Walk in sun", detail: "Easy pace · outdoor light", duration: 30, category: "Light", icon: "☼", color: "#e8b75f" },
  { id: "shower", title: "Shower", detail: "Reset · get ready for the day", duration: 15, category: "Reset", icon: "◌", color: "#67b7ce" },
  { id: "stretch", title: "Stretch / yoga", detail: "Mobility · breathe and open up", duration: 20, category: "Reset", icon: "⌁", color: "#928ce0" },
  { id: "hair-serum", title: "Hair serum", detail: "Care · apply and let it settle", duration: 5, category: "Care", icon: "✦", color: "#d58db5" },
  { id: "red-light", title: "Red light", detail: "Care · device session", duration: 15, category: "Care", icon: "◉", color: "#dc766a" },
  { id: "hang", title: "Hang from chin-up bar", detail: "Grip · decompression", duration: 5, category: "Training", icon: "↑", color: "#a8c96d" },
  { id: "kettlebells", title: "Kettlebells", detail: "Strength · short focused circuit", duration: 20, category: "Training", icon: "◆", color: "#c99a67" },
  { id: "cardio", title: "Cardio", detail: "Conditioning · steady effort", duration: 25, category: "Training", icon: "≈", color: "#64b89a" },
  { id: "lift", title: "Lift", detail: "Strength · main session", duration: 45, category: "Training", icon: "▰", color: "#8eb36d" },
  { id: "breakfast", title: "Breakfast + shake", detail: "Sit down and eat", duration: 30, category: "Fuel", icon: "◒", color: "#d59662" },
  { id: "massage-gun", title: "Massage gun", detail: "Recovery · quick pass on worked areas", duration: 10, category: "Reset", icon: "∿", color: "#73a6c8" },
  { id: "skin-routine", title: "Skin routine", detail: "Care · cleanse and moisturize", duration: 15, category: "Care", icon: "✧", color: "#ce8fb7" },
  { id: "lunch", title: "Lunch", detail: "Fuel · simple, intentional meal", duration: 30, category: "Fuel", icon: "◍", color: "#cf9e62" },
  { id: "sun-tan", title: "Sun tan", detail: "Outdoor time · finish the protocol", duration: 20, category: "Light", icon: "☀", color: "#edb65b" },
];

const CATEGORY_ORDER: Category[] = ["Training", "Fuel", "Light", "Reset", "Care"];

function timeParts(totalMinutes: number) {
  const normalized = totalMinutes % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return {
    time: `${hour % 12 || 12}:${String(minutes).padStart(2, "0")}`,
    suffix: hour >= 12 ? "PM" : "AM",
  };
}

function formatTime(totalMinutes: number) {
  const { time, suffix } = timeParts(totalMinutes);
  return `${time} ${suffix}`;
}

function formatDuration(duration: number) {
  if (duration < 60) return `${duration}m`;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export default function Home() {
  const [items, setItems] = useState<RoutineItem[]>(INITIAL_ITEMS);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    try {
      const savedItems = window.localStorage.getItem(STORAGE_KEY);
      if (savedItems) {
        const saved = JSON.parse(savedItems) as RoutineItem[];
        if (Array.isArray(saved)) {
          const defaults = new Map(INITIAL_ITEMS.map((item) => [item.id, item]));
          const restored = saved.flatMap((savedItem) => {
            const currentItem = defaults.get(savedItem.id);
            if (!currentItem) return [];
            return [{
              ...currentItem,
              duration: Number.isFinite(savedItem.duration) ? savedItem.duration : currentItem.duration,
            }];
          });
          const restoredIds = new Set(restored.map((item) => item.id));
          setItems([...restored, ...INITIAL_ITEMS.filter((item) => !restoredIds.has(item.id))]);
        }
      }
    } catch {
      // Keep the defaults when local state is unavailable or malformed.
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (hasLoaded) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [hasLoaded, items]);

  const scheduledItems = useMemo(() => {
    let cursor = START_MINUTES;
    return items.map<ScheduledItem>((item) => {
      const scheduled = { ...item, start: cursor, end: cursor + item.duration };
      cursor = scheduled.end;
      return scheduled;
    });
  }, [items]);

  const totalMinutes = useMemo(
    () => items.reduce((total, item) => total + item.duration, 0),
    [items],
  );
  const finishMinutes = START_MINUTES + totalMinutes;
  const categoryTotals = useMemo(
    () => CATEGORY_ORDER.map((category) => ({
      category,
      minutes: items.filter((item) => item.category === category).reduce((sum, item) => sum + item.duration, 0),
      color: items.find((item) => item.category === category)?.color ?? "#8f9995",
    })),
    [items],
  );

  function setDuration(id: string, value: number) {
    if (!Number.isFinite(value)) return;
    const duration = Math.min(480, Math.max(1, Math.round(value)));
    setItems((current) => current.map((item) => item.id === id ? { ...item, duration } : item));
  }

  function adjustDuration(id: string, delta: number) {
    const item = items.find((candidate) => candidate.id === id);
    if (item) setDuration(id, item.duration + delta);
  }

  function resetOrder() {
    setItems((current) => {
      const durations = new Map(current.map((item) => [item.id, item.duration]));
      return INITIAL_ITEMS.map((item) => ({ ...item, duration: durations.get(item.id) ?? item.duration }));
    });
  }

  function moveItem(sourceId: string, targetId: string, position: "before" | "after") {
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

  function handleDragKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    moveByKeyboard(id, event.key === "ArrowUp" ? -1 : 1);
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, id: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
    setDropTarget(null);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (!draggingId || draggingId === targetId) {
      setDropTarget(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setDropTarget({
      id: targetId,
      position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
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

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    const relatedTarget = event.relatedTarget as Node | null;
    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) setDropTarget(null);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">id</span>
          <div><strong>Ideal Day</strong><span>Personal protocol</span></div>
        </div>
        <div className="save-state"><span /> Saved on this device</div>
      </header>

      <div className="page-shell">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow">Daily protocol</p>
            <h1 id="page-title">Your ideal morning.</h1>
            <p>One repeatable sequence from wake-up to done. Reorder the flow and tune the timing until it feels natural.</p>
          </div>
          <div className="day-overview" aria-label="Day overview">
            <div><span>Start</span><strong>{formatTime(START_MINUTES)}</strong></div>
            <div><span>Finish</span><strong>{formatTime(finishMinutes)}</strong></div>
            <div><span>Length</span><strong>{formatDuration(totalMinutes)}</strong></div>
          </div>
        </section>

        <div className="main-grid">
          <section className="planner" aria-labelledby="schedule-title">
            <header className="planner-header">
              <div><h2 id="schedule-title">Schedule</h2><p>{items.length} blocks · times update automatically</p></div>
              <button className="quiet-button" type="button" onClick={resetOrder}>Reset order</button>
            </header>

            <div className="planner-help"><span className="help-grip">⠿</span> Drag a handle to reorder <span className="help-divider" aria-hidden="true">·</span> Adjust minutes on any block</div>

            <div className="schedule" aria-label="Idealized day schedule">
              {scheduledItems.map((item) => {
                const start = timeParts(item.start);
                const isDragging = draggingId === item.id;
                const isDropBefore = dropTarget?.id === item.id && dropTarget.position === "before";
                const isDropAfter = dropTarget?.id === item.id && dropTarget.position === "after";
                const itemStyle = { "--item-color": item.color } as CSSProperties;

                return (
                  <div
                    className={`routine-row ${isDragging ? "is-dragging" : ""} ${isDropBefore ? "drop-before" : ""} ${isDropAfter ? "drop-after" : ""}`}
                    key={item.id}
                    onDragOver={(event) => handleDragOver(event, item.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(event) => handleDrop(event, item.id)}
                    style={itemStyle}
                  >
                    {isDropBefore || isDropAfter ? <div className="drop-indicator" aria-hidden="true"><span>Move here</span></div> : null}

                    <div className="time-label"><strong>{start.time}</strong><span>{start.suffix}</span></div>

                    <article className="routine-card">
                      <button
                        className="drag-button"
                        draggable
                        type="button"
                        aria-label={`Drag ${item.title} to reorder`}
                        onDragStart={(event) => handleDragStart(event, item.id)}
                        onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                        onKeyDown={(event) => handleDragKeyDown(event, item.id)}
                      >⠿</button>

                      <div className="item-icon" aria-hidden="true">{item.icon}</div>
                      <div className="item-copy">
                        <div className="item-title"><h3>{item.title}</h3><span className="category-chip">{item.category}</span></div>
                      </div>

                      <div className="duration-control" aria-label={`Duration for ${item.title}`}>
                        <button type="button" aria-label={`Reduce ${item.title} by ${DURATION_STEP} minutes`} onClick={() => adjustDuration(item.id, -DURATION_STEP)}>−</button>
                        <div className="duration-value">
                          <input
                            aria-label={`Duration for ${item.title} in minutes`}
                            inputMode="numeric"
                            max="480"
                            min="1"
                            onChange={(event) => setDuration(item.id, event.target.valueAsNumber)}
                            step="5"
                            type="number"
                            value={item.duration}
                          />
                          <span className="duration-unit">min</span>
                        </div>
                        <button type="button" aria-label={`Add ${DURATION_STEP} minutes to ${item.title}`} onClick={() => adjustDuration(item.id, DURATION_STEP)}>+</button>
                      </div>

                    </article>
                  </div>
                );
              })}

              <div className="finish-row">
                <div className="time-label"><strong>{timeParts(finishMinutes).time}</strong><span>{timeParts(finishMinutes).suffix}</span></div>
                <p>Protocol complete</p>
              </div>
            </div>
          </section>

          <aside className="summary-rail" aria-label="Plan summary">
            <section className="summary-card shape-card">
              <div className="summary-title"><div><p className="eyebrow">Day shape</p><h2>{formatDuration(totalMinutes)} total</h2></div><span>{formatTime(START_MINUTES)}–{formatTime(finishMinutes)}</span></div>
              <div className="shape-list">
                {categoryTotals.map((entry) => (
                  <div className="shape-row" key={entry.category}>
                    <div><span className="shape-dot" style={{ background: entry.color }} /><strong>{entry.category}</strong><span>{entry.minutes} min</span></div>
                    <div className="shape-track"><span style={{ background: entry.color, width: `${(entry.minutes / totalMinutes) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </section>

            <p className="local-note"><span>●</span> Order and durations are saved locally.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
