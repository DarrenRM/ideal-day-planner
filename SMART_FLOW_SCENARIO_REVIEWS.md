# Smart-flow scenario reviews

> Status: reviewed and implemented through the reusable architecture in `SMART_FLOW_IMPLEMENTATION_PLAN.md` on 2026-08-21. The walkthroughs preserve the pre-change findings so future regressions can be compared against them.

## Purpose

This is the living casebook for reviewing realistic Ideal Day interactions before or during manual testing. It complements `SMART_FLOW_USER_TESTING.md`: that document defines how to behave as a tester, while this document captures detailed examples, expected product behavior, current behavior, gaps, and reusable design conclusions.

The goal is to evaluate the whole interaction—not merely whether Luna replied or a component rendered. A successful scenario must preserve the user's meaning across conversation, research, durable activity knowledge, today's state, recurrence, history, and future presentation.

## Reusable review method

Use this process whenever the user supplies an example message or workflow.

### 1. Establish the starting state

Record:

- The activity and its existing purpose.
- Existing products, devices, routines, history, components, variants, and schedule rules.
- Today's occurrence and completion state.
- Whether the message is sent inside an activity or through site-wide Luna.

Inspect both the persisted state and the rendered UI when possible. Do not assume the current UI accurately represents the underlying records.

### 2. Decompose the user's message

Identify every independent meaning in the message. Common facets include:

- A newly named product or device.
- A fact or preference that should persist.
- Something that happened today.
- A correction to existing information.
- A request for research.
- A routine or protocol change.
- A one-day schedule change.
- A recurring schedule rule.
- A new activity variant.
- An ambiguity that genuinely blocks safe action.

Do not force a multi-intent message down one exclusive path. One message may need activity filing, research, a dated event, and a schedule proposal together.

### 3. Decide the correct scope for each meaning

Classify each extracted fact or action as one of:

- **Canonical activity knowledge:** persists across all days and variants unless overridden.
- **Variant knowledge:** appears only for one named form of the activity.
- **Recurring activity step:** belongs inside the activity but is due only under a deterministic rule.
- **Today-specific state:** happened or applies only on one date.
- **Whole-activity schedule:** determines when the activity or variant appears.
- **Conversation only:** useful answer that should not alter durable state.

Use this rule for day-to-day variation:

1. Use a separate activity when it is genuinely a separate session or context.
2. Use an activity variant when the whole session meaningfully changes in title, duration, plan, or workspace.
3. Use a recurring activity step when one action is added to an otherwise stable routine on certain days.

### 4. Walk through the ideal interaction

Describe the intended sequence from the user's perspective:

1. Immediate save and conversational acknowledgment.
2. Visible work state when research or durable organization continues.
3. Any research and source reconciliation.
4. At most one clarification when ambiguity blocks a correct result.
5. Durable writes and their scopes.
6. Any proposal and confirmation required before future changes apply.
7. The final activity workspace and home-row presentation.
8. What happens after collapse, refresh, completion, and future-day resolution.

Luna must not claim that a change is finished before its durable write succeeds. A recurring change should be presented for confirmation rather than silently applied.

### 5. Trace the current implementation

Review the actual message routing, Luna instructions, validators, persistence, schedule model, workspace composition, component renderer, ordering, and run/history behavior. Separate:

- Behavior guaranteed by deterministic code.
- Behavior requested in Luna's instructions but still model-dependent.
- Behavior the current data model cannot represent.
- Behavior that is technically representable but produces a poor UX.

### 6. Evaluate the resulting UX

Specify what should appear:

- On the collapsed activity row on ordinary and special days.
- In the expanded workspace, in order.
- In conversation while work is pending and after it completes.
- In history, adherence, and next-due views.
- On future occurrences and variants.

Check for duplication, irrelevant controls, oversized identity cards, misleading empty circles, conflicting streak meanings, stale completed-run snapshots, and unnecessary questions.

### 7. Give a verdict and test contract

Finish each review with:

- **Verdict:** works, partly works, or requires changes.
- **What is already good.**
- **What will probably happen now.**
- **Required improvements**, prioritized by correctness before polish.
- **Manual test contract:** observable results that distinguish success from failure.

## Scenario 1 — Add a weekly grooming roller to Hair Routine

### Example message

Sent inside the existing **Hair Routine** activity:

> Hey, I bought this https://kestrelgrooming.example/products/beard-grooming-roller and used it today. I plan to use it once a week as part of my hair routine.

### Starting state reviewed on 2026-08-21

- Hair Routine is a five-minute daily activity with no variants.
- Its current workspace contains:
  1. An automatic Hair Routine activity streak.
  2. A Product card for Lumen Lab LL-01.
  3. An LL-01 daily scalp-application protocol.
  4. Pinned Lumen Lab resources.
- Today's Hair Routine occurrence is already complete.
- The linked Kestrel Grooming page describes a replaceable-head beard grooming roller with fine needles. Its manufacturer directions are for beard/face use twice weekly, with cleaning after every session and approximate monthly head replacement.

### Meanings contained in the message

| Meaning | Correct scope |
| --- | --- |
| Kestrel Grooming Beard Roller exists in this routine | Canonical activity knowledge; Device record |
| The user used it today | Today-specific usage event attached to Hair Routine |
| The user prefers once-weekly use | Recurring activity-step rule anchored to today |
| The supplied URL should be inspected | Research request and pinned source |
| The manufacturer describes beard/face use, while the existing activity is scalp-oriented | One meaningful clarification |

### Ideal Luna interaction

1. Save the message immediately and acknowledge all intended work without claiming it is already complete.
2. Show a visible workspace work state while inspecting the linked source and organizing the activity.
3. Add the device identity and today's usage event without waiting for clarification.
4. Respect the user's once-weekly preference even though the manufacturer page describes twice-weekly beard use.
5. Ask one concise question: whether the roller is being used on the scalp or beard. Do not copy beard-specific directions into a scalp protocol without confirmation.
6. Prepare a recurring-step proposal anchored to today and show the human-visible result—for example, weekly on Fridays—with Confirm, Revise, and Dismiss controls.
7. Do not mark or reopen the whole Hair Routine merely because one substep was reported complete.

Suggested initial acknowledgment:

> Got it—I’ll add the grooming roller, count today’s use, and check the linked directions. I’ll show you the weekly change before it affects future days.

Suggested clarification after research:

> Are you using it on your scalp or your beard? The linked directions are for beard and face, so I want the routine to match how you’re actually using it.

### Ideal activity presentation

#### Ordinary day row

- **Hair Routine**
- No grooming-roller label when it is not due.

#### Due-day row

- **Hair Routine**
- Secondary context such as **Grooming roller today**.

#### Expanded workspace order

1. **Hair Routine streak** — overall activity completion, not roller adherence.
2. **Today's routine** — daily LL-01 steps plus a clearly grouped weekly roller step only when due.
3. **Routine kit** — compact Product and Device identities for LL-01 and Kestrel Grooming Beard Roller.
4. **Weekly roller tracker** — last use, next due date, and week/session-based progress rather than seven daily circles.
5. **Pinned resources** — one combined section, always last.

No timer or countdown should be added unless the user requests one or a confirmed timed protocol makes it genuinely useful.

### What the current implementation handles well

- Product records already choose the binary Product or Device kind.
- Luna is instructed to create one identity record per named product or device.
- Luna is instructed to keep one shared protocol, one shared adherence area, and one combined resources area rather than duplicating all supporting UI per device.
- Streaks are ordered first and resources last.
- The activity UI can display and confirm schedule proposals.
- Activity variants and variant workspace overlays exist for cases where the whole form of an activity changes.

### Current implementation gaps

#### 1. The exact recurrence phrase misses schedule routing

The activity message router recognizes examples such as “every week,” weekday names, “alternate,” and “rotate.” It does not recognize “once a week” or the standalone word “weekly.” This exact message therefore remains an activity-only job.

Expected consequence: Luna can update the activity workspace, but no weekly schedule proposal is produced.

#### 2. Activity filing and schedule compilation are mutually exclusive

Even when schedule intent is recognized, the entire message is routed as a global schedule job. Global jobs cannot emit activity record or workspace actions. A message containing both a new device and a recurrence rule therefore loses one side of its meaning regardless of which route wins.

The message pipeline must support multiple coordinated facets: activity filing should always process durable activity knowledge, while scheduling should additionally process recurring intent.

#### 3. Whole-activity scheduling is not recurring-step scheduling

The schedule model can represent activities, variants, and sequences. It cannot directly represent one weekly step inside a daily activity.

Possible but poor approximations are:

- A seven-step daily sequence with six ordinary Hair Routine steps and one grooming-roller variant.
- A second weekly Hair Routine pattern that creates a duplicate Hair Routine occurrence on the due day.

The correct universal concept is a deterministic recurring activity step with cadence, anchor date, completion history, and next-due state.

#### 4. Today's product use has no canonical event type

Luna may represent “used it today” as history, adherence, or a protocol step completion. None is guaranteed, and none cleanly separates the roller event from completion of the entire Hair Routine.

A canonical usage event should drive history, adherence, and next-due calculation rather than asking Luna to duplicate the same fact across several records.

#### 5. Current adherence cannot express weekly success well

The current adherence record is a flat list of dated completed states. It does not know target cadence or due dates. Rendering seven daily circles for a weekly action would make six normal days look like failures.

The automatic Hair Routine streak also represents whole-activity completion. A new adherence component currently replaces that automatic streak instead of naturally creating an independent roller tracker.

#### 6. Post-completion information can diverge from the run snapshot

Completing an activity snapshots the current record versions into the activity run. Because today's Hair Routine is already complete, adding the roller afterward can update durable activity records without updating the completed run snapshot. The activity needs a supported way to append or amend dated facts after completion without changing its completion status.

#### 7. The shared protocol lacks cadence-aware grouping

A shared protocol is correct, but its current ordered-step shape cannot distinguish daily LL-01 steps from weekly roller steps. Without cadence-aware rendering, the roller may appear every day or the protocol may become a confusing flat list.

### Likely behavior if tested now

1. The message saves and Luna acknowledges it.
2. The URL triggers research and a workspace-refresh pass.
3. Luna will probably add a second Device card and update the shared protocol and resources.
4. She may add a dated history or adherence entry, but today's use is not guaranteed to receive a consistent representation.
5. No weekly proposal, variant, next-due state, or due-day home label is expected from the phrase “once a week.”
6. There is a model-dependent risk that manufacturer twice-weekly directions are mixed with the user's once-weekly preference, or that beard-specific directions are placed into the scalp routine before clarification.

### Verdict

**Partly works.** Multi-device identity, web research, and shared workspace composition are substantially in place. Recurring substeps, coordinated multi-intent processing, and dated usage events are not yet represented end to end. This scenario should not be considered complete until those gaps are addressed.

### Recommended improvements

#### Correctness first

1. Introduce coordinated multi-intent processing instead of exclusive activity-versus-schedule routing.
2. Add deterministic recurring activity steps and due-state resolution.
3. Add canonical usage events linked to an activity, item/device, occurrence/date, and source message.
4. Support post-completion amendments to a run's dated facts without changing completion.
5. Add conflict handling that preserves the user's chosen cadence while distinguishing manufacturer guidance.

#### UX and presentation

1. Group multiple products and devices into a compact Routine kit.
2. Render protocols by cadence or generate a due-aware Today's routine.
3. Give weekly actions a session/week-based tracker with last-used and next-due information.
4. Add due-day secondary labels without permanently renaming the activity.

### Manual test contract

This scenario passes only if all of the following are observable:

- An immediate, natural acknowledgment appears.
- A visible work state remains while research and organization continue.
- LL-01 remains a Product and the grooming roller appears once as a Device.
- There is still only one shared routine/protocol and one combined resource area.
- The user's once-weekly preference is not silently replaced by the manufacturer's twice-weekly guidance.
- Luna asks whether use is on scalp or beard before saving location-specific instructions.
- Today's roller use is recorded independently from whole-activity completion.
- A weekly change is shown for confirmation and produces a clear next-due date after confirmation.
- Ordinary Hair Routine days do not show the roller as due.
- The due-day row provides useful secondary context.
- Collapsing, reopening, and refreshing produce no duplicates or lost state.
- The already-completed Hair Routine stays complete and its dated history includes the late-added use.

## Scenario 2 — Turn Lift into a seven-day rotating program

### Example message

Sent inside the existing **Lift** activity:

> This is a great start. I want to make the following changes: I want to have something different each day of the week and rotate: legs, chest, back, core, triceps, biceps, balance. We have two exercises for leg day right now, and we should have a minimum of three for each that are slight variations. You should provide at least two for each that use kettlebells or dumbbells. I'll pick the third based on what equipment is at the gym and let you know what I did; you can track that as the third one until I change it. You'll need to supply the rest of the days besides legs.

### Starting state reviewed on 2026-08-21

- Lift is a 35-minute daily activity using a one-step calendar-advancing schedule.
- It has no variants.
- Its base workspace contains one workout record, **Return-to-lifting legs day**, with:
  1. Walking lunges — “Include in this legs day.”
  2. Quad-focused machine — “Use the quad machine available at the gym.”
- Neither exercise has targets, loads, repetitions, sets, or prior-performance history.
- The conversation establishes only that the user is getting back into a routine and wants to begin with legs. Luna previously asked for the exact quad-machine name, but that question is unanswered.
- There is no durable equipment profile. The workspace does not distinguish equipment the user owns, equipment reliably available at a gym, and equipment merely encountered once.
- The only stored Lift run visible in the production data is a skipped occurrence on 2026-08-20.

### Relevant programming guidance

The product should not pretend there is one universally correct split. The 2026 ACSM resistance-training guidance emphasizes consistency, individualization around goals, enjoyment, and safety, and training all major muscle groups at least twice per week rather than pursuing a needlessly complex plan. It also notes that load and volume should change with goals and that free weights, machines, bands, bodyweight, and home programs can all be effective. The U.S. Physical Activity Guidelines likewise recommend muscle-strengthening work for all major muscle groups on at least two days per week.

Sources:

- [ACSM 2026 resistance-training guidance](https://acsm.org/resistance-training-guidelines-update-2026/)
- [ACSM position-stand overview](https://acsm.org/science-spotlight-acsm-releases-new-position-stand-on-resistance-training/)
- [Physical Activity Guidelines for Americans](https://health.gov/paguidelines/second-edition/pdf/Physical_Activity_Guidelines_2nd_edition.pdf)

Product implication: Luna should support the requested seven-day rotation, but she should not silently treat it as an evidence-based default for every new lifter. A first-time setup must learn enough about frequency, goals, experience, reliable equipment, and physical limitations to recommend an appropriate structure. If a requested structure appears mismatched with the stated goal or recovery capacity, Luna should briefly surface the tradeoff without becoming obstructive or impersonating a trainer or clinician.

### Meanings contained in the message

| Meaning | Correct scope |
| --- | --- |
| Replace the single legs-only form with seven named forms | Seven Lift activity variants |
| Show one form on each day of the week | Whole-activity daily calendar sequence |
| Keep and improve the existing leg day | Legs-variant workout knowledge |
| Supply the six missing days | Variant-specific workout generation |
| Start each day with at least three exercise positions | Variant-specific workout structure |
| At least two exercises per day should use kettlebells or dumbbells | Shared equipment constraint applied to generated variants |
| The third exercise is chosen from available gym equipment | An unresolved per-variant exercise choice, later resolved from a session |
| Keep using the chosen third exercise until changed | Durable variant preference learned from actual use |
| Track available equipment as it is learned | Canonical activity context, with location and provenance where known |
| “Each day of the week” versus “rotate” | Calendar advancement is the best default here, but the proposal must make that interpretation visible |

This is a genuine multi-intent message. It contains scheduling, variant creation, program generation, migration of existing content, equipment constraints, and a future learning rule. It must not be reduced to either “change the schedule” or “update the workout card.”

### Ideal Luna interaction

1. Save the message immediately and acknowledge the whole request in ordinary language.
2. Open a visible work state above the conversation, such as **Building your seven-day Lift rotation**, while the program and schedule proposal are prepared.
3. Reuse the existing leg-day knowledge rather than starting over.
4. Interpret the requested order as Legs → Chest → Back → Core → Triceps → Biceps → Balance, advancing with the calendar because the user explicitly said each day of the week.
5. Ask one concise, high-value setup question before choosing the full exercise program: the user's primary goal and any injuries or movements to avoid. The existing “getting back into a routine” statement supplies experience context, while the new message supplies frequency and an equipment constraint.
6. Prepare a human-readable seven-day proposal showing the actual weekday-to-variant mapping. Recurring schedule changes require confirmation.
7. After confirmation, create the variants and their variant-scoped workspaces, migrate the current legs workout into Legs, and populate the other six workouts.
8. Do not claim the program is finished until every variant workspace has passed validation and can be reopened independently.

Suggested acknowledgment:

> Great—I’ll turn Lift into a seven-day rotation, keep your current leg work, give each day two kettlebell or dumbbell exercises, and leave one gym-choice spot that I can learn from what you log. I’ll show you the weekly rotation before it changes your schedule. Before I choose the exercises, what is your main goal right now, and are there any injuries or movements I should work around?

This acknowledgment does four jobs without exposing implementation details: it reflects the requested structure, explains what will be learned later, sets the expectation of confirmation, and asks only for information that materially affects the plan.

### Ideal scheduling behavior

This scenario is a strong fit for activity variants rather than seven separate activities:

- Parent activity: **Lift**
- Variants: **Legs**, **Chest**, **Back**, **Core**, **Triceps**, **Biceps**, **Balance**
- Cadence: daily
- Advancement: calendar
- Sequence: the seven variants in the user's stated order
- Confirmation preview: explicit weekday labels based on the chosen effective date

The preview should make the interpretation reversible:

> Starting Friday: Fri Legs · Sat Chest · Sun Back · Mon Core · Tue Triceps · Wed Biceps · Thu Balance

If the user intended “advance only when I complete a Lift session,” that is a different, completion-advancing sequence. The schedule proposal already gives the user a natural place to catch that difference; Luna does not need to ask a second chat question unless the wording lacks the “each day of the week” signal.

### Ideal workout migration and generation

#### Legs

The current content should become the Legs variant rather than remain at the activity base layer.

- Walking lunges remain.
- The quad-focused machine remains as the user-known gym choice, even though its exact name is unresolved.
- Add one suitable kettlebell or dumbbell exercise so Legs has at least two exercises satisfying the equipment constraint.
- Do not discard the machine merely to make the record cosmetically uniform.

#### Chest, Back, Core, Triceps, Biceps, and Balance

Each variant should initially contain exactly what the user requested:

- Two named kettlebell or dumbbell exercises selected after goal and limitation context is known.
- One clearly designed **Choose at the gym** position.

The open position must not render as a fake exercise named “TBD,” a disabled set logger, or a blank workout card. It should be a purposeful choice affordance. When the user later says, for example, “I used the cable row today,” Luna should:

1. Record cable row as today's actual third exercise.
2. Fill the open third position for the current variant only.
3. Keep cable row there on the next occurrence of that variant.
4. Add the encountered equipment to Lift's equipment context with the correct gym location and message provenance.
5. Replace or revise that choice later when the user asks, without adding a duplicate fourth item.

### Equipment knowledge and presentation

Equipment is important agent context, but it should not dominate every workout.

The durable model should distinguish:

- Equipment reliably available to the user.
- Location, when known: home, a named gym, travel, or unspecified.
- Equipment inferred from an exercise versus explicitly confirmed by the user.
- Last confirmation date and source message.
- Any relevant range or limitation, such as available dumbbell weights, only when learned.

The statement that two exercises should use kettlebells or dumbbells is enough to treat those equipment families as allowed constraints. It is not enough to infer where they are located or which weights are available.

In the expanded UI, equipment should be a compact supporting section near the bottom—not a large identity card above the workout. It could remain collapsed as **Equipment available** until the user needs to inspect or edit it. Luna should always receive the equipment context even when the component is visually collapsed.

### Ideal activity presentation

#### Collapsed row

Keep the durable activity identity stable and expose today's form as secondary context:

- **Lift**
- **Legs** or **Leg day** as a subtitle or contextual label
- 35 minutes and the Training category in their normal positions

Prefer this over permanently renaming the activity to “Lift — Legs.” The parent name remains recognizable in the list, while the day-specific meaning is still visible before opening it.

#### Expanded workspace order

1. **Lift streak or adherence** — overall activity consistency, if enabled.
2. **Today's workout** — the current variant only, with targets, last performance, set logging, and the gym-choice position.
3. **Recent progress** — scoped to the current variant by default, with an option to view all Lift history.
4. **Equipment available** — compact and usually collapsed.
5. **Pinned resources** — always last, if any exist.

Conversation remains one shared Lift thread unless the user explicitly needs per-variant notes. Luna receives the active variant in context so that “I used the leg press” cannot accidentally update Chest or Back.

### What the current implementation handles well

- The universal schedule model can represent a seven-step same-activity rotation.
- Calendar and completion advancement are both supported, so the product is not hard-coded to this example.
- Activity variants have their own records and workspace overlays.
- The schedule proposal system can create variants and replace a recurring pattern only after confirmation.
- The workout component already supports named exercises, targets, previous performance, completed sets, and set logging.
- The current workout record gives Luna useful legs-day material to preserve.
- The production catalog correctly recommends a Workout component for strength sessions instead of reducing the plan to prose.

### Current implementation gaps

#### 1. The message is routed exclusively to schedule compilation

The word “rotate” matches schedule intent. The entire message therefore becomes a `global_message`. Global jobs are explicitly forbidden from emitting activity record or workspace actions.

Expected consequence: Luna may prepare a seven-variant schedule proposal, but she cannot update Legs or build any of the other six workouts from the same message.

#### 2. Confirming variants does not seed variant workspaces

The proposal can create variants and a pattern, but proposed variant IDs do not yet exist when the original activity message is processed. There is no coordinated post-confirmation step that creates a validated workout for every new variant.

Worse, the existing legs workout is activity-scoped. Base workspace content is inherited by variants. If the schedule is confirmed without content migration, Chest, Back, Core, Triceps, Biceps, and Balance can all open showing the same legs workout.

This requires an explicit orchestration phase after proposal confirmation, or a richer proposal contract that can seed records and workspace composition for newly created variants atomically.

#### 3. The workout model cannot represent the purposeful third position

The current workout schema contains only concrete named exercises. Luna's instructions correctly prohibit empty or generic records. The model therefore has no clean representation for “I will choose this exercise at the gym, and then keep using my choice.”

Add a validated open-choice exercise position with:

- Stable position and identifier.
- Selection guidance and allowed equipment context.
- Optional resolved exercise reference.
- Resolution provenance and effective date.
- A replace action rather than append-only behavior.

#### 4. Equipment is neither structured nor reliably available to Luna

The current catalog has no equipment-profile record. Equipment can be buried in workout notes or a generic summary, which makes future exercise selection and location-aware substitutions fragile.

Add a compact activity-level equipment context. The data should be authoritative even if its UI is collapsed or omitted on most days.

#### 5. Existing base content has no safe variant-migration operation

Creating a Legs overlay is not enough if the base workout remains active, because it can continue to leak into other variants. The conversion needs a transactional operation that copies or moves selected base records and workspace components into a named variant, then removes them from the base only after the variant is valid.

#### 6. Program generation lacks a deterministic readiness gate

Luna is prompted to ask useful questions, but there is no application-owned contract saying which facts must be known before generating a multi-day lifting program. A model may generate 21 exercises immediately, ask too many questions, or ask none.

For this existing case, the minimum readiness gate is:

- Frequency or schedule intent: known.
- Reliable equipment constraint: partly known and sufficient for the first two positions.
- Experience state: known as returning.
- Primary goal: missing.
- Injuries, pain, or movements to avoid: missing.

The application should expose the missing fields to Luna and enforce one concise clarification before exercise generation.

#### 7. History and workout identity need variant scoping

Last performance, set history, adherence, and the learned third exercise must resolve against the active variant. Otherwise a chest exercise can appear as “last time” on Back, or one variant's gym choice can overwrite another's.

### Likely behavior if tested now

1. The message saves and is classified as a global schedule request because it contains “rotate.”
2. Luna may acknowledge the schedule and prepare seven variants plus a daily sequence proposal.
3. She cannot modify the current legs workout, generate the other workouts, or create an equipment component in that job.
4. If the proposal is confirmed, the new variants exist but initially have no variant-specific workout overlays.
5. The base **Return-to-lifting legs day** workout can therefore appear under every variant.
6. A later message inside each active variant could build the right workout one at a time, but that is fragmented, slow, and not what the user asked for.
7. There is no clean third-choice position, so Luna may invent a placeholder exercise, omit the third position, or choose all three herself.

### Verdict

**Requires changes before it will work as intended.** The universal scheduling primitives and workout renderer are the correct foundations, but the cross-boundary orchestration is incomplete. This scenario is an excellent test of whether Luna can turn one natural-language request into a confirmed schedule plus correctly scoped activity content without leaking base records across variants.

### Recommended improvements

#### Correctness first

1. Replace exclusive activity-versus-schedule routing with coordinated intent facets.
2. Add a post-confirmation orchestration contract for records and workspaces belonging to newly created variants.
3. Add a transactional base-to-variant migration operation.
4. Add open-choice exercise positions and a deterministic resolve/replace action.
5. Add structured equipment context with location, confidence, provenance, and last-confirmed state.
6. Require variant identity on workout mutations and history queries.
7. Add a minimum readiness gate for generated workout programs.

#### UX and presentation

1. Show today's variant as secondary context on the Lift row.
2. Preview the actual weekday mapping before confirmation.
3. Show continuous progress while the seven workspaces are being prepared; do not leave a blank component area.
4. Render the gym-choice position as intentional and useful, not incomplete.
5. Keep equipment compact and low in the workspace while making it fully available to Luna.

### First-time Lift setup

A brand-new Lift activity should not begin with an arbitrary workout card or a long interrogation. The app should combine lightweight structured setup with one conversational clarification when needed.

#### Information to collect

1. **Primary goal:** general strength, muscle growth, returning to exercise, sport support, or another user-defined goal.
2. **Frequency:** how many lifting sessions are realistically available each week.
3. **Experience:** new, returning, or experienced, plus recent baseline when useful.
4. **Reliable equipment and location:** not every machine the gym owns, only what can reasonably be planned around.
5. **Session length:** the practical time budget.
6. **Limitations:** injuries, current pain, medically relevant restrictions, or movements to avoid.
7. **Preferences:** favorite or disliked movements and whether variety or repetition is more motivating.

The Add Activity UI is the best place for deterministic facts such as frequency, session length, and broad equipment access. Luna is best used for a freeform goal, unusual rotation, tradeoff explanation, and at most one necessary clarification. Users should be able to skip optional detail and start small.

#### Recommended flow

1. The user creates **Lift**.
2. A compact setup asks for realistic weekly frequency, available time, and broad equipment access.
3. Luna asks one natural follow-up combining the most important missing facts, usually goal plus limitations.
4. Luna offers a small number of structures appropriate to that context—for example full-body sessions, an upper/lower rotation, or a user-defined split—without presenting one as universally best.
5. The user confirms the structure and sees the actual upcoming sequence.
6. Luna builds only the first useful version, including named exercises and logging controls. It can evolve from real sessions rather than pretending to know every machine and load in advance.

For a new or returning user, the system should not default to seven consecutive isolated-body-part days. Current guidance favors a sustainable plan that reaches all major muscle groups regularly, and the plan should be individualized. A seven-day rotation remains valid as a user choice, but Luna should make its frequency and recovery implications visible before confirmation.

### Manual test contract

This scenario passes only if all of the following are observable:

- The message receives an immediate acknowledgment covering both the rotation and workout changes.
- Luna asks no more than one concise setup question before generating the program.
- A visible work state remains while the schedule and variant workspaces are prepared.
- The user sees an explicit seven-day weekday mapping before any recurring change applies.
- Confirming the proposal creates exactly seven Lift variants and one recurring sequence.
- Legs preserves walking lunges and the quad-focused machine and gains enough equipment-compatible work to satisfy the user's constraint.
- Every non-leg variant contains two real kettlebell or dumbbell exercises and one intentional gym-choice position.
- No non-leg variant inherits or displays the legs workout.
- The collapsed row shows today's Lift form before the activity is opened.
- Logging a third exercise fills only the active variant's open position and persists to its next occurrence.
- The learned equipment is available to Luna with correct provenance and does not create a large redundant card near the top.
- Set history and last-performance values remain isolated by variant.
- Collapsing, reopening, refreshing, and moving to another day produce no duplicate variants, workouts, exercises, or schedule patterns.

## Scenario 3 — Add a multi-mode face mask

### Example flow

The user presses **Add Activity**, creates **Face Mask**, and supplies the official product link. Research shows that the device has multiple light modes.

Review these branches separately:

1. The user supplies only the product link.
2. The user says the whole Face Mask activity should happen every other day.
3. The user says different light modes should alternate on Face Mask days.
4. The user wants to configure the same result manually rather than through Luna.

### Starting Add Activity flow reviewed on 2026-08-21

The production Add Activity form currently contains:

- Name.
- Minutes.
- Category.
- Schedule choices for no recurrence, every day, selected weekdays, every N days, a sequence, or a scheduling description for Luna.
- Include today.

**Every N days** already defaults to two, so the deterministic UI can create an every-other-day Face Mask activity without Luna.

The form has no product URL or general activity-description field. **Describe it to Luna** is specifically a scheduling handoff, with an example about alternating activities. Creating the activity also queues a one-time Luna setup assessment, but the newly added activity is not automatically opened. For device-based care with no product or protocol details, Luna is instructed to ask which device and protocol are used.

### Meanings that must remain separate

| Meaning | Correct scope |
| --- | --- |
| The linked face mask is the device being used | Canonical activity Device record |
| Manufacturer-supported light modes | Canonical researched device capabilities |
| The user's treatment goal or preferred mode | Canonical user preference or variant knowledge |
| Use Face Mask every other day | Whole-activity cadence |
| Alternate red and green on successive sessions | Activity-variant sequence |
| Use one mode most days and choose another occasionally | Session choice, not necessarily a recurring sequence |
| Mode-specific duration or protocol | Variant-scoped protocol when it materially differs |
| What was actually used today | Today-specific session event |

The most important distinction is:

> A device having multiple modes is a capability, not evidence that the user wants a rotation.

Likewise, “every other day” determines when Face Mask appears. It does not say which mode should be used.

### Should Luna suggest a rotation?

**Conditionally, but she should not lead with that assumption.**

If research finds multiple materially different modes and the user has not named a mode or goal, Luna should ask one useful question such as:

> Which mode are you planning to use, or would you like different modes on different days?

An even better question when manufacturer documentation ties modes to different purposes is:

> What are you hoping to use the mask for? It has several light modes, and that will help me set up the right one—or a rotation if you want one.

This is preferable to “Would you like me to make a rotation?” because it does not steer the user into needless complexity. The answer may reveal that one mode is the obvious default.

Do not ask about rotation when:

- The user has already named one mode.
- The other modes are irrelevant to the user's stated goal.
- The different lights are simultaneous features rather than selectable session modes.
- Manufacturer guidance does not support inventing separate protocols for them.
- A useful single-mode setup can already be made and the additional choice has no immediate value.

### Decision table

| User input | Correct behavior |
| --- | --- |
| Product link only; multiple meaningful modes found | Save the device and supported shared directions, then ask which mode or goal matters. Do not create a rotation yet. |
| “Use this every other day” | Create or propose a two-day whole-activity cadence. Keep the mode question separate. |
| “Use red and green on alternating sessions” | Create Red and Green variants in a two-step sequence. Ask about cadence only if it is unknown. |
| “Every other day, alternating red and green” | Propose one every-two-days sequence whose successive eligible occurrences alternate Red and Green. |
| “Red Monday/Wednesday, green Friday” | Propose an explicit calendar mapping; do not reinterpret it as a simple sequence if the weekday identity matters. |
| “I choose the mode based on how my skin feels” | Keep one Face Mask activity with an in-session mode choice and dated mode logging; do not force a deterministic rotation. |

### When a mode deserves a variant

Use a Face Mask activity variant when the mode changes the session enough that the person should see it before opening the activity. Strong signals include:

- A different title or contextual label is useful on the home row.
- Duration changes.
- The manufacturer's protocol changes.
- The body area, goal, or precautions change.
- The mode follows a recurring sequence.
- History and adherence should be compared by mode.

If mode is merely a setting selected during an otherwise identical session, use a session-mode choice and dated log rather than a full variant. This keeps the universal rule intact: variants represent meaningfully different forms of an activity, not every configurable property of a product.

### Ideal Add Activity flow

The surface should remain progressive rather than exposing product research, variants, and sequence design all at once.

#### 1. Create the basic activity

Keep the existing deterministic fields for name, category, duration, and straightforward recurrence.

Add one optional, general-purpose disclosure:

> **Set this up with Luna**
> Add a product link or describe how you want this activity to work.

This should accept either a URL or natural language. It must not be labeled as scheduling-only. When used, the primary action can become **Add & Set Up**.

#### 2. Open the new activity immediately

After creation, open Face Mask directly and show a visible setup state. The user should not have to find the new row, open it, and repeat the product link while a background setup question is being generated.

Suggested work-state copy:

> **Looking into your face mask**
> Luna is checking its modes and recommended use.

#### 3. Research and save what is already certain

From an authoritative manufacturer source, save:

- One Device identity card.
- Supported shared use directions.
- A pinned official source, last.
- Supported mode capabilities as device facts.

Do not turn every mode into a card, duplicate the device, or invent a personal treatment protocol from marketing claims.

#### 4. Ask only the decision that matters

If mode choice affects the lasting activity, ask one question in conversation. Optional quick replies can keep it lightweight:

- **Use one mode**
- **Rotate modes**
- **Help me decide**

These are not three permanent setup paths. They are simply faster ways to answer the same Luna question.

#### 5. Reveal rotation controls only when selected

If the user chooses a rotation, show a compact proposal rather than a full schedule editor:

- Modes and order.
- Cadence.
- The next few dates with their mode labels.
- Confirm, revise, or dismiss.

The advanced manual sequence editor remains available for someone who wants complete control, but it should not be the default face-mask onboarding experience.

### Ideal presentation after setup

#### Collapsed row

When one mode is selected for today's occurrence:

- **Face Mask**
- Secondary context: **Red light**

On days when mode is chosen at use time, omit the mode subtitle until the user selects or logs it.

#### Expanded workspace order

1. **Face Mask adherence** — if the cadence and completion history make it useful.
2. **Today's session** — today's mode and mode-specific directions.
3. **Device** — one compact identity card for the linked mask.
4. **Mode guide** — only if comparison between supported modes remains useful after setup.
5. **Recent sessions** — dated modes and observations when actual history exists.
6. **Pinned resources** — always last.

A countdown belongs immediately after adherence only when the selected manufacturer protocol has a genuinely fixed exposure time. It should use the mode-specific duration, not the generic activity estimate.

### Manual setup, Luna setup, and chat

The intended answer is **both**, with one underlying model.

#### Manual setup

- Every other day already works through **Every N days → 2**.
- Selected weekdays already work directly.
- A user can enter the advanced sequence editor to create modes, order them, and choose calendar- or completion-based advancement.
- Product research and protocol setup still need the activity conversation because the form has no product input.

#### Luna during Add Activity

- **Describe it to Luna** can currently hand off a scheduling request after the activity is created.
- It should evolve into or sit beside a broader **Set this up with Luna** input so a product link and routine description can be coordinated as part of creation.
- Luna should return a recurring proposal for confirmation rather than applying a multi-day rotation silently.

#### Luna inside the activity

- Pasting only the product link should trigger research and activity workspace updates.
- A later, separate “make this every other day” message can trigger a schedule proposal.
- One message containing both the product link and recurrence should also work; the person should not need to know that setup and scheduling are separate systems.

#### Site-wide Luna

- Site-wide Luna should be able to create Face Mask, ask a needed clarification, and prepare its schedule.
- The same request should also initiate activity-scoped product setup after the activity exists.
- Global scheduling authority should remain narrow, proposal-based, and fully validated.

Manual controls and Luna must converge on the same activity, variant, and schedule records. They must not create parallel “manual Face Mask” and “Luna Face Mask” concepts.

### What the current implementation handles well

- Simple every-other-day recurrence is already deterministic and easy to configure.
- The universal sequence model can represent alternating Face Mask variants on a daily, every-N-days, or weekday cadence.
- Calendar and completion advancement are both available.
- Product-link messages inside an activity trigger research during the workspace-refresh pass.
- Product/device care can create one Device card, a shared protocol, adherence, and pinned manufacturer resources.
- New device-based activities are already expected to ask for product and protocol detail when none is known.
- Recurring Luna changes require a visible proposal and confirmation.

### Current implementation gaps

#### 1. There is nowhere to supply the product during Add Activity

The user can define schedule semantics before creation but cannot supply the most important Face Mask context: the actual device. The activity is created, background setup begins, and the user must later open it and paste the link.

#### 2. The new activity does not automatically open into setup

This makes a guided flow feel disconnected. Luna may prepare a question in the background while the user remains on the list with no obvious next step.

#### 3. “Describe it to Luna” is scheduling-only

The field's label and placeholder encourage scheduling requests. If the user includes the product URL there, the resulting global job cannot emit activity records or workspace actions, so it cannot save the Device or protocol.

#### 4. A combined activity message is split incorrectly

Inside Face Mask, a message containing a product URL plus “every other day” matches schedule intent and becomes a global message. Global messages cannot update activity records. The recurrence may be proposed while the product information is lost.

The reverse path also fails: an activity-only product message can build the workspace but cannot create the recurrence. The user currently gets the best result only by sending two separate messages in the correct order.

#### 5. Multi-mode capability has no explicit activity concept

The product record can hold concise facts, and variants can represent different sessions, but there is no canonical mode-capability or session-mode choice record. Luna may therefore create variants too eagerly, bury modes in protocol prose, or create multiple product cards for one physical device.

#### 6. Automatic setup cannot coordinate with a later schedule proposal

The one-time activity setup job can ask a useful device question, but it cannot suspend, resume, and coordinate a pending mode-rotation proposal as one coherent setup experience.

### Likely behavior if tested now

#### Path A — Manual cadence first

1. Add Face Mask with **Every N days = 2**.
2. The every-other-day pattern is created correctly.
3. Luna's background setup prepares a device/protocol question.
4. Open Face Mask and paste the product link.
5. Luna researches it and will probably create the Device, protocol, and resource components.

This is the strongest current path, although it is disconnected and requires the user to know the order.

#### Path B — Product first, schedule second

1. Add Face Mask.
2. Open it and paste the product link.
3. Wait for research and workspace construction.
4. Send a second message asking for every other day or a mode rotation.
5. Confirm the resulting schedule proposal.

This should mostly work, but it is more conversational labor than necessary.

#### Path C — Product and recurrence in one message

The schedule classifier wins. A proposal may be created, but the product URL and protocol are not reliably filed into Face Mask.

#### Path D — Product link inside “Describe it to Luna”

The activity is created with no recurring pattern and a site-wide Luna job is queued. Scheduling may be handled, but product research and workspace setup cannot be completed by that job.

#### Path E — Product link only

Luna should research and save the device. She may ask which mode or goal matters, but there is no deterministic rule ensuring she suggests a rotation only when appropriate. No schedule change should occur without an explicit user preference.

### Is this too complicated?

**The underlying capability is moderately complex; the user experience does not need to be.**

The UI only needs three progressive states:

1. **One mode:** ordinary Face Mask activity.
2. **Simple cadence:** ordinary activity with every-N-days or weekday recurrence.
3. **Mode rotation:** variants plus a confirmed sequence, revealed only when the user asks for or accepts it.

The complexity should live in coordinated intent handling and validated schedule composition. It should not appear as a large up-front configuration form.

### Verdict

**Simple recurrence works today; the complete intelligent setup only partly works.** Manual every-other-day scheduling is already good. Product research inside the activity is also good in isolation. The missing piece is a unified creation and conversation flow that can process product knowledge and scheduling together, then suggest—not assume—a mode rotation.

### Recommended improvements

#### Correctness first

1. Add coordinated activity and schedule intent processing.
2. Add a general optional setup payload to activity creation and deliver it to the new activity conversation.
3. Auto-open a newly created activity when setup work or a setup question is pending.
4. Add a canonical device-mode capability and dated session-mode model.
5. Use variants only when a mode materially changes the session; otherwise use an in-session mode choice.
6. Ensure a proposed mode rotation can seed variant-scoped protocols after confirmation.

#### UX and interaction

1. Add an optional **Set this up with Luna** disclosure to Add Activity.
2. Keep simple recurrence controls deterministic and immediately understandable.
3. Use one contextual Luna question rather than automatically proposing every discovered capability.
4. Offer quick replies for one mode, a rotation, or help deciding.
5. Preview the next few dates and mode labels before confirmation.

### Manual test contract

This scenario passes only if all of the following are observable:

- The product link can be supplied during or immediately after creation without being repeated.
- A newly added Face Mask opens into a visible setup flow when setup is requested.
- One physical mask becomes exactly one Device record and one Device card.
- Manufacturer modes are saved as capabilities, not treated as user preferences.
- Luna asks at most one useful mode-or-goal question when the answer matters.
- Luna does not suggest or create a rotation when one selected mode already satisfies the user's request.
- Every-other-day recurrence can be configured manually without Luna.
- “Every other day” changes cadence but does not silently invent a mode sequence.
- “Alternate red and green every other day” produces a visible proposal with both cadence and mode order.
- Confirming the proposal creates one Face Mask activity with correctly scoped variants, not duplicate activities or devices.
- Today's row shows the appropriate mode context when one is predetermined.
- Mode-specific protocols and countdown durations do not leak across variants.
- A one-message product-plus-schedule request preserves both meanings.
- Manual setup, activity Luna, and site-wide Luna all produce the same durable model.

## Scenario template

Copy this section for each new example.

### Scenario N — Name

#### Example message or action

#### Starting state

#### Meanings contained in the message

#### Ideal Luna interaction

#### Ideal activity and home presentation

#### What the current implementation handles well

#### Current implementation gaps

#### Likely behavior if tested now

#### Verdict

#### Recommended improvements

#### Manual test contract
