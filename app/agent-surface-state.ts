export type AgentJobKind = "activity_opened" | "activity_setup" | "user_message" | "workspace_refresh" | "variant_setup" | "global_message" | "global_refresh" | "follow_up";

export type AgentSurfaceState = {
  hasConversationJob: boolean;
  hasWorkspaceJob: boolean;
};

const IDLE_SURFACES: AgentSurfaceState = {
  hasConversationJob: false,
  hasWorkspaceJob: false,
};

export function agentSurfaceState(kind: AgentJobKind | null | undefined): AgentSurfaceState {
  if (kind === "activity_setup" || kind === "user_message" || kind === "global_message" || kind === "follow_up") {
    return { hasConversationJob: true, hasWorkspaceJob: false };
  }

  if (kind === "workspace_refresh" || kind === "variant_setup" || kind === "global_refresh") {
    return { hasConversationJob: false, hasWorkspaceJob: true };
  }

  return IDLE_SURFACES;
}
