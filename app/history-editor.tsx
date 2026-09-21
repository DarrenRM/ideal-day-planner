"use client";

import { useState } from "react";
import { datedEntries, obj, rows, str, type HistoryCorrection, type HistoryRecord, type Json, type StatusCorrection } from "./history-edit-model";
import type { HistoryOccurrence } from "./track-record-model";

export const occurrenceStatus = (item: HistoryOccurrence): StatusCorrection["status"] => item.completedAt ? "completed" : item.skippedAt ? "skipped" : "unmarked";
export function StatusOptions() { return <><option value="completed">Completed</option><option value="skipped">Skipped</option><option value="unmarked">Not marked complete</option></>; }

export function HistoryEditor({ date, activityId, records, occurrences, busy, onSave, onCancel }: {
  date: string; activityId: string; records: HistoryRecord[]; occurrences: HistoryOccurrence[]; busy: boolean;
  onSave: (input: HistoryCorrection) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, Json[]>>(() => Object.fromEntries(records.map((record) => [record.id, datedEntries(record.type, record.data, date)])));
  const [touched, setTouched] = useState<string[]>([]);
  const [statuses, setStatuses] = useState(() => Object.fromEntries(occurrences.map((item) => [item.id, occurrenceStatus(item)])));
  const [actionId] = useState(() => crypto.randomUUID());
  function change(record: HistoryRecord, entries: Json[]) { setDraft((value) => ({ ...value, [record.id]: entries })); setTouched((value) => [...new Set([...value, record.id])]); }
  function update(record: HistoryRecord, index: number, patch: Json) { change(record, draft[record.id].map((entry, i) => i === index ? { ...entry, ...patch } : entry)); }
  const field = (record: HistoryRecord, index: number, entry: Json, key: string, label: string, maxLength = 800) => <label key={key}>{label}<input value={str(entry[key])} maxLength={maxLength} onChange={(event) => update(record, index, { [key]: event.target.value })} /></label>;
  const changedStatuses = occurrences.filter((item) => statuses[item.id] !== occurrenceStatus(item));
  return <form className="history-editor" onSubmit={(event) => { event.preventDefault(); onSave({ actionId, date, activityId, records: records.filter((record) => touched.includes(record.id)).map((record) => ({ id: record.id, version: record.version, entries: draft[record.id] })), statuses: changedStatuses.map((item) => ({ id: item.id, revision: item.revision, status: statuses[item.id] })) }); }}>
    <h3>Edit {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</h3>
    <p className="track-coverage">Changes apply only to this date. Completion and recorded details are separate.</p>
    <fieldset disabled={busy}>
      {occurrences.map((item) => <label key={item.id}>{item.title}{item.variantName ? ` · ${item.variantName}` : ""}<select value={statuses[item.id]} onChange={(event) => setStatuses((value) => ({ ...value, [item.id]: event.target.value as StatusCorrection["status"] }))}><StatusOptions /></select></label>)}
      {records.filter((record) => !record.archived).map((record) => {
        const entries = draft[record.id];
        const data = record.data;
        return <section className="history-edit-section" key={record.id}><h4>{record.title}</h4>
          {record.type === "daily_selection" ? (() => {
            const entry = entries[0] ?? { id: `selection-${date}`, date, itemIds: [], counts: {}, recorded: true };
            const ids = Array.isArray(entry.itemIds) ? entry.itemIds : [];
            const items = [...new Map([...rows(data.items), ...rows(entry.itemSnapshots)].map((item) => [item.id, item])).values()];
            const changeCount = (id: string, count: number) => {
              const nextIds = ids.filter((value) => value !== id);
              const counts = { ...obj(entry.counts) }; delete counts[id];
              if (count > 0) nextIds.push(id);
              if (count > 1) counts[id] = count;
              change(record, [{ ...entry, itemIds: nextIds, counts, recorded: true }]);
            };
            return <>{!entries.length ? <p className="track-coverage">No choices recorded. Select only what you remember using.</p> : null}{items.map((item) => {
              const parent = items.find((value) => value.id === item.parentItemId);
              const hasModes = items.some((value) => value.parentItemId === item.id);
              const label = `${parent ? `${str(parent.label)} — ` : ""}${str(item.label)}${hasModes ? " — mode not recorded" : ""}${item.active === false ? " (retired)" : ""}`;
              const count = ids.includes(item.id) ? Number(obj(entry.counts)[str(item.id)] ?? 1) : 0;
              return item.allowMultiple ? <label className="history-count" key={str(item.id)}><span>{label}<small>{str(item.unitLabel) || "Recorded uses"}</small></span><select aria-label={`${label} count`} value={count} onChange={(event) => changeCount(str(item.id), Number(event.target.value))}>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select></label> : <label className="history-checkbox" key={str(item.id)}><input type="checkbox" checked={count > 0} onChange={(event) => changeCount(str(item.id), event.target.checked ? 1 : 0)} /><span>{label}</span></label>;
            })}<button type="button" onClick={() => change(record, [{ ...entry, itemIds: [], counts: {}, recorded: true }])}>Record none used</button></>;
          })() : record.type === "recurring_step" || record.type === "adherence" ? <label className="history-checkbox"><input type="checkbox" checked={entries.some((entry) => entry.completed !== false)} onChange={(event) => change(record, [{ ...(entries[0] ?? {}), id: entries[0]?.id ?? `use-${date}`, date, completed: event.target.checked }])} /><span>Used on this date</span></label> : <>
            {entries.map((entry, index) => <div className="history-edit-entry" key={str(entry.id)}>
              {record.type === "meal_log" ? <>{field(record, index, entry, "title", "Meal or shake", 240)}{field(record, index, entry, "detail", "Details")}{field(record, index, entry, "quantity", "Quantity", 100)}{field(record, index, entry, "servings", "Servings", 100)}{field(record, index, entry, "storage", "Storage", 300)}
                <p className="track-coverage">Ingredients for this entry. The saved recipe stays unchanged.</p>
                {rows(entry.ingredients).map((ingredient, i) => <div className="history-pair" key={str(ingredient.id)}><label>Ingredient<input maxLength={200} value={str(ingredient.label)} onChange={(event) => update(record, index, { ingredients: rows(entry.ingredients).map((value, n) => n === i ? { ...value, label: event.target.value } : value) })} /></label><label>Amount<input maxLength={80} value={str(ingredient.amount)} onChange={(event) => update(record, index, { ingredients: rows(entry.ingredients).map((value, n) => n === i ? { ...value, amount: event.target.value } : value) })} /></label><button type="button" aria-label={`Remove ${str(ingredient.label) || "ingredient"}`} onClick={() => update(record, index, { ingredients: rows(entry.ingredients).filter((_, n) => n !== i) })}>Remove</button></div>)}
                <button type="button" onClick={() => update(record, index, { ingredients: [...rows(entry.ingredients), { id: `ingredient-${crypto.randomUUID()}`, label: "", amount: "" }] })}>Add ingredient</button>
              </> : record.type === "session_log" ? <>{rows(data.fields).filter((field) => !Array.isArray(field.optionIds) || !field.optionIds.length || field.optionIds.includes(entry.optionId)).map((field) => <label key={str(field.id)}>{str(field.label)}{field.unit ? ` (${str(field.unit)})` : ""}<input maxLength={120} inputMode={field.input === "text" ? "text" : "decimal"} value={str(rows(entry.values).find((value) => value.field === field.id)?.value)} onChange={(event) => update(record, index, { values: [...rows(entry.values).filter((value) => value.field !== field.id), ...(event.target.value ? [{ field: field.id, value: event.target.value }] : [])] })} /></label>)}{field(record, index, entry, "note", "Notes", 500)}</> : record.type === "session_choice" ? <label>Recorded choice<select value={str(entry.optionId)} onChange={(event) => update(record, index, { optionId: event.target.value })}>{rows(data.options).map((option) => <option key={str(option.id)} value={str(option.id)}>{str(option.label)}</option>)}</select></label> : record.type === "strength_session" ? <>
                <strong>{str(entry.workoutTitle)}</strong>{rows(entry.exercises).map((exercise, e) => <div key={str(exercise.id)}><h5>{str(exercise.name)}</h5>{rows(exercise.sets).map((set, s) => <div className="history-pair" key={str(set.id)}>{["reps", "load", "rir"].map((key) => <label key={key}>{key === "rir" ? "Reps in reserve" : key === "reps" ? `Set ${set.ordinal} reps` : "Load (include unit)"}<input value={String(set[key] ?? "")} inputMode={key === "load" ? "text" : "numeric"} onChange={(event) => update(record, index, { exercises: rows(entry.exercises).map((value, ei) => ei !== e ? value : { ...value, sets: rows(value.sets).map((value, si) => si !== s ? value : { ...value, [key]: key === "load" ? event.target.value : event.target.value === "" ? null : Number(event.target.value) }) }) })} /></label>)}</div>)}</div>)}{field(record, index, entry, "note", "Workout notes")}
              </> : <>{field(record, index, entry, "label", "What happened", 200)}{field(record, index, entry, "detail", "Details", 500)}</>}
            </div>)}
            {!entries.length && record.type !== "strength_session" ? <button type="button" onClick={() => change(record, [{ id: `entry-${crypto.randomUUID()}`, date, ...(record.type === "session_log" ? { optionId: obj(data.defaultOption).id || "default", values: [], note: "" } : record.type === "session_choice" ? { optionId: rows(data.options)[0]?.id } : {}) }])}>Add a record for {date}</button> : null}
            {record.type === "meal_log" && entries.length ? <button type="button" onClick={() => change(record, [...entries, { id: `meal-${crypto.randomUUID()}`, date, title: "", ingredients: [] }])}>Add another meal or shake</button> : null}
          </>}
        </section>;
      })}
      <div className="history-editor-actions"><button className="history-save" type="submit" disabled={!touched.length && !changedStatuses.length}>{busy ? "Saving…" : `Save changes for ${date}`}</button><button type="button" onClick={onCancel}>Cancel</button></div>
    </fieldset>
  </form>;
}
