export type WorkspaceDisplayRole = "primary" | "countdown" | "resource" | "starter";

export function orderWorkspaceDisplayItems<T extends { displayRole: WorkspaceDisplayRole }>(items: T[]) {
  const resources = items.filter((item) => item.displayRole === "resource");
  const countdowns = items.filter((item) => item.displayRole === "countdown");
  const mainItems = items.filter((item) => item.displayRole !== "resource" && item.displayRole !== "countdown");
  const primaryIndex = mainItems.findIndex((item) => item.displayRole === "primary");
  const firstItem = primaryIndex >= 0 ? mainItems[primaryIndex] : mainItems[0];
  const supportingItems = firstItem ? mainItems.filter((item) => item !== firstItem) : [];

  return [
    ...(firstItem ? [firstItem] : []),
    ...countdowns,
    ...supportingItems,
    ...resources,
  ];
}
