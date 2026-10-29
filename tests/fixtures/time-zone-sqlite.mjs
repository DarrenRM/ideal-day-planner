import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { REMEMBER_TIME_ZONE, SELECT_USER_TIME_ZONE } from "../../app/api/time-zone-sql.ts";
import { canonicalTimeZone } from "../../app/time-zone.ts";

const UTC_DEFAULT_MIGRATION = "0025_opposite_loki.sql";
const sqlite = new DatabaseSync(":memory:");
const migrations = (await readdir(new URL("../../drizzle/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort();
const apply = async (name) => sqlite.exec(await readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8"));

// An account created before the change keeps the zone it already has.
for (const name of migrations.filter((name) => name < UTC_DEFAULT_MIGRATION)) await apply(name);
sqlite.exec(`
  INSERT INTO users (id) VALUES ('existing');
  INSERT INTO settings (user_id, time_zone) VALUES ('existing', 'Europe/Berlin');
`);
for (const name of migrations.filter((name) => name >= UTC_DEFAULT_MIGRATION)) await apply(name);

const zoneOf = (userId) => sqlite.prepare(SELECT_USER_TIME_ZONE).get(userId).timeZone;
assert.equal(zoneOf("existing"), "Europe/Berlin");

// A new account starts in UTC until its browser reports a zone.
sqlite.exec(`
  INSERT INTO users (id) VALUES ('new');
  INSERT INTO settings (user_id) VALUES ('new');
`);
assert.equal(zoneOf("new"), "UTC");

const remember = (userId, value) => {
  const zone = canonicalTimeZone(value);
  return zone ? Number(sqlite.prepare(REMEMBER_TIME_ZONE).run(zone, userId, zone).changes) : 0;
};
assert.equal(remember("new", "america/new_york"), 1);
assert.equal(zoneOf("new"), "America/New_York");
assert.equal(remember("new", "America/New_York"), 0, "an unchanged zone is not rewritten");
assert.equal(remember("new", "Not/AZone"), 0, "an invalid zone is ignored");
assert.equal(zoneOf("new"), "America/New_York");
assert.equal(zoneOf("existing"), "Europe/Berlin", "one account's zone never changes another's");
