# Track record implementation — September 20, 2026

Activities is the default tab; Calendar remains a peer. Activity detail uses weekly chapters, dated recaps and an explicit status control. Back restores the originating directory/calendar or expanded activity workspace. The history API resolves owned client keys to canonical activity IDs.

Date-specific editors support product/mode selections and counts, explicit none, meal ingredients and quantities, session fields and notes, choices, adherence, recurring uses, existing strength sets and events. Status and recorded details remain independent. Corrections preserve measured runs, original completion evidence, other dates and recipe definitions. Missing dated occurrences can be deliberately recorded without inventing a timer or product use.

Saves use expected versions, atomic guards, idempotent receipts and Undo. Selection changes update related product cadence and effective run attribution together. Record revisions preserve old labels; saved item snapshots preserve future history. Agent writes protect corrections made after their source job/message began. Future record moves retain links from their prior activity.

Validation: npm test passed (236 application tests and 9 gateway tests); npm run lint passed. SQLite tests cover atomic rollback, conflicts, identity isolation, idempotency, Undo timestamps, preserved timers, exact combinations, explicit none, historical variant records without an occurrence, cadence synchronization, retained long histories and missing-day recording.

Browser checks on disposable local data: Activities default, weekly history, browser Back to the directory, workspace View all history and return to the expanded workspace; Green-to-Amber correction and Undo; skipped-to-completed correction and Undo; shake ingredient correction with supplements/completion retained; unsaved-edit navigation protection; mobile layout. Test fixture duplicates on Today were removed; preview now has four unique activities.

Limits: original timer measurements are retained as evidence, not rewritten. Existing strength sets are editable; this editor does not create an entire new workout. Archived records remain readable. Moves made before this change can only show an origin link if that relationship was saved; missing historical evidence is never fabricated. No production data is seeded or replaced, and no schema migration is required.
