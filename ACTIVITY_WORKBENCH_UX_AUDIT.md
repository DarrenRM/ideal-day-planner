# Activity workbench UX and integrity audit

Status: implemented and validated  
Date: 2026-08-21  
Scope: cross-activity moves, the mobile conversation drawer, completed-state controls, and product/device workspace composition

This document captures the diagnosis and implementation contract for the seven issues reported after moving the Beard Grooming Roller from Skin routine to Hair Routine. The contract is now implemented; it remains the regression checklist for future changes.

## Product outcome

An activity should behave like one coherent place:

- Moving a product or device moves the complete useful bundle that belongs to it, without leaving orphaned cards or copying unrelated conversation history.
- The mobile drawer responds to one tap, opens at the latest message, and never shifts under a finger because focus changed.
- A completed activity presents an unambiguous terminal state. It does not continue to offer Skip for Today.
- A product or device is the visual parent of its own directions and resources, rather than appearing beside several disconnected cards.

## What the audit found

### 1. The move was incomplete because the app does not own dependency closure

This is primarily a contract and data-model failure, not a one-off model mistake.

The current `move_records` action asks Luna to supply a list of exact record keys. The server atomically moves those records and their directly bound workspace cards, but it does not determine which other records or portions of records belong to the moved subject. This means the operation is atomic only for the subset Luna happened to select.

The current modeling rules make this worse:

- A product is its own record.
- A dated use is a separate `activity_event` whose entries may carry an `itemKey`.
- Protocols have no product/device association.
- Resource entries have no product/device association.
- Luna is currently told to create one combined protocol and one combined resources area for a multi-product activity.

Consequently, the Beard Grooming Roller could move while its dated use or its links remained in Skin routine. The live production inspection also showed Kestrel Grooming links still inside Skin routine's shared resources record after the move. The sentence saying conversation history remains in the source was also easy to conflate with structured use history, even though those are different things.

#### Required change

Make the person identify the subject and destination; make the app calculate the move.

1. Introduce a stable subject relationship for product/device-owned information.
   - Product/device records are subject roots.
   - Dated events, recurring steps, protocol steps, and resource entries can reference a subject key.
   - Truly activity-wide information has no subject key and remains shared.
2. Replace or extend `move_records` with a subject-bundle move, such as `move_subject`, containing the source subject key and destination activity ID.
3. Resolve the dependency closure server-side.
   - Move the root product/device.
   - Move records that belong only to that subject.
   - Split mixed records so subject-owned entries move while unrelated entries stay.
   - Move or rebuild the matching workspace composition in the same transaction.
4. Keep conversation messages in the source activity as an audit trail. Conversation history must never be treated as a reason to retain structured subject history there.
5. Reject or clarify genuinely ambiguous cases, such as a protocol step shared by two devices, instead of silently leaving an orphan.
6. Add a postcondition check: after the transaction, the source activity cannot render a component or entry associated only with the moved subject.

Prompt language should reinforce this behavior, but a prompt must not be the only integrity boundary.

#### Acceptance cases

- Moving a device with a product card, weekly cadence, today's-use event, protocol, and resources leaves none of those device-owned details rendered in the source.
- A mixed resources record is split: the moved device links move and the retained product links stay.
- A shared activity-wide note or protocol remains once and is not duplicated.
- Repeating the same move is idempotent.
- Destination key/component collisions settle through an explicit merge or clarification path; they never create duplicates.
- Conversation messages remain in their original activity.

### 2. `View` can lose its first tap

The live mobile check reproduced the reported behavior: the first interaction was consumed and the next one worked.

The underlying cause is a layout change during the pointer gesture. Mobile CSS currently removes the entire expanded footer with `display: none` whenever the conversation textarea has focus. Tapping another control blurs the textarea during pointer-down; the footer immediately reappears and shifts the drawer and its controls before pointer-up. The drawer's gesture code can then interpret the movement as a swipe or the browser can finish the click over a different target.

`View` has an additional sequencing weakness: it clears its own ready notice immediately and then asks the drawer to close. Removing the pressed element before the transition has begun adds another avoidable layout mutation.

#### Required change

- Stop adding/removing the footer from document layout as an immediate consequence of textarea focus.
- Use one explicit drawer transition command for `View`.
- Start closing the drawer first; clear the ready notice after the transition begins or completes.
- Preserve the existing 280 ms drawer motion, with a reduced-motion fade/instant equivalent.
- Keep workspace content mounted throughout the transition so it is visibly revealed, not remounted after the chat disappears.
- Make the entire ready row a stable touch target and prevent double execution while the transition is settling.

#### Acceptance cases

- With the composer focused, one tap on `View` closes the drawer every time.
- The ready row remains under the pointer through pointer-up.
- The drawer slides down smoothly and reveals the updated workspace.
- The ready notice clears once and does not reappear for the same workspace revision.
- Repeated taps during the transition do not reopen or reverse it accidentally.

### 3. Composer focus and chat scroll-follow are incomplete state machines

The two-click feeling and the stale scroll position share the same source: focus, drawer geometry, and message scrolling are currently managed as loosely related effects.

Confirmed issues:

- Footer removal on textarea focus shifts the drawer during a tap.
- The scroll-follow effect runs for messages, Luna thinking, and workspace-ready notices, but not when the drawer opens.
- Opening an existing conversation can therefore reveal its oldest messages. The live check measured the opened conversation at `scrollTop: 0`, more than 1,000 px from the latest message.
- A mobile keyboard/visual-viewport resize does not request a fresh bottom alignment.
- Smooth scrolling can be interrupted by polling or layout changes and can incorrectly turn off the “follow latest” flag.

#### Required change

Treat drawer position and message following as explicit states.

- On first activity mount, restore the saved drawer preference before exposing the final middle layout.
- When the drawer transitions from closed to open:
  - if the person was already following the latest message, scroll to the bottom after the drawer's final geometry is available;
  - if they deliberately scrolled upward, preserve that reading position.
- After the person sends a message, pin to the latest message through optimistic save, typing, Luna reply, and workspace-ready notice.
- Recalculate after relevant `ResizeObserver` and `visualViewport` changes so the on-screen keyboard does not strand the composer or latest bubble.
- Do not use a smooth programmatic scroll event to infer that the person intentionally scrolled away.
- Use a stable keyboard presentation for the footer. It may visually retreat while the keyboard is open, but it must not create a synchronous layout jump under the initial tap.
- Preserve a one-tap, 44 px minimum composer target and visible focus treatment.

#### Acceptance cases

- A closed drawer with an existing conversation opens at the latest message in one tap.
- The textarea focuses in one tap before and after the footer has been visible.
- Sending a message keeps the optimistic message, typing indicator, reply, and ready notice visible without manual scrolling.
- Reading older messages is respected; a background reply shows unread state without yanking the person to the bottom.
- Opening/closing the keyboard does not hide the active composer or change the intended drawer state.

### 4. Completed-state controls are semantically ambiguous

An already-completed expanded activity currently renders all of the following:

- a top-right checkmark whose accessible action is “Mark incomplete”;
- a footer button labeled “Completed” that is actually an undo action;
- an active `Skip for Today` action.

The API toggle itself is consistent, but the presentation is not. “Completed” reads like passive status while behaving like a destructive state reversal. If it is pressed, the completion is removed without a dedicated handoff animation or an explicit description of what just changed. This explains why the control can feel as if it did not work correctly even when the request succeeds.

#### Recommended state contract

- Completion and skip remain mutually exclusive terminal states.
- When complete:
  - hide `Skip for Today` everywhere for that occurrence;
  - show the green check as status in the shared header;
  - do not make a button labeled `Completed` secretly perform undo;
  - put an explicit `Mark incomplete` action in the overflow menu (or use a clearly labeled secondary footer action if testing shows undo needs higher visibility).
- When skipped:
  - show the neutral skip status;
  - offer `Restore to today`, not completion and skip simultaneously.
- When an occurrence is marked incomplete, remove it from Highlights and return it to its correct checklist position without celebratory motion.

#### Acceptance cases

- A completed expanded activity has no Skip action.
- Every visible control's label describes what pressing it will do.
- Undo completion reliably removes the item from Highlights and restores it to the checklist once.
- No duplicate complete/reopen request can be triggered by the header and footer during an in-flight transition.
- Completion, reopen, skip, and unskip remain idempotent across retries.

### 5. Product/device information should be one composed card

The current renderer treats product, protocol, and resources as unrelated workspace cards because every workspace component is rendered independently. The product icon is placed to the left of its title. The result shown in the report looks like three separate concepts even though they describe one device.

The desired anatomy is:

1. Product or Device label and identity.
2. Name, manufacturer/variant, and short factual description.
3. Subject-specific protocol/directions.
4. Resources, as the final subsection.
5. Product/device icon tile at the top-right of the card.

The visible heading should be exactly `Product` or `Device`; `Pinned resources` becomes `Resources`.

#### Required change

Add a composition/grouping layer rather than relying on adjacency:

- A product/device workspace component becomes a parent group.
- Protocol and resource data can declare the subject key they support.
- The workspace renderer composes matching children inside the parent card.
- Shared activity-wide protocol/resources remain separate only when they genuinely apply to multiple subjects or the whole activity.
- For a multi-device Hair Routine, LL-01 and the Beard Grooming Roller each receive one card with their own directions/resources. A shared adherence streak remains above both. A truly combined routine may remain an activity-level card.
- Inside the product card, Resources is last. Global workspace ordering still keeps adherence first and countdown second.

The composition metadata should also power subject-bundle moves, so visual ownership and data ownership cannot drift apart again.

#### Acceptance cases

- Product and device cards use the correct binary label.
- The icon tile sits at the top-right without stealing width from long names.
- A subject's protocol and resources are nested in its card and do not render again as standalone duplicates.
- Two devices produce two coherent cards, not two copies of shared streak/history UI.
- Shared information has one deliberate activity-level home.
- Moving one subject moves its nested content with it.

## Implementation sequence

1. **Model and transfer integrity**
   - Add subject associations and server-side dependency closure/splitting.
   - Update the move action contract, validator, transaction, postconditions, and fixtures.
   - Correct existing Skin/Hair data only after the new operation can represent the intended result safely.
2. **Mobile interaction state machine**
   - Remove focus-driven layout jumps.
   - Make `View` a deterministic one-tap drawer transition.
   - Add drawer-open, resize, keyboard, and user-scroll-aware bottom following.
3. **Terminal activity states**
   - Unify completed/skipped action rendering across collapsed and expanded headers/footers.
   - Hide impossible actions and expose an explicit undo path.
4. **Product-group composition**
   - Add parent/subject composition to the workspace contract.
   - Nest protocol and Resources under product/device; move the icon tile.
   - Preserve streak/countdown/global ordering rules.
5. **Regression coverage and visual QA**
   - Unit-test move closure, mixed-record splitting, collisions, and idempotency.
   - Component-test one-tap `View`, focus stability, restored scroll, completion undo, and action visibility.
   - Exercise production-like records at 680, 430, and 360 px plus desktop.
   - Check reduced motion, keyboard focus, touch targets, unread state, and long product names.

## Definition of done

- All seven reported issues are covered by an explicit behavior or invariant above.
- No fix depends solely on Luna choosing a better JSON subset.
- There is one source of truth for drawer state and one for terminal activity state.
- Product ownership is represented in data and reused by both workspace composition and cross-activity moves.
- `npm run lint` and `npm test` pass, targeted regression tests are added, production is deployed, and the live mobile path is rechecked without mutating unrelated user data.
