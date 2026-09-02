import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { millisecondsUntilNextLocalDay, reconcileLocalDay } from "../app/day-rollover.ts";

test("advances a page left on Today when the local date rolls over", () => {
  assert.deepEqual(
    reconcileLocalDay(
      { todayDateKey: "2026-08-28", viewDate: "2026-08-28" },
      "2026-08-29",
    ),
    { todayDateKey: "2026-08-29", viewDate: "2026-08-29" },
  );
});

test("preserves an intentional historical view while updating Today", () => {
  assert.deepEqual(
    reconcileLocalDay(
      { todayDateKey: "2026-08-28", viewDate: "2026-08-21" },
      "2026-08-29",
    ),
    { todayDateKey: "2026-08-29", viewDate: "2026-08-21" },
  );
});

test("does not create a navigation update while the local date is unchanged", () => {
  const current = { todayDateKey: "2026-08-29", viewDate: "2026-08-29" };
  assert.equal(reconcileLocalDay(current, "2026-08-29"), current);
});

test("schedules the rollover just after the next local midnight", () => {
  const now = new Date(2026, 7, 28, 23, 59, 59, 500);
  assert.equal(millisecondsUntilNextLocalDay(now), 600);
  assert.equal(millisecondsUntilNextLocalDay(new Date(2026, 7, 28, 12)), 43_200_100);
});

test("wires date changes and wake events into a fresh current-day load", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /setDayNavigation\(\(current\) => reconcileLocalDay\(current, observedDateKey\)\)/);
  assert.match(page, /window\.addEventListener\("focus", syncAfterWake\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(page, /const date = todayDateKey;/);
  assert.match(page, /const endpoint = `\/api\/day\?date=\$\{date\}`;/);
  assert.match(page, /\}, \[todayDateKey\]\);/);
  assert.doesNotMatch(page, /const \[viewDate, setViewDate\] = useState\(localDateKey\)/);
});

test("revalidates the shared day after wake and while a tab remains visible", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const DAY_SYNC_INTERVAL_MS = 15_000/);
  assert.match(page, /`\/api\/day\?date=\$\{todayDateKey\}&sync=1`/);
  assert.match(page, /void reloadToday\(\{ background: true \}\)/);
  assert.match(page, /document\.visibilityState === "visible" && localDateKey\(\) === todayDateKey/);
  assert.match(page, /window\.setInterval\([\s\S]*DAY_SYNC_INTERVAL_MS/);
  assert.match(page, /backgroundSyncBlockedRef\.current = !hasLoaded[\s\S]*saveState !== "saved"/);
  assert.match(page, /if \(background && backgroundSyncBlockedRef\.current\) return null/);

  const route = await readFile(new URL("../app/api/day/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(syncOnly\) \{[\s\S]*readDay\(userId, date, \{ queueWork: false \}\)/);
  assert.match(route, /if \(options\.queueWork !== false\) await queueDueFollowUps/);
});
