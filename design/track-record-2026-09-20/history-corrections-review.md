# Weekly history: corrections and varied activity records

Decision: use Option 1 with Activities first/default, and C — Weekly chapters for activity detail. This review changes the design plan only; no production records were edited.

## Live review

Inspected the already signed-in Vercel Face Care workspace and Sites owner Shake / Supplements and Skin routine. No new login was required. Opened disclosures only; no completion, count, mode, or record controls were changed.

- Face Care saves named product selections and LED mask mode counts. Sep 19 shows Red ×1 + Green ×1; Sep 18 shows Red ×2; Sep 14 shows Red ×1 + Amber ×1. Today shows Red ×1 + Amber ×1. Counts and product selections coexist in a single daily selection.
- Shake / Supplements has a supplement selection record and separate meal/shake entries with saved recipes. A completed activity does not prove that a shake was consumed or every supplement selected.
- Skin routine currently shows Castile Soap and its product-owned rhythm. Product-use attribution can come from a run's subject snapshot rather than a separate explicit daily-selection entry.
- Recorded combinations do not necessarily encode session order, time-of-day, duration or dosage. Never infer those details.

## Product contract

History answers two independent questions: was this dated activity completed, and what was actually recorded within it?

Weekly chapters remain the navigation. Expand a week to browse day rows with date, status and a short domain-specific recap. Expand a day to see all saved details with their actual structure. Completion-only days remain short; a combined routine can show multiple sections. No universal duration column for untimed activity types.

### Quick completion correction

Tap a labeled status control, separate from the day disclosure, to choose Completed, Skipped or Not marked complete. Today is In progress rather than a failure. Selecting a different explicit state saves immediately with local saving/error feedback and a reversible Undo. This is a deliberate status change; tapping elsewhere in the row only opens details.

Use explicit desired-state requests, not toggle requests. Undo restores the exact prior status and any affected derived attribution, with concurrency checks. Completing a previously skipped occurrence clears its skipped state. Changing completion alone preserves saved mode counts, selections, food logs and sessions. No guessed timer duration or session details.

Missing saved days and unscheduled dates are not incomplete occurrences. Offer Record an activity for this date through a deliberate date-specific flow when backfilling is needed; do not reconstruct an old plan from today's schedule, or let generic completion silently create a recurring commitment.

### Detailed correction

Each opened day has Edit this day. Open a date-labeled editor containing:
- Activity status as an independent field.
- Relevant typed sections prefilled from saved entries.
- Save changes and Cancel.
- The exact selected date in the header and save action.

Example Sep19 Face Care: display products and LED mask > Red1, Green1, Amber0. Change Green1 to0 and Amber0 to1, then Save changes for Sep19. Save product/mode changes together so no intermediate combination leaks into the record. Leave the overall activity completed unless the user also changes its status. Update affected summaries and device-use totals.

Use product checkboxes for selections; nested mode count controls for devices; meal entry fields for food; workout sets/reps/load for strength records; measured-value fields for sessions. Preserve entry IDs when editing one of multiple same-day entries. Counts such as 2 sessions are not doses such as 2 capsules unless the stored unit explicitly establishes that meaning.

For a user asking only to mark an activity completed, do not demand detailed selections. For someone adding details to an unmarked activity, show the independent status clearly; no automatic assumption that all scheduled steps were done.

### Domain presentation

| Record family | Expanded history | Correction |
| --- | --- | --- |
| Completion only | Date and status | Explicit status choice |
| Timer or measured session | Recorded duration, saved fields and notes | Correct saved values; distinguish later self-reported duration from timer measurement |
| Supplements | Named selections, amounts only if actually stored | Dated checkboxes; typed amount fields only where supported |
| Meal/shake | Exact dated title, ingredients/modifiers, quantities, recipe reference | Edit that entry; do not modify the reusable recipe by default |
| Variable skin/device routine | Selected products and grouped device modes/counts | Date-scoped selections and mode steppers |
| Fixed product protocol | Saved use attribution and any explicit details | Correct dated product attribution; do not infer every historical use from current product roster |
| Strength workout | Variant/workout, sets, reps, loads and notes | Edit precise saved session/set |
| Older ambiguous device record | Mask used, mode not recorded | Preserve ambiguity until user supplies the mode |

## Required implementation changes and risks found

1. app/api/track-record-store.ts projects entries into string lines and omits structured edit identity such as separate record ID/key, entry ID, scope/variant and version. Replace/extend this with typed history detail and supported edit capabilities, not parsing display text.
2. app/page.tsx mutateRecord always sends localDateKey(). Existing workspace components also initialize around today. History must explicitly pass the selected historical date through read, display, mutation, retry and save paths.
3. daily_selection supports dated item IDs and counts, and mutation syncs linked recurring-step dates. This is a useful foundation, but there is no complete historical editing flow. Meal logs currently lack a direct user edit operation; session updates merge values and cannot clear a recorded field through an empty string. Add typed entry-level correction operations.
4. The default record writer saves whole payloads and revisions, but general mutations do not enforce an expected version. Add optimistic concurrency, idempotent correction IDs, and atomic writes across all affected records and summaries. Preserve unrelated dates and concurrent edits by another tab or Luna.
5. Current daily_selection history resolves item labels/parents from the current roster. Its validators drop unknown item IDs and empty selections. Historical display needs durable dated snapshots or version-backed identities so renames, retired products and mode changes cannot rewrite the meaning of past entries. Distinguish explicitly recorded none from no details recorded. Older data must remain honestly incomplete.
6. Completion retains completedSubjectKeys and recordVersions at completion. Subsequent selection edits do not reconcile this snapshot in the ordinary mutation function. Preserve the original completion evidence and record explicit correction revisions, then derive effective use from the corrected history; do not count both parent uses and child modes or legacy session notes twice.
7. Reopening currently preserves session details. However, complete after reopen upserts null timer fields when no new timing is supplied, and skip upsert resets run timing/details. A dedicated historical status correction must preserve existing evidence rather than reuse these branches unchanged.
8. Completing/skipping can advance completion-driven schedule state. Historical correction must not blindly advance the live rotation again. Define and test reconciliation separately. Correcting last-use evidence may legitimately change a since-last-use due date, but must not rewrite schedule definitions or silently replay the current sequence.
9. Existing history queries read several dated record families but omit others such as adherence and session_choice, and use present canonical ownership for moved records. Cover explicit/inferred product attribution, variants, archived records and moved subjects, keeping original occurrence context linked to canonical record ownership. Archived historical content should remain viewable without editing today's roster.
10. Entry arrays are currently bounded (daily selections/meal logs up to730). A long-lived history feature must not silently truncate retained data during validation or correction. Plan append-preserving storage/pagination and test boundary behavior.
11. Separate the date an activity happened from when it was recorded/corrected. Marking last Friday complete today must not invent a Friday completion time. Keep factual edits auditable; a compact Edited marker and reversible correction are sufficient in the normal UI.
12. Validate real calendar dates and account-local timezone; disallow unintended future edits. User/record/variant/date ownership checks remain mandatory. Never let a stale client ID or record move send a correction into another activity/account.

## Acceptance examples

- Mark a missed saved occurrence completed; exact day/week/calendar totals update; no fictitious products or duration appear.
- Reopen and re-complete a timed occurrence: prior measured duration and detailed selections survive.
- Switch Sep19 mask Green1 to Amber1: Red1 remains, total remains2, other products/dates/today unchanged, completion stays completed.
- Retired modes stay visible historically; mode-not-recorded remains honest until explicitly corrected.
- Change one supplement on a prior date without changing the shake entry; edit one shake without changing the reusable recipe.
- Explicitly record no selections without making it indistinguishable from missing history.
- Correct a routine after a subject moved to another activity, preserving the historical occurrence and canonical ownership.
- Save conflict, timeout, retry and Undo cannot duplicate uses, lose another edit, or silently show success.
- Current partial week distinguishes today and unscheduled days; no assumed seven-day denominator.

