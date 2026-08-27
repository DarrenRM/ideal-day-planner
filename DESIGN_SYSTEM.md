# Ideal Day design system

This is the visual and interaction source of truth for Ideal Day. Read it before changing UI. `PRODUCT_SPEC.md` owns product behavior; this file owns presentation rules; `app/globals.css` contains the implemented tokens and selectors. When they disagree, do not silently choose one—bring the code and this document back into alignment.

## Character

- Calm, dark, focused, and personal rather than dashboard-like.
- Dense enough to support a full day, but never cramped or cryptic.
- Today’s activity sequence is primary. Expanded activities should feel like the natural open state of their list card, not a separate application.
- Activity color identifies context and active state. Green remains the global action/success accent.
- Prefer truthful empty, loading, error, and offline states over placeholder content or hollow domain components.
- The Sites-only `/components` workbench has three peer views: production component specimens, the canonical core activity library, and the component selection map. The activity view reads the same definitions used by onboarding and activity-to-recipe matching; it is not a second documentation-only copy.

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
- Truncate only genuinely single-line schedule labels. Never truncate conversation or explanatory content, except the deliberately concise two-line detail preview on a durable work receipt; `View` exposes the committed result.

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

## Luna visual identity

- Luna is represented by a code-native living halo: a transparent central opening, a restrained multicolor translucent ring, and a sparse connected field around it. It must remain recognizable from a 64px assistant control through a large working-state presentation.
- The approved geometry baseline is one circumference of identical overlapping radial lozenges—not squares, pronounced kites, petals, a smooth gradient ring, radial sunburst, or rotating rosette. Author the row first as a regular lozenge lattice in unwrapped `(angle, radius)` space, then wrap that strip around the opening. Each tile is centered on a radial midpoint and is slightly longer radially than tangentially. Its angular half-width equals one center spacing, so its clockwise tip lands on the next tile's radial midpoint and shares the exact coordinate of the counterclockwise tip two tiles later. This creates a true 50% overlap whose intersection is a smaller copy of the source lozenge in the underlying lattice. Add no second radial row until this base unit and its overlap have been explicitly reviewed.
- Map each lattice tile into screen space with sampled polar points. Give only the two edges facing the central opening one restrained, consistent outward convex bow; keep the two outer edges on the straighter lattice profile. Preserve the shared inner, outer, and side-tip anchors, and never let an inner edge cave into the tile. Do not construct the tile from four straight screen-space chords or apply a separate 3D tilt: those projections distort the intersections into asymmetrical kites. Keep the facet row flat-colored with transparent overlap only—no glow or gradient wash beneath it.
- Treat the opening, lozenge lattice, and connected outer field as independently tunable layers. The opening is a solid black disk beneath the facets. Its radius follows the same whole-lattice breathing scale and extends to the outer row's inward tips, plus a tiny underlap, so the disk edge always remains buried beneath the two facet rows. Clip constellation marks out of the opening. The avatar canvas stays transparent outside its drawn marks, and the field becomes progressively sparser and fainter with distance before dissolving at the canvas edge.
- Motion behaves like breathing rather than spinning. Idle is slow and quiet: the complete two-row lattice scales inward around the center as one rigid composition, preserving every overlap, while the constellation remains spatially fixed. Thinking keeps the same average brightness while pulsing faster and deeper, accelerating constellation changes, and doubling the shared palette rotation across both facets and constellation. It must communicate activity through motion rather than luminance. Individual stars brighten and dim on varied, continuous curves; they never switch between discrete lit and unlit states. Facet shimmer speed is measured as visible cycles per second and shimmer amount modulates opacity evenly above and below its base so both controls remain perceptible.
- Keep the avatar lightweight enough to repeat in normal app surfaces. Reuse one deterministic field definition across instances, render the slowly changing constellation independently from the smoother facet layer, and stop both layers while the avatar is off-screen or the document is hidden. Compact avatars reduce field density, glow size, and pixel density with their rendered size while retaining a clearly visible sparse constellation; never shrink the full large-format field into a bright, noisy knot or erase it into an empty ring.
- Compact assistant placement sits at the lower right and may carry one short speech bubble. The avatar opens the existing Notes & Assistant surface; it does not introduce a second conversation system.
- Preserve a transparent outer field so the avatar can sit over app surfaces. Avoid mascot faces, literal moons, neon cyberpunk treatment, particle explosions, or animation that competes with the current task.
- Under reduced motion, render one composed still frame and remove breathing transforms.
- The approved Luna ring uses 40 facets in both rows. The outer row anchors are `.645 / .778 / .898`; the inner row anchors are `.560 / .645 / .778`, so its outer tip lands exactly on the outer row's shared side-tip anchor. The outer row uses `.32` opacity, `.18` shimmer amount, and `1.01` shimmer speed. The inner row uses `.50` opacity, `.35` color lift, `.09` shimmer amount, and `.63` shimmer speed; all other inner-row values inherit the approved outer-row settings. Composite facets additively so translucent intersections become richer and more luminous against black instead of flattening into dull overlays.
- Breathing is a single facet-lattice scale pulse, never a per-row or per-tip deformation. Idle contracts by `6.5%` over `5.8s`; thinking contracts by `14%` over `2.9s`. The constellation does not scale with the breath. Color rotation defaults to `30°/s` in idle and exactly doubles in thinking across both facets and constellation.
- The `/luna-demo` lab preserves the approved ring geometry and focuses only on idle/thinking motion plus complete, facet-only, constellation-only, and compact scale comparisons. It may tune idle contraction/cycle and thinking contraction/cycle/constellation activity. Copied demo settings contain only these mode values and their derived color-rotation speeds.

## Responsive layout

Treat these as intentional test widths, not device guesses: 1040, 800, 680, 430, 360px, plus a wide desktop.

- Wide desktop: content is capped at 1180px; the summary rail is 294px; schedule and summary may sit side by side.
- At 1040px: collapse the main layout to one column.
- At 680px and below: begin directly at Schedule; hide desktop hero/summary content; remove the schedule's redundant outer card; use edge space carefully.
- Mobile collapsed activity: icon and title first; a plain-language activity length such as “5 minutes” beneath it on the left with separate minus/plus buttons immediately after it; category/status aligned on the right; overflow menu and completion at upper right. Day Timeline adds clock time without changing the header anatomy. Long titles ellipsize instead of squeezing controls.
- Mobile expanded activity: reuse the same header structure and controls as the collapsed activity. Preserve one continuous full-screen shell; stack workspace above conversation. When conversation is collapsed, keep only the large Skip/Mark Complete actions directly above its bottom handle. Opening conversation slides over and hides those actions; it does not resize or remove them mid-transition.
- In its header, treat the activity title and metadata as one group while preserving a 6px optical separation between their rows.
- The full-screen mobile expanded shell is flush to every viewport edge and has no inherited outer padding; its header, workspace, conversation, and footer own their internal spacing.
- Move directly from the activity header into workspace components and conversation. Do not repeat the activity category/title or reserve a permanent context strip for duration/status already visible elsewhere.
- Checklist mode must not leave blank columns, labels, padding, or controls where Timeline information would have appeared. Timeline-on and Timeline-off are deliberate layouts, not visibility patches over one layout.
- Never solve a narrow layout by reducing text below its semantic role. Reflow, stack, shorten nonessential copy, or move actions into an overflow menu.
- Test mobile layouts with long titles, active/complete/skipped states, open menus, a multiline Luna message, populated records, empty state, loading state, and the on-screen keyboard assumption.
- Do not reserve a visible drag handle. A closed activity is itself the reorder surface: drag directly with a mouse, or hold briefly and drag on touch. A normal tap still opens it; `Alt` + arrow keys reorder a focused activity without dragging.
- On touch, a held activity lifts into a full-card drag ghost while one same-height dashed slot shows the exact destination and surrounding cards reflow around it. Keep reordering within the activity’s current commitment segment; moving between Essentials, Going further, and Keep it going requires the explicit role action rather than a drag side effect.

## Scheduling surfaces

- Add Activity keeps simple scheduling compact: no schedule, every day, selected weekdays, every N days, create a sequence, or describe it to Luna. A separate progressive `Set this up with Luna` disclosure accepts a product link or useful context without forcing the person into schedule language. Saving the activity itself is immediate and never waits for Luna.
- Manage Routine is an overview, not a database-shaped card wall. Present the model as a subset and its library: lead with the Essential activity count, state the total in `All Activities`, then place compact Essentials and All Activities disclosures inside the plan summary surface. Keep both collapsed by default, allow only one open at a time, and do not repeat administrative overlines such as `Core set` or `Activity library`. Show custom schedules and nested scheduled steps as separate secondary timing details, and show Paused only when it contains restorable rules. `All Activities` is the complete catalog and therefore includes Essentials; never use it as a euphemism for only non-essential activities. Keep one `Adjust with Luna` action for changing priorities or future schedules.
- When a scheduled activity contains a validated recurring step with a different cadence, Manage Routine adds one conditional `Within activities` / `Scheduled steps` section between custom rules and ordinary daily activities. Group steps beneath their parent activity, show the parent as the daily activity rather than reclassifying it, and state each nested cadence plus its next occurrence. Count these as scheduled steps in the summary, never as additional activities or custom parent schedules.
- The schedule header uses a vertical-ellipsis overflow control and a concise `+ Add` action. Its overflow menu opens directly into actions without a redundant decorative heading.
- On the mobile home screen, omit the branded app bar so the dated day surface begins at the safe-area inset. Keep the date and day-level actions as the primary row. Beneath it, show one quiet `Yesterday` action by default; reveal `Earlier`, conditional `Later`, and `Today` only while reviewing history. Do not render inactive calendar controls or repeat `Today` as a status label.
- A past day uses a correction-only list styled like expanded Highlight history: activity icon, title, completion state, duration, and one whole-row completion toggle. Hide planning, adding, rearranging, optional suggestions, achievements, and activity expansion while reviewing history.
- A compact routine row shows an activity or rotation title, a plain-language recurrence, and rotation steps only when relevant. A custom whole-activity recurrence also shows its next three human-readable occurrences on a third line: keep the cadence muted and the upcoming dates green. The whole row opens a focused editor; trailing controls consistently place the overflow menu immediately before the far-right disclosure chevron. The overflow menu contains the infrequent Pause or Restore action.
- Nested scheduled steps use a quiet child connector beneath their parent activity. Keep the child cadence muted and its single nearest due state green; provide one section-level `Adjust` action that opens Luna with scheduled-step context rather than implying a complete manual editor exists.
- A one-activity editor exposes recurrence first. Start and end dates live under Advanced options, and internal names, revision data, cursor state, plan roles, and duplicate labels never appear. Changes explicitly target future days and leave today unchanged.
- A rotation editor adds only the complexity the person needs: ordered activity/variant steps, cadence, advancement behavior, starting step, and a short next-three preview. Do not show four competing previews or repeat the same name in multiple fields.
- A resolved variant is part of the activity identity for that occurrence. Prefer `Activity — Variant` on one line; on constrained mobile widths retain the activity title and place the variant on a subordinate line rather than shrinking either below its type role.
- Today-only editing uses an occurrence sheet/modal with explicit activity, variant, date, duration, and label fields. It must communicate that the change affects this occurrence. Clear user-authored cadence and Essential/More-for-today changes apply directly through Luna when their exact targets are available. Proposals remain a presentation for proactive Luna-originated recommendations; ambiguous requests ask for clarification.
- Activity-originated schedule work uses the workspace loading surface where the schedule result will land, never conversation typing dots after Luna has already acknowledged the request. Success refreshes the schedule card and produces a concise completion message. Failure remains visible with a retry action.
- Site-wide Luna opens from the app shell as a right-side drawer on desktop. On mobile, the home screen uses a full-width accent-colored `Notes & Assistant` handle with unread treatment and no connection-status copy; the entire handle opens the conversation. The open sheet keeps that same accent handle at its top, and the entire handle closes it. The sheet remains mounted but inert while closed so the conversation continuously rises from the bottom handle and returns to it without a remount flash. Its feed is preloaded while closed, and newly committed receipt cards settle into the chronology with a short motion instead of appearing abruptly. Messages, work state, clarification, and proposal cards survive closing and reopening. Root-conversation work uses the familiar Luna typing dots after the immediate acknowledgement; it never substitutes a technical progress card for conversation feedback. A delegated activity receipt is the authoritative completion state. Pressing `View` keeps the receipt, closes the root drawer, and transitions directly into the affected activity.
- A schedule proposal card must distinguish today impact from future-pattern impact and provide explicit Apply, Revise with Luna, and Dismiss actions. Applying once visibly settles the card; retries never produce duplicate patterns or occurrences.

## Daily commitment tiers

- `Essential` and `Go Further` are hierarchy, not categories and not provenance. Never color or badge an activity differently because it was seeded, user-created, or Luna-created.
- Essentials use the full standard activity-card anatomy and establish the initial daily progress denominator. An explicitly activated Go Further activity temporarily joins today's denominator in a separate `Going further` segment; it never appears beneath the Essentials heading, and an unchosen option never joins the denominator.
- Go Further is one bounded surface beneath the working list with a single visible heading, `More for today`, and one concise stretch-goal support line. Do not repeat `Go Further` as a second visible title. Its options use a compact 52–56px inert information row with the normal activity icon/color, title, duration/category metadata, and one explicit `Add` button—never an unchecked completion circle and never a whole-row add target.
- `Keep it going` is a labeled continuation segment at the end of today's working activity list for three days after an extra is completed. Those items are already part of today: render the exact standard activity-card anatomy and interactions beneath the heading, with no add affordance, special card treatment, or explanatory subcopy. They expand today's denominator for that date without changing the recurring activity's Go Further role. Skipping resolves one without improving the completed fraction, and the quiet three-day continuation window remains; do not add streak pressure, warning color, or chat interruptions.
- Show at most three options before `See all`. The surface should feel invitational, not like an overflowing second task list; avoid guilt copy, percentages, or “incomplete” states.
- Activating an option should preserve spatial continuity: animate the compact option into a normal card in the `Going further` segment in roughly 500ms, temporarily disable newly exposed Add controls, then provide a short `Added to Going further · Undo` affordance and the existing next-item cue. `Return to More for today` reverses the same dated activation with equivalent spatial continuity. Under reduced motion, use immediate placement with a short opacity settle.
- Activated extras join today's working denominator immediately and join Completed when finished. Skipping resolves one without increasing the completion fraction: it remains in the denominator and never joins Completed. Unchosen extras remain absent from progress and disappear naturally when the dated plan rolls over.

## Completion motion

- Completion feedback begins on press instead of waiting for persistence: sweep a restrained lime-to-gold highlight across a closed activity or the shared header of an expanded activity, briefly pop the checkmark, then settle into the normal Done state.
- After that feedback settles, a completed activity leaves the working checklist and lands as its category-colored icon in the compact Completed panel. The panel count and icon may settle/pop, but the remaining checklist must reflow calmly and preserve the next-activity cue.
- Completed shows every completed activity as a compact icon grid and expands into readable completion history. Its heading uses the terse uppercase overline role, and the icons need no secondary completion dots because every icon in this surface is complete by definition. It is a progress surface, not a second stack of full activity cards; skipped activities remain in the checklist.
- Completed adapts its density to the amount completed and is never shorter than a collapsed activity card at the same viewport. With one completion, omit the redundant progress ring and use a larger icon with the activity title as immediate deterministic copy; with two or three, use larger tiles; with four or more, use the compact grid. Keep equal optical space above and below the panel. Luna's optional editorial review is silent: never show typing dots or leave this progress surface visibly waiting for generated copy.
- When the progress ring is present, center a compact completed/selected fraction such as `2/6`. Essentials create the starting denominator and activated extras expand it for that date. Skipping leaves both values unchanged and is represented by the skipped row, not by inflated progress. Do not add a second `done` label. Supporting copy is never blank: use the longest completed block as the immediate factual fallback, then replace it only when Luna returns a stronger supported highlight.
- Luna highlight copy is optional and earned. Select one dominant, concrete, evidence-backed streak, milestone, completion cluster, effort, comeback, or personal best rather than summarizing the day. Keep it headline-short and clamp it to two lines beneath the overline so the entire copy block never exceeds three lines; when nothing is genuinely notable, keep the count and icon grid without fallback encouragement.
- Once all Essentials are complete, completing the final remaining activity selected for today triggers one contained `Day Bloom` inside Completed: the progress ring closes and briefly resolves to a check, a lime-to-gold trace travels around the panel, and the completed icons illuminate in a quick stagger. Remove the empty working-list heading and zero-left count only when the completion has settled into Completed. Keep the `More for today` invitation concise and unchanged rather than adding another completion message there. Do not replay the bloom on reload or use it for ordinary completions.
- Once all essentials are settled and every deliberately chosen extra is resolved, keep a permanent achievement beacon between Completed and Go Further. It is a distinct, non-interactive victory state—not another progress summary. Use `Essentials complete` only when every Essential was completed; if any were skipped, use the truthful `Today settled` state and state the skipped count without changing Completed. It remains on reload; only its arrival animation is event-driven. Choosing an extra temporarily yields the beacon to a `Going further` work state; finishing or skipping that commitment restores it. Go Further follows as an optional encore rather than visually replacing the achievement.
- Keep the celebration under 720ms, non-blocking, and free of layout movement. Under reduced motion, replace travel and scaling with a short highlight fade.
- Skip uses a separate, quieter status motion: a neutral 250–350ms sweep and small skip-icon settle, never the celebratory lime-to-gold treatment. A skipped card remains readable and stays in its checklist position rather than joining completed activities.
- When Skip is used from an expanded activity, finish the status motion, collapse back to the list, and gently cue the next unfinished activity. Under reduced motion, use a short neutral fade before the same handoff.

## Activity workspace components

### Component library workbench

`/components` is the Sites-only living reference and design workbench for activity components. It must render the same production component primitives used inside activities, hydrated with synthetic records; do not create visually similar demo-only copies. Its inventory includes the approved record/workspace catalog, meaningful presentation variants, and app-owned activity surfaces such as streaks, schedule summaries, check-ins, workspace states, invitations, durable conversation work receipts, and multi-subject navigation. Selection guidance comes from the approved component catalog and composition recipes, and the page documents semantic display order and explicit ownership/linking rules. “Good fits” describes intended applicability; “Used on” is derived from the current production activity, workspace, follow-up, schedule, and receipt state and must not be hand-maintained. Production component changes should therefore appear in the workbench automatically, and design changes made through the workbench should update the shared production primitive rather than a specimen wrapper.

- Components use the shared workspace header, card, field, list, action, empty, loading, and error patterns.
- A product or device owns its own streak/rhythm whenever multiple items have different starts, cadences, or completion histories. Render that rhythm inside the product card above its protocol. Only collapse rhythms into one activity-level streak when the subjects are strictly synchronized. A daily subject begins with an inviting `Day 1` state. A non-daily subject uses a compact dated rhythm rail with its nearest real occurrence emphasized; never label future occurrences `Use 1`, `Use 2`, or similar. Newly added items show a clear first/start date and never borrow the activity's older checked days.
- A whole-activity schedule card appears only when its recurrence carries useful information beyond an endless one-step daily default: selected weekdays, every-N-days cadence, a bounded schedule, completion-driven advancement, or a multi-step rotation. It shows the plain-language rule plus the next three occurrences, emphasizing the nearest one; rotation occurrences include their resolved variant or step label. A recurring sub-item keeps its own recurring-step component and never causes the parent activity to claim that cadence.
- A recurring step remains visible between dates so the person can understand the rhythm and see that the current cycle is complete. Between occurrences it is a compact status surface, not an overdue task; when already completed in the current cycle, place one compact check immediately before the `Last used` value and remove the redundant action row, title, and repeated cadence note. A completion made today keeps that compact checked value reversible. Equipment is a compact shared reference, an activity event is a concise dated recap, and a session choice uses whole-row 44px controls. An intentional workout open choice must look actionable and purposeful rather than incomplete.
- Recurring steps sit directly beneath adherence/streak content and before countdowns or the main activity cards. This keeps infrequent actions and their status near the top instead of burying them beneath reference material. Each recurring card uses `Rhythm` as its overline, states the cadence in plain language, and shows a compact rail of real dated occurrences with the nearest one emphasized. Show `Last used` only when history exists; a brand-new rhythm shows only its meaningful first/start/next status. These dates and cycle state are derived by the app from completion history and the validated cadence; Luna does not write them as display copy.
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
- An activity with no useful workspace content still opens to conversation first. Its conversation header remains a working drawer control; collapsing it reveals one compact, truthful invitation to shape the activity with Luna. Never describe this idle state as Luna working or render a hollow domain component.
- The conversation drawer opens at the latest message unless the person deliberately scrolled upward. Composer focus, keyboard resizing, ready notices, and drawer transitions must not move a touch target between pointer-down and pointer-up.
- Product and device cards are visual parents. Identity leads, the product/device-specific icon tile sits at the top-right, rhythm and protocol follow, and one final `About` subsection owns the concise description and source links. Nested protocol/resources never render again as peer cards.
- When an activity owns more than one product or device, lead the workspace with normal, unboxed activity-action tabs and no redundant `Overview` heading. The tab rail sits directly in the workspace above its panel; it is never wrapped in another workspace card. Tabs name concrete routine actions (`Face serum`, `Brush teeth`) and show each action's next meaningful date as `Today`, `Friday`, or another concise date without a `Due` prefix. Daily actions sort before non-daily actions so the default panel is useful every day; otherwise preserve their authored order. Products and devices used together share an explicit `routineAction` and appear as supporting detail in that action's tab panel. Do not show setup language, inventory counts, cramped product tabs, or product names as primary navigation. Selection uses a quiet activity-color underline, never a checkmark or another completion symbol. Preserve every subject's independent record ownership, rhythm, protocol, and sources. This pattern applies across activities; it is not a Bed Routine special case. Keep both desktop panes inside one viewport-bounded workbench and let workspace and conversation scroll independently.
- Completed expanded activities hide Skip for Today. Completion is passive status in the header/footer; the explicit `Mark incomplete` action lives in the overflow menu.

## Conversation

- Follow familiar messaging conventions: readable bubbles, restrained timestamps, clear sender distinction, delivery checkmarks, and a multiline composer with a visible Send action.
- The conversation follows the latest message only when the user is already near the bottom or has just sent a message.
- Interface guidance, loading indicators, and empty-state copy must not masquerade as messages from Luna.
- Human-facing copy describes the person's activity and outcome, never internal component, record, job, or rendering machinery.
- Durable work appears chronologically in the conversation as a verified work receipt, not as a transient success toast. Activity and site-wide conversation feeds render the same shared receipt primitive. A receipt uses the activity icon and color when available, leads with a stable event label such as `Activity moved`, and uses the specific result title as its at-most-two-line subtext. Detailed audit copy remains durable but does not compete in the card. It is never generated merely because the workspace signature changed.
- Work receipts cover applied activity updates, direct schedule changes, subject moves, and scheduled check-ins. Proposed, failed, no-op, and acknowledgement-only work produces no success receipt.
- Site-wide Luna acknowledges linked-source research immediately, then delegates durable changes silently. The coordinator never claims that delegated work failed or succeeded; only the specialist's committed receipt reports the outcome.
- Receipts remain in history after `View` is pressed. Viewing may quiet the receipt, collapse the mobile conversation drawer, scroll to the workspace result, and briefly trace the target surface; it never deletes the audit artifact. Reduced motion uses a static highlight.

## Change checklist

Before finishing a UI change:

1. Confirm the change follows the semantic type roles and does not introduce sub-11px text.
2. Check wide desktop and the 680, 430, and 360px mobile layouts.
3. Check default, active, complete, skipped, expanded, loading, empty, error, and menu-open states affected by the change.
4. Check keyboard focus, accessible names, text enlargement, reduced motion, and touch sizing.
5. Prefer shared tokens and component patterns; document a genuinely new pattern here before repeating it.
6. Run `npm run lint` and `npm test` before committing.
