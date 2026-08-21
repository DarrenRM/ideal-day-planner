import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatActivityRecordDate } from "../app/activity-record-format.ts";
import { parseActivityRecord } from "../app/activity-record-model.ts";

test("formats record dates for people without narrow machine-date strings", () => {
  const today = new Date(2026, 7, 20, 12);
  assert.equal(formatActivityRecordDate("2026-08-20", today), "Today");
  assert.equal(formatActivityRecordDate("2026-08-03", today), "Aug 3");
  assert.equal(formatActivityRecordDate("2025-12-31", today), "Dec 31, 2025");
  assert.equal(formatActivityRecordDate("Recently", today), "Recently");
  assert.equal(formatActivityRecordDate(undefined, today), "Recent");
});

test("keeps checklist rows and their checkbox visual in one deliberate control", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /className={`record-item-row/);
  assert.match(component, /aria-pressed={completedToday\(item\)}/);
  assert.match(component, /className="record-item-check"/);
  assert.doesNotMatch(css, /\.generic-checklist button/);
  assert.match(css, /\.record-item-row \{[^}]*min-height: 42px/s);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.record-item-row \{ min-height: 44px; \}/);
});

test("renders history as its own responsive recap rather than a timeline grid", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /record-history-entry/);
  assert.match(component, /formatActivityRecordDate\(entry\.date\)/);
  assert.match(css, /\.record-history-entry time \{[^}]*white-space: nowrap/s);
  assert.doesNotMatch(css, /\.record-history-list \.timeline-entry/);
});

test("keeps product cards focused on identity instead of generated subfields", async () => {
  const component = await readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8");
  const productRenderer = component.match(/function ProductRecord[\s\S]*?\n}/)?.[0] || "";
  assert.match(productRenderer, /<small>\{kindLabel\}<\/small>/);
  assert.doesNotMatch(productRenderer, /usefulFields|record-field-grid/);

  const record = parseActivityRecord({
    id: "product-1",
    recordKey: "hair-serum",
    recordType: "product",
    title: "Hair serum",
    scope: "activity",
    scopeDate: null,
    version: 1,
    payloadJson: JSON.stringify({
      kind: "product",
      name: "LL-01",
      manufacturer: "Lumen Lab",
      variant: "Hair serum",
      fields: [{ label: "Use", value: "Daily" }],
    }),
    updatedAt: "2026-08-20T12:00:00Z",
  });
  assert.deepEqual(record?.data, {
    kind: "product",
    name: "LL-01",
    manufacturer: "Lumen Lab",
    variant: "Hair serum",
    notes: "",
  });
});

test("lets the mobile activity row receive bottom-half taps around the duration controls", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.routine-card \.item-controls > \.duration-control \{[^}]*pointer-events: none;/s);
  assert.match(css, /\.routine-card \.item-controls > \.duration-control button \{[^}]*pointer-events: auto;/s);
});
