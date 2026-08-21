export type ActivityMoveAction = {
  op: "move_subject";
  targetActivityId: string;
  subjectKey: string;
};

export type SubjectMoveRecord = {
  key: string;
  subjectKey?: string | null;
  type: string;
  data: Record<string, unknown>;
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
    if (source.op !== "move_subject") return [];
    const targetActivityId = boundedIdentifier(source.targetActivityId, 160);
    const subjectKey = recordKey(source.subjectKey);
    if (!targetActivityId || targetActivityId === sourceActivityId || !subjectKey) return [];
    return [{ op: "move_subject" as const, targetActivityId, subjectKey }];
  }).slice(0, 4);
}

function collectSubjectReferences(value: unknown, references = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return references;
  if (Array.isArray(value)) {
    for (const entry of value) collectSubjectReferences(entry, references);
    return references;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if ((key === "subjectKey" || key === "itemKey") && typeof entry === "string") {
      const normalized = recordKey(entry);
      if (normalized) references.add(normalized);
    } else {
      collectSubjectReferences(entry, references);
    }
  }
  return references;
}

export function resolveSubjectMoveRecordKeys(records: SubjectMoveRecord[], subjectKeyValue: string) {
  const subjectKey = recordKey(subjectKeyValue);
  if (!subjectKey) return { recordKeys: [], ambiguousRecordKeys: [] };
  const recordKeys: string[] = [];
  const ambiguousRecordKeys: string[] = [];
  for (const record of records) {
    const explicitSubjectKey = recordKey(record.subjectKey);
    const references = collectSubjectReferences(record.data);
    const isRoot = record.type === "product" && recordKey(record.key) === subjectKey;
    if (isRoot || explicitSubjectKey === subjectKey || (references.size === 1 && references.has(subjectKey))) {
      recordKeys.push(record.key);
      continue;
    }
    if (references.has(subjectKey)) ambiguousRecordKeys.push(record.key);
  }
  return {
    recordKeys: [...new Set(recordKeys)].slice(0, 40),
    ambiguousRecordKeys: [...new Set(ambiguousRecordKeys)].slice(0, 20),
  };
}
