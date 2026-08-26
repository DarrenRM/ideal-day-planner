import { getD1 } from "../../db";
import { hasUsefulActivityRecordData } from "../activity-record-model";
import { readActivityRecords } from "../api/agent-store";
import { shouldShowActivitySchedule } from "../schedule-summary";
import type { LibraryComponentType } from "./component-library-fixtures";

export type ComponentUsageMap = Partial<Record<LibraryComponentType, string[]>>;

type ActivityRow = { id: string; title: string; category: string };
type WorkspaceRow = { activityId: string; title: string; documentJson: string | null };
type ActivityTitleRow = { activityId: string; title: string };
type ScheduleRow = {
  activityId: string;
  title: string;
  cadenceJson: string;
  advancementJson: string;
  endDate: string | null;
  stepCount: number;
};

function parsedObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function add(usage: Map<string, Set<string>>, type: string, title: string) {
  if (!title.trim()) return;
  const titles = usage.get(type) ?? new Set<string>();
  titles.add(title);
  usage.set(type, titles);
}

function starterStreakActivity(activity: Pick<ActivityRow, "title" | "category">) {
  return /skin|hair|serum|daily routine|morning routine|evening routine/.test(`${activity.title} ${activity.category}`.toLowerCase());
}

export async function readComponentUsage(userId: string): Promise<ComponentUsageMap> {
  const db = getD1();
  const [activityResult, workspaceResult, followUpResult, activeJobResult, scheduleResult, receiptResult] = await Promise.all([
    db.prepare(`SELECT id, title, category FROM activities WHERE user_id = ? ORDER BY title`).bind(userId).all<ActivityRow>(),
    db.prepare(`
      SELECT activity.id AS activityId, activity.title, revision.document_json AS documentJson
      FROM activities activity
      JOIN activity_workspaces workspace ON workspace.activity_id = activity.id
      LEFT JOIN workspace_revisions revision ON revision.id = workspace.current_revision_id
      WHERE activity.user_id = ?
      ORDER BY activity.title
    `).bind(userId).all<WorkspaceRow>(),
    db.prepare(`
      SELECT DISTINCT activity.id AS activityId, activity.title
      FROM activities activity
      JOIN activity_follow_ups followup ON followup.activity_id = activity.id
      WHERE activity.user_id = ? AND followup.status IN ('pending', 'due', 'asked')
      ORDER BY activity.title
    `).bind(userId).all<ActivityTitleRow>(),
    db.prepare(`
      SELECT DISTINCT activity.id AS activityId, activity.title
      FROM activities activity
      JOIN agent_jobs job ON job.activity_id = activity.id
      WHERE activity.user_id = ? AND job.status IN ('queued', 'leased', 'running', 'retryable_failure')
      ORDER BY activity.title
    `).bind(userId).all<ActivityTitleRow>(),
    db.prepare(`
      SELECT step.activity_id AS activityId, activity.title, pattern.cadence_json AS cadenceJson,
             pattern.advancement_json AS advancementJson, pattern.end_date AS endDate,
             (SELECT COUNT(*) FROM schedule_pattern_steps sibling WHERE sibling.pattern_id = pattern.id) AS stepCount
      FROM schedule_pattern_steps step
      JOIN schedule_patterns pattern ON pattern.id = step.pattern_id
      JOIN activities activity ON activity.id = step.activity_id
      WHERE pattern.user_id = ? AND pattern.archived_at IS NULL
      ORDER BY activity.title
    `).bind(userId).all<ScheduleRow>(),
    db.prepare(`
      SELECT DISTINCT activity.id AS activityId, activity.title
      FROM conversation_artifacts artifact
      JOIN activities activity ON activity.id = artifact.activity_id
      WHERE artifact.user_id = ?
      ORDER BY activity.title
    `).bind(userId).all<ActivityTitleRow>(),
  ]);

  const usage = new Map<string, Set<string>>();
  const componentsByActivity = new Map<string, Set<string>>();
  const productComponentsByActivity = new Map<string, Set<string>>();
  const recordsByActivity = new Map(await Promise.all(activityResult.results.map(async (activity) => [
    activity.id,
    await readActivityRecords(activity.id),
  ] as const)));
  for (const row of workspaceResult.results) {
    const document = row.documentJson ? parsedObject(row.documentJson) : {};
    const components = Array.isArray(document.components) ? document.components : [];
    const records = recordsByActivity.get(row.activityId) ?? [];
    const recordsByKey = new Map(records.map((record) => [record.key, record]));
    const siblingRecordTypes = records.map((record) => record.type);
    const types = componentsByActivity.get(row.activityId) ?? new Set<string>();
    const productComponents = productComponentsByActivity.get(row.activityId) ?? new Set<string>();
    for (const candidate of components) {
      if (!candidate || typeof candidate !== "object" || !("type" in candidate) || typeof candidate.type !== "string") continue;
      if (candidate.type === "summary") {
        const recordKey = "recordKey" in candidate && typeof candidate.recordKey === "string" ? candidate.recordKey : "";
        const record = recordsByKey.get(recordKey);
        if (!record || !hasUsefulActivityRecordData(record, { activityTitle: row.title, siblingRecordTypes })) continue;
      }
      types.add(candidate.type);
      if (candidate.type === "product" && "id" in candidate && typeof candidate.id === "string") productComponents.add(candidate.id);
      add(usage, candidate.type, row.title);
    }
    componentsByActivity.set(row.activityId, types);
    productComponentsByActivity.set(row.activityId, productComponents);
  }

  for (const activity of activityResult.results) {
    const types = componentsByActivity.get(activity.id) ?? new Set<string>();
    if (starterStreakActivity(activity) || types.has("adherence")) add(usage, "activity_streak", activity.title);
    if ((productComponentsByActivity.get(activity.id)?.size ?? 0) > 1) add(usage, "product_action_tabs", activity.title);
  }

  for (const row of followUpResult.results) add(usage, "activity_follow_up", row.title);
  for (const row of activeJobResult.results) add(usage, "workspace_working", row.title);
  for (const row of receiptResult.results) add(usage, "conversation_work_receipt", row.title);
  const shownScheduleIds = new Set<string>();
  for (const row of scheduleResult.results) {
    const cadence = parsedObject(row.cadenceJson);
    const advancement = parsedObject(row.advancementJson);
    const cadenceKind = cadence.kind === "weekdays" || cadence.kind === "interval_days" ? cadence.kind : "daily";
    const advancementKind = advancement.kind === "completion" ? "completion" : "calendar";
    if (shouldShowActivitySchedule({
      cadenceKind,
      advancementKind,
      endDate: row.endDate,
      stepCount: Number(row.stepCount) || 1,
    })) {
      add(usage, "activity_schedule", row.title);
      shownScheduleIds.add(row.activityId);
    }
  }

  const followUpIds = new Set(followUpResult.results.map((row: ActivityTitleRow) => row.activityId));
  const workingIds = new Set(activeJobResult.results.map((row: ActivityTitleRow) => row.activityId));
  for (const activity of activityResult.results) {
    const types = componentsByActivity.get(activity.id) ?? new Set<string>();
    const hasStreak = starterStreakActivity(activity) || types.has("adherence");
    const hasVisibleWorkspace = types.size > 0 || hasStreak || followUpIds.has(activity.id) || shownScheduleIds.has(activity.id);
    if (hasVisibleWorkspace) add(usage, "workspace_invitation", activity.title);
    else if (!workingIds.has(activity.id)) add(usage, "workspace_empty", activity.title);
  }

  return Object.fromEntries([...usage.entries()].map(([type, titles]) => [type, [...titles].sort((left, right) => left.localeCompare(right))])) as ComponentUsageMap;
}
