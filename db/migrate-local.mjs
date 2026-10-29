// Creates the local development database by applying the Drizzle migrations with Wrangler.
// The binding and placeholder database ID match vite.config.ts, so `npm run dev` reads the same
// local database. Wrangler records applied migrations, so running this again is safe.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const configPath = fileURLToPath(new URL("../.wrangler/local-migrations.json", import.meta.url));
mkdirSync(fileURLToPath(new URL("../.wrangler/", import.meta.url)), { recursive: true });
writeFileSync(configPath, JSON.stringify({
  name: "ideal-day-local",
  compatibility_date: "2026-08-01",
  d1_databases: [{
    binding: "DB",
    database_name: "site-creator-d1",
    database_id: "00000000-0000-4000-8000-000000000000",
    migrations_dir: "../drizzle",
  }],
}, null, 2));

const result = spawnSync("npx", ["wrangler", "d1", "migrations", "apply", "DB", "--local", "--config", configPath, "--persist-to", ".wrangler/state"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, CI: "true", WRANGLER_WRITE_LOGS: "false", WRANGLER_SEND_METRICS: "false" },
});
process.exit(result.status ?? 1);
