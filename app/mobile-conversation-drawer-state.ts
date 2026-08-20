export type MobileDrawerInitialState = {
  canCollapse: boolean;
  hasConversation: boolean;
  hasConversationJob: boolean;
  openOnMount: boolean;
  savedOpen: boolean | null;
};

export type MobileDrawerMessage = { id: string; author: "user" | "luna" };

export function latestLunaMessageId(messages: MobileDrawerMessage[]) {
  return [...messages].reverse().find((message) => message.author === "luna")?.id ?? null;
}

export function unreadLunaMessageId(latestMessageId: string | null, lastSeenMessageId: string | null) {
  return latestMessageId && latestMessageId !== lastSeenMessageId ? latestMessageId : null;
}

export function resolveMobileDrawerInitialOpen({
  canCollapse,
  hasConversation,
  hasConversationJob,
  openOnMount,
  savedOpen,
}: MobileDrawerInitialState) {
  if (!canCollapse || openOnMount) return true;
  if (savedOpen !== null) return savedOpen;
  return hasConversation || hasConversationJob;
}
