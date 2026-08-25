# Ideal Day — Onboarding Flow Specification

Status: testing prototype
Last updated: 2026-08-25
Owner: Darren

This document defines the working product and UX direction for introducing a new person to Ideal Day. `PRODUCT_SPEC.md` remains the product source of truth. Decisions here are proposals until they are confirmed and promoted into that specification.

## 1. Objective

Onboarding should help a person create and begin a believable first day without requiring them to understand Ideal Day's data model, scheduling language, component catalog, or agent architecture.

The first experience should feel like using Ideal Day, not configuring it.

The target first-session outcome is:

> The person has described what matters, reviewed a small but meaningful proposed day, approved it, and completed or begun one useful activity.

Onboarding completion by itself is not the activation event. The first credible plan plus a real action is.

## 2. Research principles

The proposed flow applies several patterns shared by strong contemporary mobile onboarding experiences:

- Reach meaningful product value quickly instead of front-loading a product tour.
- Teach through interaction in the real interface.
- Ask personalization questions only when the answers visibly change the result.
- Provide reasonable defaults and postpone advanced configuration.
- Begin with achievable commitments and reveal deeper systems contextually.
- Celebrate real progress rather than rewarding questionnaire completion.
- Treat onboarding as the beginning of a multi-day calibration loop, not a one-time funnel.

Useful references:

- [Apple Human Interface Guidelines — Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding)
- [Amplitude — Why the first five minutes matter](https://amplitude.com/blog/first-five-minutes)
- [Finch — Our approach to self-care](https://help.finchcare.com/hc/en-us/articles/37935669335309-Our-Approach-to-Self-Care)
- [Duolingo — Improving the streak](https://blog.duolingo.com/improving-the-streak/)
- [RevenueCat — Noom onboarding teardown](https://www.revenuecat.com/blog/growth/web-to-app-onboarding-funnel)

## 3. Product position

### 3.1 The first plan is a proposal

Luna's initial activities are not silently committed to the person's routine. They form a reversible proposal shown only after the person has answered the focused onboarding questions.

The experience should communicate:

> Here is the Essential set I would start with based on what you told me. Does this feel right?

The person can:

- Accept the proposal.
- Edit or remove an activity.
- Select or deselect a proposed Essential.
- Reorder the proposed day.
- Ask Luna to make the day lighter, fuller, more specific, or otherwise different.
- Add something Luna missed.

Only confirmation creates durable activities, schedule patterns, follow-ups, activity setup jobs, and workspace records.

### 3.2 Onboarding is not the home screen

The first-run flow is a dedicated, full-screen experience. It should not populate a miniature home screen before it understands the person, and it should not expose Highlights, achievements, Go Further, Keep It Going, or other day-state surfaces during intake.

The last onboarding screen may reuse normal activity-card anatomy for recognition, but it is still an Essential-selection review rather than a draft Today page. This keeps the decision focused: choose the small set that should define a successful first day.

The real Today screen appears only after confirmation. It contains only the selected Essentials on the first day; optional and historical surfaces appear later when real behavior justifies them.

### 3.3 Origin and commitment remain independent

Activity origin and routine commitment are separate dimensions:

| Dimension | Values | Meaning |
| --- | --- | --- |
| Origin | `starter`, `user`, `luna`, `imported` | Where the activity came from |
| Commitment | `essential`, `extra` | How one schedule step participates in a day |

Origin is useful for auditing, recommendations, and analytics. It should not normally appear as a badge or hierarchy in the daily interface.

A user-created activity is not automatically Essential. A Luna suggestion is not automatically optional. The role follows the person's intent.

### 3.4 A suggestion is not yet an activity

Starter ideas and Luna's later possibilities should remain lightweight candidates until accepted. They must not be inserted into the durable activity catalog merely because they were shown.

This prevents onboarding from replacing an empty account with a large hidden or optional backlog.

## 4. Desired emotional arc

The onboarding should move through five feelings:

1. **Understood** — the app asks what the person wants their life or day to support.
2. **Relieved** — Luna turns an unstructured answer into a manageable starting point.
3. **In control** — the proposal is editable and nothing is imposed silently.
4. **Capable** — the first day feels substantial but achievable.
5. **Motivated** — a real completion produces visible progress and a reason to return.

Avoid tones that feel clinical, judgmental, overly inspirational, or mechanically revealing. Luna should not discuss records, components, mappings, setup states, or internal confidence unless the person asks about implementation.

## 5. Proposed first-run journey

```text
Welcome
  -> priorities
  -> friction and constraints
  -> preferred rhythms
  -> coaching pace
  -> Luna prepares a proposal
  -> choose starting Essentials
  -> user revises or confirms
  -> real Today screen
  -> first useful action
  -> real completion reward
  -> first-week calibration
```

The questionnaire consists of four focused pages after the welcome. Each page has one job, one short explanation, one ambient visual treatment, and tap-based choices. It should feel more like a thoughtful conversation with momentum than a settings form.

Progress is always visible. Back preserves every answer. The primary action remains near the mobile safe area, and Continue stays disabled only when an answer is required.

### 5.0.1 Ambient art direction

Background art sits behind the interface rather than competing with it. It is low-contrast, partially obscured by UI surfaces, and primarily visible through negative space. It should feel like an environmental mood layer, not an illustration placed behind the app. Brightness and saturation remain restrained enough that white text, tap targets, and card hierarchy stay dominant.

The first prototype uses four related treatments so each question can have its own environmental mood without changing the interface language:

- **Topographic dusk landscape** — near-black contour lines around the edges and upper area, with a low hazy mountain horizon and a muted amber, dusty mauve, violet, and charcoal dusk glow.
- **Atmospheric current** — fine, slow current paths around a quiet central reading area, with a desaturated blue-gray, teal, and dusty-violet bloom.
- **Abstract orbital glow** — large, subtle orbital paths across near-black, with a quiet green-gold atmospheric bloom and only a few sparse dim nodes.
- **Cool light veil** — broad translucent mist planes dissolving into graphite and smoked blue, with a restrained silver-green and muted olive bloom near the lower edge.

The four questions use these in order: topographic dusk for priorities, atmospheric current for real-life friction, orbital glow for daily rhythm, and cool light veil for Luna's coaching approach. All four are preloaded so moving between pages does not wait for the next background asset.

Never use a stock-photo look, neon cyberpunk, obvious wallpaper, busy texture, literal motivational symbols, or more than one main visual motif on a screen. The imagery does not replace a question, explain a feature, or consume the primary reading area.

### 5.1 Welcome

Purpose: establish the promise without presenting a feature tour.

Possible deterministic interface copy:

> **Build a day around what matters to you.**
> Turn what matters to you into a clear daily plan—and let Luna help it evolve as your life does.

The supporting copy sells the person's resulting capability rather than the questionnaire mechanics. A small footer may say only `Takes about 2 minutes`.

Primary action:

> Build my first day

Do not explain components, activity conversations, universal scheduling, variants, Timeline, or the distinction between global and activity Luna here.

### 5.2 Page one — priorities

Purpose: learn what this season of life should support before suggesting any activity.

Primary prompt:

> What should your days help you make room for?

The person chooses up to three recognizable priorities:

- More energy
- Strength and movement
- Focused work
- Better sleep
- Calm and recovery
- Nourishment
- Self-care
- Home and order
- Creativity
- Connection

An optional **Something else** field accepts a short natural-language goal. The selected labels and optional words become proposal evidence; they are never treated as activity titles.

### 5.3 Page two — friction

Purpose: prevent an appealing but unrealistic plan by understanding what commonly breaks a day.

Primary prompt:

> What usually gets in the way?

The person chooses up to two:

- Low energy
- An unpredictable schedule
- Starting is the hard part
- Too many priorities
- Evenings fall apart
- I forget
- Pain or physical limits
- Nothing obvious

This answer must visibly affect the proposal. For example, low energy favors shorter actions, an unpredictable schedule avoids fragile clock-based commitments, and physical limits prevent unsupported exercise suggestions.

### 5.4 Page three — rhythm

Purpose: learn where support belongs without forcing the person to configure schedules.

Primary prompt:

> Where would a little structure help most?

The person chooses one or two day rhythms:

- A morning anchor
- A midday reset
- An evening wind-down
- Movement somewhere in the day
- Keep it flexible

The supporting line says only `Choose up to two.` The option labels themselves carry the useful rhythm context.

### 5.5 Page four — coaching pace

Purpose: choose the weight of the first Essential set and how assertively Luna should calibrate it.

Primary prompt:

> How should Luna start with you?

Working options:

- **Keep it light** — preselect three Essentials and protect breathing room.
- **Find my balance** — preselect four Essentials with a mix of care and progress.
- **Challenge me** — preselect five Essentials while keeping each one concrete.

The page teaches the commitment model in one line:

> Essentials are your core set of daily goals. Add or remove activities at your pace.

These labels replace the vague capacity language. The answer changes the amount and effort of the proposal, not merely decorative wording.

### 5.6 Clarification

Luna may ask at most one concise clarification before producing the first proposal when the answer materially changes the plan.

Good clarification subjects include:

- A goal whose meaning is ambiguous.
- A medical limitation or injury that changes a fitness suggestion.
- Whether a named commitment is daily or belongs on particular days.
- A conflict between requested ambition and stated capacity.

Do not ask for details that can be safely deferred until the person first opens the relevant activity.

### 5.7 Preparing the proposal

The user receives an immediate acknowledgment before durable Luna work begins. A bounded visible work state explains that Luna is preparing a starting day.

The transition should not expose an empty home screen, a partially populated list, repeated typing states, or activities snapping into place one by one.

Keep this state focused on Luna's current work. Do not add implementation reassurance, creation-state disclaimers, or a manual deterministic-builder link beneath the progress indicator. Recovery choices belong on a real error state if the work fails.

When the proposal is ready, transition once into the complete draft.

### 5.8 Confirm starting Essentials

This is the first time activities appear. It is a dedicated review screen, not Today and not a populated home-page preview.

Possible heading:

> **Confirm your Essentials**
> Based on your answers, Luna recommends this starting set. Choose what fits and adjust any activity before you begin.

The screen contains six to eight concrete candidates. Each candidate has:

- A familiar activity title such as `Morning walk`, `Strength session`, `Focus block`, `Breakfast`, `Bed routine`, `Meditation`, or `Tidy reset`.
- An activity icon and category color.
- The same category tag used by Today activity cards.
- A realistic duration estimate.
- One short, specific reason tied to a selected priority, friction, or rhythm.
- A large whole-card selection control with a visible checked state.

Luna preselects three, four, or five based on the chosen coaching pace. The person may select between three and six total. Unselected candidates remain provisional and disappear after confirmation; they do not become Go Further activities or enter the activity library.

Do not show Highlights, a progress denominator, selection count, saved-state badge, recommendation-explanation card, achievements, completion controls, More for Today, stretch goals, future candidates, or a calibration card on this screen. Those concepts are intentionally deferred.

The person may tap a small edit affordance to change a title or duration without leaving the review. Duration editing reuses the same direct minute value with minus/plus controls as a Today activity. A secondary **Rethink these with Luna** action can revise the candidate set as one coherent update.

Primary action:

- **Start with these Essentials**

### 5.9 Confirmation

Confirmation is one atomic product boundary:

1. Create accepted durable activities with correct origin metadata.
2. Create validated schedule patterns and ordered steps.
3. Mark every accepted starting step Essential.
4. Create explicit onboarding follow-ups.
5. Queue only the activity setup jobs justified by accepted activities.
6. Resolve today's occurrences.
7. Move directly into the confirmed home screen with the selected Essentials and no pre-populated optional pool.

If any required operation fails, preserve the draft and show a specific retry state. Never leave the person with a partially created routine while claiming setup is complete.

### 5.10 First useful action

After confirmation, identify one approachable next action. This can be the first Essential or something the person has already done today and can truthfully mark complete.

Do not invent a completion merely to demonstrate the animation.

The normal completion transition, Highlights update, and achievement system should teach the value loop through use. No explanatory tour is necessary unless testing shows the interaction is unclear.

## 6. Building a reasonable first day

The first day should be judged by coverage and effort, not by a universal activity count.

### 6.1 Proposed readiness rules

Before showing the proposal, verify:

- Every selected priority is represented by at least one candidate or acknowledged in Luna's concise summary.
- The candidate set contains six to eight distinct, concrete activities.
- The preselected Essential set contains three, four, or five activities according to coaching pace.
- Estimated effort accounts for stated friction and preferred rhythm.
- The plan contains meaningful progress as well as maintenance when the person's goals support both.
- No Essential depends on an unanswered question that makes it impossible or unsafe to perform.
- At least one activity is immediately actionable.
- Titles describe recognizable actions rather than abstract outcomes or moods.
- No optional backlog, stretch list, or future-idea dump is created during onboarding.

### 6.2 Confidence levels

Luna should internally distinguish:

- **Confident** — directly requested or strongly implied; suitable for the proposed Essential set.
- **Plausible** — supports a stated goal but needs the person's approval; suitable as a visible candidate.
- **Uncertain** — meaning or cadence is unresolved; clarify or defer.

Do not expose numeric confidence scores. Make assumptions visible through ordinary language where needed.

### 6.3 Time-of-day adaptation

If onboarding occurs late in the day, do not present a full morning-to-night plan as if the person failed it already.

Offer a choice such as:

- Start with a small version today.
- Build tomorrow's full starting day.

The durable routine can still begin on the appropriate date. Today-specific choices must not rewrite the recurring pattern accidentally.

## 7. Capability reveal strategy

Ideal Day already supports a broad set of activity and agent capabilities. Onboarding should preserve them through progressive disclosure.

| Capability | First proposal | Contextual introduction | Advanced or explicit use |
| --- | --- | --- | --- |
| Goals | Ask early and use visibly | Revisit during check-ins | Edit in routine management |
| Essentials and Go Further | Essentials only; choose the first small set | Introduce Go Further after observed behavior or an explicit addition | Per-pattern role editing |
| Origin metadata | Store silently | Use for recommendations and analytics | Audit or import tooling |
| Category, icon, color | Infer and render | Editable with the activity | Design settings if ever needed |
| Duration estimate | Include quietly | Adjust on cards | Timeline placement |
| Daily/weekday/interval cadence | Use when clear | Ask when the activity requires it | Routine manager |
| Rotations and variants | Only when explicitly requested | Propose when meaningful variation emerges | Full schedule proposal UI |
| Products and devices | Use supplied links or names | Research and attach protocol/resources | Multi-subject management |
| Protocols and checklists | Build only from sufficient evidence | Expand through activity conversation | Manual component editing if introduced |
| Session choice and session logs | Select internally for matching activities | Reveal when the first session is performed | Historical analysis |
| Strength workouts and set logging | Use only for an accepted Lift-style activity | Complete setup with one useful question | Program rotations and progression |
| Meal and shake logging | Keep daily outcome simple | Preserve recipes or ingredients when supplied | Trends and reusable recipes |
| Supplement selection | Show a stable roster when known | Learn named supplements through conversation | Product detail and history |
| Item lists and open loops | Not required during first setup | Introduce when the user mentions a need | Global capture and scheduling |
| Timers and countdowns | Only when inherent to the activity | Add by request or supported protocol | Timeline-independent use |
| Adherence, history, metrics, trends | Do not show empty trackers | Appear as real data accumulates | Long-term review |
| Highlights and achievements | Do not show during questionnaire or review | Teach through the first real completion | Historical reflection |
| Keep It Going | No history yet | Appears after eligible prior behavior | Schedule-aware continuation |
| Needs Attention | No open loops yet | Appears when Luna files an unresolved item | Global Luna decisions |
| Global Luna | Present as onboarding guide | Cross-activity conversation | Routine and schedule proposals |
| Activity Luna | Avoid opening every thread during onboarding | Introduce on first relevant activity | Durable activity-specific collaboration |
| Day Timeline | Off by default | Mention only if clock planning is requested | Settings |

## 8. Activity and component setup

### 8.1 Do not create empty components

A component should render only when it has enough validated data to be useful. Do not display empty workout, checklist, product, history, tracker, goal, or metric cards to imply future capability.

### 8.2 Simple activities

A simple, fully specified activity may be usable from its title, duration, completion action, and conversation without any workspace component.

Examples include a brief walk, a plainly described household action, or another low-choice task that does not benefit from stored instructions or measurements.

### 8.3 Activities requiring setup

Open-ended or specialized activities may receive the smallest useful component combination and, when necessary, one focused Luna question.

Examples:

- Cardio may need a session choice and measured-session log.
- Lift may need goals, limitations, equipment, and a strength plan.
- A linked device may need a product record, protocol, and resources.
- Supplements may need a daily selection roster.
- Food activities may need a concise meal log.

Activity setup should be staggered. Confirming six activities must not produce six simultaneous Luna conversations, six typing indicators, or a burst of unsolicited questions.

Priority order:

1. The first activity the person is likely to perform.
2. Activities whose missing information blocks safe or useful execution.
3. Activities as they are opened or become due.
4. Silent maintenance only when it cannot create conversation spam.

## 9. Luna interaction contract

### 9.1 Luna is a collaborator, not an intake form

Structured UI handles bounded decisions. Luna handles natural language, ambiguity, tradeoffs, explanations, and plan revision.

Luna should:

- Acknowledge the person's goals promptly.
- Ask no more than one necessary clarification before the proposal.
- Produce a complete proposal rather than streaming partial activities into the home screen.
- Explain a recommendation when the reason is useful or uncertain.
- Accept broad revision language such as “too much,” “more ambitious,” or “I do this only on weekdays.”
- Preserve the person's words and intent through revisions.
- Make future check-in promises only when a durable follow-up is created.

Luna should not:

- Claim the routine is saved before confirmation.
- Create advanced rotations merely because an activity supports modes.
- ask one setup interview per proposed activity.
- Fill the day with unsupported wellness conventions.
- Convert every possible improvement into an activity.
- Automatically promote future suggestions to Essentials.
- Narrate internal component or persistence behavior.

### 9.2 Working state

If proposal generation takes noticeable time, show one stable work surface with concise dynamic status. Do not leave the person looking at a blank list.

The acknowledgment and work surface have separate purposes:

- The acknowledgment confirms that Luna understood the request.
- The work surface shows that the proposed day is being prepared.

Transition directly from the work state to the finished proposal.

## 10. First-week calibration

Onboarding continues after confirmation, but it should stop feeling like onboarding.

### 10.1 Planned check-ins

The first proposal may include a visible, removable calibration promise:

> After three days, Luna will help you decide whether to add an evening routine and another movement activity.

The promise creates a real follow-up. Removing it cancels the corresponding agent check-in.

### 10.2 Evidence used at check-in

Luna may consider:

- Essential completions and skips.
- Deliberately selected Go Further activities.
- Activity logs and measurements.
- Notes and conversation.
- Whether the day repeatedly ended with unresolved Essentials.
- Whether the person consistently chose more than the proposed day.
- Explicit statements that the routine felt too light, heavy, repetitive, or incomplete.

Luna then proposes a change. She does not silently enlarge or reduce the routine.

### 10.3 Timing policy

Initial date-based guidance:

- Daily activities: check after approximately three to four days.
- Activities occurring two or three times per week: check after approximately one week.
- Weekly activities: check after the first due occurrence, allowing enough time for it to be performed.
- Explicit trials: honor the person's requested review date or duration.

The current follow-up model is date-based. A later extension should support behavioral triggers such as:

- After three scheduled opportunities.
- After two completions.
- After two consecutive skips.
- After the first completed rotation cycle.

Until behavioral triggers exist, Luna should choose a sensible date and inspect the available evidence when that date arrives.

## 11. Mobile UI and interaction details

### 11.1 Continuity

Use a short stack of full-screen, single-purpose questionnaire pages. Continuity comes from shared typography, color, motion, icons, and activity-card anatomy—not from showing the home screen prematurely.

Suggested progression:

1. Focused welcome.
2. Priorities.
3. Friction.
4. Rhythm.
5. Coaching pace.
6. Stable preparation state.
7. Dedicated Essential-selection review.
8. Real Today screen after confirmation.

### 11.2 Draft-to-live transition

After **Start with these Essentials**:

- Remove rejected and unaccepted candidates.
- Transition directly into the real Today screen without an intermediate `Your first day is ready` page.
- Introduce completion affordances only after the transition.
- Move focus to the first actionable Essential.
- Respect reduced-motion settings.

The transition should feel like the plan becoming real, while maintaining a clear boundary between onboarding and Today.

### 11.3 Editing the proposal

Whole-card taps open a lightweight draft editor. The editor should prioritize:

- Title or intended action.
- Duration estimate.
- Selected versus not selected.

Cadence, Essential versus Go Further, variants, component selection, product ownership, and workspace binding do not belong in this editor.

### 11.4 Adjusting with Luna

On mobile, **Adjust with Luna** opens the global Luna sheet over the draft while preserving the proposal beneath it.

When Luna produces a revision:

- Acknowledge the requested change immediately.
- Keep the current proposal stable while working.
- Apply the finished revision as one coherent animated update.
- Briefly indicate what changed.
- Preserve manual edits unless the person explicitly asked to replace them.

### 11.5 Navigation safety

Leaving onboarding should preserve the draft. Returning should resume at the same stage. Back navigation must never discard substantial natural-language input or a generated proposal without confirmation.

### 11.6 Keyboard, focus, and accessibility

- Keep primary actions reachable above the mobile safe area.
- Use normal readable body text and existing design-system tokens.
- Ensure coaching-pace choices and Essential selection are not communicated by color alone.
- Announce proposal completion and confirmation through an accessible status region.
- Move focus intentionally after generation, revision, and confirmation.
- Reduce or remove decorative transitions under `prefers-reduced-motion`.

## 12. Edge cases

### 12.1 Very little information

If the person provides a vague goal such as “be healthier,” ask one high-yield clarification or propose a conservative plan with clearly labeled assumptions. Do not return an empty day.

### 12.2 Highly detailed routine

If the person supplies a complete routine, preserve it rather than forcing the standard three-to-six range. The proposal should still distinguish Essentials from Go Further and identify any unsafe or ambiguous schedule assumptions.

### 12.3 Imported or returning user

A returning or imported user should receive a routine review, not first-run onboarding. Preserve durable activity identity and history. Offer to simplify, prioritize, or recalibrate the existing routine through a proposal.

### 12.4 User skips onboarding

If skipping is allowed, land on a useful minimal starter state with a prominent but non-blocking path to build the first day. Do not create a large default routine. The person must be able to return to guided setup from Settings or global Luna.

### 12.5 Agent unavailable

Preserve answers and show a truthful recoverable state. A small deterministic starter builder may remain usable, but the interface must not impersonate Luna or claim a personalized proposal was produced.

## 13. Measurement

Primary activation candidates:

- First proposal generated.
- First proposal confirmed.
- First activity begun or logged.
- First truthful activity completion.
- Time from onboarding start to first useful action.

Early quality and retention signals:

- Proposal revision rate and common revision requests.
- Activities removed before confirmation.
- Essentials completed, skipped, or left unresolved on days one through seven.
- Go Further activation rate.
- First planned check-in viewed and answered.
- Day 1, Day 3, Day 7, and Day 14 return.
- Routine expansion and contraction after calibration.
- Percentage of initial activities still present after two weeks.

Do not optimize solely for onboarding completion. A person can finish every screen and still receive an unusable day.

## 14. Implementation implications

The flow likely requires a durable but provisional onboarding proposal model rather than immediately creating ordinary activities.

Potential concepts:

- An onboarding session with explicit stage and resumability.
- Versioned draft proposals.
- Candidate activities with source evidence, confidence class, proposed role, order, duration, and cadence.
- Candidate future additions that are not activity definitions.
- Atomic proposal confirmation.
- Setup-job suppression while candidates remain provisional.
- A readiness validator for coverage, actionability, unresolved blockers, and effort.
- A bounded onboarding follow-up plan.
- Later support for behavior-triggered follow-ups in addition to dates.

The existing schedule-proposal pattern is a useful precedent for revision, confirmation, validation, and auditability. Onboarding should not bypass the authoritative activity, schedule, workspace, or follow-up validators when a draft is accepted.

### 14.1 `/testing` prototype contract

The first implementation lives at `/testing` and is deliberately isolated from the signed-in person's production routine:

- The server derives a testing-only user identity from the authenticated owner; the browser cannot choose or submit an arbitrary sandbox identity.
- Priority, friction, rhythm, coaching-pace answers, Luna jobs, and candidate proposals live in a provisional onboarding session. Ordinary activities, schedules, day items, activity conversations, runs, and workspaces do not exist before confirmation.
- Luna's proposal runs through the existing local bridge as a dedicated Terra-backed durable job. A bounded deterministic starter remains available if the bridge cannot finish.
- `Start with these Essentials` validates that three to six candidates are selected, then atomically materializes only those selected activities into the real activity, daily schedule, Essential role, day-plan, conversation, and profile tables for the testing identity only.
- Confirmation reloads directly into the isolated testing identity's current-day shell. It begins with the selected Essential list rather than an onboarding-completion interstitial, optional surfaces, or invented post-setup UI.
- The three-dot menu exposes `Reset onboarding` only on `/testing`. Reset deletes the exact derived testing user and relies on foreign-key cascades; it never targets the owner identity.
- Initial accepted activities are intentionally actionable without generated workspaces. The normal activity setup/compiler path can run later when a person adds details that justify a component, which avoids a burst of speculative setup work at confirmation.

This route is a product test surface, not a second implementation of the production home page. Promotion to `/` should reuse the same provisional session and confirmation boundary while moving the presentation into the shared Today shell.

## 15. Open decisions

1. Should the maximum priority count remain three after usability testing?
2. Should the optional free-text goal appear on the first page or behind **Something else**?
3. Is three to six selected Essentials the right hard validation boundary?
4. Should the Essential review support title and duration editing in the first test, or wait until selection quality is proven?
5. What is the smallest deterministic fallback when Luna is unavailable?
6. Should sign-in occur before question one, before proposal generation, or after the preview in a public version?
7. Which onboarding follow-ups should be date-based initially, and which justify event-trigger support before launch?
8. What does a successful first-day proposal look like for someone onboarding late at night?

## 16. Working recommendation

Build onboarding as a short co-authored first-day experience:

1. Ask what matters.
2. Ask what makes follow-through difficult.
3. Ask where support should fit.
4. Ask how strongly Luna should coach.
5. Let Luna create one complete set of concrete candidates.
6. Let the person choose three to six starting Essentials on a dedicated review screen.
7. Confirm before creating durable activity machinery.
8. Enter the real Today screen only after confirmation.
9. Deliver one real completion and reward.
10. Grow the routine through explicit, evidence-backed check-ins.

The product should feel capable from the first session without attempting to display every capability. Depth should appear as the person's life supplies reasons for it.
