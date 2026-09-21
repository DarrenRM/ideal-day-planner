import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { correctDatedRecord, datedEntries, preserveCorrectedDates } from "../app/history-edit-model.ts";
import { validateRecordActions } from "../app/activity-record-model.ts";
import { effectiveCompletedSubjects } from "../app/completion-evidence.ts";

const date = "2026-09-19";
const record = { id: "r", key: "choices", type: "daily_selection", title: "Choices", version: 1, activityId: "care", variantId: null, archived: false, subjectKey: null, data: { kind: "routine", items: [{ id: "mask", label: "LED mask", subjectKey: "mask" }, ...["red", "green", "amber"].map((id) => ({ id, label: id, parentItemId: "mask", subjectKey: "mask", allowMultiple: true }))], entries: [{ id: "old", date, itemIds: ["red", "green"] }, { id: "today", date: "2026-09-20", itemIds: ["red", "amber"] }] } };
test("historical mode correction retains identity, other dates, parent labels and exact counts", () => {
  const next = correctDatedRecord(record, date, [{ id: "old", date, itemIds: ["red", "amber"], counts: { red: 2 } }]);
  assert.deepEqual(next.entries[1], record.data.entries[1]);
  assert.equal(next.entries[0].id, "old");
  assert.deepEqual(next.entries[0].counts, { red: 2 });
  assert.ok(next.entries[0].itemSnapshots.some((item) => item.label === "LED mask"));
  assert.deepEqual(record.data.entries[0].itemIds, ["red", "green"]);
});
test("explicit none remains a durable entry through normal record validation", () => {
  const data = correctDatedRecord(record, date, [{ id: "old", date, itemIds: [] }]);
  const [action] = validateRecordActions([{ op: "upsert", record: { key: record.key, title: record.title, type: record.type, data } }]);
  assert.equal(datedEntries(record.type, action.record.data, date)[0].recorded, true);
});
test("correction preserves history beyond former caps, including through workspace parsing", () => {
  const entries = Array.from({ length: 740 }, (_, i) => ({ id: `e-${i}`, date: new Date(Date.UTC(2022, 0, i + 1)).toISOString().slice(0, 10), itemIds: ["red"] }));
  const data = correctDatedRecord({ ...record, data: { ...record.data, entries } }, date, [{ id: "new", date, itemIds: [] }]);
  const [action] = validateRecordActions([{ op: "upsert", record: { key: record.key, title: record.title, type: record.type, data } }]);
  assert.equal(action.record.data.entries.length, 741);
});
test("record correction rejects another date or an unknown mode", () => {
  assert.throws(() => correctDatedRecord(record, date, [{ id: "old", date: "2026-09-18", itemIds: [] }]), /selected date/);
  assert.throws(() => correctDatedRecord(record, date, [{ id: "old", date, itemIds: ["unknown"] }]), /no longer available/);
});
test("corrected product attribution preserves the original evidence and permits explicit none", () => {
  assert.deepEqual(effectiveCompletedSubjects({ completedSubjectKeys: ["mask"], correctedSubjectKeys: [] }), []);
  assert.deepEqual(effectiveCompletedSubjects({ completedSubjectKeys: ["mask"] }), ["mask"]);
});
test("a compiler started before a correction cannot overwrite the corrected date", () => {
  const corrected = correctDatedRecord(record, date, [{ id: "old", date, itemIds: [] }]);
  const next = preserveCorrectedDates(record.type, corrected, record.data, [date]);
  assert.deepEqual(next.entries.find((entry) => entry.date === date).itemIds, []);
  assert.deepEqual(next.entries.find((entry) => entry.date !== date), record.data.entries[1]);
  assert.deepEqual(preserveCorrectedDates('recurring_step',{completedDates:[]},{completedDates:[date,'2026-09-20']},[date]).completedDates,['2026-09-20']);
});
test("history corrections are atomic, user scoped, idempotent and conflict checked in SQLite", () => {
  const result = spawnSync(process.execPath, ["--experimental-sqlite", "--experimental-strip-types", fileURLToPath(new URL("./fixtures/history-corrections-sqlite.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
