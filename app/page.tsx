"use client";

import type { CSSProperties, DragEvent, FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";

type Category = "Light" | "Reset" | "Training" | "Fuel" | "Care" | "Logistics" | "Creativity";

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
const DELETED_KEY = "idealized-day-deleted-v1";

const INITIAL_ITEMS: RoutineItem[] = [
  { id: "sun-walk", title: "Walk in sun", detail: "Easy pace · outdoor light", duration: 30, category: "Light", icon: "☼", color: "#e8b75f" },
  { id: "shower", title: "Shower", detail: "Reset · get ready for the day", duration: 15, category: "Reset", icon: "◌", color: "#67b7ce" },
  { id: "stretch", title: "Stretch / yoga", detail: "Mobility · breathe and open up", duration: 20, category: "Reset", icon: "⌁", color: "#928ce0" },
  { id: "hair-serum", title: "Hair serum", detail: "Care · apply and let it settle", duration: 5, category: "Care", icon: "✦", color: "#d58db5" },
  { id: "red-light", title: "Red light", detail: "Care · device session", duration: 15, category: "Care", icon: "◉", color: "#dc766a" },
  { id: "shake", title: "Shake", detail: "Quick fuel before training", duration: 5, category: "Fuel", icon: "◒", color: "#d59662" },
  { id: "hang", title: "Hang from chin-up bar", detail: "Grip · decompression", duration: 5, category: "Training", icon: "↑", color: "#a8c96d" },
  { id: "kettlebells", title: "Kettlebells", detail: "Strength · short focused circuit", duration: 20, category: "Training", icon: "◆", color: "#c99a67" },
  { id: "cardio", title: "Cardio", detail: "Conditioning · steady effort", duration: 25, category: "Training", icon: "≈", color: "#64b89a" },
  { id: "lift", title: "Lift", detail: "Strength · main session", duration: 45, category: "Training", icon: "▰", color: "#8eb36d" },
  { id: "breakfast", title: "Breakfast", detail: "Sit down and eat", duration: 25, category: "Fuel", icon: "◒", color: "#d59662" },
  { id: "massage-gun", title: "Massage gun", detail: "Recovery · quick pass on worked areas", duration: 10, category: "Reset", icon: "∿", color: "#73a6c8" },
  { id: "skin-routine", title: "Skin routine", detail: "Care · cleanse and moisturize", duration: 15, category: "Care", icon: "✧", color: "#ce8fb7" },
  { id: "lunch", title: "Lunch", detail: "Fuel · simple, intentional meal", duration: 30, category: "Fuel", icon: "◍", color: "#cf9e62" },
  { id: "sun-tan", title: "Sun tan", detail: "Outdoor time · finish the protocol", duration: 20, category: "Light", icon: "☀", color: "#edb65b" },
];

const CATEGORY_ORDER: Category[] = ["Training", "Fuel", "Light", "Reset", "Care", "Logistics", "Creativity"];
const CATEGORY_OPTIONS: Category[] = ["Care", "Training", "Fuel", "Reset", "Light", "Logistics", "Creativity"];
const CATEGORY_META: Record<Category, Pick<RoutineItem, "icon" | "color">> = {
  Care: { icon: "✦", color: "#d58db5" },
  Training: { icon: "◆", color: "#a8c96d" },
  Fuel: { icon: "◒", color: "#d59662" },
  Reset: { icon: "◌", color: "#67b7ce" },
  Light: { icon: "☼", color: "#e8b75f" },
  Logistics: { icon: "↗", color: "#7ba6c9" },
  Creativity: { icon: "✺", color: "#b58ad6" },
};
const INITIAL_IDS = new Set(INITIAL_ITEMS.map((item) => item.id));

function isCategory(value: unknown): value is Category {
  return CATEGORY_OPTIONS.includes(value as Category);
}

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

function normalizeActivityDuration(duration: number) {
  if (!Number.isFinite(duration)) return 15;
  return Math.min(480, Math.max(5, Math.round(duration / 5) * 5));
}

export default function Home() {
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDuration, setDraftDuration] = useState(15);
  const [draftCategory, setDraftCategory] = useState<Category>("Care");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("Care");
  const [deletedDefaultIds, setDeletedDefaultIds] = useState<string[]>([]);

  useEffect(() => {
    let nextItems = INITIAL_ITEMS;
    let nextDeletedDefaultIds: string[] = [];
    try {
      const savedDeletedIds = window.localStorage.getItem(DELETED_KEY);
      const deletedIds = new Set<string>();
      if (savedDeletedIds) {
        const parsedDeletedIds = JSON.parse(savedDeletedIds) as unknown;
        if (Array.isArray(parsedDeletedIds)) {
          parsedDeletedIds.forEach((id) => {
            if (typeof id === "string" && INITIAL_IDS.has(id)) deletedIds.add(id);
          });
        }
      }
      nextDeletedDefaultIds = [...deletedIds];

      const savedItems = window.localStorage.getItem(STORAGE_KEY);
      if (savedItems) {
        const saved = JSON.parse(savedItems) as unknown;
        if (Array.isArray(saved)) {
          const defaults = new Map(INITIAL_ITEMS.map((item) => [item.id, item]));
          const restored = (saved as RoutineItem[]).flatMap((savedItem) => {
            if (deletedIds.has(savedItem.id)) return [];
            const currentItem = defaults.get(savedItem.id);
            if (!currentItem) {
              if (
                typeof savedItem.id !== "string" ||
                !savedItem.id.startsWith("custom-") ||
                typeof savedItem.title !== "string" ||
                !savedItem.title.trim() ||
                !isCategory(savedItem.category)
              ) return [];
              const meta = CATEGORY_META[savedItem.category];
              return [{
                id: savedItem.id,
                title: savedItem.title.trim().slice(0, 60),
                detail: "Custom block",
                duration: normalizeActivityDuration(savedItem.duration),
                category: savedItem.category,
                ...meta,
              }];
            }
            const savedDuration = normalizeActivityDuration(
              Number.isFinite(savedItem.duration) ? savedItem.duration : currentItem.duration,
            );
            const duration = savedItem.id === "breakfast" && savedItem.title?.includes("shake")
              ? normalizeActivityDuration(savedDuration - 5)
              : savedDuration;
            const title = typeof savedItem.title === "string" && savedItem.title.trim()
              ? savedItem.title.trim().slice(0, 60)
              : currentItem.title;
            const category = isCategory(savedItem.category) ? savedItem.category : currentItem.category;
            return [{
              ...currentItem,
              title,
              category,
              color: category === currentItem.category ? currentItem.color : CATEGORY_META[category].color,
              duration,
            }];
          });
          const restoredIds = new Set(restored.map((item) => item.id));
          const merged = [...restored];
          INITIAL_ITEMS.forEach((item, index) => {
            if (deletedIds.has(item.id) || restoredIds.has(item.id)) return;
            const nextKnownItem = INITIAL_ITEMS.slice(index + 1).find((candidate) => !deletedIds.has(candidate.id) && restoredIds.has(candidate.id));
            const insertAt = nextKnownItem ? merged.findIndex((candidate) => candidate.id === nextKnownItem.id) : merged.length;
            merged.splice(insertAt, 0, item);
            restoredIds.add(item.id);
          });
          nextItems = merged;
        } else {
          nextItems = INITIAL_ITEMS.filter((item) => !deletedIds.has(item.id));
        }
      } else {
        nextItems = INITIAL_ITEMS.filter((item) => !deletedIds.has(item.id));
      }
    } catch {
      nextItems = INITIAL_ITEMS;
      nextDeletedDefaultIds = [];
    }
    setDeletedDefaultIds(nextDeletedDefaultIds);
    setItems(nextItems);
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.localStorage.setItem(DELETED_KEY, JSON.stringify(deletedDefaultIds));
  }, [deletedDefaultIds, hasLoaded, items]);

  useEffect(() => {
    if (!editingId) return;
    const item = items.find((candidate) => candidate.id === editingId);
    if (!item) {
      setEditingId(null);
      return;
    }
    const hasChanges = editTitle !== item.title || editCategory !== item.category;
    if (hasChanges) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".inline-edit-form")) return;
      setEditingId(null);
      setEditTitle("");
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [editCategory, editTitle, editingId, items]);

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
    if (!item) return;
    const duration = delta > 0
      ? Math.floor(item.duration / DURATION_STEP) * DURATION_STEP + DURATION_STEP
      : Math.ceil(item.duration / DURATION_STEP) * DURATION_STEP - DURATION_STEP;
    setDuration(id, Math.max(5, duration));
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;
    const meta = CATEGORY_META[draftCategory];
    const item: RoutineItem = {
      id: `custom-${window.crypto.randomUUID()}`,
      title: title.slice(0, 60),
      detail: "Custom block",
      duration: normalizeActivityDuration(draftDuration),
      category: draftCategory,
      ...meta,
    };
    setItems((current) => [...current, item]);
    setDraftTitle("");
    setDraftDuration(15);
    setIsAdding(false);
  }

  function removeItem(id: string) {
    if (INITIAL_IDS.has(id)) {
      setDeletedDefaultIds((current) => current.includes(id) ? current : [...current, id]);
    }
    if (editingId === id) cancelEditing();
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function startEditing(item: RoutineItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditCategory(item.category);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditTitle("");
  }

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = editTitle.trim();
    if (!editingId || !title) return;
    setItems((current) => current.map((item) => {
      if (item.id !== editingId) return item;
      const categoryChanged = item.category !== editCategory;
      return {
        ...item,
        title: title.slice(0, 60),
        category: editCategory,
        color: categoryChanged ? CATEGORY_META[editCategory].color : item.color,
        icon: categoryChanged && item.id.startsWith("custom-") ? CATEGORY_META[editCategory].icon : item.icon,
      };
    }));
    cancelEditing();
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
        <div className="save-state"><span /> {hasLoaded ? "Saved on this device" : "Loading this device"}</div>
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
            <div><span>Finish</span><strong>{hasLoaded ? formatTime(finishMinutes) : "—"}</strong></div>
            <div><span>Length</span><strong>{hasLoaded ? formatDuration(totalMinutes) : "—"}</strong></div>
          </div>
        </section>

        <div className="main-grid">
          <section className="planner" aria-labelledby="schedule-title">
            <header className="planner-header">
              <div><h2 id="schedule-title">Schedule</h2><p>{hasLoaded ? `${items.length} blocks · times update automatically` : "Loading your saved day…"}</p></div>
              <div className="planner-actions">
                <button
                  aria-controls="add-block-form"
                  aria-expanded={isAdding}
                  className="add-block-button"
                  disabled={!hasLoaded}
                  type="button"
                  onClick={() => setIsAdding((current) => !current)}
                ><span aria-hidden="true">+</span> Add Activity</button>
              </div>
            </header>

            {isAdding ? (
              <form className="add-block-form" id="add-block-form" noValidate onSubmit={addItem}>
                <div className="add-field add-name-field">
                  <label htmlFor="block-name">Name</label>
                  <input
                    autoFocus
                    id="block-name"
                    maxLength={60}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder="e.g. Sauna"
                    value={draftTitle}
                  />
                </div>
                <div className="add-field">
                  <label htmlFor="block-duration">Minutes</label>
                  <input
                    id="block-duration"
                    inputMode="numeric"
                    max="480"
                    min="5"
                    onBlur={() => setDraftDuration((current) => normalizeActivityDuration(current))}
                    onChange={(event) => setDraftDuration(event.target.valueAsNumber || 5)}
                    step="5"
                    type="number"
                    value={draftDuration}
                  />
                </div>
                <div className="add-field">
                  <label htmlFor="block-category">Category</label>
                  <select id="block-category" onChange={(event) => setDraftCategory(event.target.value as Category)} value={draftCategory}>
                    {CATEGORY_OPTIONS.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </div>
                <div className="add-form-actions">
                  <button className="cancel-add-button" type="button" onClick={() => setIsAdding(false)}>Cancel</button>
                  <button className="confirm-add-button" disabled={!draftTitle.trim()} type="submit">Add</button>
                </div>
              </form>
            ) : null}

            <div className="planner-help"><span className="help-grip"><GripVertical aria-hidden="true" size={14} strokeWidth={1.8} /></span> Drag a handle to reorder <span className="help-divider" aria-hidden="true">·</span> Adjust minutes on any block</div>

            <div className="schedule" aria-label="Idealized day schedule">
              {hasLoaded ? <>{scheduledItems.map((item) => {
                const start = timeParts(item.start);
                const isDragging = draggingId === item.id;
                const isDropBefore = dropTarget?.id === item.id && dropTarget.position === "before";
                const isDropAfter = dropTarget?.id === item.id && dropTarget.position === "after";
                const isEditing = editingId === item.id;
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

                    <article className={`routine-card ${isEditing ? "is-editing" : ""}`}>
                      <button
                        className="drag-button"
                        draggable
                        type="button"
                        aria-label={`Drag ${item.title} to reorder`}
                        onDragStart={(event) => handleDragStart(event, item.id)}
                        onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                        onKeyDown={(event) => handleDragKeyDown(event, item.id)}
                      ><GripVertical aria-hidden="true" size={15} strokeWidth={1.8} /></button>

                      <div className="item-icon" aria-hidden="true">{item.icon}</div>
                      {isEditing ? (
                        <>
                          <div className="mobile-time-label mobile-edit-time" aria-hidden="true"><strong>{start.time}</strong><span>{start.suffix}</span></div>
                          <form className="inline-edit-form" onSubmit={saveEdit}>
                            <input
                              aria-label={`Title for ${item.title}`}
                              autoFocus
                              maxLength={60}
                              onChange={(event) => setEditTitle(event.target.value)}
                              onKeyDown={(event) => { if (event.key === "Escape") cancelEditing(); }}
                              value={editTitle}
                            />
                            <select
                              aria-label={`Tag for ${item.title}`}
                              onChange={(event) => setEditCategory(event.target.value as Category)}
                              value={editCategory}
                            >
                              {CATEGORY_OPTIONS.map((category) => <option key={category}>{category}</option>)}
                            </select>
                            <div className="inline-edit-actions">
                              <button type="button" aria-label="Cancel editing" onClick={cancelEditing}>×</button>
                              <button className="save-edit-button" disabled={!editTitle.trim()} type="submit" aria-label="Save changes">✓</button>
                            </div>
                          </form>
                        </>
                      ) : (
                        <div className="item-copy">
                          <div className="item-title">
                            <h3>{item.title}</h3>
                          </div>
                          <div className="item-meta">
                            <div className="mobile-time-label" aria-hidden="true"><strong>{start.time}</strong><span>{start.suffix}</span></div>
                            <span className="category-chip">{item.category}</span>
                          </div>
                        </div>
                      )}

                      <button
                        className="edit-item-button"
                        type="button"
                        aria-label={`Edit ${item.title}`}
                        onClick={() => startEditing(item)}
                      ><Pencil aria-hidden="true" size={14} strokeWidth={1.8} /></button>

                      <button
                        className="delete-item-button"
                        type="button"
                        aria-label={`Remove ${item.title}`}
                        onClick={() => removeItem(item.id)}
                      ><Trash2 aria-hidden="true" size={14} strokeWidth={1.8} /></button>

                      <div className="duration-control" aria-label={`Duration for ${item.title}`}>
                        <button type="button" aria-label={`Reduce ${item.title} by ${DURATION_STEP} minutes`} onClick={() => adjustDuration(item.id, -DURATION_STEP)}>−</button>
                        <div className="duration-value">
                          <input
                            aria-label={`Duration for ${item.title} in minutes`}
                            inputMode="numeric"
                            max="480"
                            min="5"
                            onBlur={() => setDuration(item.id, normalizeActivityDuration(item.duration))}
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
              </div></> : (
                <div className="schedule-loading" role="status" aria-label="Loading your saved day">
                  {[0, 1, 2, 3].map((row) => <div className="schedule-loading-row" aria-hidden="true" key={row} />)}
                </div>
              )}
            </div>
          </section>

          <aside className="summary-rail" aria-label="Plan summary">
            <section className="summary-card shape-card">
              <div className="summary-title"><div><p className="eyebrow">Day shape</p><h2>{hasLoaded ? `${formatDuration(totalMinutes)} total` : "Loading…"}</h2></div><span>{hasLoaded ? `${formatTime(START_MINUTES)}–${formatTime(finishMinutes)}` : "—"}</span></div>
              <div className="shape-list">
                {hasLoaded ? categoryTotals.map((entry) => (
                  <div className="shape-row" key={entry.category}>
                    <div><span className="shape-dot" style={{ background: entry.color }} /><strong>{entry.category}</strong><span>{entry.minutes} min</span></div>
                    <div className="shape-track"><span style={{ background: entry.color, width: totalMinutes ? `${(entry.minutes / totalMinutes) * 100}%` : "0%" }} /></div>
                  </div>
                )) : [0, 1, 2, 3, 4].map((row) => <div className="shape-loading-row" aria-hidden="true" key={row} />)}
              </div>
            </section>

            <p className="local-note"><span>●</span> {hasLoaded ? "Order and durations are saved locally." : "Loading saved settings…"}</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
