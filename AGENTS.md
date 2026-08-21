# Ideal Day agent notes

- Production source of truth: the private Sites app at `https://ideal-day-sites.example` and its bound D1 database. Local D1 is disposable development data.
- Luna runs in the local Hermes `ideal-day` profile. API-server sessions expose only Hermes web research; the browser never connects to Hermes or receives credentials. D1 is durable memory, while each bridge attempt uses an isolated Hermes session so retries cannot accumulate prompt history. Web search uses the profile's keyless DDGS backend.
- A Windows task named `Ideal Day Hermes Bridge` starts Hermes if needed, then runs `bridge/start-ideal-day.ps1`. The bridge makes authenticated outbound HTTPS requests to production; no inbound localhost tunnel is used.
- Bridge secrets are user-bound DPAPI files in `%LOCALAPPDATA%\IdealDay`, never repository files. Rotate both the Sites bypass token and `IDEAL_DAY_BRIDGE_TOKEN` together with the local copies.
- Agent work is durable in D1. The UI shows work immediately while a message is saved and continues while the bridge heartbeat is online; queued offline work says Luna will catch up.
- Catalog v3 stores durable domain data in validated base or variant-scoped activity records and uses workspace revisions only for composition. Luna may emit bounded `recordActions`, `workspaceActions`, `scheduleProposal`, and allowlisted `occurrenceActions`.
- The approved catalog and recipe hints live in `bridge/component-catalog.mjs`; `app/activity-record-model.ts` and `app/workspace-model.ts` are the authoritative validators.
- Universal scheduling is D1-authoritative: `schedule_patterns` and ordered steps resolve idempotently into dated `daily_plan_items`. `app/schedule-model.ts` owns the pure language/validators; `app/api/schedule-store.ts` owns resolution; `app/api/schedule-proposal-service.ts` owns confirmed Luna proposals. Never edit an activity definition to represent a one-day change.
- Site-wide Luna uses the one global conversation and the same asynchronous bridge as activity Luna. Recurring changes require a revisioned proposal and confirmation; immediate writes are restricted to validated single-occurrence actions. `schedule_action_events` is the durable audit/idempotency boundary.
- Keep `backups/production-routine-2026-08-21.json` as the known-good production activity/order snapshot and `/restore`-compatible recovery input. Do not overwrite it with local development data.
- The default day mode is a flexible checklist. The persisted `Day Timeline` setting owns clock placement and scheduling semantics; activity-length controls remain available in either mode.
- Mobile collapsed and expanded activities share one header contract. Expanded footers keep only the large Skip and Mark Complete actions.
- Read `DESIGN_SYSTEM.md` before changing UI. It is the visual and interaction source of truth; `PRODUCT_SPEC.md` owns behavior and `app/globals.css` implements the tokens.
- Use `npm run dev` for UI work, `npm test` and `npm run lint` before committing, and the Sites build/hosting workflow for production changes.
