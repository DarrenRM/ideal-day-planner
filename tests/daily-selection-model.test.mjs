import assert from "node:assert/strict";
import test from "node:test";

import { mergeDailySelectionData, migrateLegacyDailySelection, previousDateKey, selectionForDate, withSelectionForDate } from "../app/daily-selection-model.ts";

test("migrates a supplement checklist and recap into one canonical selection history", () => {
  const migrated = migrateLegacyDailySelection({
    items: [
      { id: "e", label: "E", completedDates: [] },
      { id: "lutein", label: "Lutein", completedDates: ["2026-08-21"] },
      { id: "k", label: "K", completedDates: [] },
    ],
  }, [{
    entries: [{ id: "legacy", date: "2026-08-20", value: "E, Lutein, K", detail: "Taken today" }],
  }]);

  assert.deepEqual(migrated.items.map((item) => [item.id, item.active]), [["e", true], ["lutein", true], ["k", true]]);
  assert.deepEqual(selectionForDate(migrated, "2026-08-20"), ["e", "lutein", "k"]);
  assert.deepEqual(selectionForDate(migrated, "2026-08-21"), ["lutein"]);
});

test("replaces one date without rewriting prior daily selections", () => {
  const data = {
    items: [{ id: "e", label: "E" }, { id: "k", label: "K" }],
    entries: [{ id: "selection-2026-08-20", date: "2026-08-20", itemIds: ["e"] }],
  };
  const next = withSelectionForDate(data, "2026-08-21", ["e", "k", "missing", "e"]);
  assert.deepEqual(selectionForDate(next, "2026-08-20"), ["e"]);
  assert.deepEqual(selectionForDate(next, "2026-08-21"), ["e", "k"]);
  assert.equal(previousDateKey("2026-03-01"), "2026-02-28");
});

test("merges agent updates without dropping omitted roster items or history", () => {
  const merged = mergeDailySelectionData({
    items: [{ id: "e", label: "E", active: true }, { id: "k", label: "K", active: true }],
    entries: [{ id: "old", date: "2026-08-20", itemIds: ["e"] }],
  }, {
    items: [{ id: "k", label: "K", active: false }],
    entries: [{ id: "today", date: "2026-08-21", itemIds: ["k"] }],
  });
  assert.equal(merged.items.find((item) => item.id === "e")?.active, true);
  assert.equal(merged.items.find((item) => item.id === "k")?.active, false);
  assert.deepEqual(merged.entries.map((entry) => entry.date), ["2026-08-20", "2026-08-21"]);
});
