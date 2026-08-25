import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  deterministicOnboardingProposal,
  onboardingReviewDate,
  parseOnboardingProposal,
} from "../app/onboarding-model.ts";

test("builds a bounded editable starter that matches the selected pace", () => {
  for (const [capacity, expected] of [["gentle", 3], ["balanced", 4], ["push", 5]]) {
    const proposal = deterministicOnboardingProposal("I want calmer mornings, focused creative work, better movement, and good sleep", capacity);
    const parsed = parseOnboardingProposal(proposal, capacity);
    assert.ok(parsed);
    assert.equal(parsed.activities.filter((activity) => activity.planRole === "essential").length, expected);
    assert.ok(parsed.activities.every((activity) => activity.durationMinutes >= 5));
    assert.ok(parsed.activities.some((activity) => activity.immediatelyActionable));
  }
});

test("rejects drafts that overfill the chosen pace or lose actionable essentials", () => {
  const balanced = deterministicOnboardingProposal("I want a balanced day with movement and focused work", "balanced");
  const overfilled = {
    ...balanced,
    activities: [
      ...balanced.activities,
      { key: "another-essential", title: "Another essential", category: "Care", durationMinutes: 10, planRole: "essential", reason: "Too much for this pace.", immediatelyActionable: true },
      { key: "sixth-essential", title: "Sixth essential", category: "Care", durationMinutes: 10, planRole: "essential", reason: "Also too much.", immediatelyActionable: true },
    ],
  };
  assert.equal(parseOnboardingProposal(overfilled, "balanced"), null);
  assert.equal(parseOnboardingProposal({
    ...balanced,
    activities: balanced.activities.map((activity) => ({ ...activity, immediatelyActionable: false })),
  }, "balanced"), null);
  assert.equal(onboardingReviewDate("2026-08-25", balanced), "2026-08-28");
});

test("keeps testing onboarding isolated and only materializes after confirmation", async () => {
  const [store, route, page, rootPage, bridge] = await Promise.all([
    readFile(new URL("../app/api/onboarding-testing-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/testing/onboarding/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/testing/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../bridge/ideal-day-bridge.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(store, /testing-onboarding:/);
  assert.match(store, /DELETE FROM users WHERE id = \?/);
  assert.match(store, /confirmTestingProposal/);
  assert.match(store, /INSERT OR REPLACE INTO activities/);
  assert.match(route, /mode === "confirm"/);
  assert.match(page, /Reset onboarding/);
  assert.match(page, /Your real Ideal Day stays untouched/);
  assert.doesNotMatch(rootPage, /Reset onboarding/);
  assert.match(bridge, /onboarding_proposal/);
  assert.match(bridge, /provisional proposal, not durable activity data/);
});
