# Ideal Day

A personal planning app built around activities, where an AI agent assembles each activity's interface from an app-owned component library.

## What it is

Ideal Day organizes a day around activities: strength training, cardio, a face-care routine, meals, supplements and more. Each activity has its own workspace, history and conversation. You tell the in-app agent, Luna, what you did or what you want ("I plan to use it once a week"), and the activity updates to match: a product card, a protocol, a cadence, a session log.

The premise, from `PRODUCT_SPEC.md`, is that a day is better organized around activities than around a calendar. Each activity combines a place in an ideal daily sequence, structured information relevant to it, a scoped conversation, and an agent that files new information into the right records. The home screen is a flexible daily checklist; clock scheduling is optional.

## What's interesting

- **The agent proposes, the app decides.** Luna never writes to the screen or the database. It returns typed actions (record, workspace, move, schedule proposal, dated occurrence), and `app/activity-record-model.ts` and `app/workspace-model.ts` validate them before anything is saved. A completion receipt is written only from changes that actually committed.
- **Bounded failure handling.** A rejected save gets one correction in the same session that quotes the exact reason and tells the model to ask a question instead of inventing data. A job fails after three attempts. Only malformed output and rejections raised before anything was saved are corrected; an ambiguous network or server failure is never replayed. See `bridge/result-correction.mjs` and `tests/bridge-correction.test.mjs`.
- **An app-owned component library.** The agent composes activities from the 26 component types in `bridge/component-catalog.mjs`. The app refuses to lease work to a bridge running a different catalog version, and a test fails if the `/components` workbench lacks a specimen for any catalog type. Products and devices are subject roots that own their records, and moving one between activities is a single validated action (`COMPONENT_RELATIONSHIPS.md`).
- **Durable agent work.** Jobs live in the database with leases and heartbeats, and every attempt gets a fresh agent session so retries cannot accumulate prompt history. The UI shows work immediately and says Luna will catch up when the agent is offline.
- **Model routing from an isolated eval.** The eval replays a real request through the production prompt, component catalog and validators, in throwaway sessions with nothing applied to the app. Configurations that failed the validators or filed data under the wrong activity were ruled out. Method and results are in `evals/README.md`.

## How it works

```
Browser --> App (vinext on Cloudflare Workers) --> D1 (SQLite, Drizzle)
                  ^   durable job queue: leases, heartbeats, validation
                  |   outbound HTTPS only
           Bridge worker (Node) --> local Hermes agent runtime --> model
```

- `app/` is the React 19 app on [vinext](https://github.com/cloudflare/vinext) (the Next.js App Router API on Vite), with the API routes and validators. The schema is in `db/` and 25 Drizzle migrations are in `drizzle/`.
- `bridge/` is a Node worker that polls the app for jobs, builds the prompt from the component catalog and the activity's records, calls the agent runtime, and posts the result back for validation. Linked pages are fetched and cached before the building step.
- Luna has two paths: a fast conversational model that acknowledges and answers right away, and a separate building model that does the durable work. Model IDs are set in `bridge/ideal-day-bridge.mjs` and can be overridden by environment variable.
- `vercel-gateway/` is a small Vercel project that adds a two-user password login in front of the app (scrypt-hashed passwords, signed session cookies).
- Specs: `PRODUCT_SPEC.md`, `DESIGN_SYSTEM.md`, `SCHEDULING_SYSTEM_SPEC.md`, `COMPONENT_RELATIONSHIPS.md`.

## Running it locally

Requires Node.js 22.13 or later. Development and tests run on Windows; the bridge launcher scripts (`bridge/*.ps1`) are PowerShell.

```bash
npm ci
npm run dev        # http://localhost:3000, with a local simulated D1 database
npm test           # build, then the app tests and the gateway tests
npm run lint
```

The app, tests and lint need no environment variables and no API keys. Without the bridge running, agent requests queue until a worker picks them up.

To run the agent, start the Hermes agent runtime with a profile named `ideal-day` (API server on `127.0.0.1:8643`), then run `npm run bridge`. Against a non-local app URL the bridge needs `IDEAL_DAY_APP_URL`, `IDEAL_DAY_BRIDGE_TOKEN` and `IDEAL_DAY_SITES_BYPASS_TOKEN`. All variable names are listed in `.env.example`, and the gateway's are in `vercel-gateway/.env.example`.

## Status

In use at home since August 2026. The agent builds each activity's interface through the validated path described above, and the model routing is the result of the eval in `evals/`. The repository has 49 test files for the app and 3 for the gateway.

## How it was built

Designed and directed by Darren Mills, built with AI coding agents. See `AGENTS.md` for the rules the agents work under. The specs in the repository are the contracts the agents build against, and `SMART_FLOW_USER_TESTING.md` is the brief an agent follows when it tests the product as a user.

## License

No license yet.
