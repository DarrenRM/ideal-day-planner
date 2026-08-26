export type MobileDrawerInitialState = {
  canCollapse: boolean;
  hasConversation: boolean;
  hasConversationJob: boolean;
  openOnMount: boolean;
  preferConversation?: boolean;
  savedOpen: boolean | null;
};

export type MobileDrawerMessage = { id: string; author: "user" | "luna" };

export function latestLunaMessageId(messages: MobileDrawerMessage[]) {
  return [...messages].reverse().find((message) => message.author === "luna")?.id ?? null;
}

export function unreadLunaMessageId(latestMessageId: string | null, lastSeenMessageId: string | null) {
  return latestMessageId && latestMessageId !== lastSeenMessageId ? latestMessageId : null;
}

export function shouldShowUnreadLunaBoundary({
  isInitialLoad,
  isDrawerOpen,
  isDocumentVisible,
}: {
  isInitialLoad: boolean;
  isDrawerOpen: boolean;
  isDocumentVisible: boolean;
}) {
  return isInitialLoad || !isDrawerOpen || !isDocumentVisible;
}

export function resolveMobileDrawerInitialOpen({
  canCollapse,
  hasConversation,
  hasConversationJob,
  openOnMount,
  preferConversation = false,
  savedOpen,
}: MobileDrawerInitialState) {
  if (!canCollapse || openOnMount) return true;
  if (savedOpen !== null) return savedOpen;
  return preferConversation || hasConversation || hasConversationJob;
}
