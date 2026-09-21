# Component relationships

Ideal Day keeps durable facts and visual composition separate, then joins them with explicit stable keys. This is the source of truth for that join.

## The three identities

- An activity is the long-lived context and conversation, such as Hair Routine.
- A record is durable domain data, such as the `beard-grooming-roller` product or its protocol.
- A workspace component is a presentation slot bound to one record through `recordKey`.

Component order controls presentation only. It never means that one record belongs to another.

## Subject ownership

A product or device record is a subject root. Its `subjectKey` is its own record key. Adherence, recurring-step, protocol, or Resources records that belong to that item carry the same `subjectKey`; a Resources entry also carries the same `itemKey`. Genuinely activity-wide records carry no `subjectKey`.

Product and device roots carry a concise `routineAction` for activity-level presentation. Subjects used together in one concrete action share the exact value—for example, toothpaste and an electric toothbrush both support `Brush teeth`. This groups subject cards beneath one activity-action tab without changing ownership: every subject remains an independent root and only records with its own `subjectKey` move or nest with it. A shared `routineAction` is never permission to merge histories, protocols, resources, or moves. The server rejects a changed product card that omits its action or its subject-owned adherence/recurring rhythm, so incomplete composition cannot silently reach the workspace.

The renderer may nest only explicitly owned `adherence`, `recurring_step`, `protocol`, and `resources` records inside a matching product/device card. It must not infer ownership from adjacency, titles, card count, or there being one product. Rhythm comes first, protocol follows, and the final `About` presentation owns the product description plus links from the nested resources record.

A product identity and its sources can be saved before its cadence is known. Check the saved routine and source evidence first, but do not treat ownership or manufacturer guidance as the person's usage schedule. When essential cadence remains unknown, omit the new tracked product card and ask a concise clarification; never invent cadence or historical completions just to satisfy composition validation. Once known, bind both the product and its subject-owned rhythm. Explicit pre-commit composition rejections return machine-readable issues for one bounded correction, not repeated blind retries.

Activity-wide adherence stays first at activity level. Due activity-wide recurring steps come directly beneath it, followed by countdowns and primary content; Resources remain last. A product-owned daily rhythm uses adherence with an explicit `effectiveDate`; an independently scheduled product uses recurring_step. A newly added subject never inherits the parent activity's earlier runs. Multiple product rhythms collapse to one shared activity streak only when every product has the same cadence, same start boundary, and synchronized completion history.

Completing an activity stores an immutable `completedSubjectKeys` snapshot in that run. The app includes only product/device subjects whose rhythm is due on that date. This lets later products start cleanly without rewriting what older completion rows meant. Explicit historical corrections retain that snapshot and store `correctedSubjectKeys` as effective attribution, including an explicit empty array. Schedule and workspace readers prefer corrected attribution when present. Atomic correction receipts retain before/after evidence for conflict-checked Undo. Subject moves retain a `history` relation to the source activity; past entries link to the current canonical owner instead of creating duplicate records.

A `daily_selection` is activity-wide and carries no `subjectKey`. With `kind:routine`, it owns the primary interaction; its item `subjectKey` links place product information and optional session details under a closed reference disclosure rather than competing product tabs. Workspace composition removes those owned primary bindings without removing the records. Its roster and dated entries are one canonical record; recent-history presentation is derived from those entries and must not be split into a peer `history` record.

A `meal_log` is activity-wide and carries no `subjectKey`. It owns optional reusable recipes and the dated meal, shake, or food-prep entries that reference them. Recipe links and ingredients remain inside this record rather than becoming adjacent `resources`, `item_list`, or `history` records.

A workout phase is an activity- or variant-scoped `protocol` with no `subjectKey`. It carries the target workout's `workoutRecordKey` and a bounded `phase` of `warmup` or `cooldown`. The renderer nests it inside that workout's strength session before or after the numbered exercises. A warm-up is never inferred from card adjacency or numbered as an exercise; an unlinked protocol remains an independent activity card.

## Moving a subject

Within a `kind: routine` daily selection, optional `parentItemId` groups modes beneath one roster item. Both parent and children retain the same explicit `subjectKey`; grouping does not create new products or activity variants. Only one nesting level is valid. Children use the existing dated item IDs/counts and may reference separate recurring-step records. A child use satisfies its parent's general cadence, but never another child's cadence. Parent IDs in older entries represent uses with no recorded mode and must not be reclassified. Device details are nested within the parent; existing separate device session notes remain read-only, not a second count source.

`move_subject` names one subject root and a destination activity. The server resolves the root and every record with the same `subjectKey`, plus unambiguous dated/cadence records that explicitly reference the subject through `itemKey`. It moves their workspace bindings atomically. Conversation stays in the original activity as audit history.

The durable move receipt remains in that original conversation, but its `View` target is the destination activity. Moving a nested recurring step does not change the destination activity's permanent Essential/Go Further role; when the step is due, day resolution temporarily activates the destination parent while keeping nested-step detail inside the expanded activity workspace.

Luna must keep unrelated subjects in separate protocol and Resources records. This makes movement bounded and prevents a moved device from leaving links or directions behind. Shared or mixed legacy data is migrated or separated before a move; it is never guessed at render time.

## Changes checklist

When adding or changing a component:

1. Decide whether its data is activity-wide or owned by one product/device.
2. Validate and preserve `subjectKey` and any entry-level `itemKey` in the record model.
3. Bind the workspace slot by `recordKey`; do not encode ownership in component IDs or order.
4. Verify rendering, movement, retries, and legacy backfill independently.
5. Add a migration for stored legacy data when a relationship contract changes.
