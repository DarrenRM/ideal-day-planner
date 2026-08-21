# Universal Scheduling, Activity Variants, and Global Luna

Status: implemented, migrated, deployed, and verified in production  
Scope owner: `PRODUCT_SPEC.md` remains the product source of truth; this file is the detailed implementation contract for scheduling, variants, and site-wide Luna.  
Last scoped: 2026-08-21

## 1. Objective

Build a universal scheduling system that can express simple repetition, multi-activity alternation, and same-activity variant rotation without hard-coding behavior for workouts, light therapy, or any other domain.

The system must support both deterministic UI setup and natural-language setup through Luna. Luna may understand open-ended requests and ask clarifying questions, but every write must compile into a small, validated, auditable set of application-owned actions.

The finished system must support all of these as ordinary instances of the same model:

- One activity every day.
- One activity on selected weekdays.
- One activity every N days.
- Multiple activities alternating in one routine position.
- One activity rotating through multiple variants.
- Separate specific activities instead of variants.
- A one-day move, substitution, duration change, or label override.
- A future recurring change that begins on a selected date.
- An activity that exists durably without any schedule placement.

The examples above are acceptance fixtures, not domain-specific features.

## 2. Product decisions

These decisions are part of the implementation contract:

1. An activity is durable context; a scheduled occurrence is not the activity definition.
2. A variant is an optional durable version of an activity, not a renamed daily activity.
3. A schedule pattern is a routine-level sequence. A pattern may contain one step or many steps, and its steps may reference one activity or several activities.
4. Simple recurrence is represented by a one-step pattern. Alternation and rotation are represented by multi-step patterns.
5. Daily plans remain dated snapshots. Changing a future pattern does not silently rewrite completed or already-customized days.
6. `Day Timeline` remains orthogonal. Scheduling decides whether an occurrence exists and where it belongs in the sequence; Timeline decides whether the resolved day is placed on a clock.
7. Luna is optional for basic scheduling. Every schedule Luna creates must remain understandable and editable through app-owned UI.
8. Luna's language understanding may be broad. Her executable output remains typed, narrow, server-validated, revisioned, and attributable.
9. Luna never rearranges or optimizes the routine without an explicit request.
10. Recurring or multi-day changes require a preview and confirmation in the initial release. Clear, reversible, single-occurrence changes may execute immediately.

## 3. Problems in the current implementation

The current implementation has the right high-level separation in `PRODUCT_SPEC.md`, but the runtime does not yet fully honor it:

- `routine_items` gives every routine position one fixed activity and permits that activity only once per routine.
- Every routine item is copied into every newly created day; there is no cadence evaluator.
- `daily_plan_items` has no variant, pattern, step, occurrence key, or day-specific display label.
- Replacing today's list upserts permanent activity title/category/icon/color values, so an occurrence edit can accidentally become an activity-definition edit.
- `activity_runs` is unique by user, activity, and date, preventing multiple occurrences of the same activity on one date.
- Activity records can be activity- or day-scoped, but cannot be durably scoped to a variant.
- Conversations and agent jobs require an activity, so there is no site-wide Luna conversation.
- Luna can emit bounded record and workspace actions but cannot emit schedule proposals or occurrence actions.
- The activity bridge receives only the selected activity's schedule context, not the routine or cross-activity schedule state needed to reason about alternation and movement.

The implementation must correct these underlying boundaries rather than layering client-only exceptions over them.

## 4. Conceptual model

### 4.1 Activity definition

A durable context such as `Gym`, `Face Mask`, `Cardio`, `Breakfast`, or `Leg Day`.

It owns or anchors:

- Permanent conversation and activity knowledge.
- Shared activity records and history.
- Shared workspace composition.
- Category, icon, color, and stable title.

An occurrence may snapshot its title for historical display, but editing one occurrence must not update the activity definition unless the user explicitly chooses to rename the activity everywhere.

### 4.2 Activity variant

An optional named version of one activity, such as `Leg day`, `Green light`, or `Indoor bike`.

A variant may have:

- A name and optional concise description.
- An optional default duration.
- Variant-scoped records, such as a workout, protocol, or product setting.
- A variant workspace overlay.
- An active/archived state and stable ordering.

Variants share the parent activity's conversation and overall history by default. They do not create hidden duplicate activities.

Users may instead choose separate activities. `Leg Day`, `Push Day`, and `Pull Day` as separate activity definitions must remain valid. A future optional activity group/program may provide roll-up history across separate activities, but it is not required for the first scheduling release.

### 4.3 Schedule pattern

A durable routine-level slot that emits at most one scheduled step whenever its cadence triggers.

A pattern contains:

- Name.
- Routine/template ownership.
- Position among the day's other patterns.
- Cadence.
- Ordered steps.
- Anchor date and initial step.
- Advancement policy.
- Effective date and optional end date.
- Active/archived state.
- Revision metadata.

A one-step pattern represents ordinary recurrence. A multi-step pattern represents alternation or rotation.

### 4.4 Schedule step

One position in a pattern's sequence. A step references:

- One activity definition.
- Zero or one activity variant.
- Optional duration override.
- Optional occurrence label override.
- Stable step order.

Cross-activity and same-activity sequences use the same step type:

- `Lift -> Cardio` references two activities.
- `Gym/Legs -> Gym/Core -> Gym/Push -> Gym/Pull` references one activity and four variants.

### 4.5 Daily occurrence

The resolved, dated snapshot presented in Today. It stores enough information to remain historically legible even if the activity, variant, or pattern later changes.

It includes:

- Stable occurrence identity.
- Date and day position.
- Activity and optional variant references.
- Source pattern and source step when generated by a pattern.
- Activity-title and variant-name snapshots.
- Optional one-day display-label override.
- Duration snapshot.
- Completion, skip, removal, and movement state.
- Revision/provenance metadata.

### 4.6 Activity run

The actual execution record for one occurrence. Runs belong primarily to a daily-plan item/occurrence, not to the tuple of activity and date.

The same activity may therefore occur more than once on one date. Ad hoc runs without a daily occurrence remain possible.

## 5. Universal scheduling language

### 5.1 Cadence

The first release supports these validated cadence forms:

```ts
type ScheduleCadence =
  | { kind: "daily" }
  | { kind: "weekdays"; weekdays: number[]; intervalWeeks?: number }
  | { kind: "interval_days"; every: number; anchorDate: string };
```

Rules:

- Weekdays use the user's local timezone and integers 0 through 6.
- Weekday arrays are unique, sorted, and non-empty.
- `intervalWeeks` and `every` are bounded positive integers.
- `anchorDate`, `effectiveDate`, and `endDate` use local `YYYY-MM-DD` dates.
- Dates before `effectiveDate` and after `endDate` do not trigger.
- More advanced monthly/calendar expressions are deferred until there is a real use case.

### 5.2 Advancement

```ts
type AdvancementPolicy =
  | { kind: "calendar" }
  | { kind: "completion"; advanceOnSkip: boolean };
```

- `calendar` selects a step from the ordinal number of cadence triggers since the anchor. Missing or skipping an occurrence does not pause the sequence.
- `completion` selects the current stored cursor. Completing the occurrence advances it exactly once. Skipping advances only when `advanceOnSkip` is true.
- Reopening, retrying, or receiving duplicate completion requests must not advance a cursor twice.
- Reversing completion must not silently rewind a sequence after later occurrences exist. It creates an explicit inconsistency state that the user can resolve or Luna can explain.

### 5.3 Anchor

Every multi-step pattern requires:

- The local date on which the pattern becomes effective.
- The first selected step on or after that date.

The setup UI may default the anchor to today and the initial step to the first entered step, but both must be visible in the proposal.

### 5.4 Position

Each pattern occupies one routine position. On a triggering date, the selected step appears at that position. Patterns that do not trigger emit nothing and consume no position.

Today's manual ordering remains an occurrence override. It must not reorder the durable pattern unless the user explicitly chooses to update future days.

### 5.5 Exceptions and overrides

One-day operations are modeled as occurrence overrides rather than pattern rewrites:

- Move to another date.
- Move within one day.
- Substitute a different activity or variant.
- Change duration.
- Change display label.
- Skip or remove for one day.
- Add an ad hoc occurrence.

The system must preserve source-pattern provenance and avoid re-generating the source occurrence after a move.

## 6. Resolution engine

Daily resolution is deterministic application code. It must not require Luna or Hermes.

When a local date is requested:

1. Load active schedule patterns effective on that date, ordered by routine position.
2. Evaluate whether each cadence triggers.
3. Select the step using its calendar calculation or completion cursor.
4. Build a stable occurrence key from the pattern, trigger date, and emission identity.
5. Insert the daily-plan item idempotently if it does not already exist.
6. Apply persisted one-day overrides and imported moved occurrences.
7. Preserve existing customized or settled occurrences.
8. Return the dated snapshot to the UI.

Resolution requirements:

- Repeated GETs never duplicate occurrences.
- A stale client cannot overwrite a newer day or pattern revision.
- Pattern changes apply from an explicit effective date. Today is not rewritten unless included in the confirmed proposal.
- Completed historical days never change when a variant is renamed or a pattern is edited.
- Checklist mode and Timeline mode resolve the same occurrences and order.
- Timeline mode calculates clock placement only after resolution.
- Completion-based patterns advance transactionally with run completion.
- Failed or retried completion requests remain idempotent.

## 7. Display contract

The permanent activity title stays stable. Today may present a resolved variant or one-day label without renaming the activity.

Examples:

- `Gym — Leg day`
- `Face Mask — Red light`
- `Cardio — Indoor bike`

This is a derived display title composed from the activity snapshot plus variant/label snapshot.

Responsive behavior:

- Preserve the existing shared collapsed/expanded activity header contract.
- When the compound title fits, render the variant as a visually subordinate suffix on the title line.
- When it does not fit, retain the activity title and place the variant on a short supporting line rather than making it unreadably small.
- Keep activity-length controls and category/status placement consistent with `DESIGN_SYSTEM.md`.
- The expanded activity header uses the same resolved title as the collapsed row.
- The conversation remains attached to the parent activity. The active occurrence and variant are included in Luna's context.

Workspace behavior:

- Shared activity components render first according to the normal ordering policy.
- A selected variant may add or replace variant-specific operational components below shared components.
- Day-scoped components may further specialize the current occurrence.
- A base workspace and variant overlay must merge deterministically; opening must never wait for generation.
- Streak/adherence ordering continues to follow the global workspace ordering contract.

## 8. Manual scheduling UX

### 8.1 Add Activity

Keep Add Activity fast. The initial form contains:

- Name.
- Category.
- Duration estimate.
- `Include today` when appropriate.
- A compact Schedule choice.

The common Schedule choices are:

- No recurring schedule.
- Every day.
- Selected weekdays.
- Every N days.
- Create a sequence.
- Describe it to Luna.

Saving the activity definition never waits for Luna.

If the user chooses a simple deterministic schedule, save it directly as a one-step pattern.

If the user chooses `Create a sequence`, use an app-owned editor that can:

- Add an existing or newly created activity as a step.
- Select or create an activity variant for a step.
- Reorder and remove steps.
- Choose cadence, anchor, and advancement policy.
- Preview the next several resolved occurrences.

If the user chooses `Describe it to Luna`:

1. Save the activity definition immediately.
2. Preserve the typed scheduling request as a user message in global Luna.
3. Link the new activity and Add Activity draft context to that message.
4. If `Include today` is selected, create an explicit one-day occurrence so the activity is usable while the future pattern is unresolved.
5. Let Luna ask a clarifying question or return a schedule proposal.
6. Apply the recurring pattern only after confirmation.

### 8.2 Schedule management

The routine menu needs a `Manage schedule` surface showing patterns rather than a flattened list of every possible future occurrence.

Each pattern summary shows:

- Name.
- Cadence in ordinary language.
- Sequence steps.
- Advancement policy.
- Effective date.
- A short upcoming preview.
- Edit, pause/archive, and ask-Luna actions.

Simple one-step patterns should still look simple. The interface must not expose database terminology such as pattern cursor or occurrence key.

### 8.3 Daily overrides

From an activity occurrence, the user may:

- Move it within today.
- Move it to another date.
- Change today's variant.
- Change today's duration.
- Skip or remove it for today.
- Apply a change to future occurrences instead.

When scope is ambiguous, the UI asks `Just this occurrence` or `This and future occurrences` before saving.

## 9. Site-wide Luna

### 9.1 One Luna, multiple context lenses

Site-wide Luna and activity Luna are not different personalities or independent sources of truth.

- Activity Luna opens with one activity, occurrence, variant, records, workspace, and recent activity conversation in focus.
- Site-wide Luna opens with the routine, today's resolved plan, schedule patterns, pending proposals, settings, and a compact activity catalog in focus.
- Activity conversation remains activity-scoped.
- Cross-activity scheduling requests made inside an activity are routed through the same schedule-planning service used by global Luna.
- Global Luna has its own permanent conversation so users can discuss the whole day without entering an activity.

The global entry point should be available from the primary app shell on desktop and mobile. It should open a sheet/drawer or full-screen mobile conversation consistent with the existing activity conversation behavior.

### 9.2 Context packet

Global schedule jobs receive only the information required to reason about the request:

- User timezone and relevant settings.
- Local current date.
- Compact activity catalog with stable IDs, titles, categories, and variants.
- Current schedule patterns and revisions.
- Today and explicitly referenced nearby daily occurrences.
- Pending schedule proposal, if any.
- Recent relevant global messages.
- The source activity/occurrence when invoked from an activity.

They do not receive raw SQL, database bindings, unrestricted application tools, or every activity workspace by default. Existing typed retrieval may fetch additional activity context when genuinely needed.

### 9.3 Conversation and work states

Global Luna follows the existing durable asynchronous contract:

- The user message appears immediately and is saved before processing.
- A visible work state appears while Luna interprets or researches.
- Clarifying questions are normal durable Luna messages; no process remains blocked waiting for an answer.
- A schedule proposal is a durable UI card connected to the source message and agent job.
- The proposal survives reloads and can be confirmed, revised, or dismissed later.
- Confirmation produces an immediate visible result and an audit event.

## 10. Luna schedule contract

### 10.1 Principle

Luna is a conversational compiler for the app's schedule language. She may understand arbitrary wording, but she cannot create arbitrary schedule code or mutate unvalidated rows.

### 10.2 Result types

A schedule-aware Luna run may return:

1. A conversational response.
2. One normal clarifying question.
3. A typed schedule proposal.
4. A permitted one-occurrence action.
5. Existing bounded record/workspace actions when relevant.

Extend the current bridge envelope rather than creating a second agent protocol. The exact validator may evolve, but the semantic shape is:

```ts
type LunaResult = {
  message: string | null;
  workspaceFollowup: boolean;
  recordActions: RecordAction[];
  workspaceActions: WorkspaceAction[];
  followUpQuestion: null | {
    body: string;
    proposalId?: string;
  };
  scheduleProposal: null | ScheduleProposalDocument;
  occurrenceActions: OccurrenceAction[];
};
```

### 10.3 Schedule proposal

```ts
type ScheduleProposalDocument = {
  baseRevision: number;
  effectiveDate: string;
  summary: string;
  impact: {
    todayChanges: number;
    futurePatternChanges: number;
  };
  actions: ScheduleProposalAction[];
};
```

Validated proposal actions may include:

- Create an activity definition with bounded title/category/duration fields.
- Create, rename, reorder, or archive an activity variant.
- Create, update, pause, or archive a schedule pattern.
- Add, update, reorder, or remove pattern steps.
- Set cadence, anchor, initial step, and advancement policy.
- Include or exclude today explicitly.

The backend resolves all IDs, verifies ownership, enforces limits, validates references, and rejects stale `baseRevision` values before showing or applying the proposal.

### 10.4 Immediate occurrence actions

The initial immediate-action allowlist is deliberately small:

- Move one known occurrence within the current day.
- Move one known occurrence to one explicit local date.
- Change one occurrence's duration.
- Change one occurrence to an existing variant.
- Skip, unskip, remove, or restore one occurrence.
- Add one occurrence of an existing activity on an explicit date.

Every action requires a stable occurrence/activity ID, explicit date when relevant, idempotency key, source message, agent job, and server-side ownership check.

### 10.5 Confirmation policy

Execute immediately only when all are true:

- The request is explicit and unambiguous.
- It affects one occurrence.
- It is reversible.
- It does not alter a recurring pattern or create an activity/variant.
- The destination and collision behavior are clear.

Otherwise create a proposal. Initial recurring changes always require confirmation, even when the wording is explicit.

Luna asks one concise clarification when any of these are unresolved:

- The referenced activity or date.
- Whether the request affects one occurrence or the recurring pattern.
- The cadence or anchor.
- Sequence step order.
- Whether advancement is calendar- or completion-based.
- Whether a skip advances a completion-based sequence.
- Whether excluded days pause the sequence.
- What to do when the destination already contains the activity.

Do not ask questions whose answers are already available from settings, records, or the current proposal.

## 11. Proposed persistence model

All authoritative scheduling state belongs in D1. Browser storage may remember only transient UI preferences such as whether the global Luna drawer was last open.

### 11.1 New or generalized tables

#### `activity_variants`

- `id`
- `user_id`
- `activity_id`
- `name`
- `description`
- `default_duration_minutes`
- `position`
- `archived_at`
- `created_at`
- `updated_at`

Indexes must support activity ownership and ordered active-variant lookup.

#### `schedule_patterns`

- `id`
- `user_id`
- `routine_id`
- `name`
- `position`
- `cadence_json`
- `advance_policy_json`
- `anchor_date`
- `initial_step_position`
- `effective_date`
- `end_date`
- `revision`
- `archived_at`
- `created_at`
- `updated_at`

#### `schedule_pattern_steps`

- `id`
- `pattern_id`
- `activity_id`
- `activity_variant_id`
- `position`
- `duration_minutes`
- `display_label_override`
- `created_at`
- `updated_at`

#### `schedule_pattern_state`

- `pattern_id` primary key
- `current_step_position`
- `last_advanced_daily_plan_item_id`
- `revision`
- `updated_at`

This table is used only for completion-based patterns. Cursor advancement and activity completion must occur in one logical transaction/batch with idempotency protection.

#### `schedule_proposals`

- `id`
- `user_id`
- `conversation_id`
- `source_message_id`
- `source_agent_job_id`
- `status`: `draft`, `awaiting_clarification`, `ready`, `applied`, `dismissed`, or `stale`
- `base_revision`
- `document_json`
- `applied_at`
- `created_at`
- `updated_at`

#### `schedule_action_events`

Append-only audit rows for user- and Luna-initiated schedule changes, containing action type, validated payload, source, actor, idempotency key, and created timestamp.

### 11.2 Existing table changes

#### `daily_plan_items`

Add:

- `occurrence_key`
- `schedule_pattern_id`
- `schedule_pattern_step_id`
- `activity_variant_id`
- `variant_name_snapshot`
- `display_label_override`
- `source_date`
- `moved_from_daily_plan_item_id`
- `revision`

Uniqueness must be based on the occurrence key within a daily plan, not activity `client_key`, so the same activity can appear more than once in one day.

#### `activity_runs`

Replace the user/activity/date uniqueness rule with occurrence-based uniqueness for scheduled runs. Preserve support for ad hoc runs without a daily-plan item.

#### `activity_records`

Add nullable `activity_variant_id` and validate `scope = "variant"` when present. Existing activity and day scopes remain valid.

#### `activity_workspaces`

Generalize workspace identity so an activity may have one base workspace and optional variant overlays. Enforce one active base workspace per activity and one active overlay per variant.

#### `conversations`

Generalize conversation scope:

- Add `scope_type` with `activity` and `global` values.
- Make `activity_id` nullable for the single global user conversation.
- Preserve one activity conversation per user/activity.
- Enforce one global conversation per user.

#### `agent_jobs`

Allow global jobs without an activity ID and add an explicit context/scope type. Existing activity jobs remain unchanged in behavior.

### 11.3 Migration requirements

- Generate and inspect a checked-in D1 migration.
- Backfill every existing routine item as a one-step daily schedule pattern at the same position and duration.
- Preserve today's ordering, completion, skip state, conversations, workspaces, records, and runs.
- Backfill stable occurrence keys for existing daily-plan items.
- Do not infer variants from titles during migration.
- Do not rewrite historical activity titles.
- Keep compatibility reads only for the duration of the migration; remove dual-write paths before marking the work complete.
- Run representative query-plan checks before adding non-unique indexes; add indexes from actual lookup patterns.

## 12. Application APIs

Prefer narrow endpoints and shared server-side validators over whole-day replacement.

Required capability surfaces:

- Read activity definitions and variants.
- Create/update/archive an activity variant.
- Read schedule patterns and upcoming preview.
- Create/update/archive a pattern through validated user input.
- Resolve one date idempotently.
- Apply one occurrence override.
- Create/read/confirm/revise/dismiss a schedule proposal.
- Open/read/send the global Luna conversation.

All writes require:

- Signed-in user ownership.
- Request validation and bounded strings/arrays/numbers.
- Idempotency where retried agent or completion work is possible.
- Base revision or equivalent optimistic concurrency for pattern/proposal changes.
- Durable provenance.
- A structured error that the UI can present without losing the draft.

Deprecate the current whole-day client PUT path after equivalent narrow operations cover add, edit, reorder, complete, skip, remove, and duration changes. In particular, today's occurrence edits must stop upserting durable activity definitions.

## 13. Implementation phases

### Phase 1: Pure scheduling model and validators

- Add TypeScript model types and runtime validators for cadence, advancement, patterns, steps, proposals, and occurrence actions.
- Build a pure date-resolution module using local-date strings and explicit timezone inputs.
- Add table-driven tests for one-step recurrence, interval cadence, weekday cadence, cross-activity sequences, same-activity variant sequences, anchors, skips, and idempotency.

Exit condition: the scheduling language can resolve all acceptance fixtures without UI, D1, or Luna.

### Phase 2: D1 migration and deterministic daily resolution

- Add schema and migration.
- Backfill current routine items to one-step patterns.
- Replace activity/date run uniqueness with occurrence identity.
- Resolve daily occurrences from patterns.
- Separate occurrence edits from activity-definition edits.
- Add narrow occurrence APIs and retain existing user state.

Exit condition: existing users see the same current routine, while test users can create and resolve multi-step patterns without Luna.

### Phase 3: Variants and workspace context

- Add activity-variant CRUD.
- Display resolved variant labels in collapsed and expanded headers.
- Include occurrence and variant in activity Luna context.
- Add variant-scoped records and workspace overlays.
- Ensure historical snapshots remain stable after variant edits.

Exit condition: one activity can rotate variants and render the correct operational UI/history for the selected occurrence.

### Phase 4: Manual schedule UI

- Add compact recurrence controls to Add Activity.
- Add the sequence editor and upcoming preview.
- Add Manage Schedule.
- Add daily move/substitute/scope controls.
- Preserve mobile spacing, touch targets, shared headers, and hold-to-drag behavior.

Exit condition: every scheduling feature works without Luna.

### Phase 5: Site-wide Luna and proposals

- Add the global conversation scope and app-shell entry point.
- Add global asynchronous jobs and bridge context.
- Extend the Luna envelope with schedule proposals, clarification, and immediate occurrence actions.
- Add proposal cards with confirm, revise, and dismiss flows.
- Connect `Describe it to Luna` from Add Activity.
- Route schedule intent from activity chat through the same service.

Exit condition: Luna can clarify and safely implement natural-language schedule requests without raw database access or hidden changes.

### Phase 6: Integration, cleanup, and production rollout

- Remove obsolete whole-day and dual-write behavior.
- Update `PRODUCT_SPEC.md`, `DESIGN_SYSTEM.md`, and `AGENTS.md` with the final contract.
- Update the smart-flow testing guide with global Luna and schedule scenarios.
- Run migrations, tests, lint, build, production deployment, and focused signed-in verification.
- Confirm the Hermes bridge remains isolated and retries remain idempotent.

Exit condition: production and local behavior agree, existing user data is preserved, and every acceptance scenario passes.

## 14. Test matrix

At minimum, automated and focused integration coverage must include:

### Resolution

- Daily one-step pattern.
- Selected weekdays across a week boundary.
- Every-two-days pattern across month and year boundaries.
- Two-activity calendar sequence.
- Four-variant weekday sequence.
- Completion sequence where skip does not advance.
- Completion sequence where skip advances.
- Duplicate GET and duplicate completion requests.
- Pattern effective dates and end dates.
- Two occurrences of the same activity on one date.

### Editing

- Today-only duration, variant, label, order, and date movement.
- This-and-future pattern edit.
- Stale proposal and stale pattern revision rejection.
- Moving onto a date that already contains the same activity.
- Renaming a variant without changing historical snapshots.
- Editing today's display without renaming the durable activity.

### Luna

- Global message is durably visible before processing.
- Ambiguous request produces one useful clarification and no mutation.
- Recurring request produces a previewed proposal and no pre-confirmation mutation.
- Confirm applies exactly once.
- Dismiss applies nothing.
- Clear one-day request uses only an allowlisted occurrence action.
- Cross-activity request resolves only owned activity IDs.
- Bridge retry does not duplicate patterns, steps, occurrences, messages, or audit events.

### UX

- Variant is visible from Today and expanded view on desktop and mobile.
- Long activity plus variant titles remain legible.
- Simple schedules do not look like advanced sequence builders.
- Pending global Luna work, questions, and proposals survive reload.
- Schedule UI remains usable with Timeline on and off.
- Keyboard, screen-reader labels, touch targets, and reduced-motion behavior are correct.

## 15. Acceptance scenarios

These scenarios must pass through the universal model without special-case activity code:

1. Create Lift every other day. Verify future dates and anchor behavior.
2. Create Lift on Monday, Wednesday, and Friday.
3. Alternate existing Lift and Cardio activities on weekdays. Verify weekend pause and Monday continuation according to the selected policy.
4. Create one Gym activity with Legs, Core, Push, and Pull variants. Rotate them Monday, Wednesday, and Friday and display the selected variant from Today.
5. Create separate Leg Day, Push Day, and Pull Day activities and place them in one sequence.
6. Create one Face Mask activity with Red light and Green light variants and alternate them.
7. Ask global Luna to create each of scenarios 3 through 6. Verify clarification, proposal preview, confirmation, and resulting deterministic schedule.
8. Ask activity Luna, `Move this to next Tuesday.` Verify one occurrence moves without changing the recurring pattern.
9. Ask, `Move all future sessions to Tuesdays.` Verify Luna proposes a recurring change rather than applying a one-day move.
10. Skip and complete sessions under both advancement policies and verify the next selected step.
11. Rename today's displayed session without changing the activity definition or historical records.
12. Use the same activity twice on one date and record two independent runs.

## 16. Non-goals for the first release

- Calendar-provider synchronization.
- Arbitrary cron syntax or model-generated scheduling code.
- Unsolicited schedule optimization.
- Health-program recommendations without an explicit user request.
- Monthly rules, holidays, geofenced triggers, or dependency graphs.
- Automatic conversion of existing specific activity titles into variants.
- Mandatory activity grouping/program rollups.
- Replacing the controlled component catalog with generated UI.

## 17. Completion checklist

Mark an item complete only after implementation and verification, not when code is merely drafted.

- [x] Pure scheduling language and validators implemented.
- [x] Cadence and sequence resolver fully tested.
- [x] D1 migration generated, inspected, and applied locally.
- [x] Existing routine preserved as one-step patterns.
- [x] Daily occurrence identity supports duplicate activities per date.
- [x] Today edits no longer overwrite durable activity definitions.
- [x] Activity variants and variant-scoped records implemented.
- [x] Variant-aware shared/overlay workspaces implemented.
- [x] Derived occurrence titles implemented responsively.
- [x] Manual simple schedule UI implemented.
- [x] Manual sequence editor and upcoming preview implemented.
- [x] Manage Schedule implemented.
- [x] Narrow occurrence mutation APIs replace whole-day writes.
- [x] Global Luna conversation and app-shell entry implemented.
- [x] Durable clarification and proposal lifecycle implemented.
- [x] Typed schedule and occurrence actions implemented and audited.
- [x] Add Activity can hand a scheduling request to global Luna.
- [x] Activity Luna can route schedule requests through the same service.
- [x] Product, design-system, agent, and smart-flow docs updated.
- [x] Full automated test suite passes.
- [x] Lint and production build pass.
- [x] Production migration and deployment complete.
- [x] Focused desktop/mobile production verification passes.
