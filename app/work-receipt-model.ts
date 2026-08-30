import type { RecordAction } from "./activity-record-model";
import type { ActivityMoveAction } from "./activity-transfer-model";
import type { FollowUpAction } from "./follow-up-model";
import type { ScheduleCadence } from "./schedule-model";
import type { WorkspaceAction, WorkspaceComponent } from "./workspace-model";

export type WorkReceiptKind = "activity_update" | "schedule_update" | "subject_move" | "check_in";

export type WorkReceiptDraft = {
  kind: WorkReceiptKind;
  title: string;
  detail: string;
  secondary?: string;
  target: "workspace";
  targetActivityId?: string;
  targetActivityClientKey?: string;
  targetRecordKey?: string;
};

type ExistingRecord = { key: string; title: string };
type HistoricalComponent = Pick<WorkspaceComponent, "id" | "type" | "title">;

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

function componentFeature(component: HistoricalComponent) {
  if (component.type === "product") return "product";
  if (component.type === "protocol" || component.type === "routine" || component.type === "checklist") return "routine steps";
  if (component.type === "recurring_step") return /weekly/i.test(component.title) ? "a weekly schedule" : "a recurring schedule";
  if (component.type === "activity_event" || component.type === "history") return "use history";
  if (component.type === "resources") return "references";
  return "saved section";
}

function relatedTitle(candidate: string, subject: string) {
  const normalizedCandidate = candidate.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normalizedSubject = subject.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalizedSubject.length >= 4 && normalizedCandidate.includes(normalizedSubject);
}

export function historicalWorkspaceReceipt(input: {
  activityTitle: string;
  before: HistoricalComponent[];
  after: HistoricalComponent[];
  moveTargetTitle?: string | null;
}): WorkReceiptDraft | null {
  const beforeIds = new Set(input.before.map((component) => component.id));
  const afterIds = new Set(input.after.map((component) => component.id));
  const added = input.after.filter((component) => !beforeIds.has(component.id));
  const removed = input.before.filter((component) => !afterIds.has(component.id));
  if (!added.length && !removed.length) return null;

  const movedSubject = removed.find((component) => component.type === "product");
  if (input.moveTargetTitle && movedSubject) {
    const movedFeatures = removed.map(componentFeature);
    const stayed = input.after.find((component) => relatedTitle(component.title, movedSubject.title));
    return {
      kind: "subject_move",
      title: `${movedSubject.title} moved to ${input.moveTargetTitle}`,
      detail: `Moved the ${humanList(movedFeatures)} to ${input.moveTargetTitle}.${stayed ? ` ${componentFeature(stayed).replace(/^./, (letter) => letter.toUpperCase())} stayed in ${input.activityTitle}.` : ""}`,
      target: "workspace",
    };
  }

  const addedSubject = added.find((component) => component.type === "product");
  if (addedSubject) {
    const features = added.filter((component) => component.id !== addedSubject.id).map(componentFeature);
    return {
      kind: "activity_update",
      title: `${addedSubject.title} added`,
      detail: features.length
        ? `Added ${addedSubject.title} with ${humanList(features)} to ${input.activityTitle}.`
        : `Added ${addedSubject.title} to ${input.activityTitle}.`,
      target: "workspace",
    };
  }

  if (removed.length === 1 && (removed[0].type === "activity_event" || removed[0].type === "history")) {
    const subject = removed[0].title.replace(/\s+(use|history)$/i, "");
    return {
      kind: "activity_update",
      title: `${subject} history removed`,
      detail: `Removed the remaining use history from ${input.activityTitle}.`,
      target: "workspace",
    };
  }

  return {
    kind: "activity_update",
    title: `${input.activityTitle} updated`,
    detail: added.length ? `Added ${humanList(added.map((component) => component.title))}.` : `Removed ${humanList(removed.map((component) => component.title))}.`,
    target: "workspace",
  };
}

export function scheduleWorkReceipt(input: {
  activityTitle: string;
  activityId?: string;
  activityClientKey?: string;
  previousCadence?: ScheduleCadence | null;
  cadence?: ScheduleCadence;
  planRole?: "essential" | "extra";
}) : WorkReceiptDraft {
  if (input.planRole && input.cadence) {
    const previous = input.previousCadence ? scheduleCadenceLabel(input.previousCadence) : "Previous schedule";
    const next = scheduleCadenceLabel(input.cadence);
    return {
      kind: "schedule_update",
      title: `${input.activityTitle} is now essential`,
      detail: `${previous === next ? next : `${previous} → ${next}`}. It now counts toward your essential set.`,
      target: "workspace",
      ...(input.activityId ? { targetActivityId: input.activityId } : {}),
      ...(input.activityClientKey ? { targetActivityClientKey: input.activityClientKey } : {}),
    };
  }
  if (input.planRole) {
    return {
      kind: "schedule_update",
      title: `${input.activityTitle} is now ${input.planRole === "essential" ? "essential" : "in More for today"}`,
      detail: input.planRole === "essential"
        ? "It now counts toward your essential daily set."
        : "It is now available as a stretch goal.",
      target: "workspace",
      ...(input.activityId ? { targetActivityId: input.activityId } : {}),
      ...(input.activityClientKey ? { targetActivityClientKey: input.activityClientKey } : {}),
    };
  }
  if (!input.cadence) throw new Error("A schedule receipt needs a cadence or plan role.");
  const previous = input.previousCadence ? scheduleCadenceLabel(input.previousCadence) : "Previous schedule";
  const next = scheduleCadenceLabel(input.cadence);
  return {
    kind: "schedule_update",
    title: `${input.activityTitle} schedule updated`,
    detail: previous === next ? next : `${previous} → ${next}`,
    target: "workspace",
    ...(input.activityId ? { targetActivityId: input.activityId } : {}),
    ...(input.activityClientKey ? { targetActivityClientKey: input.activityClientKey } : {}),
  };
}

export function activityWorkReceipt(input: {
  activityTitle: string;
  jobKind: string;
  existingRecords: ExistingRecord[];
  recordActions: RecordAction[];
  workspaceActions: WorkspaceAction[];
  activityMoves: ActivityMoveAction[];
  moveDetails?: Array<{ subjectTitle: string; targetTitle: string; targetActivityId: string; targetActivityClientKey: string }>;
  followUpActions: FollowUpAction[];
}): WorkReceiptDraft | null {
  const move = input.moveDetails?.[0];
  if (move) {
    return {
      kind: "subject_move",
      title: `${move.subjectTitle} moved to ${move.targetTitle}`,
      detail: "All of its linked details moved together.",
      target: "workspace",
      targetActivityId: move.targetActivityId,
      targetActivityClientKey: move.targetActivityClientKey,
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
  const targetRecordKey = upserts.length === 1 ? upserts[0].record.key : null;

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
        ...(targetRecordKey ? { targetRecordKey } : {}),
      };
    }
    return {
      kind: "activity_update",
      title: input.jobKind === "activity_setup" ? `${input.activityTitle} is ready` : `${input.activityTitle} updated`,
      detail: details.slice(0, 2).join(" "),
      secondary: `Check-in set for ${due}.`,
      target: "workspace",
      ...(targetRecordKey ? { targetRecordKey } : {}),
    };
  }

  return {
    kind: "activity_update",
    title: input.jobKind === "activity_setup" ? `${input.activityTitle} is ready` : `${input.activityTitle} updated`,
    detail: details.slice(0, 2).join(" "),
    target: "workspace",
    ...(targetRecordKey ? { targetRecordKey } : {}),
  };
}
