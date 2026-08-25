import { recurringStepIsDue, type ActivityRecord } from "./activity-record-model.ts";

export type DueRecurringStep = {
  recordKey: string;
  subjectKey: string | null;
  label: string;
};

export function dueRecurringSteps(records: ActivityRecord[], date: string): DueRecurringStep[] {
  return records.flatMap((record) => {
    if (record.type !== "recurring_step" || !recurringStepIsDue(record, date)) return [];
    const label = typeof record.data.label === "string" ? record.data.label.trim() : "";
    if (!label) return [];
    return [{ recordKey: record.key, subjectKey: record.subjectKey, label }];
  });
}
