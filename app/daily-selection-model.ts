export type DailySelectionItem = {
  id: string;
  label: string;
  detail?: string;
  active?: boolean;
  source?: string;
  subjectKey?: string;
  cadenceRecordKey?: string;
  allowMultiple?: boolean;
  unitLabel?: string;
};

export type DailySelectionEntry = {
  id: string;
  date: string;
  itemIds: string[];
  counts?: Record<string, number>;
};

export type DailySelectionData = {
  kind?: "supplements" | "routine";
  prompt?: string;
  items: DailySelectionItem[];
  entries: DailySelectionEntry[];
};

type LegacyChecklistItem = {
  id?: unknown;
  label?: unknown;
  detail?: unknown;
  source?: unknown;
  completedDates?: unknown;
};

type LegacyHistoryEntry = {
  id?: unknown;
  date?: unknown;
  value?: unknown;
  detail?: unknown;
};

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizedLabel(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
}

export function previousDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - 1, 12));
  return date.toISOString().slice(0, 10);
}

export function selectionForDate(data: Pick<DailySelectionData, "entries">, date: string) {
  return data.entries.find((entry) => entry.date === date)?.itemIds ?? [];
}

export function selectionCountsForDate(data: Pick<DailySelectionData, "entries">, date: string) {
  const entry = data.entries.find((candidate) => candidate.date === date);
  const selected = new Set(entry?.itemIds ?? []);
  return Object.fromEntries(Object.entries(entry?.counts ?? {})
    .filter(([id, count]) => selected.has(id) && Number.isInteger(count) && count > 0)
    .map(([id, count]) => [id, Math.min(9, count)]));
}

export function withSelectionForDate(data: DailySelectionData, date: string, itemIds: string[], counts: Record<string, number> = {}): DailySelectionData {
  const knownIds = new Set(data.items.map((item) => item.id));
  const repeatableIds = new Set(data.items.filter((item) => item.allowMultiple).map((item) => item.id));
  const uniqueIds = [...new Set(itemIds)].filter((id) => knownIds.has(id));
  const normalizedCounts = Object.fromEntries(Object.entries(counts)
    .filter(([id, count]) => uniqueIds.includes(id) && repeatableIds.has(id) && Number.isInteger(count) && count > 1)
    .map(([id, count]) => [id, Math.min(9, count)]));
  const retained = data.entries.filter((entry) => entry.date !== date);
  return {
    ...data,
    entries: uniqueIds.length
      ? [...retained, { id: `selection-${date}`, date, itemIds: uniqueIds, ...(Object.keys(normalizedCounts).length ? { counts: normalizedCounts } : {}) }].sort((left, right) => left.date.localeCompare(right.date))
      : retained,
  };
}

/** Agent writes are patches over durable history: supplied ids/dates win, omitted history survives. */
export function mergeDailySelectionData(current: DailySelectionData, incoming: DailySelectionData): DailySelectionData {
  const items = new Map(current.items.map((item) => [item.id, item]));
  for (const item of incoming.items) items.set(item.id, item);
  const entries = new Map(current.entries.map((entry) => [entry.date, entry]));
  for (const entry of incoming.entries) entries.set(entry.date, entry);
  return {
    kind: incoming.kind ?? current.kind,
    prompt: incoming.prompt ?? current.prompt,
    items: [...items.values()],
    entries: [...entries.values()].sort((left, right) => left.date.localeCompare(right.date)),
  };
}

/** Converts the old checklist + recap pair into one canonical dated selection record. */
export function migrateLegacyDailySelection(
  checklistData: { items?: unknown },
  historyRecords: Array<{ entries?: unknown }> = [],
): DailySelectionData {
  const rawItems = Array.isArray(checklistData.items) ? checklistData.items as LegacyChecklistItem[] : [];
  const items: DailySelectionItem[] = rawItems.flatMap((item, index) => {
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!label) return [];
    return [{
      id: typeof item.id === "string" && item.id ? item.id : `item-${index + 1}`,
      label,
      detail: typeof item.detail === "string" ? item.detail.trim() : "",
      active: true,
      source: typeof item.source === "string" ? item.source.trim() : "",
    }];
  });
  const selections = new Map<string, Set<string>>();
  rawItems.forEach((item, index) => {
    const id = items[index]?.id;
    if (!id || !Array.isArray(item.completedDates)) return;
    for (const date of item.completedDates) {
      if (!validDate(date)) continue;
      const selected = selections.get(date) ?? new Set<string>();
      selected.add(id);
      selections.set(date, selected);
    }
  });

  const idsByLabel = new Map(items.map((item) => [normalizedLabel(item.label), item.id]));
  for (const history of historyRecords) {
    const entries = Array.isArray(history.entries) ? history.entries as LegacyHistoryEntry[] : [];
    for (const entry of entries) {
      if (!validDate(entry.date)) continue;
      const selected = selections.get(entry.date) ?? new Set<string>();
      const value = typeof entry.value === "string" ? entry.value : "";
      for (const token of value.split(/[,;|]+/)) {
        const id = idsByLabel.get(normalizedLabel(token));
        if (id) selected.add(id);
      }
      if (selected.size) selections.set(entry.date, selected);
    }
  }

  return {
    items,
    entries: [...selections.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, itemIds]) => ({ id: `selection-${date}`, date, itemIds: [...itemIds] })),
  };
}
