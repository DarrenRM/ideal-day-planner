import assert from "node:assert/strict";
import test from "node:test";

import { createDailySelectionSaveQueue } from "../app/daily-selection-save-queue.ts";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function nextTurn() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("serializes rapid selection saves and persists the latest tapped state", async () => {
  const first = deferred();
  const second = deferred();
  const calls = [];
  const savingStates = [];
  const queue = createDailySelectionSaveQueue({
    save: async (itemIds) => {
      calls.push(itemIds);
      return await (calls.length === 1 ? first.promise : second.promise);
    },
    onSavingChange: (saving) => savingStates.push(saving),
  });

  queue.push(["e"]);
  queue.push(["e", "k"]);
  queue.push(["e", "k", "zinc"]);
  await nextTurn();
  assert.deepEqual(calls, [["e"]]);

  first.resolve(true);
  await nextTurn();
  assert.deepEqual(calls, [["e"], ["e", "k", "zinc"]]);

  second.resolve(true);
  await nextTurn();
  assert.deepEqual(savingStates, [true, false]);
  queue.dispose();
});

test("reports a failed selection save and accepts a later retry", async () => {
  const calls = [];
  let failures = 0;
  const queue = createDailySelectionSaveQueue({
    save: async (itemIds) => {
      calls.push(itemIds);
      return calls.length > 1;
    },
    onError: () => { failures += 1; },
  });

  queue.push(["e"]);
  await nextTurn();
  assert.equal(failures, 1);

  queue.push(["e", "k"]);
  await nextTurn();
  assert.deepEqual(calls, [["e"], ["e", "k"]]);
  queue.dispose();
});
