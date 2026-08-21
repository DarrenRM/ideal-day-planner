import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatActivityRecordDate } from "../app/activity-record-format.ts";
import { parseActivityRecord, recurringStepIsDue } from "../app/activity-record-model.ts";

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
  const [component, workspace, css] = await Promise.all([
    readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/activity-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const productRenderer = component.match(/function ProductRecord[\s\S]*?\n}/)?.[0] || "";
  assert.match(productRenderer, /<small>\{kindLabel\}<\/small>/);
  assert.doesNotMatch(productRenderer, /usefulFields|record-field-grid/);
  assert.match(productRenderer, /product-supporting-records/);
  assert.match(productRenderer, /<div><small>\{kindLabel\}<\/small><strong>\{data\.name\}<\/strong>/);
  assert.match(productRenderer, /<span className="product-mark">/);
  assert.match(component, /eyebrow="Resources"/);
  assert.doesNotMatch(component, /Pinned resources/);
  assert.match(workspace, /nestedSupportingComponents/);
  assert.match(workspace, /record\.subjectKey === product\.key/);
  assert.doesNotMatch(workspace, /productComponents\.length === 1/);
  assert.match(css, /\.product-heading \{[^}]*justify-content: space-between/s);

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

test("preserves explicit resource ownership at both record and entry level", () => {
  const record = parseActivityRecord({
    id: "resources-1",
    recordKey: "roller-resources",
    subjectKey: "beard-roller",
    recordType: "resources",
    title: "Beard roller resources",
    scope: "activity",
    scopeDate: null,
    version: 1,
    payloadJson: JSON.stringify({
      entries: [{
        id: "official-guide",
        label: "Official guide",
        url: "https://example.com/guide",
        note: "Directions",
        itemKey: "beard-roller",
      }],
    }),
    updatedAt: "2026-08-21T12:00:00Z",
  });
  assert.equal(record?.subjectKey, "beard-roller");
  assert.equal(record?.data.entries[0].itemKey, "beard-roller");
});

test("keeps mobile composer focus from changing footer layout and follows drawer geometry", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(css, /textarea:focus\) \.activity-footer \{ display: none;/);
  assert.match(css, /textarea:focus\) \.activity-footer \{[^}]*visibility: hidden;/s);
  assert.match(page, /\[isConversationDrawerOpen, scrollConversationToBottom\]/);
  assert.match(page, /window\.visualViewport\?\.addEventListener\("resize"/);
  assert.match(page, /setWorkspaceReadyLabel\(null\)[\s\S]*setIsViewingWorkspace\(false\)/);
});

test("lets the mobile activity row receive bottom-half taps around the duration controls", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.routine-card \.item-controls > \.duration-control \{[^}]*pointer-events: none;/s);
  assert.match(css, /\.routine-card \.item-controls > \.duration-control button \{[^}]*pointer-events: auto;/s);
});

test("renders reusable cadence, equipment, mode, event, and open-workout states", async () => {
  const component = await readFile(new URL("../app/activity-record-components.tsx", import.meta.url), "utf8");
  assert.match(component, /function RecurringStepRecord/);
  assert.match(component, /function ActivityEventRecord/);
  assert.match(component, /function EquipmentRecord/);
  assert.match(component, /function SessionChoiceRecord/);
  assert.match(component, /workout-open-choices/);
});

test("normalizes recurring substeps and only exposes them on due dates", () => {
  const record = parseActivityRecord({
    id: "roller-step", recordKey: "weekly-roller", recordType: "recurring_step",
    title: "Grooming roller", scope: "activity", scopeDate: null, version: 1,
    payloadJson: JSON.stringify({
      label: "Use the grooming roller", note: "Once weekly", anchorDate: "2026-08-21",
      cadence: { kind: "weekly", every: 1 }, completedDates: ["2026-08-21"],
    }),
    updatedAt: "2026-08-21T12:00:00Z",
  });
  assert.ok(record);
  assert.equal(recurringStepIsDue(record, "2026-08-21"), true);
  assert.equal(recurringStepIsDue(record, "2026-08-22"), false);
  assert.equal(recurringStepIsDue(record, "2026-08-28"), true);
});
