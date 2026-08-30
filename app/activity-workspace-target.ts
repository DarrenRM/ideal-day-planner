export function activityRecordTargetId(activityId: string, recordKey: string) {
  return `activity-record-${encodeURIComponent(activityId)}-${encodeURIComponent(recordKey)}`;
}
