export type AgentJobKind = "activity_opened" | "activity_setup" | "user_message" | "workspace_refresh";

export type AgentSurfaceState = {
  hasConversationJob: boolean;
  hasWorkspaceJob: boolean;
};

const IDLE_SURFACES: AgentSurfaceState = {
  hasConversationJob: false,
  hasWorkspaceJob: false,
};

export function agentSurfaceState(kind: AgentJobKind | null | undefined): AgentSurfaceState {
  if (kind === "activity_setup" || kind === "user_message") {
    return { hasConversationJob: true, hasWorkspaceJob: false };
  }

  if (kind === "workspace_refresh") {
    return { hasConversationJob: false, hasWorkspaceJob: true };
  }

  return IDLE_SURFACES;
}
