import assert from "node:assert/strict";
import test from "node:test";

import { fallbackDayHighlight } from "../app/day-highlight.ts";

test("keeps Highlights useful while Luna has no editorial highlight", () => {
  assert.equal(fallbackDayHighlight([]), null);
  assert.equal(fallbackDayHighlight([{ title: "Morning Walk", duration: 30 }]), "Morning Walk");
  assert.equal(fallbackDayHighlight([
    { title: "Skin routine", duration: 5, completedAt: "2026-08-23T08:10:00Z" },
    { title: "Morning Walk", duration: 30, completedAt: "2026-08-23T08:40:00Z" },
  ]), "Morning Walk was today's longest completed block.");
});

test("breaks equal-duration highlight ties with the latest completion", () => {
  assert.equal(fallbackDayHighlight([
    { title: "First", duration: 5, completedAt: "2026-08-23T08:10:00Z" },
    { title: "Latest", displayTitle: "Latest variation", duration: 5, completedAt: "2026-08-23T08:20:00Z" },
  ]), "Latest variation was today's longest completed block.");
});
