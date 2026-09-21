# Track record design study — September 20, 2026

Status: Implemented Option 1 with Activities first and C — Weekly chapters. Historical correction and typed detail requirements are documented in history-corrections-review.md; implementation verification is recorded in implementation-verification.md. The concepts below preserve the design study that led to the selected direction.

## Approved direction and current iteration

The user selected Option 1 (Calendar + Activities), reordered to Activities / Calendar with Activities as the initial view. Preserve the selected concept's overall navigation and origin-aware Back behavior.

Only the activity-history detail is under review, especially its Recent history region. The first draft repeats the same information in a row header, status line and nested timer card. A completion-only day should not look like a disclosure promising additional detail.

Three focused alternatives:
- A — Compact log (recommended): one list with date, status and recorded time; inline expansion only for meaningful saved details. Show actual timer duration once. A dash under the Recorded time column means no timer recorded, not zero. Provide an accessible description. An unrecorded timer does not diminish a valid completion.
- B — Day focus: turn the existing date strip into a selector driving a single detail surface. The full calendar picker reaches older dates. Better for richer saved details, less efficient for comparing many days. Today, selected date and completion must remain visually distinct. The strip must update to the selected week after a calendar jump.
- C — Weekly chapters: group dates under week summaries with one recent week open and older weeks collapsed. Better for long histories, at the cost of another disclosure level. Weekly counts use saved planned occurrences, not an assumed seven-day denominator.

Common behavior: show Today in progress as its own state, preserve skipped and unknown distinctions, render all meaningful saved details (including non-timer records and variants), and keep View this day secondary. A row with no additional saved information has no expansion chevron. Older history pagination remains available. No invented comparisons, goals or health statistics.

## Findings

- The current calendar, controls and legend push By activity below the first mobile viewport. Selecting an activity repeats the same calendar.
- In app/track-record.tsx, chooseActivity only changes a filter; Back always invokes onClose.
- Live mobile inspection reproduced "Activity not found." from Chin-up Bar / Visualization's View all history. app/api/schedule-store.ts selects a client key as activityId and a separate databaseActivityId, then omits databaseActivityId from the UI response. The workspace callback passes the client key; app/api/history/route.ts only accepts the owned database ID. Resolve the key to the canonical owned ID at the history boundary, or deliberately expose and pass the canonical ID; verify both entry paths.
- Home's strengths: editorial date typography, restrained category-colored line icons, familiar activity cards and a clear content hierarchy.

## Independent concepts and synthesis

My three ideas, developed while the first imagegen call ran:
1. Calendar + Activities as prominent peer tabs with distinct activity detail.
2. A Day Journal of home-style day cards, with a calendar for date jumping.
3. An Activity Library with recent status previews and dated records.

Imagegen independently proposed Daily Timeline, Activity List + Mini Streaks, and Calendar Journeys. Keep its readable dated log, miniature history previews and explicit day-to-activity paths. Discard its added global navigation, unsourced exercise statistics, irrelevant Notes/About tabs and duplicate calendars.

Final three:
1. Calendar + Activities (recommended): balanced date overview and activity discovery.
2. Day Journal: strongest resemblance to the home list; best for remembering a day.
3. Activity Library: strongest for recurring review of one particular activity.

## Shared interaction contract

- Preserve the existing Track record entry on home. Root history returns to Today.
- Peer tabs change in place and retain period, selection, search and scroll.
- Activity rows open a distinctly titled activity history led by dated records.
- Back and browser Back pop one meaningful navigation level. Restore date, period, filter, scroll and focus.
- Workspace View all history opens the same activity detail, but its Back returns directly to the originating workspace with its state preserved.
- Day recap can open an activity's history; activity history can open a whole-day recap. Return respects the entry path and avoids duplicated cyclic states.
- Viewing is read-only. Only Correct this day enables corrections. Reopening completion preserves saved session details.
- Resolve activity identities within the signed-in user's ownership. Do not broaden access or globally replace client keys.

## Presentation and responsive behavior

Use existing color, spacing, icon and typography primitives. Proposed serif history/date headings extend home's editorial date treatment; document that extension if selected. Use Phosphor line icons and canonical category colors, including rose for Bed Routine/Care.

Phone: full-screen history, 44px primary controls, 12px side insets, readable month grid. Calendar day target sizing must still fit 360px. Year shows month previews, not tiny interactive heatmap squares.

Desktop: retain the home shell and content width; calendar/list on the left and selected recap on the right. Collapse below 1040px. Activity history reuses the same master/detail approach.

Retain month/year navigation and older history. Activity detail leads with dated records; calendar is secondary. For Day Journal the period control opens the date/month/year picker. For Activity Library, Calendar remains a peer tab.

Calendar uses factual counts plus accessible day descriptions. Missing saved days, nothing scheduled, not recorded complete, skipped, complete, and today in progress stay distinct. Status strips use symbols/text in addition to color. No guilt-oriented red crosses or daily streak assumptions. A partially completed day must never carry a Completed badge.

Summary denominators remain saved scheduled occurrences, including skips and excluding unchosen extras. Only show duration when a timer actually ran. Never invent sessions, reps, health improvements, streaks or AI insights. Images use illustrative data; production dates and totals must be derived consistently from D1.

Loading skeletons retain layout. Errors keep Back and local Retry working. Empty histories say No history recorded yet. Loading older entries must not reset the view. Preserve variants and saved selections.

## Implementation after direction selection

1. Fix the activity identity boundary and cover direct workspace and directory entry.
2. Add typed history navigation state, origin-aware returns, browser Back handling and state restoration.
3. Separate overview, directory, activity history and day recap while sharing components and the existing history contract.
4. Add bounded cross-date history retrieval if required. Current endpoints return a period overview or one day's details; avoid one request per day. Preserve user scoping and pagination.
5. Update DESIGN_SYSTEM.md and PRODUCT_SPEC.md.
6. Validate nested returns, reload fallback, empty/unknown/error states, calendar periods, corrections, recorded details, keyboard use, text enlargement, reduced motion, 360/430/680/1040/wide widths, and both gateway/origin identities. Run npm test and npm run lint before committing. Deployment follows existing Sites-first ordering only when requested.

## Inspiration

- [Oura Trends](https://ouraring.com/blog/trends/): period overview followed by focused detail.
- [Streaks](https://streaksapp.com/): activity recognition and compact historical feedback.
- [Exist custom tracking](https://exist.io/blog/custom-tracking/): readable chronological records.

## Image provenance

Built-in imagegen used. It does not expose a model selector; the requested gpt-image-2.5 version cannot be independently verified. Images are visual proposals, not working screens. Exact prompt set is in prompts.md.

The reviewed final images define layout and flow. Raster generation still leaves illustrative data inconsistencies: some totals/status strips do not reconcile, and proposal 3's recap omits one of the eight example rows. These are not product requirements. Implementation must render every saved occurrence, compute all totals and previews from the same data, and use the existing canonical Phosphor icon mapping. Do not transcribe image values or recreate missing rows as intended behavior.
