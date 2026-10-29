# Ideal Day model-routing evaluation

This replay evaluates Luna model configurations against the same prompt builder, component catalog, JSON parser, record validators, and workspace validators used by the production bridge. Production D1 is read-only; every candidate runs in a new isolated Hermes API session and no candidate output is applied to the app.

## Current fixture

The fixture in `fixtures/skin-routine-beard-roller.mjs` is a production snapshot of the Skin routine activity, with product names, brands and links swapped for fictional ones. It replays this user message:

> hey i bought this https://kestrelgrooming.example/products/beard-grooming-roller and used it today. i plan to use it once a week as part of my hair routine

This case tests web research, product/device classification, a weekly substep, an event that happened today, preservation of existing components, and the conflict between the open `Skin routine` activity and the user's explicit `hair routine` destination.

## Run it

```powershell
npm run eval:model-routing
```

For repeat trials:

```powershell
$env:IDEAL_DAY_EVAL_RUNS = '2'
npm run eval:model-routing
```

Reports and full raw responses are written to `evals/results/`. They contain real activity context and should remain private.

## Findings from 2026-08-21

Three isolated trials were observed per configuration (one pilot plus a two-run comparison):

| Configuration | Valid app JSON | Mean latency | Source research | Caught Skin/Hair conflict |
|---|---:|---:|---:|---:|
| Luna medium · Fast | 0/3 | 35.9s | output discarded | 0/3 |
| Luna xhigh · Fast | 0/3 | 91.6s | output discarded | 0/3 |
| Terra none | 3/3 | 26.6s | 0/3 | 1/3 |
| Sol none | 3/3 | 61.6s | 3/3 | 0/3 |

Every Luna failure had the same serialization defect: the final resource-record action was missing one closing brace immediately before `workspaceActions`. The content was often thoughtful, but the app correctly rejected it, so it had zero production value and caused retries.

Terra none was the best fast compiler. It reliably produced valid bounded actions, but it was not comparable to Sol for this web-research case. Its best trial also demonstrated the safest UX: it noticed that the user named Hair routine while speaking inside Skin routine, asked where the device belonged, and made no writes.

Sol none was the strongest researcher and consistently distinguished the user's once-weekly plan from the manufacturer's twice-weekly suggestion. It was substantially slower and, in every trial, silently saved hair-routine data into Skin routine.

## Implemented routing after the evaluation

The production route now keeps the deterministic immediate acknowledgement, uses Luna low + Fast for conversation, and uses Terra low on the standard tier for durable compilation. The bridge fetches and caches linked pages before calling Terra, repairs a narrow class of malformed JSON locally, allows one in-session correction, and caps whole-job attempts at three.

On the exact Kestrel Grooming replay, Terra low standard returned five valid records and five valid components in 23.0 seconds. Terra low + Fast returned the same complete result in 22.6 seconds. The 0.4-second difference is not meaningful enough to justify Fast-tier spend, so standard is the default. The source snapshot is now reduced to structured product evidence when available instead of carrying storefront chrome into the prompt.

Cross-activity filing is an explicit typed action rather than a prompt-only destination guard. A second isolated replay of “hey i put this in the wrong spot, can you move it over” inferred Hair Routine from the permanent thread and selected the device, protocol, recurrence, usage event, and resource for one validated move in 4.8 seconds. It made no duplicate record/workspace writes and asked no unnecessary question. Run that replay with:

```powershell
node --experimental-strip-types evals/test-activity-move.mjs
```

## Ordering check

The persisted workspace retains stable component positions, but the production display layer deterministically places adherence first, countdowns second, and resources last. The evaluator applies that same display ordering before judging the final UI.

The detailed two-run report is `results/skin-routine-beard-roller-2026-08-21T20-39-04-270Z.md`.
