import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { deterministicOnboardingProposal, onboardingReviewDate, parseOnboardingAnswers, parseOnboardingProposal } from "../app/onboarding-model.ts";

function answers(capacity = "balanced") { return { version: 2, priorities: ["energy", "focus", "sleep"], frictions: ["low-energy"], rhythms: ["morning", "evening"], capacity, note: "I want enough energy left for my family." }; }

test("validates the focused four-part onboarding answers", () => {
  assert.deepEqual(parseOnboardingAnswers(answers()), answers());
  assert.equal(parseOnboardingAnswers({ ...answers(), priorities: ["energy", "focus", "sleep", "calm"] }), null);
  assert.equal(parseOnboardingAnswers({ ...answers(), frictions: ["none", "low-energy"] }), null);
  assert.deepEqual(parseOnboardingAnswers({ ...answers(), rhythms: ["flexible", "morning"] })?.rhythms, ["flexible", "morning"]);
});

test("builds six to eight concrete candidates and preselects by coaching pace", () => {
  for (const [capacity, expected] of [["gentle", 3], ["balanced", 4], ["push", 5]]) {
    const proposal = deterministicOnboardingProposal(answers(capacity));
    const parsed = parseOnboardingProposal(proposal, capacity);
    assert.ok(parsed);
    assert.ok(parsed.activities.length >= 6 && parsed.activities.length <= 8);
    assert.equal(parsed.activities.filter((activity) => activity.selected).length, expected);
    assert.ok(parsed.activities.every((activity) => activity.durationMinutes >= 5));
    assert.ok(parsed.activities.every((activity) => activity.durationMinutes <= 480));
    assert.ok(parsed.activities.every((activity) => !/reset|important progress|move your body|ease into/i.test(activity.title)));
    assert.ok(parsed.activities.filter((activity) => activity.choices).every((activity) => activity.choices.length === 3 && activity.choices.some((choice) => choice.key === activity.choiceKey)));
  }
});

test("repairs generic, mismatched candidate names and adds concrete choices", () => {
  const proposal = deterministicOnboardingProposal(answers());
  const generic = { ...proposal, activities: proposal.activities.map((activity) => activity.key === "focus-block" ? { ...activity, title: "30-minute Focus block", category: "Training", choices: undefined, choiceKey: undefined } : activity) };
  const parsed = parseOnboardingProposal(generic, "balanced");
  assert.ok(parsed);
  const focus = parsed.activities.find((activity) => activity.key === "focus-block");
  assert.equal(focus.title, "Deep work session");
  assert.equal(focus.category, "Creativity");
  assert.deepEqual(focus.choices.map((choice) => choice.title), ["Deep work session", "Creative project time", "Planning session"]);
  assert.ok(parsed.activities.every((activity) => /^[A-Z]/.test(activity.title)));
});

test("rejects candidate sets with too few selections or non-actionable selections", () => {
  const proposal = deterministicOnboardingProposal(answers());
  assert.equal(parseOnboardingProposal({ ...proposal, activities: proposal.activities.map((activity) => ({ ...activity, selected: false })) }, "balanced"), null);
  assert.equal(parseOnboardingProposal({ ...proposal, activities: proposal.activities.map((activity) => ({ ...activity, immediatelyActionable: false })) }, "balanced"), null);
  assert.equal(onboardingReviewDate("2026-08-25", proposal), "2026-08-28");
});

test("keeps testing onboarding isolated and materializes only selected Essentials", async () => {
  const [store, route, page, styles, rootPage, bridge, spec] = await Promise.all([
    readFile(new URL("../app/api/onboarding-testing-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/testing/onboarding/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/testing/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
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
  assert.match(page, /Make room for the life you want\./);
  assert.match(page, /build momentum one day at a time/);
  assert.match(page, /Hey, I’m Luna—your new assistant/);
  assert.match(page, /<LunaAvatar[^>]+size=\{126\}/);
  assert.match(styles, /\.onboarding-hero-copy[^}]+top: 30%/);
  assert.match(styles, /\.onboarding-hero-luna[^}]+top: 70%/);
  assert.match(styles, /\.onboarding-hero-bubble[^}]+top: 116px; left: 124px/);
  assert.doesNotMatch(page, /Four quick questions|let Luna help it evolve|MEET LUNA/);
  assert.match(page, /What should your days make room for\?/);
  assert.match(page, /What usually gets in the way\?/);
  assert.match(page, /Where would a little structure help most\?/);
  assert.match(page, /How should Luna start with you\?/);
  assert.match(page, /Confirm your Essentials\./);
  assert.match(page, /Choose the activities that feel right for you\./);
  assert.doesNotMatch(page, /These are Luna’s recommendations/);
  assert.match(page, /Reset onboarding/);
  assert.match(page, /ActivityDurationControl/);
  assert.match(page, /category-chip/);
  assert.match(page, /YOUR ESSENTIALS/);
  assert.match(page, /OTHER SUGGESTIONS/);
  assert.match(page, /Which do you prefer\?/);
  assert.match(page, /Add \$\{activity\.title\} to Essentials/);
  assert.match(page, /startViewTransition/);
  assert.match(page, /Start my day/);
  assert.match(page, /Trash2/);
  assert.match(page, /Activity length/);
  assert.match(page, /Building your starting day/);
  assert.doesNotMatch(page, /progressTitle|activity\.reason|onboarding-edit-meta|onboarding-candidate-select|>Remove</);
  assert.match(page, /window\.location\.assign\("\/testing"\)/);
  assert.doesNotMatch(page, /No activities have been created yet/);
  assert.doesNotMatch(page, /Why these\?|Not saved yet/);
  assert.match(page, /priorities: "dusk"/);
  assert.match(page, /friction: "current"/);
  assert.match(page, /rhythm: "orbital"/);
  assert.match(page, /coaching: "veil"/);
  assert.doesNotMatch(page, /MORE FOR TODAY|stretch goals/i);
  assert.doesNotMatch(rootPage, /Reset onboarding/);
  assert.match(bridge, /six to eight candidate activities/);
  assert.match(bridge, /Category and title must agree/);
  assert.match(spec, /Onboarding is not the home screen/);
});

test("keeps the Luna avatar code-native, stateful, and motion-aware", async () => {
  const [avatar, demo, design] = await Promise.all([
    readFile(new URL("../app/luna-avatar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/luna-demo/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../DESIGN_SYSTEM.md", import.meta.url), "utf8"),
  ]);
  assert.match(avatar, /<canvas/);
  assert.match(avatar, /prefers-reduced-motion/);
  assert.match(avatar, /"idle" \| "listening" \| "thinking"/);
  assert.match(avatar, /DEFAULT_LUNA_FACET_TUNING/);
  assert.match(avatar, /DEFAULT_LUNA_INNER_FACET_TUNING/);
  assert.match(avatar, /DEFAULT_LUNA_MOTION_TUNING/);
  assert.match(avatar, /facetCount: 40/);
  assert.match(avatar, /globalCompositeOperation = "lighter"/);
  assert.match(avatar, /facetTime \* TAU \* config\.shimmerSpeed/);
  assert.match(demo, /5 live sliders/);
  assert.match(demo, /Facet-ring contraction/);
  assert.match(demo, /Constellation activity/);
  assert.match(demo, /SCALE TESTS/);
  assert.match(demo, /Copy modes/);
  assert.doesNotMatch(demo, /Overlay inner row|diamondRows/);
  assert.match(avatar, /facetRows/);
  assert.match(avatar, /config\.artScale \* ringScale/);
  assert.match(avatar, /openingGuide\.innerTipPosition \* ringScale/);
  assert.match(avatar, /facetContext\.fillStyle = "#000"/);
  assert.match(avatar, /thinkingBreathDepth: \.14/);
  assert.match(avatar, /networkArtRadius = radius \* \.76;/);
  assert.doesNotMatch(avatar, /networkArtRadius = radius \* \.76 \* ringScale/);
  assert.match(avatar, /phase: node\.phase/);
  assert.doesNotMatch(avatar, /pointSize > 1\.18/);
  assert.match(avatar, /paletteTime = elapsed \* \(state === "thinking" \? 2 : 1\)/);
  assert.match(avatar, /networkColorAt/);
  assert.match(design, /code-native living halo/);
});
