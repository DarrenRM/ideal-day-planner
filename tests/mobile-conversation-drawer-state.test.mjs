import assert from "node:assert/strict";
import test from "node:test";

import { resolveMobileDrawerInitialOpen } from "../app/mobile-conversation-drawer-state.ts";

const workspaceWithoutConversation = {
  canCollapse: true,
  hasConversation: false,
  hasConversationJob: false,
  openOnMount: false,
  savedOpen: null,
};

test("starts collapsed when an activity has workspace content but no conversation", () => {
  assert.equal(resolveMobileDrawerInitialOpen(workspaceWithoutConversation), false);
});

test("starts open when conversation is the only useful surface", () => {
  assert.equal(resolveMobileDrawerInitialOpen({ ...workspaceWithoutConversation, canCollapse: false }), true);
});

test("starts open for conversation history or an active conversation job", () => {
  assert.equal(resolveMobileDrawerInitialOpen({ ...workspaceWithoutConversation, hasConversation: true }), true);
  assert.equal(resolveMobileDrawerInitialOpen({ ...workspaceWithoutConversation, hasConversationJob: true }), true);
});

test("respects an explicit user choice after automatic defaults", () => {
  assert.equal(resolveMobileDrawerInitialOpen({ ...workspaceWithoutConversation, hasConversation: true, savedOpen: false }), false);
  assert.equal(resolveMobileDrawerInitialOpen({ ...workspaceWithoutConversation, savedOpen: true }), true);
});

test("an intentional open-on-mount request overrides a saved closed drawer", () => {
  assert.equal(resolveMobileDrawerInitialOpen({ ...workspaceWithoutConversation, openOnMount: true, savedOpen: false }), true);
});
