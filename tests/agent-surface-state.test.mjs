import assert from "node:assert/strict";
import test from "node:test";

import { agentSurfaceState } from "../app/agent-surface-state.ts";

test("keeps setup questions in conversation without opening workspace progress", () => {
  assert.deepEqual(agentSurfaceState("activity_setup"), {
    hasConversationJob: true,
    hasWorkspaceJob: false,
  });
});

test("shows workspace progress only for durable workspace refreshes", () => {
  assert.deepEqual(agentSurfaceState("workspace_refresh"), {
    hasConversationJob: false,
    hasWorkspaceJob: true,
  });
  assert.deepEqual(agentSurfaceState("variant_setup"), {
    hasConversationJob: false,
    hasWorkspaceJob: true,
  });
});

test("keeps user replies in conversation and legacy opens idle", () => {
  assert.deepEqual(agentSurfaceState("user_message"), {
    hasConversationJob: true,
    hasWorkspaceJob: false,
  });
  assert.deepEqual(agentSurfaceState("activity_opened"), {
    hasConversationJob: false,
    hasWorkspaceJob: false,
  });
  assert.deepEqual(agentSurfaceState(null), {
    hasConversationJob: false,
    hasWorkspaceJob: false,
  });
});
