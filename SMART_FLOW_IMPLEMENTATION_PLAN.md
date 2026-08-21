# Smart flow implementation plan

This plan turns the three scenario reviews in `SMART_FLOW_SCENARIO_REVIEWS.md` into one reusable activity model. The app should support a weekly tool inside a daily routine, a rotating multi-day workout, and a researched multi-mode device without adding scenario-specific code.

## Shared model

An activity has four independent layers:

1. **Identity** — durable facts shared by every occurrence, such as products, devices, equipment, goals, and source links.
2. **Variant** — the version selected for a particular occurrence, such as Legs, Push, or Red Light.
3. **Occurrence** — what happened today, including a selected option, completed recurring step, workout sets, or product use.
4. **Schedule** — when the activity or its variants appear. Schedule changes remain proposed and user-confirmed.

Luna may update identity, variant, and occurrence records after acknowledging a message. If the same message also changes scheduling, a coordinated schedule job prepares a confirmation proposal instead of replacing the activity update.

## Changes

### 1. Coordinated intent

- Every message sent inside an activity receives an activity-scoped response and workspace refresh.
- Messages that also contain activity-level schedule intent queue a second, global scheduling job in the same conversation. Cadence explicitly described as part of or within a parent routine remains an activity-scoped recurring step.
- Scheduling recognizes ordinary phrases such as “weekly,” “once a week,” “every other day,” “alternate,” and “rotate.”
- The activity job owns products, equipment, protocols, events, and today’s UI. The schedule job owns variants, patterns, and future occurrences.

### 2. Durable variant context

- Agent jobs store the activity variant that was active when the job was created.
- Workspace refreshes inherit that variant rather than reading whichever activity was opened most recently.
- Confirming a proposal that creates variants queues a setup pass for each new variant, using the original request as context.
- Records explicitly scoped to the activity remain shared; records scoped to a variant remain isolated to that variant.

### 3. Reusable records

- **Recurring step** — a substep with its own cadence and dated completions, shown only when due.
- **Activity event** — dated facts such as “used the grooming roller today” without pretending the whole activity was completed again.
- **Equipment** — available, preferred, or unknown equipment shared across workout variants.
- **Session choice** — a small set of modes when a full schedule variant is unnecessary, with today’s selection.
- **Workout open choice** — an intentional exercise slot chosen at the gym, distinct from a missing exercise.

The workspace orders adherence first, countdown second, main working components next, and resources last.

## Scenario outcomes

### Hair Routine + weekly grooming roller

The link is researched and saved as a second device, “used today” becomes an activity event, and “once a week” becomes a recurring step. The daily Hair Routine remains daily; only the roller step has weekly cadence.

### Lift + seven-day rotation

The schedule proposal creates seven named variants and rotates them. Equipment remains a shared activity record. Each variant owns its workout. A third “choose at the gym” slot is represented as an open choice until the user logs a real exercise.

### Face Mask + multiple light modes

Add Activity can pass the product link and setup request directly to Luna. Product/device facts stay shared. If the user requests a rotation, Luna proposes variants and a cadence; otherwise a session-choice component can select today’s mode without forcing a complex schedule.

## UX contract

- Deterministic schedule controls remain available for daily, weekdays, and every N days.
- “Set this up with Luna” accepts a URL or natural-language details independently of the schedule selector.
- A newly created activity that appears today opens immediately so the user can see the acknowledgement and setup progress.
- No empty data component renders while Luna is still assembling it.
- Proposed future changes always require confirmation; current-day record updates can appear immediately.

## Verification

- Validator and usefulness tests cover every new record.
- Router tests cover combined record and schedule intent.
- Agent-state tests cover variant setup and workspace progress.
- Schedule tests cover post-confirm variant setup.
- The production build, full test suite, and lint must pass before commit.
