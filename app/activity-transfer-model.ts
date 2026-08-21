export type ActivityMoveAction = {
  op: "move_records";
  targetActivityId: string;
  recordKeys: string[];
};

function boundedIdentifier(value: unknown, maximum: number) {
  const identifier = typeof value === "string" ? value.trim().slice(0, maximum) : "";
  return identifier && /^[A-Za-z0-9][A-Za-z0-9:._%-]*$/.test(identifier) ? identifier : "";
}

function recordKey(value: unknown) {
  const key = typeof value === "string" ? value.trim().toLowerCase().slice(0, 80) : "";
  return key && /^[a-z0-9][a-z0-9-]*$/.test(key) ? key : "";
}

export function validateActivityMoveActions(value: unknown, sourceActivityId?: string | null): ActivityMoveAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const source = candidate as Record<string, unknown>;
    if (source.op !== "move_records") return [];
    const targetActivityId = boundedIdentifier(source.targetActivityId, 160);
    const recordKeys = Array.isArray(source.recordKeys)
      ? [...new Set(source.recordKeys.map(recordKey).filter(Boolean))].slice(0, 20)
      : [];
    if (!targetActivityId || targetActivityId === sourceActivityId || !recordKeys.length) return [];
    return [{ op: "move_records" as const, targetActivityId, recordKeys }];
  }).slice(0, 4);
}
