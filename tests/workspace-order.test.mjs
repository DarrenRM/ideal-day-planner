import assert from "node:assert/strict";
import test from "node:test";
import { orderWorkspaceDisplayItems } from "../app/workspace-order.ts";

const item = (id, displayRole) => ({ id, displayRole });

test("keeps streaks first, recurring actions directly beneath them, then countdowns and primary content", () => {
  const ordered = orderWorkspaceDisplayItems([
    item("primary", "primary"),
    item("resource-one", "resource"),
    item("support", "primary"),
    item("countdown", "countdown"),
    item("weekly", "recurring"),
    item("streak", "streak"),
    item("resource-two", "resource"),
  ]);

  assert.deepEqual(ordered.map(({ id }) => id), [
    "streak",
    "weekly",
    "countdown",
    "primary",
    "support",
    "resource-one",
    "resource-two",
  ]);
});

test("uses the streak as the first surface when no primary component exists", () => {
  const ordered = orderWorkspaceDisplayItems([
    item("resource", "resource"),
    item("countdown", "countdown"),
    item("weekly", "recurring"),
    item("streak", "streak"),
  ]);

  assert.deepEqual(ordered.map(({ id }) => id), ["streak", "weekly", "countdown", "resource"]);
});

test("does not manufacture an empty first slot for a standalone countdown", () => {
  const ordered = orderWorkspaceDisplayItems([
    item("resource", "resource"),
    item("countdown", "countdown"),
  ]);

  assert.deepEqual(ordered.map(({ id }) => id), ["countdown", "resource"]);
});
