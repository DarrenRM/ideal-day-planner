import assert from "node:assert/strict";
import test from "node:test";

import {
  latestLunaMessageId,
  resolveMobileDrawerInitialOpen,
  unreadLunaMessageId,
} from "../app/mobile-conversation-drawer-state.ts";

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

test("prefers conversation for an empty workspace without overriding the person's saved drawer state", () => {
  assert.equal(resolveMobileDrawerInitialOpen({ ...workspaceWithoutConversation, preferConversation: true }), true);
  assert.equal(resolveMobileDrawerInitialOpen({ ...workspaceWithoutConversation, preferConversation: true, savedOpen: false }), false);
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

test("finds the newest Luna message without treating a user reply as Luna", () => {
  assert.equal(latestLunaMessageId([
    { id: "luna-1", author: "luna" },
    { id: "user-1", author: "user" },
    { id: "luna-2", author: "luna" },
    { id: "user-2", author: "user" },
  ]), "luna-2");
});

test("keeps a new Luna message unread until its exact id has been seen", () => {
  assert.equal(unreadLunaMessageId("luna-2", "luna-1"), "luna-2");
  assert.equal(unreadLunaMessageId("luna-2", "luna-2"), null);
  assert.equal(unreadLunaMessageId(null, "luna-1"), null);
});
