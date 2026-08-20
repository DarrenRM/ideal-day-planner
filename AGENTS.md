# Ideal Day agent notes

- Production source of truth: the private Sites app at `https://ideal-day-sites.example` and its bound D1 database. Local D1 is disposable development data.
- Luna runs in the local Hermes `ideal-day` profile. API-server sessions expose only Hermes web research; the browser never connects to Hermes or receives credentials.
- A Windows task named `Ideal Day Hermes Bridge` starts Hermes if needed, then runs `bridge/start-ideal-day.ps1`. The bridge makes authenticated outbound HTTPS requests to production; no inbound localhost tunnel is used.
- Bridge secrets are user-bound DPAPI files in `%LOCALAPPDATA%\IdealDay`, never repository files. Rotate both the Sites bypass token and `IDEAL_DAY_BRIDGE_TOKEN` together with the local copies.
- Agent work is durable in D1. The UI shows work immediately while a message is saved and continues while the bridge heartbeat is online; queued offline work says Luna will catch up.
- Catalog v2 stores durable domain data in validated activity records and uses workspace revisions only for composition. Luna may emit bounded `recordActions` and `workspaceActions`.
- The approved catalog and recipe hints live in `bridge/component-catalog.mjs`; `app/activity-record-model.ts` and `app/workspace-model.ts` are the authoritative validators.
- Use `npm run dev` for UI work, `npm test` and `npm run lint` before committing, and the Sites build/hosting workflow for production changes.
