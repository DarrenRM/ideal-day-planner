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

- Add Activity keeps simple scheduling compact: no schedule, every day, selected weekdays, every N days, create a sequence, or describe it to Luna. Saving the activity itself is immediate and never waits for Luna.
- Manage Schedule presents one card per recurring pattern. Each card shows the name, plain-language cadence, sequence, advancement policy, effective date, and a short upcoming preview. Never expose cursor, occurrence-key, or revision terminology.
- The sequence editor uses app-owned controls for cadence, start/end dates, advancement, initial step, activity/variant choice, duration, optional display label, ordering, and preview. A one-step pattern must still feel simple.
- A resolved variant is part of the activity identity for that occurrence. Prefer `Activity — Variant` on one line; on constrained mobile widths retain the activity title and place the variant on a subordinate line rather than shrinking either below its type role.
- Today-only editing uses an occurrence sheet/modal with explicit activity, variant, date, duration, and label fields. It must communicate that the change affects this occurrence; future-pattern changes belong in Manage Schedule or a confirmed Luna proposal.
- Site-wide Luna opens from the app shell as a right-side drawer on desktop and a full-screen conversation on mobile. Messages, work state, clarification, and proposal cards survive closing and reopening.
- A schedule proposal card must distinguish today impact from future-pattern impact and provide explicit Apply, Revise with Luna, and Dismiss actions. Applying once visibly settles the card; retries never produce duplicate patterns or occurrences.

## Completion motion

- Completion feedback begins on press instead of waiting for persistence: sweep a restrained lime-to-gold highlight across a closed activity or the shared header of an expanded activity, briefly pop the checkmark, then settle into the normal Done state.
- Keep the celebration under 720ms, non-blocking, and free of layout movement. Under reduced motion, replace travel and scaling with a short highlight fade.
- Skip uses a separate, quieter status motion: a neutral 250–350ms sweep and small skip-icon settle, never the celebratory lime-to-gold treatment. A skipped card remains readable and stays in its checklist position rather than joining completed activities.
- When Skip is used from an expanded activity, finish the status motion, collapse back to the list, and gently cue the next unfinished activity. Under reduced motion, use a short neutral fade before the same handoff.

## Activity workspace components

- Components use the shared workspace header, card, field, list, action, empty, loading, and error patterns.
- Luna chooses and fills approved components; she does not choose fonts, spacing, colors, arbitrary HTML, or one-off visual systems.
- Render a component only when it has enough supported information to be useful. Ask for missing information first when the component would otherwise be a hollow shell.
- Preserve stable component anatomy across activities while allowing the data and combination of components to fit the activity.
- Record/history information is scannable; current actions are visually stronger than historical details.
- Checklist rows are whole-row controls with an unmistakable check state and a minimum 44px mobile target. Use spacing and a quiet filled surface to group items; do not stack divider lines inside an already bordered workspace card.
- History is a read-only recap, not a timeline impersonation. Format machine dates for people, keep dates unbroken, and let titles/details reflow beside or beneath metadata without fixed narrow columns.
- On mobile, workspace cards keep their natural content height rather than stretching to fill the activity. When conversation is collapsed, a compact invitation directly below the workspace lets the person reopen Luna without speaking in internal component language.

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
