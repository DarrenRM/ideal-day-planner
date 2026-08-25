export type GlobalRequestPlan = {
  kind: "conversation" | "question" | "durable_work";
  outcomes: string[];
};

export type HandledOutcome = {
  index: number;
  via: "message" | "activity_work" | "schedule_change" | "schedule_proposal" | "occurrence" | "capture" | "clarification";
};

export function parseGlobalRequestPlan(value: unknown): GlobalRequestPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const kind = source.kind;
  if (kind !== "conversation" && kind !== "question" && kind !== "durable_work") return null;
  if (!Array.isArray(source.outcomes) || source.outcomes.length > 6) return null;
  const outcomes = source.outcomes.map((outcome) => typeof outcome === "string" ? outcome.trim().slice(0, 300) : "");
  if (outcomes.some((outcome) => !outcome)) return null;
  if (kind !== "conversation" && !outcomes.length) return null;
  return { kind, outcomes };
}

export function parseStoredGlobalRequestPlan(value: string | null | undefined): GlobalRequestPlan | null {
  if (!value) return null;
  try { return parseGlobalRequestPlan(JSON.parse(value)); } catch { return null; }
}

export function validateHandledOutcomes(value: unknown, plan: GlobalRequestPlan | null): HandledOutcome[] | null {
  if (!plan?.outcomes.length) return [];
  if (!Array.isArray(value) || value.length > 12) return null;
  const allowedVia = new Set<HandledOutcome["via"]>([
    "message", "activity_work", "schedule_change", "schedule_proposal", "occurrence", "capture", "clarification",
  ]);
  const handled: HandledOutcome[] = [];
  const seen = new Set<number>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const source = candidate as Record<string, unknown>;
    const index = typeof source.index === "number" && Number.isInteger(source.index) ? source.index : 0;
    const via = typeof source.via === "string" && allowedVia.has(source.via as HandledOutcome["via"])
      ? source.via as HandledOutcome["via"]
      : null;
    if (!via || index < 1 || index > plan.outcomes.length || seen.has(index)) return null;
    seen.add(index);
    handled.push({ index, via });
  }
  return seen.size === plan.outcomes.length ? handled : null;
}
