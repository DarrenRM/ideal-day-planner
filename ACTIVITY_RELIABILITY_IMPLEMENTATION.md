# Activity reliability implementation

This document turns the composer/notification diagnosis and the two follow-up investigations into one implementation contract. The fixes belong together because they all govern whether Luna's visible promises correspond to durable app state.

## 1. Message composer and mobile footer

### Problem

Focusing the composer currently hides the activity footer with CSS while its layout row remains reserved. This creates a dead-looking blank area and can happen even when no software keyboard is consuming the space.

### Solution

- Keep the primary activity actions available unless the browser reports that the visual viewport is genuinely reduced by a software keyboard.
- When the keyboard is open, collapse the footer row itself instead of making its contents invisible inside reserved space.
- Restore the footer as soon as the keyboard closes.
- Preserve a stable composer/send target during pointer interaction and keep the conversation pinned to the newest message when the user is already at the bottom.

### Acceptance criteria

- Merely focusing the composer on desktop or with a hardware keyboard does not remove the footer.
- A mobile software keyboard may replace the footer, but it leaves no empty reserved row.
- Closing the keyboard restores Skip/Complete without reopening the activity.

## 2. Notifications, schedule state, and View targets

### Problem

The generic “X is ready” notice is inferred from the newest workspace component. It does not describe what changed, and its View action can point at content that is intentionally hidden. The Shower example also exposed a deeper modeling error: Luna represented the parent activity's every-other-day cadence as a nested `recurring_step`, while the authoritative activity schedule remained daily.

### Solution

- Replace generic ready text with typed, app-owned outcomes: workspace updated, schedule proposal ready, schedule updated, follow-up due, or save failed.
- Generate labels from the committed result and destination, not free-form model copy.
- Render View only when the notice has a valid, visible target. A workspace target opens the component area; a schedule target opens Schedule Manager for that activity.
- Add an app-owned schedule summary for non-daily activity schedules, with last/next occurrence where available.
- Treat parent activity cadence and nested recurring steps as different domains. A `recurring_step` may describe an item inside an activity; it may never substitute for the activity's own schedule.
- Reject or archive parent-like recurring-step records deterministically, and route parent cadence requests through schedule proposals.

### Acceptance criteria

- Every View action performs an observable navigation or drawer transition on the first press.
- No chevron or View affordance is interactive when its destination cannot open.
- Schedule-only requests do not create hidden workspace components.
- Non-daily schedules are visible without depending on a model-authored card.

## 3. Structured updates and truthful completion

### Problem

The grooming-roller correction was not just a normal model miss. The fast conversational pass promised an update, but the background `workspace_refresh` failed three times with a foreign-key constraint. The UI hid the terminal failure. A later request succeeded, leaving partial record-graph debt.

### Solution

- Preserve record identities during cross-activity moves and validate the complete relation graph before committing revisions.
- Make record persistence transactional in dependency order: subject roots first, then owned protocol/resource/history records, then removals.
- Reconcile idempotently after uncertain or partial attempts.
- Surface a typed save-failed notice with a Retry action when the latest durable workspace job failed and has not been superseded by a success.
- Conversational acknowledgements may say work is underway, but “updated,” “saved,” or “ready” is reserved for a successful durable write.
- Moving a subject between activities moves or removes all subject-owned records together; resources cannot remain attached to the old activity.

### Acceptance criteria

- A failed workspace write is visible and retryable.
- Retrying cannot duplicate records or revisions.
- Cross-activity moves leave one complete subject graph at the destination and none at the source.
- Success notices appear only after the database commit.

## 4. Durable delayed check-ins

### Problem

Conversation history can remember that a user is trying something for a week, but history cannot wake Luna later. Ordinary activity opens intentionally do not run the model, and Hermes cron is not the app's durable scheduler.

### Solution

- Add first-class follow-up records containing activity, purpose, source message, due date, state, and whether the date was inferred.
- Explicit requests such as “ask me again in a week” always create a follow-up.
- Explicit finite trials such as “I'll do the elliptical for one week” create an inferred, user-editable check-in even without the words “ask me.”
- Vague possibilities are remembered as context but do not create a dated interruption.
- App code, not the model runtime, detects due follow-ups and enqueues Luna exactly once.
- Show pending/due follow-ups as a compact app-owned workspace card. The user can change or dismiss an inferred check-in.
- After Luna asks the due question, mark the follow-up as asked; a relevant user answer completes it.

### Acceptance criteria

- A one-week trial survives browser, process, and bridge restarts.
- Due activation is idempotent and does not depend on opening the exact activity first.
- A due check-in produces one Luna message, not one per poll or page load.
- The pending date is visible before it is due and can be changed or removed.

## Delivery checklist

- [x] Correct mobile keyboard/footer behavior
- [x] Typed notices with valid targets
- [x] App-owned schedule summary and parent-cadence guard
- [x] Visible save failures and safe retry
- [x] Durable follow-up schema, inference, due activation, and UI
- [x] Regression tests for all four flows
- [x] Production migration, deployment, and state cleanup
