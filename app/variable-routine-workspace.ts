import type { ActivityRecord } from "./activity-record-model";
import type { DailySelectionData } from "./daily-selection-model";
import type { WorkspaceDocument, WorkspaceComponent } from "./workspace-model";

// The roster owns the interaction. Keeping its products must not restore the
// former product-tab layout or render a linked cadence/session twice.
export function variableRoutineWorkspace(workspace: WorkspaceDocument, records: ActivityRecord[]) {
  const routines = records.filter((record) => record.type === "daily_selection"
    && record.data.kind === "routine" && (record.data as DailySelectionData).items.length > 0);
  const subjectKeys = new Set(routines.flatMap((record) => (record.data as DailySelectionData).items
    .flatMap((item) => item.subjectKey ? [item.subjectKey] : [])));
  if (!routines.length) return { workspace, subjectKeys };
  const cadenceKeys = new Set(routines.flatMap((record) => (record.data as DailySelectionData).items
    .flatMap((item) => item.cadenceRecordKey ? [item.cadenceRecordKey] : [])));
  const recordsByKey = new Map(records.map((record) => [record.key, record]));
  const routineKeys = new Set(routines.map((record) => record.key));
  const rosterComponents: WorkspaceComponent[] = routines.map((record) => {
    const existing = workspace.components.find((component) => component.type === "daily_selection" && component.recordKey === record.key);
    return existing ?? { id: `routine-${record.key}`.slice(0, 64), type: "daily_selection", title: record.title, recordKey: record.key, presentation: "featured" };
  });
  const remaining = workspace.components.filter((component) => {
    if (!("recordKey" in component) || !component.recordKey) return true;
    const record = recordsByKey.get(component.recordKey);
    return !routineKeys.has(component.recordKey) && !cadenceKeys.has(component.recordKey)
      && !(record && (subjectKeys.has(record.key) || record.subjectKey && subjectKeys.has(record.subjectKey)));
  });
  return { workspace: { version: 1 as const, components: [...rosterComponents, ...remaining] }, subjectKeys };
}
