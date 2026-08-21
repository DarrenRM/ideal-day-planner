# Component relationships

Ideal Day keeps durable facts and visual composition separate, then joins them with explicit stable keys. This is the source of truth for that join.

## The three identities

- An activity is the long-lived context and conversation, such as Hair Routine.
- A record is durable domain data, such as the `beard-grooming-roller` product or its protocol.
- A workspace component is a presentation slot bound to one record through `recordKey`.

Component order controls presentation only. It never means that one record belongs to another.

## Subject ownership

A product or device record is a subject root. Its `subjectKey` is its own record key. A protocol or Resources record that belongs to that item carries the same `subjectKey`; a Resources entry also carries the same `itemKey`. Genuinely activity-wide records carry no `subjectKey`.

The renderer may nest only explicitly owned `protocol` and `resources` records inside a matching product/device card. It must not infer ownership from adjacency, titles, card count, or there being one product. Resources are always the last nested section.

Adherence stays first at activity level. Due recurring steps come directly beneath it, followed by countdowns and primary content; Resources remain last. Recurrence, history, equipment, choices, and other activity-level records remain independent cards unless their component contract explicitly introduces subject composition later.

## Moving a subject

`move_subject` names one subject root and a destination activity. The server resolves the root and every record with the same `subjectKey`, plus unambiguous dated/cadence records that explicitly reference the subject through `itemKey`. It moves their workspace bindings atomically. Conversation stays in the original activity as audit history.

Luna must keep unrelated subjects in separate protocol and Resources records. This makes movement bounded and prevents a moved device from leaving links or directions behind. Shared or mixed legacy data is migrated or separated before a move; it is never guessed at render time.

## Changes checklist

When adding or changing a component:

1. Decide whether its data is activity-wide or owned by one product/device.
2. Validate and preserve `subjectKey` and any entry-level `itemKey` in the record model.
3. Bind the workspace slot by `recordKey`; do not encode ownership in component IDs or order.
4. Verify rendering, movement, retries, and legacy backfill independently.
5. Add a migration for stored legacy data when a relationship contract changes.
