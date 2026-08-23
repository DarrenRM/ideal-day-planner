export type CompletedHighlightItem = {
  title: string;
  displayTitle?: string;
  duration: number;
  completedAt?: string | null;
};

function displayTitle(item: CompletedHighlightItem) {
  return item.displayTitle?.trim() || item.title.trim();
}

function completionMillis(value: string | null | undefined) {
  if (!value) return 0;
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function fallbackDayHighlight(items: CompletedHighlightItem[]) {
  if (!items.length) return null;
  if (items.length === 1) return displayTitle(items[0]);

  const leading = [...items].sort((left, right) =>
    right.duration - left.duration
      || completionMillis(right.completedAt) - completionMillis(left.completedAt),
  )[0];
  return `${displayTitle(leading)} was today's longest completed block.`;
}
