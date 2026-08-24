import type { ActivityRecordContent, RecordAction } from "./activity-record-model";
import type { ScheduleCadence } from "./schedule-model";

function identity(value: unknown) {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
}

export function recurringStepRepresentsParentActivity(
  record: ActivityRecordContent,
  activity: { title?: string | null; clientKey?: string | null },
) {
  if (record.type !== "recurring_step") return false;
  const title = identity(activity.title);
  const clientKey = identity(activity.clientKey);
  const label = identity(record.data.label);
  const itemKey = identity(record.data.itemKey);
  const recordKey = identity(record.key);
  if (itemKey && clientKey && itemKey === clientKey) return true;
  if (label && title && (label === title || label === `do ${title}` || label === `${title} routine`)) return true;
  if (!record.subjectKey && label && title && label.includes(title) && /every|daily|weekly|weekday|schedule|cadence/.test(label)) return true;
  return Boolean(recordKey && clientKey && (recordKey === `${clientKey} schedule` || recordKey === `${clientKey} cadence`));
}

export function parentScheduleCadenceFromRecurringStep(record: ActivityRecordContent): ScheduleCadence | null {
  if (record.type !== "recurring_step") return null;
  const { anchorDate, cadence } = record.data;
  if (cadence.kind === "interval_days") {
    return { kind: "interval_days", every: cadence.every, anchorDate };
  }
  if (cadence.kind === "weekly") {
    return { kind: "interval_days", every: cadence.every * 7, anchorDate };
  }
  return { kind: "weekdays", weekdays: cadence.weekdays, intervalWeeks: 1 };
}

export function removeParentCadenceRecordActions(
  actions: RecordAction[],
  activity: { title?: string | null; clientKey?: string | null },
) {
  return actions.filter((action) => action.op === "remove" || !recurringStepRepresentsParentActivity(action.record, activity));
}
