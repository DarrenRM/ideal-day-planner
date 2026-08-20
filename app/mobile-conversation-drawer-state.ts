export type MobileDrawerInitialState = {
  canCollapse: boolean;
  hasConversation: boolean;
  hasConversationJob: boolean;
  openOnMount: boolean;
  savedOpen: boolean | null;
};

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
