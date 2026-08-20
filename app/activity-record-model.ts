export const ACTIVITY_RECORD_TYPES = [
  "summary",
  "product",
  "protocol",
  "checklist",
  "item_list",
  "workout",
  "quick_log",
  "history",
  "comparison",
  "metric",
  "trend",
  "adherence",
  "timeline",
  "goal",
  "attention",
  "resources",
] as const;

export type ActivityRecordType = typeof ACTIVITY_RECORD_TYPES[number];

export type ActivityRecord = {
  id: string;
  key: string;
  type: ActivityRecordType;
  title: string;
  scope: "activity" | "day";
  scopeDate: string | null;
  version: number;
  data: Record<string, unknown>;
  updatedAt: string;
};

export type RecordAction =
  | {
      op: "upsert";
      record: {
        key: string;
        type: ActivityRecordType;
        title: string;
        scope?: "activity" | "day";
        scopeDate?: string | null;
        data: Record<string, unknown>;
      };
    }
  | { op: "remove"; recordKey: string };

export type ActivityRecordContent = Pick<ActivityRecord, "type" | "title" | "data">;

export type ActivityRecordUsefulnessContext = {
  activityTitle?: string;
  plannedDurationMinutes?: number | null;
};

function boundedString(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function boundedNumber(value: unknown, minimum = -1_000_000, maximum = 1_000_000) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : null;
}

function stableKey(value: unknown) {
  const key = boundedString(value, 80).toLowerCase();
  return /^[a-z0-9][a-z0-9-]*$/.test(key) ? key : "";
}

function safeUrl(value: unknown) {
  const url = boundedString(value, 800);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function stringArray(value: unknown, maximumItems = 30, maximumLength = 300) {
  return Array.isArray(value)
    ? value.map((entry) => boundedString(entry, maximumLength)).filter(Boolean).slice(0, maximumItems)
    : [];
}

function objectArray(value: unknown, maximumItems: number, map: (entry: Record<string, unknown>, index: number) => Record<string, unknown> | null) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const mapped = map(item as Record<string, unknown>, index);
    return mapped ? [mapped] : [];
  }).slice(0, maximumItems);
}

function itemId(value: unknown, index: number) {
  return stableKey(value) || `item-${index + 1}`;
}

function nonEmptyArray(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function normalizedText(value: unknown) {
  return boundedString(value, 800).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isPlaceholderActivityText(value: unknown) {
  const text = normalizedText(value);
  return !text || /\b(not yet (specified|known|documented)|details? (are )?(not yet specified|needed|unknown)|still need(ed)?|to be determined|tbd|before (creating|building)|need to (ask|confirm|learn))\b/.test(text);
}

export function hasUsefulActivityRecordData(record: ActivityRecordContent, context: ActivityRecordUsefulnessContext = {}) {
  const data = record.data;
  const activityTitle = normalizedText(context.activityTitle);

  if (record.type === "summary") {
    const summary = normalizedText(data.summary);
    const genericSummaries = new Set([
      activityTitle,
      activityTitle ? `${activityTitle} overview` : "",
      activityTitle ? `${activityTitle} session` : "",
      activityTitle ? `${activityTitle} activity` : "",
      normalizedText(record.title),
    ].filter(Boolean));
    const fields = Array.isArray(data.fields) ? data.fields : [];
    const meaningfulFields = fields.filter((field) => {
      if (!field || typeof field !== "object") return false;
      const entry = field as Record<string, unknown>;
      const label = normalizedText(entry.label);
      const value = normalizedText(entry.value);
      const plannedDuration = context.plannedDurationMinutes;
      const repeatsSchedule = plannedDuration != null
        && /^(planned )?duration$/.test(label)
        && value === `${plannedDuration} minutes`;
      return Boolean(label && value && !repeatsSchedule);
    });
    return Boolean((summary && !isPlaceholderActivityText(summary) && !genericSummaries.has(summary)) || meaningfulFields.length);
  }

  if (record.type === "product") return Boolean(normalizedText(data.name));
  if (record.type === "protocol") return Boolean((!isPlaceholderActivityText(data.summary) && normalizedText(data.summary)) || nonEmptyArray(data.steps));
  if (record.type === "checklist" || record.type === "item_list") return nonEmptyArray(data.items);
  if (record.type === "workout") return nonEmptyArray(data.exercises);
  if (record.type === "quick_log") return nonEmptyArray(data.fields);
  if (record.type === "history" || record.type === "timeline" || record.type === "comparison" || record.type === "adherence" || record.type === "resources") return nonEmptyArray(data.entries);
  if (record.type === "metric" || record.type === "trend") {
    return typeof data.current === "number" || typeof data.target === "number" || nonEmptyArray(data.entries);
  }
  if (record.type === "goal") return Boolean(!isPlaceholderActivityText(data.statement) && normalizedText(data.statement));
  if (record.type === "attention") return Boolean(!isPlaceholderActivityText(data.body) && normalizedText(data.body));
  return false;
}

function validateData(type: ActivityRecordType, value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;

  if (type === "summary") {
    return {
      summary: boundedString(source.summary, 800),
      fields: objectArray(source.fields, 30, (entry) => {
        const label = boundedString(entry.label, 100);
        const fieldValue = boundedString(entry.value, 400);
        return label && fieldValue ? { label, value: fieldValue } : null;
      }),
    };
  }

  if (type === "product") {
    const name = boundedString(source.name, 160);
    if (!name) return null;
    return {
      kind: source.kind === "device" ? "device" : "product",
      name,
      manufacturer: boundedString(source.manufacturer, 160),
      variant: boundedString(source.variant, 200),
      notes: boundedString(source.notes, 800),
      fields: objectArray(source.fields, 20, (entry) => {
        const label = boundedString(entry.label, 100);
        const fieldValue = boundedString(entry.value, 400);
        return label && fieldValue ? { label, value: fieldValue } : null;
      }),
    };
  }

  if (type === "protocol") {
    return {
      summary: boundedString(source.summary, 800),
      steps: objectArray(source.steps, 30, (entry, index) => {
        const label = boundedString(entry.label, 400);
        return label ? { id: itemId(entry.id, index), label, note: boundedString(entry.note, 500), completed: entry.completed === true, completedDates: stringArray(entry.completedDates, 366, 10).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)) } : null;
      }),
    };
  }

  if (type === "checklist" || type === "item_list") {
    return {
      items: objectArray(source.items, 100, (entry, index) => {
        const label = boundedString(entry.label, 300);
        if (!label) return null;
        const urgency = ["now", "soon", "this_week", "later"].includes(String(entry.urgency)) ? String(entry.urgency) : "";
        return {
          id: itemId(entry.id, index),
          label,
          detail: boundedString(entry.detail, 500),
          completed: entry.completed === true,
          completedDates: stringArray(entry.completedDates, 366, 10).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
          urgency,
          source: boundedString(entry.source, 160),
        };
      }),
    };
  }

  if (type === "workout") {
    return {
      focus: boundedString(source.focus, 300),
      exercises: objectArray(source.exercises, 40, (entry, index) => {
        const name = boundedString(entry.name, 160);
        if (!name) return null;
        return {
          id: itemId(entry.id, index),
          name,
          note: boundedString(entry.note, 400),
          targetSets: boundedNumber(entry.targetSets, 0, 20),
          targetReps: boundedString(entry.targetReps, 40),
          targetLoad: boundedString(entry.targetLoad, 60),
          lastPerformance: boundedString(entry.lastPerformance, 160),
          completed: entry.completed === true,
          completedDates: stringArray(entry.completedDates, 366, 10).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
          sets: objectArray(entry.sets, 30, (set, setIndex) => ({
            id: itemId(set.id, setIndex),
            load: boundedString(set.load, 60),
            reps: boundedNumber(set.reps, 0, 1000),
            effort: boundedString(set.effort, 40),
            completedAt: boundedString(set.completedAt, 40),
          })),
        };
      }),
    };
  }

  if (type === "quick_log") {
    return {
      fields: objectArray(source.fields, 12, (entry, index) => {
        const label = boundedString(entry.label, 80);
        if (!label) return null;
        return { id: itemId(entry.id, index), label, unit: boundedString(entry.unit, 30), input: entry.input === "text" ? "text" : "number" };
      }),
      entries: objectArray(source.entries, 100, (entry, index) => ({
        id: itemId(entry.id, index),
        values: objectArray(entry.values, 12, (pair) => {
          const field = stableKey(pair.field);
          const fieldValue = boundedString(pair.value, 120);
          return field && fieldValue ? { field, value: fieldValue } : null;
        }),
        note: boundedString(entry.note, 500),
        createdAt: boundedString(entry.createdAt, 40),
      })),
    };
  }

  if (type === "history" || type === "timeline") {
    return {
      entries: objectArray(source.entries, 100, (entry, index) => {
        const title = boundedString(entry.title, 200);
        return title ? {
          id: itemId(entry.id, index),
          title,
          detail: boundedString(entry.detail, 600),
          date: boundedString(entry.date, 40),
          value: boundedString(entry.value, 120),
          tone: boundedString(entry.tone, 30),
        } : null;
      }),
    };
  }

  if (type === "comparison") {
    return {
      entries: objectArray(source.entries, 30, (entry, index) => {
        const label = boundedString(entry.label, 120);
        return label ? {
          id: itemId(entry.id, index), label,
          previous: boundedString(entry.previous, 120), current: boundedString(entry.current, 120),
          change: boundedString(entry.change, 80),
        } : null;
      }),
    };
  }

  if (type === "metric" || type === "trend") {
    const label = boundedString(source.label, 120);
    if (!label) return null;
    return {
      label,
      unit: boundedString(source.unit, 30),
      current: boundedNumber(source.current),
      target: boundedNumber(source.target),
      entries: objectArray(source.entries, 180, (entry, index) => {
        const value = boundedNumber(entry.value);
        return value === null ? null : { id: itemId(entry.id, index), value, date: boundedString(entry.date, 40) };
      }),
    };
  }

  if (type === "adherence") {
    return {
      entries: objectArray(source.entries, 120, (entry, index) => {
        const date = boundedString(entry.date, 40);
        return date ? { id: itemId(entry.id, index), date, completed: entry.completed === true, note: boundedString(entry.note, 300) } : null;
      }),
    };
  }

  if (type === "goal") {
    const statement = boundedString(source.statement, 500);
    if (!statement) return null;
    return {
      statement,
      current: boundedNumber(source.current),
      target: boundedNumber(source.target),
      unit: boundedString(source.unit, 30),
      note: boundedString(source.note, 600),
    };
  }

  if (type === "attention") {
    const body = boundedString(source.body, 800);
    if (!body) return null;
    return {
      body,
      tone: ["info", "warning", "important"].includes(String(source.tone)) ? String(source.tone) : "info",
      actions: stringArray(source.actions, 8, 160),
    };
  }

  if (type === "resources") {
    return {
      entries: objectArray(source.entries, 40, (entry, index) => {
        const label = boundedString(entry.label, 180);
        const url = safeUrl(entry.url);
        return label && url ? { id: itemId(entry.id, index), label, url, note: boundedString(entry.note, 300) } : null;
      }),
    };
  }

  return null;
}

export function validateRecordActions(value: unknown, planDate?: string | null): RecordAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((action) => {
    if (!action || typeof action !== "object" || Array.isArray(action)) return [];
    const source = action as Record<string, unknown>;
    if (source.op === "remove") {
      const recordKey = stableKey(source.recordKey);
      return recordKey ? [{ op: "remove" as const, recordKey }] : [];
    }
    if (source.op !== "upsert" || !source.record || typeof source.record !== "object" || Array.isArray(source.record)) return [];
    const record = source.record as Record<string, unknown>;
    const key = stableKey(record.key);
    const type = ACTIVITY_RECORD_TYPES.includes(record.type as ActivityRecordType) ? record.type as ActivityRecordType : null;
    const title = boundedString(record.title, 140);
    if (!key || !type || !title) return [];
    const data = validateData(type, record.data);
    if (!data) return [];
    const scope = record.scope === "day" ? "day" as const : "activity" as const;
    const requestedDate = boundedString(record.scopeDate, 10);
    const scopeDate = scope === "day" && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || planDate || "") ? (requestedDate || planDate || null) : null;
    if (scope === "day" && !scopeDate) return [];
    return [{ op: "upsert" as const, record: { key, type, title, scope, scopeDate, data } }];
  }).slice(0, 30);
}

export function parseActivityRecord(row: {
  id: string; recordKey: string; recordType: string; title: string; scope: string;
  scopeDate: string | null; version: number; payloadJson: string; updatedAt: string;
}): ActivityRecord | null {
  if (!ACTIVITY_RECORD_TYPES.includes(row.recordType as ActivityRecordType)) return null;
  try {
    const data = validateData(row.recordType as ActivityRecordType, JSON.parse(row.payloadJson));
    if (!data) return null;
    return {
      id: row.id,
      key: row.recordKey,
      type: row.recordType as ActivityRecordType,
      title: row.title,
      scope: row.scope === "day" ? "day" : "activity",
      scopeDate: row.scopeDate,
      version: row.version,
      data,
      updatedAt: row.updatedAt,
    };
  } catch {
    return null;
  }
}
