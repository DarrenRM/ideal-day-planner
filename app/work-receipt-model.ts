import type { RecordAction } from "./activity-record-model";
import type { ActivityMoveAction } from "./activity-transfer-model";
import type { FollowUpAction } from "./follow-up-model";
import type { ScheduleCadence } from "./schedule-model";
import type { WorkspaceAction } from "./workspace-model";

export type WorkReceiptKind = "activity_update" | "schedule_update" | "subject_move" | "check_in";

export type WorkReceiptDraft = {
  kind: WorkReceiptKind;
  title: string;
  detail: string;
  secondary?: string;
  target: "workspace";
};

type ExistingRecord = { key: string; title: string };

export function scheduleCadenceLabel(cadence: ScheduleCadence) {
  if (cadence.kind === "daily") return "Every day";
  if (cadence.kind === "interval_days") return cadence.every === 2 ? "Every other day" : `Every ${cadence.every} days`;
  return cadence.weekdays.map((day) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]).join(", ");
}

function humanList(values: string[]) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length <= 1) return unique[0] || "";
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")}, and ${unique.at(-1)}`;
}

function shortRecordTitle(title: string) {
  return title.trim().replace(/\s+/g, " ").slice(0, 64);
}

export function scheduleWorkReceipt(input: {
  activityTitle: string;
  previousCadence?: ScheduleCadence | null;
  cadence: ScheduleCadence;
}) : WorkReceiptDraft {
  const previous = input.previousCadence ? scheduleCadenceLabel(input.previousCadence) : "Previous schedule";
  const next = scheduleCadenceLabel(input.cadence);
  return {
    kind: "schedule_update",
    title: `${input.activityTitle} schedule updated`,
    detail: previous === next ? next : `${previous} → ${next}`,
    target: "workspace",
  };
}

export function activityWorkReceipt(input: {
  activityTitle: string;
  jobKind: string;
  existingRecords: ExistingRecord[];
  recordActions: RecordAction[];
  workspaceActions: WorkspaceAction[];
  activityMoves: ActivityMoveAction[];
  moveDetails?: Array<{ subjectTitle: string; targetTitle: string }>;
  followUpActions: FollowUpAction[];
}): WorkReceiptDraft | null {
  const move = input.moveDetails?.[0];
  if (move) {
    return {
      kind: "subject_move",
      title: `${move.subjectTitle} moved to ${move.targetTitle}`,
      detail: "All of its linked details moved together.",
      target: "workspace",
    };
  }

  const existingByKey = new Map(input.existingRecords.map((record) => [record.key, record.title]));
  const upserts = input.recordActions.filter((action) => action.op === "upsert");
  const removals = input.recordActions.filter((action) => action.op === "remove");
  const added = upserts.filter((action) => !existingByKey.has(action.record.key)).map((action) => shortRecordTitle(action.record.title));
  const updated = upserts.filter((action) => existingByKey.has(action.record.key)).map((action) => shortRecordTitle(action.record.title));
  const removed = removals.map((action) => shortRecordTitle(existingByKey.get(action.recordKey) || "saved section"));
  const followUp = input.followUpActions.find((action) => action.op === "upsert");
  const workspaceTitles = input.workspaceActions
    .filter((action) => action.op === "upsert")
    .map((action) => shortRecordTitle(action.component.title));
  const hasWorkspaceChange = input.workspaceActions.length > 0;
  const hasDurableChange = input.recordActions.length > 0 || hasWorkspaceChange || input.activityMoves.length > 0 || Boolean(followUp);
  if (!hasDurableChange) return null;

  const details: string[] = [];
  if (added.length) details.push(`Added ${humanList(added)}.`);
  if (updated.length) details.push(`Updated ${humanList(updated)}.`);
  if (removed.length) details.push(`Removed ${humanList(removed)}.`);
  if (!details.length && workspaceTitles.length) details.push(`Added ${humanList(workspaceTitles)}.`);
  if (!details.length && hasWorkspaceChange) details.push("Updated the activity layout.");

  if (followUp && followUp.op === "upsert") {
    const due = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" })
      .format(new Date(`${followUp.dueDate}T12:00:00Z`));
    if (!details.length) {
      return {
        kind: "check_in",
        title: `${input.activityTitle} check-in scheduled`,
        detail: `Luna will return on ${due} about ${followUp.title.toLowerCase()}.`,
        target: "workspace",
      };
    }
    return {
      kind: "activity_update",
      title: input.jobKind === "activity_setup" ? `${input.activityTitle} is ready` : `${input.activityTitle} updated`,
      detail: details.slice(0, 2).join(" "),
      secondary: `Check-in set for ${due}.`,
      target: "workspace",
    };
  }

  return {
    kind: "activity_update",
    title: input.jobKind === "activity_setup" ? `${input.activityTitle} is ready` : `${input.activityTitle} updated`,
    detail: details.slice(0, 2).join(" "),
    target: "workspace",
  };
}
