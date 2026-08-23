# Ideal Day design system

This is the visual and interaction source of truth for Ideal Day. Read it before changing UI. `PRODUCT_SPEC.md` owns product behavior; this file owns presentation rules; `app/globals.css` contains the implemented tokens and selectors. When they disagree, do not silently choose one—bring the code and this document back into alignment.

## Character

- Calm, dark, focused, and personal rather than dashboard-like.
- Dense enough to support a full day, but never cramped or cryptic.
- Today’s activity sequence is primary. Expanded activities should feel like the natural open state of their list card, not a separate application.
- Activity color identifies context and active state. Green remains the global action/success accent.
- Prefer truthful empty, loading, error, and offline states over placeholder content or hollow domain components.

## Typography

Use rem-scaled semantic tokens. Mobile may promote a role for readability but must never make it smaller than desktop.

| Role | Token | Size / line height | Use |
| --- | --- | --- | --- |
| Title | `--type-title` | 18px | Section and panel titles |
| Prominent | `--type-body-lg` | 16px / 24px | Activity titles, prominent body text, all mobile form values |
| Body | `--type-body` | 14px / 20px | Normal reading, Luna messages, descriptions |
| Supporting | `--type-body-sm` | 13px / 18px | Compact explanations and secondary content |
| Label | `--type-label` | 12px / 16px | Controls, field labels, secondary UI |
| Micro | `--type-micro` | 11px / 16px | Timestamps, short statuses, terse uppercase overlines only |

Rules:

- Never use Micro for prose, messages, form values, or button labels.
- Mobile inputs, selects, and textareas use at least Prominent to remain readable and avoid browser zoom behavior.
- Prefer sentence case. Reserve uppercase plus letter spacing for short overlines, statuses, and categories.
- Every true activity-workspace overline uses one shared primitive: activity color, Micro type with a 16px line box, 720 weight, `.09em` letter spacing, and uppercase rendering. This includes temporal labels, component types, cadence labels, product/device kinds, schedules, timers, streaks, and check-ins. Keep locations, timestamps, field labels, and explanatory metadata muted rather than treating them as overlines.
- Text must reflow without clipping at 200% browser text size and with user text-spacing overrides.
- Truncate only genuinely single-line schedule labels. Never truncate conversation or explanatory content.

## Color

The canonical global tokens are:

| Token | Value | Purpose |
| --- | --- | --- |
| `--bg` | `#0a0c0f` | Page background |
| `--surface` | `#101316` | Primary surface |
| `--surface-raised` | `#15191d` | Menus and raised controls |
| `--surface-soft` | `#0d1013` | Subtle nested surface |
| `--border` | `#242a2e` | Standard divider and border |
| `--border-strong` | `#31383d` | Interactive and emphasized border |
| `--text` | `#eef1ec` | Primary text |
| `--muted` | `#8d9692` | Secondary text |
| `--subtle` | `#626b68` | Terse metadata only |
| `--accent` | `#b5d77d` | Primary action and completion |
| `--accent-bright` | `#cef09a` | Active/high-emphasis accent |
| `--accent-ink` | `#17210f` | Text on the accent |

- Meet accessible contrast in every state; never communicate state through color alone.
- Use the activity's `--item-color` locally for its category, expanded outline, and relevant component accents. Do not wash an entire workspace in the activity color.
- Category color is canonical rather than activity-authored: Training lime, Fuel warm orange, Light gold, Recharge blue, Care rose, Logistics steel blue, Creativity violet, and Spirit indigo. Every category pill and activity accent must resolve through that single mapping; persisted legacy colors never override it.
- Off-time activities remain fully legible when deliberately opened. Time state may change a badge or border, not disable the content visually.
- Destructive actions use restrained warm red and always include text plus confirmation when data loss is meaningful.

## Spacing and shape

- Preferred spacing rhythm: 4, 8, 12, 16, 20, 24, and 32px. Use 6 or 10px only for optical alignment inside compact controls.
- Keep at least 8px between separate controls and at least 12px between unrelated content groups.
- Use 6–8px radii for compact controls, 9–12px for cards/popovers, 14–16px for major shells, and full pills only for tags/statuses.
- Standard borders are 1px. One component should own each visible edge; avoid overlapping or clipped nested borders.
- Schedule tags and statuses share one 18px pill primitive with a 16px line box and symmetric horizontal padding. Do not use directional padding to position pill text; keep labels and icons optically centered through the shared flex alignment.
- An expanded activity's active outline must continuously enclose its header, context, conversation, and footer at every viewport.
- Shadows are quiet depth cues for menus and raised surfaces, never a substitute for hierarchy.

## Controls and states

- Primary mobile controls and form fields are at least 40px high; 44px is preferred when space allows.
- Compact repeated icon controls may be 32px only when clearly separated and backed by an accessible name. Do not introduce new controls below 32px.
- Icon-only controls require an `aria-label`; desktop hover/focus may add a tooltip. Menus use icon plus text.
- Use Lucide icons already present in the app. Keep ordinary control icons between 14 and 18px and align them optically with their labels.
- Give each activity a meaningful Lucide line icon immediately left of its title, colored with its category color. Match familiar activity words when possible (walk, shower, lifting, meals, meditation, and so on), then fall back to the category icon. Icons add recognition but never replace the title.
- Every interactive element needs default, hover, keyboard-focus, active/pressed, disabled, loading, success, and error treatment where applicable.
- Loading feedback appears where work will land. Luna typing belongs in conversation; workspace preparation belongs in the workspace. Do not leave either region apparently frozen.
- Opening an activity preserves its final header and footer while a quiet middle loading surface waits for both the initial activity state and saved drawer preference. Never render a provisional drawer position that immediately moves.
- A pending setup question may coexist with the truthful empty workspace. Do not render an empty workout, checklist, protocol, or other domain card merely to fill space.

## Responsive layout

Treat these as intentional test widths, not device guesses: 1040, 800, 680, 430, 360px, plus a wide desktop.

- Wide desktop: content is capped at 1180px; the summary rail is 294px; schedule and summary may sit side by side.
- At 1040px: collapse the main layout to one column.
- At 680px and below: begin directly at Schedule; hide desktop hero/summary content; remove the schedule's redundant outer card; use edge space carefully.
- Mobile collapsed activity: icon and title first; a plain-language activity length such as “5 minutes” beneath it on the left with separate minus/plus buttons immediately after it; category/status aligned on the right; overflow menu and completion at upper right. Day Timeline adds clock time without changing the header anatomy. Long titles ellipsize instead of squeezing controls.
- Mobile expanded activity: reuse the same header structure and controls as the collapsed activity. Preserve one continuous full-screen shell; stack workspace above conversation; keep only the large Skip/Mark Complete actions in the footer.
- In its header, treat the activity title and metadata as one group while preserving a 6px optical separation between their rows.
- The full-screen mobile expanded shell is flush to every viewport edge and has no inherited outer padding; its header, workspace, conversation, and footer own their internal spacing.
- Move directly from the activity header into workspace components and conversation. Do not repeat the activity category/title or reserve a permanent context strip for duration/status already visible elsewhere.
- Checklist mode must not leave blank columns, labels, padding, or controls where Timeline information would have appeared. Timeline-on and Timeline-off are deliberate layouts, not visibility patches over one layout.
- Never solve a narrow layout by reducing text below its semantic role. Reflow, stack, shorten nonessential copy, or move actions into an overflow menu.
- Test mobile layouts with long titles, active/complete/skipped states, open menus, a multiline Luna message, populated records, empty state, loading state, and the on-screen keyboard assumption.
- Do not reserve a visible drag handle. A closed activity is itself the reorder surface: drag directly with a mouse, or hold briefly and drag on touch. A normal tap still opens it; `Alt` + arrow keys reorder a focused activity without dragging.

## Scheduling surfaces

- Add Activity keeps simple scheduling compact: no schedule, every day, selected weekdays, every N days, create a sequence, or describe it to Luna. A separate progressive `Set this up with Luna` disclosure accepts a product link or useful context without forcing the person into schedule language. Saving the activity itself is immediate and never waits for Luna.
- Manage Routine is an overview, not a database-shaped card wall. Lead with a concise routine summary and one `Adjust with Luna` action; show custom days and rotations first, keep ordinary daily activities collapsed by default, and show Paused only when it contains restorable rules.
- A compact routine row shows an activity or rotation title, a plain-language recurrence, and rotation steps only when relevant. The whole row opens a focused editor; the overflow menu contains the infrequent Pause or Restore action.
- A one-activity editor exposes recurrence first. Start and end dates live under Advanced options, and internal names, revision data, cursor state, plan roles, and duplicate labels never appear. Changes explicitly target future days and leave today unchanged.
- A rotation editor adds only the complexity the person needs: ordered activity/variant steps, cadence, advancement behavior, starting step, and a short next-three preview. Do not show four competing previews or repeat the same name in multiple fields.
- A resolved variant is part of the activity identity for that occurrence. Prefer `Activity — Variant` on one line; on constrained mobile widths retain the activity title and place the variant on a subordinate line rather than shrinking either below its type role.
- Today-only editing uses an occurrence sheet/modal with explicit activity, variant, date, duration, and label fields. It must communicate that the change affects this occurrence; future-pattern changes open the matching rule in Manage Routine or use a confirmed Luna proposal.
- Site-wide Luna opens from the app shell as a right-side drawer on desktop and a full-screen conversation on mobile. Messages, work state, clarification, and proposal cards survive closing and reopening.
- A schedule proposal card must distinguish today impact from future-pattern impact and provide explicit Apply, Revise with Luna, and Dismiss actions. Applying once visibly settles the card; retries never produce duplicate patterns or occurrences.

## Daily commitment tiers

- `Essential` and `Go Further` are hierarchy, not categories and not provenance. Never color or badge an activity differently because it was seeded, user-created, or Luna-created.
- Essentials use the full standard activity-card anatomy and are the only activities counted in the daily success denominator.
- Go Further is one bounded surface beneath the working list. Its options use a compact 52–56px whole-row control with the normal activity icon/color, title, duration/category metadata, and a plus affordance—never an unchecked completion circle.
- `Keep it going` is the first subgroup inside Go Further when prior matching-occurrence history supports it. Give continuation rows a restrained category-tinted surface and a short `Last done ...` explanation; do not add streak pressure, warning color, or chat interruptions. When present, label the rest `More to choose from` and keep both subgroups within the shared three-item collapsed budget.
- Show at most three options before `See all`. The surface should feel invitational, not like an overflowing second task list; avoid guilt copy, percentages, or “incomplete” states.
- Activating an option should preserve spatial continuity: animate the compact option into a normal card at its ordered list position in roughly 500ms, then provide the existing next-item cue. Under reduced motion, use an immediate placement with a short opacity settle.
- Completed activated extras join Highlights. Unchosen extras remain absent from completion progress and disappear naturally when the dated plan rolls over.

## Completion motion

- Completion feedback begins on press instead of waiting for persistence: sweep a restrained lime-to-gold highlight across a closed activity or the shared header of an expanded activity, briefly pop the checkmark, then settle into the normal Done state.
- After that feedback settles, a completed activity leaves the working checklist and lands as its category-colored icon in the compact Highlights panel. The panel count and icon may settle/pop, but the remaining checklist must reflow calmly and preserve the next-activity cue.
- Highlights shows every completed activity as a compact icon grid and expands into readable completion history. Its heading uses the terse uppercase overline role, and the icons need no secondary completion dots because every icon in this surface is complete by definition. It is a progress surface, not a second stack of full activity cards; skipped activities remain in the checklist.
- Highlights adapts its density to the amount completed and is never shorter than a collapsed activity card at the same viewport. With one completion, omit the redundant progress ring and use a larger icon with the activity title as immediate deterministic copy; with two or three, use larger tiles; with four or more, use the compact grid. Keep equal optical space above and below the panel. Luna's optional editorial review is silent: never show typing dots or leave this progress surface visibly waiting for generated copy.
- When the progress ring is present, center a compact completed/essential fraction such as `2/6`; do not add a second `done` label. Supporting copy is never blank: use the longest completed block as the immediate factual fallback, then replace it only when Luna returns a stronger supported highlight.
- Luna highlight copy is optional and earned. Select one dominant, concrete, evidence-backed streak, milestone, completion cluster, effort, comeback, or personal best rather than summarizing the day. Keep it headline-short and clamp it to two lines beneath the overline so the entire copy block never exceeds three lines; when nothing is genuinely notable, keep the count and icon grid without fallback encouragement.
- Keep the celebration under 720ms, non-blocking, and free of layout movement. Under reduced motion, replace travel and scaling with a short highlight fade.
- Skip uses a separate, quieter status motion: a neutral 250–350ms sweep and small skip-icon settle, never the celebratory lime-to-gold treatment. A skipped card remains readable and stays in its checklist position rather than joining completed activities.
- When Skip is used from an expanded activity, finish the status motion, collapse back to the list, and gently cue the next unfinished activity. Under reduced motion, use a short neutral fade before the same handoff.

## Activity workspace components

- Components use the shared workspace header, card, field, list, action, empty, loading, and error patterns.
- A recurring step is absent when it is not due; never show a disabled placeholder for the off day. Equipment is a compact shared reference, an activity event is a concise dated recap, and a session choice uses whole-row 44px controls. An intentional workout open choice must look actionable and purposeful rather than incomplete.
- Due recurring steps sit directly beneath adherence/streak content and before countdowns or the main activity cards. This keeps infrequent, today-relevant actions near the top instead of burying them beneath reference material. Each recurring card presents cadence as its overline, a non-redundant subject title, then a quiet two-column `Last completed` / `Next due` status row above the action. These dates are derived by the app from completion history and the validated cadence; Luna does not write them as display copy.
- Luna chooses and fills approved components; she does not choose fonts, spacing, colors, arbitrary HTML, or one-off visual systems.
- Render a component only when it has enough supported information to be useful. Ask for missing information first when the component would otherwise be a hollow shell.
- Preserve stable component anatomy across activities while allowing the data and combination of components to fit the activity.
- Treat equipment as low-priority reference data: place it after the actionable and current-state components, group items by location, and suppress repeated default labels such as “available” or a shared equipment kind.
- Pending check-ins are commitments, not mini forms. Label them Upcoming and state when Luna will return and why in app-owned language. Keep the calendar visible; place a compact overflow trigger immediately before it, with `Remove check-in` as the only destructive action.
- A session choice may carry a bounded default through a known review date. Show the selected option and its “planned through” date; a deliberate dated choice overrides only that day.
- A measured session is one adaptive primary card: today’s selected modality, last compatible session, a small evidence-based input form, and app-derived weekly progress. It must not fragment the same session into separate quick-log, history, metric, and comparison cards.
- Before a linked session choice is made, show the expanded choice first and keep the session logger absent. After selection, animate unselected choices into a compact state, move the measured session first, place any upcoming check-in after it, then show the compact selected choice with a `See all options` control. Equipment and Resources remain below actionable session content.
- Measured-session fields follow the chosen modality and start with only supported inputs. Duration and effort are broadly reusable; distance, settings, heart rate, and results appear only when useful. Derive totals, averages, comparisons, and charts from the canonical dated entries rather than asking Luna to maintain display summaries.
- A strength session is a specialized primary card, not a measured-session skin. Lead with the resolved workout variant and compact exercise/set progress. Keep one exercise expanded at a time; show previous values and today’s target before the set table; use separate weight, reps, and check controls with optional set details below. Checking a set saves immediately and may reveal a quiet rest timer. Recent workout summaries belong at the bottom of the same strength card, while shared equipment remains a lower-priority reference card.
- Strength sessions disclose detail as evidence appears. A brand-new plan shows its exercise outline and one clear `Log first set` action; it does not render zeroed progress, empty history, blank comparisons, or an empty set table. After the first set, reveal today’s progress and logger. Show previous-performance columns, comparisons, weekly summaries, and history only when their underlying data exists.
- An explicitly linked strength warm-up lives inside the strength card before numbered exercises; a cool-down lives after them. Treat each as a collapsible phase checklist, collapse it when complete, and keep its progress separate from exercise/set history.
- Strength set rows preserve readable columns at narrow widths. Prefer shorter headings, stacked comparisons, and optional details over shrinking form values. Logged rows are reversible through their checked control; the active entry row is visually distinct without looking incomplete.
- Record/history information is scannable; current actions are visually stronger than historical details.
- Checklist rows are whole-row controls with an unmistakable check state and a minimum 44px mobile target. Use spacing and a quiet filled surface to group items; do not stack divider lines inside an already bordered workspace card.
- Daily selections are subset choices, not obligations. Present the active roster as calm 44px pill controls; selected pills use the activity color and a check. Keep `Same as yesterday` secondary and reversible, add new roster items inline, and derive a short recent-days recap from the same dated entries. Keep that recap collapsed beneath Today by default so history never competes with the current action; do not render a separate history card for the same selections.
- Meal logs follow natural conversation rather than ingredient-by-ingredient controls. Lead with the concise thing eaten, drunk, made, or prepped today. Show only supplied modifiers in the summary; place recipe sources, ingredients, instructions, servings, batch, and storage details in an accessible collapsed disclosure. A simple meal needs no empty detail UI, and recent entries are derived in the same card.
- History is a read-only recap, not a timeline impersonation. Format machine dates for people, keep dates unbroken, and let titles/details reflow beside or beneath metadata without fixed narrow columns.
- On mobile, workspace cards keep their natural content height rather than stretching to fill the activity. When conversation is collapsed, a compact invitation directly below the workspace lets the person reopen Luna without speaking in internal component language.
- The conversation drawer opens at the latest message unless the person deliberately scrolled upward. Composer focus, keyboard resizing, ready notices, and drawer transitions must not move a touch target between pointer-down and pointer-up.
- Product and device cards are visual parents. Their identity and description lead, the icon tile sits at the top-right, subject-specific protocol follows, and Resources is always the final subsection. Nested protocol/resources never render again as peer cards.
- Completed expanded activities hide Skip for Today. Completion is passive status in the header/footer; the explicit `Mark incomplete` action lives in the overflow menu.

## Conversation

- Follow familiar messaging conventions: readable bubbles, restrained timestamps, clear sender distinction, delivery checkmarks, and a multiline composer with a visible Send action.
- The conversation follows the latest message only when the user is already near the bottom or has just sent a message.
- Interface guidance, loading indicators, and empty-state copy must not masquerade as messages from Luna.
- Human-facing copy describes the person's activity and outcome, never internal component, record, job, or rendering machinery.

## Change checklist

Before finishing a UI change:

1. Confirm the change follows the semantic type roles and does not introduce sub-11px text.
2. Check wide desktop and the 680, 430, and 360px mobile layouts.
3. Check default, active, complete, skipped, expanded, loading, empty, error, and menu-open states affected by the change.
4. Check keyboard focus, accessible names, text enlargement, reduced motion, and touch sizing.
5. Prefer shared tokens and component patterns; document a genuinely new pattern here before repeating it.
6. Run `npm run lint` and `npm test` before committing.
