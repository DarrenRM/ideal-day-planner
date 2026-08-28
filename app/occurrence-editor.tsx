"use client";

import { CalendarDays, X } from "./icons";
import { FormEvent, useEffect, useState } from "react";

type Item = { id: string; activityId?: string; title: string; duration: number; activityVariantId?: string | null; variantName?: string | null; displayLabel?: string | null };
type Activity = { id: string; title: string };
type Variant = { id: string; activityId: string; name: string };

export function OccurrenceEditor({ item, onClose, onFuture, onSaved }: { item: Item | null; onClose: () => void; onFuture: () => void; onSaved: () => void }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [activityId, setActivityId] = useState("");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(5);
  const [variantId, setVariantId] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item) return;
    const timer = window.setTimeout(() => {
      setDuration(item.duration);
      setActivityId(item.activityId ?? "");
      setVariantId(item.activityVariantId ?? "");
      setLabel(item.displayLabel ?? "");
      setDate("");
      setError("");
    }, 0);
    void fetch("/api/activities", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      setActivities(result.activities ?? []);
      setVariants(result.variants ?? []);
    }).catch(() => undefined);
    return () => window.clearTimeout(timer);
  }, [item]);

  if (!item) return null;

  async function apply(event: FormEvent) {
    event.preventDefault();
    if (!item || saving) return;
    setSaving(true);
    setError("");
    const actions: Array<Record<string, unknown>> = [];
    if (duration !== item.duration) actions.push({ type: "set_duration", occurrenceId: item.id, durationMinutes: duration });
    if (activityId && activityId !== item.activityId) {
      actions.push({ type: "set_activity", occurrenceId: item.id, activityId, activityVariantId: variantId || null });
    } else if (variantId !== (item.activityVariantId ?? "")) {
      actions.push({ type: "set_variant", occurrenceId: item.id, activityVariantId: variantId || null });
    }
    if (label.trim() !== (item.displayLabel ?? "")) actions.push({ type: "set_label", occurrenceId: item.id, displayLabel: label.trim() || null });
    if (date) actions.push({ type: "move_to_date", occurrenceId: item.id, date });
    try {
      for (const action of actions) {
        const response = await fetch("/api/occurrences", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: { ...action, idempotencyKey: `user:${crypto.randomUUID()}` } }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "That change could not be saved.");
      }
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That change could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-modal-backdrop occurrence-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section aria-labelledby="occurrence-editor-title" aria-modal="true" className="settings-modal occurrence-editor" role="dialog">
        <header className="settings-modal-header"><div><span>Today only</span><h2 id="occurrence-editor-title">Change {item.title}</h2></div><button aria-label="Close" type="button" onClick={onClose}><X aria-hidden="true" size={18} /></button></header>
        <form onSubmit={apply}>
          <p>These changes affect this occurrence without renaming or rewriting the activity.</p>
          <div className="occurrence-editor-grid">
            <label><span>Activity</span><select value={activityId} onChange={(event) => { setActivityId(event.target.value); setVariantId(""); }}>{activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}</select></label>
            <label><span>Minutes</span><input min="5" max="480" step="5" type="number" value={duration} onChange={(event) => setDuration(Math.max(5, event.target.valueAsNumber || 5))} /></label>
            <label><span>Variant</span><select value={variantId} onChange={(event) => setVariantId(event.target.value)}><option value="">No variant</option>{variants.filter((variant) => variant.activityId === activityId).map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select></label>
            <label><span>Label for today</span><input maxLength={60} placeholder="Optional" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
            <label><span>Move to date</span><input min={new Date().toISOString().slice(0, 10)} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          </div>
          {error ? <p className="settings-save-error">{error}</p> : null}
          <button className="occurrence-future-link" type="button" onClick={onFuture}><CalendarDays aria-hidden="true" size={15} /> Change this and future occurrences</button>
          <div className="schedule-editor-actions"><button type="button" onClick={onClose}>Cancel</button><button className="confirm-add-button" disabled={saving} type="submit">{saving ? "Saving…" : "Save today"}</button></div>
        </form>
      </section>
    </div>
  );
}
