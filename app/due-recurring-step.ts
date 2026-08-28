import type { ActivityRecord } from "./activity-record-model.ts";
import { recurringStepScheduleStatus, type RecurringCadence } from "./recurring-step-schedule.ts";

export type DueRecurringStep = {
  recordKey: string;
  subjectKey: string | null;
  label: string;
  dueDate: string;
  dueState: "today" | "overdue";
};

export function dueRecurringSteps(records: ActivityRecord[], date: string): DueRecurringStep[] {
  return records.flatMap((record) => {
    if (record.type !== "recurring_step") return [];
    const status = recurringStepScheduleStatus({
      anchorDate: typeof record.data.anchorDate === "string" ? record.data.anchorDate : undefined,
      cadence: record.data.cadence as RecurringCadence | undefined,
      completedDates: Array.isArray(record.data.completedDates) ? record.data.completedDates.filter((value): value is string => typeof value === "string") : [],
    }, date);
    if (!status.dueDate || !status.dueState) return [];
    const label = typeof record.data.label === "string" ? record.data.label.trim() : "";
    if (!label) return [];
    return [{ recordKey: record.key, subjectKey: record.subjectKey, label, dueDate: status.dueDate, dueState: status.dueState }];
  });
}
