export type TimerWorkspaceComponent = {
  id: string;
  type: "timer";
  title: string;
};

export type CountdownWorkspaceComponent = {
  id: string;
  type: "countdown";
  title: string;
  durationSource: "activity" | "fixed";
  durationSeconds: number;
};

export type RoutineWorkspaceComponent = {
  id: string;
  type: "routine";
  title: string;
  recordKey?: string;
  summary?: string;
  steps?: string[];
  facts?: Array<{ label: string; value: string }>;
};

export const DATA_WORKSPACE_COMPONENT_TYPES = [
  "summary", "product", "protocol", "checklist", "item_list", "workout", "quick_log",
  "history", "comparison", "metric", "trend", "adherence", "timeline", "goal",
  "attention", "resources",
] as const;

export type DataWorkspaceComponentType = typeof DATA_WORKSPACE_COMPONENT_TYPES[number];

export type DataWorkspaceComponent = {
  id: string;
  type: DataWorkspaceComponentType;
  title: string;
  recordKey: string;
  presentation?: "default" | "compact" | "featured";
};

export type WorkspaceComponent = TimerWorkspaceComponent | CountdownWorkspaceComponent | RoutineWorkspaceComponent | DataWorkspaceComponent;

export type WorkspaceDocument = {
  version: 1;
  components: WorkspaceComponent[];
};

export type WorkspaceAction =
  | { op: "upsert"; component: WorkspaceComponent }
  | { op: "remove"; componentId: string };

export const EMPTY_WORKSPACE: WorkspaceDocument = { version: 1, components: [] };

function boundedString(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function componentId(value: unknown) {
  const id = boundedString(value, 64).toLowerCase();
  return /^[a-z0-9][a-z0-9-]*$/.test(id) ? id : "";
}

function recordKey(value: unknown) {
  const key = boundedString(value, 80).toLowerCase();
  return /^[a-z0-9][a-z0-9-]*$/.test(key) ? key : "";
}

function validateComponent(value: unknown, defaultCountdownSeconds: number): WorkspaceComponent | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = componentId(source.id);
  const type = source.type;
  if (!id) return null;

  if (type === "timer") {
    return { id, type, title: boundedString(source.title, 100) || "Timer" };
  }

  if (type === "countdown") {
    const hasExplicitDuration = typeof source.durationSeconds === "number";
    const durationSource = source.durationSource === "activity" || !hasExplicitDuration ? "activity" : "fixed";
    const requestedSeconds = hasExplicitDuration ? Math.round(source.durationSeconds as number) : defaultCountdownSeconds;
    return {
      id,
      type,
      title: boundedString(source.title, 100) || "Countdown",
      durationSource,
      durationSeconds: Math.min(24 * 60 * 60, Math.max(1, Number.isFinite(requestedSeconds) ? requestedSeconds : defaultCountdownSeconds)),
    };
  }

  if (type === "routine") {
    const title = boundedString(source.title, 100);
    if (!title) return null;
    const binding = recordKey(source.recordKey);
    if (binding) return { id, type, title, recordKey: binding };
    const steps = Array.isArray(source.steps)
      ? source.steps.map((step) => boundedString(step, 300)).filter(Boolean).slice(0, 12)
      : [];
    const facts = Array.isArray(source.facts)
      ? source.facts.flatMap((fact) => {
          if (!fact || typeof fact !== "object") return [];
          const entry = fact as Record<string, unknown>;
          const label = boundedString(entry.label, 100);
          const factValue = boundedString(entry.value, 300);
          return label && factValue ? [{ label, value: factValue }] : [];
        }).slice(0, 20)
      : [];
    return {
      id,
      type,
      title,
      summary: boundedString(source.summary, 500),
      steps,
      facts,
    };
  }

  if (DATA_WORKSPACE_COMPONENT_TYPES.includes(type as DataWorkspaceComponentType)) {
    const title = boundedString(source.title, 100);
    const binding = recordKey(source.recordKey);
    if (!title || !binding) return null;
    const presentation = source.presentation === "compact" || source.presentation === "featured" ? source.presentation : "default";
    return { id, type: type as DataWorkspaceComponentType, title, recordKey: binding, presentation };
  }

  return null;
}

export function validateWorkspaceActions(value: unknown, defaultCountdownSeconds: number): WorkspaceAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((action) => {
    if (!action || typeof action !== "object") return [];
    const source = action as Record<string, unknown>;
    if (source.op === "remove") {
      const id = componentId(source.componentId);
      return id ? [{ op: "remove" as const, componentId: id }] : [];
    }
    if (source.op === "upsert") {
      const component = validateComponent(source.component, defaultCountdownSeconds);
      return component ? [{ op: "upsert" as const, component }] : [];
    }
    return [];
  }).slice(0, 20);
}

export function applyWorkspaceActions(document: WorkspaceDocument | null, actions: WorkspaceAction[]): WorkspaceDocument {
  const components = [...(document?.components ?? [])];
  for (const action of actions) {
    if (action.op === "remove") {
      const index = components.findIndex((component) => component.id === action.componentId);
      if (index >= 0) components.splice(index, 1);
      continue;
    }
    const index = components.findIndex((component) => component.id === action.component.id);
    if (index >= 0) components[index] = action.component;
    else components.push(action.component);
  }
  return { version: 1, components: components.slice(0, 20) };
}
