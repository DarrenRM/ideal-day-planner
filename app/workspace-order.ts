export type WorkspaceDisplayRole = "streak" | "recurring" | "primary" | "countdown" | "reference" | "resource";

export function orderWorkspaceDisplayItems<T extends { displayRole: WorkspaceDisplayRole }>(items: T[]) {
  const streaks = items.filter((item) => item.displayRole === "streak");
  const recurringItems = items.filter((item) => item.displayRole === "recurring");
  const resources = items.filter((item) => item.displayRole === "resource");
  const references = items.filter((item) => item.displayRole === "reference");
  const countdowns = items.filter((item) => item.displayRole === "countdown");
  const mainItems = items.filter((item) => item.displayRole === "primary");
  const firstItem = mainItems[0];
  const supportingItems = firstItem ? mainItems.filter((item) => item !== firstItem) : [];

  return [
    ...streaks,
    ...recurringItems,
    ...countdowns,
    ...(firstItem ? [firstItem] : []),
    ...supportingItems,
    ...references,
    ...resources,
  ];
}
