import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { deterministicOnboardingProposal, onboardingReviewDate, parseOnboardingAnswers, parseOnboardingProposal } from "../app/onboarding-model.ts";

function answers(capacity = "balanced") { return { version: 2, priorities: ["energy", "focus", "sleep"], frictions: ["low-energy"], rhythms: ["morning", "evening"], capacity, note: "I want enough energy left for my family." }; }

test("validates the focused four-part onboarding answers", () => {
  assert.deepEqual(parseOnboardingAnswers(answers()), answers());
  assert.equal(parseOnboardingAnswers({ ...answers(), priorities: ["energy", "focus", "sleep", "calm"] }), null);
  assert.equal(parseOnboardingAnswers({ ...answers(), frictions: ["none", "low-energy"] }), null);
  assert.equal(parseOnboardingAnswers({ ...answers(), rhythms: ["flexible", "morning"] }), null);
});

test("builds six to eight concrete candidates and preselects by coaching pace", () => {
  for (const [capacity, expected] of [["gentle", 3], ["balanced", 4], ["push", 5]]) {
    const proposal = deterministicOnboardingProposal(answers(capacity));
    const parsed = parseOnboardingProposal(proposal, capacity);
    assert.ok(parsed);
    assert.ok(parsed.activities.length >= 6 && parsed.activities.length <= 8);
    assert.equal(parsed.activities.filter((activity) => activity.selected).length, expected);
    assert.ok(parsed.activities.every((activity) => activity.durationMinutes >= 5));
    assert.ok(parsed.activities.every((activity) => !/reset|important progress|move your body|ease into/i.test(activity.title)));
  }
});

test("rejects candidate sets with too few selections or non-actionable selections", () => {
  const proposal = deterministicOnboardingProposal(answers());
  assert.equal(parseOnboardingProposal({ ...proposal, activities: proposal.activities.map((activity) => ({ ...activity, selected: false })) }, "balanced"), null);
  assert.equal(parseOnboardingProposal({ ...proposal, activities: proposal.activities.map((activity) => ({ ...activity, immediatelyActionable: false })) }, "balanced"), null);
  assert.equal(onboardingReviewDate("2026-08-25", proposal), "2026-08-28");
});

test("keeps testing onboarding isolated and materializes only selected Essentials", async () => {
  const [store, route, page, rootPage, bridge, spec] = await Promise.all([
    readFile(new URL("../app/api/onboarding-testing-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/testing/onboarding/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/testing/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../bridge/ideal-day-bridge.mjs", import.meta.url), "utf8"),
    readFile(new URL("../ONBOARDING_FLOW_SPEC.md", import.meta.url), "utf8"),
  ]);
  assert.match(store, /testing-onboarding-v2:/);
  assert.match(store, /DELETE FROM users WHERE id = \?/);
  assert.match(store, /activities\.filter\(\(activity\) => activity\.selected\)/);
  assert.match(store, /'essential'/);
  assert.doesNotMatch(store, /planRole === "extra"/);
  assert.match(route, /mode === "confirm"/);
  assert.match(page, /What should your days make room for\?/);
  assert.match(page, /What usually gets in the way\?/);
  assert.match(page, /Where would a little structure help most\?/);
  assert.match(page, /How should Luna start with you\?/);
  assert.match(page, /Choose your Essentials\./);
  assert.match(page, /Reset onboarding/);
  assert.doesNotMatch(page, /HIGHLIGHTS|MORE FOR TODAY|stretch goals/i);
  assert.doesNotMatch(rootPage, /Reset onboarding/);
  assert.match(bridge, /six to eight candidate activities/);
  assert.match(spec, /Onboarding is not the home screen/);
});
