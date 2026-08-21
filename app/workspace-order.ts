export type WorkspaceDisplayRole = "streak" | "primary" | "countdown" | "resource";

export function orderWorkspaceDisplayItems<T extends { displayRole: WorkspaceDisplayRole }>(items: T[]) {
  const streaks = items.filter((item) => item.displayRole === "streak");
  const resources = items.filter((item) => item.displayRole === "resource");
  const countdowns = items.filter((item) => item.displayRole === "countdown");
  const mainItems = items.filter((item) => item.displayRole === "primary");
  const firstItem = mainItems[0];
  const supportingItems = firstItem ? mainItems.filter((item) => item !== firstItem) : [];

  return [
    ...streaks,
    ...countdowns,
    ...(firstItem ? [firstItem] : []),
    ...supportingItems,
    ...resources,
  ];
}
