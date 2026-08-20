# Smart-flow user testing guide

## Purpose

Use this document to guide an agent that is testing Ideal Day as a thoughtful real user. The goal is not merely to find broken buttons. The goal is to find moments where the app technically works but misunderstands what a person would expect, creates friction, exposes implementation details, invents information, fails to act on useful context, or behaves inconsistently over time.

The tester should behave like an engaged, skeptical user who wants the product to become trustworthy. Use ordinary language, follow natural impulses, and question anything that feels artificial, noisy, misleading, forgetful, or unnecessarily complicated.

## Core mental model

An activity is a persistent room that may contain:

- A workspace shaped for that activity.
- A permanent conversation with Luna.
- Plans, products, routines, facts, history, measurements, timers, lists, and open questions.
- Today-specific state such as schedule position, completion, or an active run.

The activity persists across days. Its useful structure should remain, while time-sensitive data changes. Opening the room should feel immediate and familiar. Luna is present but not performative: silence is correct when there is nothing useful to say.

## Tester posture

1. Behave naturally before behaving systematically. Try the words and actions a person would actually use.
2. Treat confusion, hesitation, distrust, and annoyance as evidence. Record why the interface caused the feeling.
3. Question product semantics, not only visual polish. Ask, “What did I reasonably expect the app to understand or do here?”
4. Distinguish a genuine agent response from canned copy, fixture data, or a frontend illusion.
5. Prefer truthful emptiness over invented helpfulness.
6. Expect useful information to become durable product state when the user clearly supplies it.
7. Expect Luna to stay quiet when no question, warning, decision, or action is useful.
8. Revisit activities. Many smart-flow failures appear only after leaving, reopening, changing the clock, refreshing, or returning on another day.

## Smart-flow questions

For every meaningful interaction, evaluate these dimensions.

### Relevance

- Did Luna speak because something useful required attention, or merely because the activity opened?
- Was a setup question prepared from explicit activity setup state, or did an ordinary reopen unnecessarily invoke the model again?
- Was a question necessary? Would its answer materially change what happens now or establish information the activity truly depends on?
- Did Luna avoid repeating, paraphrasing, or re-greeting on re-entry?
- If silence was appropriate, did the UI remain calm without a typing indicator?

### Understanding and action

- Did the system identify the durable information contained in an ordinary user message?
- Did it immediately create or update the appropriate workspace component when the information was clear?
- Did it merely acknowledge the message in prose while failing to change the product?
- Did the resulting component fit the form of the activity rather than force every activity into one template?
- Did the app ask for clarification only when ambiguity genuinely blocked a useful action?

### Truthfulness

- Is every displayed product, plan, history item, metric, or preference supported by user input or a known source?
- Is sample or fixture data clearly absent from the real testing path?
- Does Luna avoid claiming that something was saved, added, or changed unless the durable mutation succeeded?
- Does user-facing language avoid implementation terms such as component mapping, context packets, databases, or rendering state?

### Persistence and scope

- Does an activity-level component remain when the activity is reopened and on future days?
- Does a “just today” change remain daily rather than silently changing the activity forever?
- Does timer/run state survive a temporary collapse or navigation when that is what a user would expect?
- Are global, activity-level, and today-only information placed at the correct scope?
- Do corrections update the existing concept instead of creating duplicates?

### Time and navigation

- Can the user open an off-time activity without it appearing disabled, stale, or washed out?
- Does the clock update current state without stealing the activity the user chose to view?
- Does completing an activity produce the expected handoff?
- Do countdowns default to the activity’s allotted duration unless the user specifies another duration?
- Does a schedule-bound countdown update immediately when the allotted duration changes, while a started run preserves its original planned-duration snapshot?

### Conversation quality

- Does the conversation follow new messages only when the user is already near the bottom?
- Does a user message save immediately and remain visible while Luna works?
- Does typing appear only when a visible response is actually being prepared?
- Are responses friendly and contextual without sounding canned, technical, overly enthusiastic, or falsely intimate?

### Recovery and trust

- What happens when Hermes is offline, slow, interrupted, or retried?
- Are jobs idempotent, or do messages/components duplicate after reconnecting or reopening?
- Can the user correct a wrong interpretation conversationally?
- Does the app preserve the original user message and avoid losing capture when classification is uncertain?

## Testing loop

1. **Establish the state.** Note the date, fake or real time, selected activity, existing conversation, and workspace contents.
2. **Act naturally.** Open an activity, write an ordinary message, request a useful change, start a control, or mark something complete.
3. **Observe the immediate response.** Check visual state, typing, saved state, workspace changes, and whether the UI blocks.
4. **Observe the durable response.** Wait for Luna, then collapse and reopen. Refresh when useful. Confirm that the correct state remains and duplicates do not appear.
5. **Change one boundary.** Try a different time of day, another activity, an ambiguous correction, offline/reconnect behavior, mobile width, or a future-day scenario.
6. **Name the expectation gap.** Describe what happened, what a reasonable user expected, and why the difference matters.
7. **Retest after a fix.** Test both sides of the rule. For example, verify that Chin-up Bar stays silent while an undocumented product routine still asks a useful setup question.

## High-value scenarios

- Open a self-explanatory five-minute activity, leave, and return several times. Expect no generic Luna chatter or typing.
- Open an under-documented product activity. Expect one concrete question whose answer would affect the routine.
- Answer with a product and a simple routine. Expect the left workspace to update immediately, not merely a conversational acknowledgment.
- Ask Luna to add a timer or countdown. Confirm the correct control appears and a countdown defaults to the activity duration.
- Create a new open-ended activity such as a cardio modality or mobility routine. Confirm Luna prepares suitable components and one high-value setup question before repeated use.
- Start a timer, complete the activity early, and verify that allotted, planned, and actual elapsed durations remain distinct. Complete another activity without starting a timer and verify that actual elapsed time remains unknown.
- Ask for a component “just today,” then distinguish it from an activity-level component intended for future days.
- Correct a product name, quantity, step, or goal. Expect an update rather than a duplicate component.
- Open an activity far from the current time. Expect the expanded room to remain fully active.
- Scroll up in a long conversation while a message arrives. Expect the viewport to remain where the user left it.
- Collapse an active timer and reopen it. Expect elapsed state to remain coherent.
- Stop the agent host, send a message, reconnect, and confirm one eventual result with no duplicate.

## Reporting format

For each issue, report:

- **Observed:** the exact behavior and relevant wording.
- **Expected:** the behavior a reasonable user would infer from the product.
- **Why it matters:** confusion, trust, interruption, lost information, duplicate state, or another consequence.
- **Reproduction:** the shortest reliable sequence.
- **Evidence:** activity, time, message text, workspace result, and whether it survived reopen/refresh.
- **Suggested product rule:** a general rule that fixes this case without overfitting to one activity.
- **Counter-test:** a contrasting scenario that should still behave differently.

Prioritize semantic failures over cosmetic preferences:

1. Lost, false, duplicated, or wrongly scoped durable state.
2. Agent actions that contradict clear user intent.
3. Unnecessary interruption, repeated chatter, or misleading processing state.
4. Navigation, temporal, accessibility, and responsive failures.
5. Copy and visual polish.

## Guardrails

- Use synthetic or clearly reversible test information when possible.
- Do not delete user-authored history merely to obtain a clean test state.
- Do not approve external purchases, health decisions, account changes, or other consequential actions.
- Do not reward the agent for sounding confident; verify the resulting product state.
- Do not accept a chat acknowledgment as evidence that a workspace mutation occurred.
- Do not report a missing future feature as a regression unless the current interface claims it works.

## Reusable instruction

When assigning this role to an agent, use:

> Read `SMART_FLOW_USER_TESTING.md` completely. Then use the live Ideal Day app as a thoughtful real user. Explore ordinary activity flows, conversations, workspace changes, time behavior, persistence, re-entry, corrections, and failure recovery. Find semantic expectation gaps, not only broken controls. For each issue, provide evidence, the expected behavior, a general product rule, and a counter-test. Preserve user-authored data and use reversible test inputs.
