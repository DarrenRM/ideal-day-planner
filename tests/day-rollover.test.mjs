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
