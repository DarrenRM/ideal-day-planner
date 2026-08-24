import { getD1 } from "../../db";
import { parseActivityRecord, validateRecordActions, type ActivityRecord as PersistedActivityRecord, type RecordAction } from "../activity-record-model";
import { activitySetupKey, activitySetupKeyMatches } from "../activity-setup-policy";
import { resolveSubjectMoveRecordKeys } from "../activity-transfer-model";
import { applyWorkspaceActions as mergeWorkspaceActions, EMPTY_WORKSPACE, type WorkspaceAction, type WorkspaceDocument } from "../workspace-model";
import { validateFollowUpActions, type ActivityFollowUp, type FollowUpAction } from "../follow-up-model";
import { addLocalDays, localDateInTimeZone, parseAdvancement, parseCadence, previewPattern, type SchedulePattern } from "../schedule-model";
import { shouldShowActivitySchedule } from "../schedule-summary";
import { parentScheduleCadenceFromRecurringStep, recurringStepRepresentsParentActivity } from "../activity-cadence-guard";
import { inferSessionChoicePlan, type SessionChoicePlanData } from "../session-choice-plan";
import { measuredSessionFields, type SessionChoiceData } from "../session-log-model";
import { mergeDailySelectionData, migrateLegacyDailySelection, previousDateKey, selectionForDate, withSelectionForDate, type DailySelectionData } from "../daily-selection-model";
import { mergeMealLogData, type MealLogData } from "../meal-log-model";

export type ActivityRecord = {
  id: string;
  clientKey: string;
  title: string;
  category: string;
  icon: string;
  color: string;
};

let schemaPromise: Promise<void> | null = null;

export function requestIdentity(request: Request) {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (userId) return userId;
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" ? "local-development-user" : null;
}

export function isLocalBridgeRequest(request: Request) {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export function safeId(value: string) {
  return encodeURIComponent(value).replaceAll("%", "_");
}

export async function ensureAgentSchema() {
  if (!schemaPromise) {
    const db = getD1();
    schemaPromise = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS conversations (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        scope_type text DEFAULT 'activity' NOT NULL,
        activity_id text,
        activity_variant_id text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS conversation_messages (
        id text PRIMARY KEY NOT NULL,
        conversation_id text NOT NULL,
        role text NOT NULL,
        body text NOT NULL,
        source text NOT NULL,
        agent_job_id text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS conversation_messages_conversation_created_idx ON conversation_messages (conversation_id, created_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS captured_intents (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        conversation_id text,
        source_message_id text,
        source_agent_job_id text,
        destination_activity_id text,
        capture_kind text DEFAULT 'open_item' NOT NULL,
        label text NOT NULL,
        normalized_label text NOT NULL,
        detail text DEFAULT '' NOT NULL,
        urgency text DEFAULT '' NOT NULL,
        destination_hint text DEFAULT '' NOT NULL,
        status text DEFAULT 'pending_destination' NOT NULL,
        timing_status text DEFAULT 'unspecified' NOT NULL,
        scheduled_date text,
        linked_record_key text,
        linked_item_id text,
        idempotency_key text NOT NULL,
        dismissed_at text,
        resolved_at text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
        FOREIGN KEY (source_message_id) REFERENCES conversation_messages(id) ON DELETE SET NULL,
        FOREIGN KEY (destination_activity_id) REFERENCES activities(id) ON DELETE SET NULL
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS captured_intents_user_idempotency_unique ON captured_intents (user_id, idempotency_key)"),
      db.prepare("CREATE INDEX IF NOT EXISTS captured_intents_user_status_idx ON captured_intents (user_id, status, updated_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS captured_intents_activity_status_idx ON captured_intents (destination_activity_id, status)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS activity_visits (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        activity_id text NOT NULL,
        activity_variant_id text,
        conversation_id text NOT NULL,
        client_visit_id text NOT NULL,
        context_json text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_variant_id) REFERENCES activity_variants(id) ON DELETE SET NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_visits_user_client_unique ON activity_visits (user_id, client_visit_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS activity_visits_activity_opened_idx ON activity_visits (activity_id, created_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS activity_follow_ups (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        activity_id text NOT NULL,
        conversation_id text NOT NULL,
        follow_up_key text NOT NULL,
        title text NOT NULL,
        question text NOT NULL,
        due_date text NOT NULL,
        status text DEFAULT 'pending' NOT NULL,
        inferred integer DEFAULT 0 NOT NULL,
        source_message_id text,
        source_agent_job_id text,
        trigger_job_id text,
        asked_at text,
        completed_at text,
        dismissed_at text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (source_message_id) REFERENCES conversation_messages(id) ON DELETE SET NULL
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_follow_ups_activity_key_unique ON activity_follow_ups (activity_id, follow_up_key)"),
      db.prepare("CREATE INDEX IF NOT EXISTS activity_follow_ups_user_due_idx ON activity_follow_ups (user_id, status, due_date)"),
      db.prepare("CREATE INDEX IF NOT EXISTS activity_follow_ups_activity_status_idx ON activity_follow_ups (activity_id, status)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS agent_jobs (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        scope_type text DEFAULT 'activity' NOT NULL,
        activity_id text,
        activity_variant_id text,
        day_plan_id text,
        day_revision integer,
        conversation_id text NOT NULL,
        kind text NOT NULL,
        idempotency_key text NOT NULL,
        source_message_id text,
        status text DEFAULT 'queued' NOT NULL,
        attempts integer DEFAULT 0 NOT NULL,
        lease_token text,
        lease_owner text,
        leased_at text,
        lease_expires_at text,
        error text,
        progress_title text,
        progress_detail text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_variant_id) REFERENCES activity_variants(id) ON DELETE SET NULL,
        FOREIGN KEY (day_plan_id) REFERENCES daily_plans(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS agent_jobs_user_idempotency_unique ON agent_jobs (user_id, idempotency_key)"),
      db.prepare("CREATE INDEX IF NOT EXISTS agent_jobs_status_created_idx ON agent_jobs (status, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS agent_jobs_conversation_idx ON agent_jobs (conversation_id)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS agent_workers (
        id text PRIMARY KEY NOT NULL,
        runtime text NOT NULL,
        last_seen_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS agent_workers_last_seen_idx ON agent_workers (last_seen_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS agent_session_bindings (
        id text PRIMARY KEY NOT NULL,
        conversation_id text NOT NULL,
        runtime text NOT NULL,
        runtime_session_id text NOT NULL,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS agent_session_bindings_conversation_runtime_unique ON agent_session_bindings (conversation_id, runtime)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS activity_workspaces (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        activity_id text NOT NULL,
        activity_variant_id text,
        current_revision_id text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_variant_id) REFERENCES activity_variants(id) ON DELETE CASCADE
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS activity_profiles (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        activity_id text NOT NULL,
        setup_status text DEFAULT 'preparing' NOT NULL,
        setup_key text NOT NULL,
        setup_question_message_id text,
        assessed_at text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_profiles_user_activity_unique ON activity_profiles (user_id, activity_id)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS activity_runs (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        activity_id text NOT NULL,
        activity_variant_id text,
        daily_plan_item_id text,
        plan_date text NOT NULL,
        status text DEFAULT 'completed' NOT NULL,
        allotted_duration_seconds integer,
        planned_duration_seconds integer,
        actual_elapsed_seconds integer,
        timer_mode text,
        timer_component_id text,
        started_at text,
        completed_at text,
        details_json text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_variant_id) REFERENCES activity_variants(id) ON DELETE SET NULL,
        FOREIGN KEY (daily_plan_item_id) REFERENCES daily_plan_items(id) ON DELETE SET NULL
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_runs_daily_plan_item_unique ON activity_runs (daily_plan_item_id) WHERE daily_plan_item_id IS NOT NULL"),
      db.prepare("CREATE INDEX IF NOT EXISTS activity_runs_activity_date_idx ON activity_runs (activity_id, plan_date)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS activity_records (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        activity_id text NOT NULL,
        activity_variant_id text,
        record_key text NOT NULL,
        subject_key text,
        record_type text NOT NULL,
        title text NOT NULL,
        scope text DEFAULT 'activity' NOT NULL,
        scope_date text,
        payload_json text NOT NULL,
        version integer DEFAULT 1 NOT NULL,
        source_message_id text,
        source_agent_job_id text,
        archived_at text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_variant_id) REFERENCES activity_variants(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_records_user_activity_base_key_unique ON activity_records (user_id, activity_id, record_key) WHERE activity_variant_id IS NULL"),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_records_user_activity_variant_key_unique ON activity_records (user_id, activity_id, activity_variant_id, record_key) WHERE activity_variant_id IS NOT NULL"),
      db.prepare("CREATE INDEX IF NOT EXISTS activity_records_activity_scope_idx ON activity_records (activity_id, scope, scope_date)"),
      db.prepare("CREATE INDEX IF NOT EXISTS activity_records_activity_type_idx ON activity_records (activity_id, record_type)"),
      db.prepare("CREATE INDEX IF NOT EXISTS activity_records_activity_subject_idx ON activity_records (activity_id, subject_key)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS activity_record_revisions (
        id text PRIMARY KEY NOT NULL,
        record_id text NOT NULL,
        revision_number integer NOT NULL,
        title text NOT NULL,
        payload_json text NOT NULL,
        source_message_id text,
        source_agent_job_id text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (record_id) REFERENCES activity_records(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_record_revisions_record_number_unique ON activity_record_revisions (record_id, revision_number)"),
      db.prepare("CREATE INDEX IF NOT EXISTS activity_record_revisions_record_idx ON activity_record_revisions (record_id)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS record_relations (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        record_id text NOT NULL,
        activity_id text NOT NULL,
        relation_type text DEFAULT 'related' NOT NULL,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (record_id) REFERENCES activity_records(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS record_relations_record_activity_type_unique ON record_relations (record_id, activity_id, relation_type)"),
      db.prepare("CREATE INDEX IF NOT EXISTS record_relations_activity_idx ON record_relations (activity_id)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS workspace_revisions (
        id text PRIMARY KEY NOT NULL,
        workspace_id text NOT NULL,
        revision_number integer NOT NULL,
        document_json text NOT NULL,
        source_agent_job_id text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES activity_workspaces(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS workspace_revisions_workspace_number_unique ON workspace_revisions (workspace_id, revision_number)"),
      db.prepare("CREATE INDEX IF NOT EXISTS workspace_revisions_workspace_idx ON workspace_revisions (workspace_id)"),
    ]).then(async () => {
      const columns = await db.prepare("PRAGMA table_info(activity_visits)").all<{ name: string }>();
      if (!columns.results.some((column) => column.name === "context_json")) {
        await db.prepare("ALTER TABLE activity_visits ADD COLUMN context_json text").run();
      }
      if (!columns.results.some((column) => column.name === "created_at")) {
        await db.prepare("ALTER TABLE activity_visits ADD COLUMN created_at text").run();
        await db.prepare("UPDATE activity_visits SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL").run();
      }
      const jobColumns = await db.prepare("PRAGMA table_info(agent_jobs)").all<{ name: string }>();
      if (!jobColumns.results.some((column) => column.name === "scope_type")) {
        await db.prepare("ALTER TABLE agent_jobs ADD COLUMN scope_type text DEFAULT 'activity' NOT NULL").run();
      }
      if (!jobColumns.results.some((column) => column.name === "progress_title")) {
        await db.prepare("ALTER TABLE agent_jobs ADD COLUMN progress_title text").run();
      }
      if (!jobColumns.results.some((column) => column.name === "progress_detail")) {
        await db.prepare("ALTER TABLE agent_jobs ADD COLUMN progress_detail text").run();
      }
      if (!jobColumns.results.some((column) => column.name === "activity_variant_id")) {
        await db.prepare("ALTER TABLE agent_jobs ADD COLUMN activity_variant_id text REFERENCES activity_variants(id) ON DELETE SET NULL").run();
      }
      if (!jobColumns.results.some((column) => column.name === "day_plan_id")) {
        await db.prepare("ALTER TABLE agent_jobs ADD COLUMN day_plan_id text REFERENCES daily_plans(id) ON DELETE CASCADE").run();
      }
      if (!jobColumns.results.some((column) => column.name === "day_revision")) {
        await db.prepare("ALTER TABLE agent_jobs ADD COLUMN day_revision integer").run();
      }
      const dayPlanColumns = await db.prepare("PRAGMA table_info(daily_plans)").all<{ name: string }>();
      if (!dayPlanColumns.results.some((column) => column.name === "highlight_status")) {
        await db.prepare("ALTER TABLE daily_plans ADD COLUMN highlight_status text DEFAULT 'idle' NOT NULL").run();
      }
      if (!dayPlanColumns.results.some((column) => column.name === "highlight_body")) {
        await db.prepare("ALTER TABLE daily_plans ADD COLUMN highlight_body text").run();
      }
      if (!dayPlanColumns.results.some((column) => column.name === "highlight_kind")) {
        await db.prepare("ALTER TABLE daily_plans ADD COLUMN highlight_kind text").run();
      }
      if (!dayPlanColumns.results.some((column) => column.name === "highlight_revision")) {
        await db.prepare("ALTER TABLE daily_plans ADD COLUMN highlight_revision integer DEFAULT 0 NOT NULL").run();
      }
      const conversationColumns = await db.prepare("PRAGMA table_info(conversations)").all<{ name: string }>();
      if (!conversationColumns.results.some((column) => column.name === "scope_type")) {
        await db.prepare("ALTER TABLE conversations ADD COLUMN scope_type text DEFAULT 'activity' NOT NULL").run();
      }
      if (!conversationColumns.results.some((column) => column.name === "last_read_at")) {
        await db.prepare("ALTER TABLE conversations ADD COLUMN last_read_at text").run();
      }
      await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_activity_unique ON conversations (user_id, activity_id) WHERE scope_type = 'activity'").run();
      await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_global_unique ON conversations (user_id) WHERE scope_type = 'global'").run();
      const workspaceColumns = await db.prepare("PRAGMA table_info(activity_workspaces)").all<{ name: string }>();
      if (!workspaceColumns.results.some((column) => column.name === "activity_variant_id")) {
        await db.prepare("ALTER TABLE activity_workspaces ADD COLUMN activity_variant_id text REFERENCES activity_variants(id)").run();
      }
      await db.prepare("DROP INDEX IF EXISTS activity_workspaces_user_activity_unique").run();
      await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_workspaces_user_activity_base_unique ON activity_workspaces (user_id, activity_id) WHERE activity_variant_id IS NULL").run();
      await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_workspaces_user_activity_variant_unique ON activity_workspaces (user_id, activity_id, activity_variant_id) WHERE activity_variant_id IS NOT NULL").run();
    }).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

export async function findActivity(userId: string, clientKey: string): Promise<ActivityRecord | null> {
  return getD1().prepare(`
    SELECT id, client_key AS clientKey, title, category, icon, color
    FROM activities
    WHERE user_id = ? AND client_key = ?
  `).bind(userId, clientKey).first<ActivityRecord>();
}

export async function ensureConversation(userId: string, activity: ActivityRecord) {
  const db = getD1();
  const conversationId = `conversation:${safeId(userId)}:${safeId(activity.clientKey)}`;
  await db.prepare(`
    INSERT OR IGNORE INTO conversations (id, user_id, activity_id)
    VALUES (?, ?, ?)
  `).bind(conversationId, userId, activity.id).run();
  return conversationId;
}

export async function ensureGlobalConversation(userId: string) {
  const db = getD1();
  const conversationId = `conversation:${safeId(userId)}:global`;
  await db.prepare(`
    INSERT OR IGNORE INTO conversations (id, user_id, scope_type, activity_id)
    VALUES (?, ?, 'global', NULL)
  `).bind(conversationId, userId).run();
  return conversationId;
}

export type DayHighlightState = {
  status: "idle" | "queued" | "running" | "ready" | "quiet";
  body: string | null;
  kind: string | null;
  revision: number;
};

export async function queueDayHighlight(userId: string, dayPlanId: string): Promise<DayHighlightState> {
  await ensureAgentSchema();
  const db = getD1();
  const completed = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM daily_plan_items
    WHERE daily_plan_id = ? AND completed_at IS NOT NULL AND removed_at IS NULL
  `).bind(dayPlanId).first<{ count: number }>();
  const revisionRow = await db.prepare(`
    UPDATE daily_plans
    SET highlight_revision = highlight_revision + 1,
        highlight_status = ?, highlight_body = NULL, highlight_kind = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
    RETURNING highlight_revision AS revision
  `).bind((completed?.count ?? 0) > 0 ? "queued" : "quiet", dayPlanId, userId).first<{ revision: number }>();
  const revision = revisionRow?.revision ?? 0;
  if ((completed?.count ?? 0) < 1) return { status: "quiet", body: null, kind: null, revision };

  const conversationId = await ensureGlobalConversation(userId);
  const jobId = `agent-job:${safeId(userId)}:day-highlight:${safeId(dayPlanId)}:${revision}`;
  await db.batch([
    db.prepare(`
      UPDATE agent_jobs
      SET status = 'succeeded', lease_token = NULL, lease_owner = NULL,
          lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND kind = 'day_highlight' AND day_plan_id = ?
        AND status IN ('queued', 'retryable_failure')
    `).bind(userId, dayPlanId),
    db.prepare(`
      INSERT OR IGNORE INTO agent_jobs
        (id, user_id, scope_type, day_plan_id, day_revision, conversation_id, kind, idempotency_key)
      VALUES (?, ?, 'global', ?, ?, ?, 'day_highlight', ?)
    `).bind(jobId, userId, dayPlanId, revision, conversationId, `day-highlight:${dayPlanId}:${revision}`),
  ]);
  return { status: "queued", body: null, kind: null, revision };
}

export async function queueDayHighlightIfNeeded(userId: string, dayPlanId: string): Promise<DayHighlightState | null> {
  await ensureAgentSchema();
  const db = getD1();
  const plan = await db.prepare(`
    SELECT highlight_status AS status, highlight_body AS body, highlight_revision AS revision,
           (SELECT COUNT(*) FROM daily_plan_items
            WHERE daily_plan_id = daily_plans.id
              AND completed_at IS NOT NULL AND removed_at IS NULL) AS completedCount
    FROM daily_plans
    WHERE id = ? AND user_id = ?
  `).bind(dayPlanId, userId).first<{ status: DayHighlightState["status"]; body: string | null; revision: number; completedCount: number }>();
  const needsFirstReview = plan?.status === "idle";
  const needsCompactRewrite = plan?.status === "ready" && (plan.body?.length ?? 0) > 72;
  const needsCountFallback = plan?.status === "quiet" && (plan.completedCount ?? 0) >= 5;
  if (!plan || !plan.completedCount || (!needsFirstReview && !needsCompactRewrite && !needsCountFallback)) return null;

  const conversationId = await ensureGlobalConversation(userId);
  const revision = plan.revision + 1;
  const claimed = await db.prepare(`
    UPDATE daily_plans
    SET highlight_revision = ?, highlight_status = 'queued',
        highlight_body = NULL, highlight_kind = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND highlight_revision = ?
      AND (highlight_status = 'idle'
        OR (highlight_status = 'ready' AND length(COALESCE(highlight_body, '')) > 72)
        OR (highlight_status = 'quiet' AND (
          SELECT COUNT(*) FROM daily_plan_items
          WHERE daily_plan_id = daily_plans.id
            AND completed_at IS NOT NULL AND removed_at IS NULL
        ) >= 5))
    RETURNING highlight_revision AS revision
  `).bind(revision, dayPlanId, userId, plan.revision).first<{ revision: number }>();
  if (!claimed) return null;

  const jobId = `agent-job:${safeId(userId)}:day-highlight:${safeId(dayPlanId)}:${revision}`;
  try {
    await db.prepare(`
      INSERT OR IGNORE INTO agent_jobs
        (id, user_id, scope_type, day_plan_id, day_revision, conversation_id, kind, idempotency_key)
      VALUES (?, ?, 'global', ?, ?, ?, 'day_highlight', ?)
    `).bind(jobId, userId, dayPlanId, revision, conversationId, `day-highlight:${dayPlanId}:${revision}`).run();
  } catch (error) {
    await db.prepare(`
      UPDATE daily_plans SET highlight_status = 'idle', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND highlight_revision = ? AND highlight_status = 'queued'
    `).bind(dayPlanId, userId, revision).run();
    throw error;
  }
  return { status: "queued", body: null, kind: null, revision };
}

export async function readGlobalConversationState(conversationId: string, userId: string) {
  const db = getD1();
  const activeJob = await db.prepare(`
    SELECT status, kind, progress_title AS progressTitle, progress_detail AS progressDetail
    FROM agent_jobs
    WHERE conversation_id = ? AND scope_type = 'global'
      AND kind <> 'day_highlight'
      AND status IN ('queued', 'leased', 'running', 'retryable_failure')
    ORDER BY created_at DESC LIMIT 1
  `).bind(conversationId).first();
  const onlineWorker = await db.prepare(`SELECT id FROM agent_workers WHERE last_seen_at >= datetime('now', '-20 seconds') LIMIT 1`).first();
  const proposals = await db.prepare(`
    SELECT id, status, document_json AS documentJson, created_at AS createdAt
    FROM schedule_proposals
    WHERE user_id = ? AND conversation_id = ? AND status IN ('draft', 'awaiting_clarification', 'ready')
    ORDER BY created_at DESC LIMIT 20
  `).bind(userId, conversationId).all<{ id: string; status: string; documentJson: string; createdAt: string }>();
  return {
    messages: await readConversationMessages(conversationId),
    activeJob: activeJob ?? null,
    agentOnline: Boolean(onlineWorker),
    proposals: proposals.results.flatMap((proposal) => {
      try { return [{ id: proposal.id, status: proposal.status, document: JSON.parse(proposal.documentJson), createdAt: proposal.createdAt }]; } catch { return []; }
    }),
  };
}

export async function readConversationMessages(conversationId: string) {
  const result = await getD1().prepare(`
    SELECT id, role AS author, body, created_at AS createdAt
    FROM conversation_messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC, id ASC
    LIMIT 200
  `).bind(conversationId).all<{ id: string; author: "user" | "luna"; body: string; createdAt: string }>();
  return result.results;
}

type WorkspaceRecord = {
  revisionId: string | null;
  revisionNumber: number | null;
  documentJson: string | null;
};

function parseWorkspaceDocument(value: string | null): WorkspaceDocument {
  if (!value) return EMPTY_WORKSPACE;
  try {
    const parsed = JSON.parse(value) as WorkspaceDocument;
    if (parsed?.version !== 1 || !Array.isArray(parsed.components)) return EMPTY_WORKSPACE;
    return {
      version: 1,
      components: parsed.components.map((component) => component.type === "countdown" && component.durationSource !== "fixed"
        ? { ...component, durationSource: "timeline" as const }
        : component),
    };
  } catch {
    return EMPTY_WORKSPACE;
  }
}

export type ActivitySetupProfile = {
  setupStatus: "preparing" | "question_pending" | "ready" | "unnecessary";
  setupKey: string;
  setupQuestionMessageId: string | null;
};

export async function readActivitySetupProfile(activityId: string) {
  return getD1().prepare(`
    SELECT setup_status AS setupStatus, setup_key AS setupKey,
           setup_question_message_id AS setupQuestionMessageId
    FROM activity_profiles WHERE activity_id = ? LIMIT 1
  `).bind(activityId).first<ActivitySetupProfile>();
}

export async function queueActivitySetup(userId: string, activity: ActivityRecord) {
  await ensureAgentSchema();
  const db = getD1();
  const setupKey = activitySetupKey(activity);
  const profile = await readActivitySetupProfile(activity.id);
  if (profile && activitySetupKeyMatches(profile.setupKey, activity)) {
    if (profile.setupKey !== setupKey) {
      await db.prepare(`
        UPDATE activity_profiles
        SET setup_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE activity_id = ?
      `).bind(setupKey, activity.id).run();
    }
    return { ...profile, setupKey };
  }

  const conversationId = await ensureConversation(userId, activity);
  const jobId = `agent-job:${safeId(userId)}:setup:${safeId(activity.clientKey)}:${setupKey}`;
  const existing = await db.prepare("SELECT status FROM agent_jobs WHERE id = ?").bind(jobId).first<{ status: string }>();
  if (!existing) {
    await db.batch([
      db.prepare(`
        INSERT INTO activity_profiles (id, user_id, activity_id, setup_status, setup_key)
        VALUES (?, ?, ?, 'preparing', ?)
        ON CONFLICT(user_id, activity_id) DO UPDATE SET
          setup_status = 'preparing', setup_key = excluded.setup_key,
          setup_question_message_id = NULL, assessed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      `).bind(`activity-profile:${safeId(userId)}:${safeId(activity.clientKey)}`, userId, activity.id, setupKey),
      db.prepare(`
        INSERT INTO agent_jobs
          (id, user_id, activity_id, conversation_id, kind, idempotency_key)
        VALUES (?, ?, ?, ?, 'activity_setup', ?)
      `).bind(jobId, userId, activity.id, conversationId, `activity-setup:${activity.id}:${setupKey}`),
    ]);
  }
  return readActivitySetupProfile(activity.id);
}

export async function completeActivitySetup(input: {
  activityId: string;
  messageId: string | null;
  hasUsefulWorkspaceContent: boolean;
}) {
  const status = input.messageId ? "question_pending" : input.hasUsefulWorkspaceContent ? "ready" : "unnecessary";
  await getD1().prepare(`
    UPDATE activity_profiles
    SET setup_status = ?, setup_question_message_id = ?, assessed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE activity_id = ?
  `).bind(status, input.messageId, input.activityId).run();
}

export async function markActivitySetupAnswered(activityId: string) {
  await getD1().prepare(`
    UPDATE activity_profiles
    SET setup_status = 'ready', updated_at = CURRENT_TIMESTAMP
    WHERE activity_id = ? AND setup_status IN ('preparing', 'question_pending')
  `).bind(activityId).run();
}

export async function completeRequestedActivitySetup(activityId: string, hasUsefulWorkspaceContent: boolean) {
  await getD1().prepare(`
    UPDATE activity_profiles
    SET setup_status = ?, assessed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE activity_id = ? AND setup_status = 'preparing'
  `).bind(hasUsefulWorkspaceContent ? "ready" : "unnecessary", activityId).run();
}

async function readWorkspaceLayer(activityId: string, activityVariantId: string | null) {
  const row = await getD1().prepare(`
    SELECT aw.current_revision_id AS revisionId, wr.revision_number AS revisionNumber,
           wr.document_json AS documentJson
    FROM activity_workspaces aw
    LEFT JOIN workspace_revisions wr ON wr.id = aw.current_revision_id
    WHERE aw.activity_id = ? AND ${activityVariantId ? "aw.activity_variant_id = ?" : "aw.activity_variant_id IS NULL"}
    LIMIT 1
  `).bind(...(activityVariantId ? [activityId, activityVariantId] : [activityId])).first<WorkspaceRecord>();
  return {
    revisionId: row?.revisionId ?? null,
    revisionNumber: row?.revisionNumber ?? 0,
    document: parseWorkspaceDocument(row?.documentJson ?? null),
  };
}

export async function readActivityWorkspace(activityId: string, activityVariantId?: string | null) {
  const base = await readWorkspaceLayer(activityId, null);
  if (!activityVariantId) return base;
  const overlay = await readWorkspaceLayer(activityId, activityVariantId);
  const components = [...base.document.components];
  for (const component of overlay.document.components) {
    const index = components.findIndex((candidate) => candidate.id === component.id);
    if (index >= 0) components[index] = component;
    else components.push(component);
  }
  return {
    revisionId: overlay.revisionId ?? base.revisionId,
    revisionNumber: Math.max(base.revisionNumber, overlay.revisionNumber),
    document: { version: 1 as const, components: components.slice(0, 20) },
    layers: { base, overlay },
  };
}

export async function persistWorkspaceActions(input: {
  userId: string;
  activityId: string;
  activityVariantId?: string | null;
  agentJobId: string;
  actions: WorkspaceAction[];
}) {
  if (!input.actions.length) return readActivityWorkspace(input.activityId, input.activityVariantId);
  const db = getD1();
  const workspaceId = `workspace:${safeId(input.userId)}:${safeId(input.activityId)}${input.activityVariantId ? `:variant:${safeId(input.activityVariantId)}` : ""}`;
  const revisionId = `workspace-revision:${safeId(input.agentJobId)}`;
  const existingRevision = await db.prepare(`
    SELECT revision_number AS revisionNumber, document_json AS documentJson
    FROM workspace_revisions WHERE id = ?
  `).bind(revisionId).first<{ revisionNumber: number; documentJson: string }>();
  if (existingRevision) {
    return { revisionId, revisionNumber: existingRevision.revisionNumber, document: parseWorkspaceDocument(existingRevision.documentJson) };
  }

  const current = await readWorkspaceLayer(input.activityId, input.activityVariantId ?? null);
  const nextDocument = mergeWorkspaceActions(current.document, input.actions);
  const revisionNumber = current.revisionNumber + 1;
  await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO activity_workspaces (id, user_id, activity_id, activity_variant_id)
      VALUES (?, ?, ?, ?)
    `).bind(workspaceId, input.userId, input.activityId, input.activityVariantId ?? null),
    db.prepare(`
      INSERT OR IGNORE INTO workspace_revisions
        (id, workspace_id, revision_number, document_json, source_agent_job_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(revisionId, workspaceId, revisionNumber, JSON.stringify(nextDocument), input.agentJobId),
    db.prepare(`
      UPDATE activity_workspaces
      SET current_revision_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(revisionId, workspaceId),
  ]);
  return { revisionId, revisionNumber, document: nextDocument };
}

type ActivityRecordRow = {
  id: string;
  recordKey: string;
  subjectKey: string | null;
  recordType: string;
  title: string;
  scope: string;
  scopeDate: string | null;
  version: number;
  payloadJson: string;
  updatedAt: string;
};

export async function readActivityRecords(activityId: string, planDate?: string | null, activityVariantId?: string | null): Promise<PersistedActivityRecord[]> {
  const result = await getD1().prepare(`
    SELECT id, record_key AS recordKey, subject_key AS subjectKey, record_type AS recordType, title, scope,
           scope_date AS scopeDate, version, payload_json AS payloadJson, updated_at AS updatedAt
    FROM activity_records
    WHERE activity_id = ? AND archived_at IS NULL
      AND (
        scope = 'activity'
        OR (scope = 'day' AND scope_date = ?)
        OR (scope = 'variant' AND activity_variant_id = ?)
      )
    ORDER BY created_at ASC, id ASC
    LIMIT 200
  `).bind(activityId, planDate ?? "", activityVariantId ?? "").all<ActivityRecordRow>();
  return result.results.flatMap((row) => {
    const record = parseActivityRecord(row);
    return record ? [record] : [];
  });
}

export async function persistRecordActions(input: {
  userId: string;
  activityId: string;
  activityVariantId?: string | null;
  actionId: string;
  actions: RecordAction[];
  sourceMessageId?: string | null;
  sourceAgentJobId?: string | null;
}) {
  const db = getD1();
  // Subject roots establish ownership for the records that follow. Removals
  // happen last so retries never observe a bundle with its owner removed first.
  const orderedActions = [...input.actions].sort((left, right) => {
    const priority = (action: RecordAction) => action.op === "remove" ? 3 : action.record.type === "product" ? 0 : action.record.subjectKey ? 1 : 2;
    return priority(left) - priority(right);
  });
  for (const action of orderedActions) {
    if (action.op === "remove") {
      await db.prepare(`
        UPDATE activity_records SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND activity_id = ? AND record_key = ?
          AND ${input.activityVariantId ? "activity_variant_id = ?" : "activity_variant_id IS NULL"}
          AND archived_at IS NULL
      `).bind(...(input.activityVariantId
        ? [input.userId, input.activityId, action.recordKey, input.activityVariantId]
        : [input.userId, input.activityId, action.recordKey])).run();
      continue;
    }

    const variantId = action.record.scope === "variant" ? input.activityVariantId ?? null : null;
    if (action.record.scope === "variant" && !variantId) throw new Error("A variant record requires an active variant.");
    const recordId = `activity-record:${safeId(input.userId)}:${safeId(input.activityId)}${variantId ? `:variant:${safeId(variantId)}` : ""}:${safeId(action.record.key)}`;
    const revisionId = `activity-record-revision:${safeId(input.actionId)}:${safeId(action.record.key)}`;
    const existingRevision = await db.prepare("SELECT id FROM activity_record_revisions WHERE id = ?")
      .bind(revisionId).first<{ id: string }>();
    if (existingRevision) continue;
    const current = await db.prepare(`
      SELECT id, version, record_type AS recordType, payload_json AS payloadJson FROM activity_records
      WHERE user_id = ? AND activity_id = ? AND record_key = ?
        AND ${variantId ? "activity_variant_id = ?" : "activity_variant_id IS NULL"}
      LIMIT 1
    `).bind(...(variantId
      ? [input.userId, input.activityId, action.record.key, variantId]
      : [input.userId, input.activityId, action.record.key])).first<{ id: string; version: number; recordType: string; payloadJson: string }>();
    const nextVersion = (current?.version ?? 0) + 1;
    // A cross-activity move deliberately preserves the durable record id. Use
    // that persisted id for its revisions and relations instead of rebuilding
    // an activity-derived id that no longer names the row.
    const persistedRecordId = current?.id ?? recordId;
    let nextData = action.record.data;
    if (action.record.type === "daily_selection" && current?.recordType === "daily_selection" && (input.sourceAgentJobId || input.sourceMessageId)) {
      try {
        const currentData = JSON.parse(current.payloadJson) as DailySelectionData;
        nextData = mergeDailySelectionData(currentData, action.record.data as DailySelectionData);
      } catch { /* the validated incoming record remains the safe fallback */ }
    }
    if (action.record.type === "meal_log" && current?.recordType === "meal_log" && (input.sourceAgentJobId || input.sourceMessageId)) {
      try {
        const currentData = JSON.parse(current.payloadJson) as MealLogData;
        nextData = mergeMealLogData(currentData, action.record.data as MealLogData);
      } catch { /* the validated incoming record remains the safe fallback */ }
    }
    const payloadJson = JSON.stringify(nextData);
    await db.batch([
      db.prepare(`
        INSERT INTO activity_records
          (id, user_id, activity_id, activity_variant_id, record_key, subject_key, record_type, title, scope, scope_date,
           payload_json, version, source_message_id, source_agent_job_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(${variantId ? "user_id, activity_id, activity_variant_id, record_key" : "user_id, activity_id, record_key"})
        WHERE activity_variant_id IS ${variantId ? "NOT " : ""}NULL DO UPDATE SET
          subject_key = excluded.subject_key, record_type = excluded.record_type, title = excluded.title, scope = excluded.scope,
          scope_date = excluded.scope_date, payload_json = excluded.payload_json,
          version = excluded.version, source_message_id = excluded.source_message_id,
          source_agent_job_id = excluded.source_agent_job_id, archived_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        recordId, input.userId, input.activityId, variantId, action.record.key, action.record.subjectKey ?? null, action.record.type,
        action.record.title, action.record.scope ?? "activity", action.record.scopeDate ?? null,
        payloadJson, nextVersion, input.sourceMessageId ?? null, input.sourceAgentJobId ?? null,
      ),
      db.prepare(`
        INSERT OR IGNORE INTO activity_record_revisions
          (id, record_id, revision_number, title, payload_json, source_message_id, source_agent_job_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(revisionId, persistedRecordId, nextVersion, action.record.title, payloadJson, input.sourceMessageId ?? null, input.sourceAgentJobId ?? null),
      db.prepare(`
        INSERT OR IGNORE INTO record_relations (id, user_id, record_id, activity_id, relation_type)
        VALUES (?, ?, ?, ?, 'primary')
      `).bind(`record-relation:${safeId(persistedRecordId)}:${safeId(input.activityId)}:primary`, input.userId, persistedRecordId, input.activityId),
    ]);
  }
}

export async function readActivityFollowUps(activityId: string): Promise<ActivityFollowUp[]> {
  const rows = await getD1().prepare(`
    SELECT id, follow_up_key AS followUpKey, title, question, due_date AS dueDate,
           status, inferred, created_at AS createdAt, asked_at AS askedAt
    FROM activity_follow_ups
    WHERE activity_id = ? AND status IN ('pending', 'due', 'asked')
    ORDER BY due_date, created_at
    LIMIT 30
  `).bind(activityId).all<{
    id: string; followUpKey: string; title: string; question: string; dueDate: string;
    status: ActivityFollowUp["status"]; inferred: number; createdAt: string; askedAt: string | null;
  }>();
  return rows.results.map((row) => ({
    id: row.id,
    key: row.followUpKey,
    title: row.title,
    question: row.question,
    dueDate: row.dueDate,
    status: row.status,
    inferred: Boolean(row.inferred),
    createdAt: row.createdAt,
    askedAt: row.askedAt,
  }));
}

export async function archiveParentCadenceRecords(userId: string) {
  const rows = await getD1().prepare(`
    SELECT record.id, record.record_key AS recordKey, record.subject_key AS subjectKey,
           record.record_type AS recordType, record.title, record.scope,
           record.scope_date AS scopeDate, record.version, record.payload_json AS payloadJson,
           record.updated_at AS updatedAt, activity.title AS activityTitle,
           activity.client_key AS clientKey
    FROM activity_records record
    JOIN activities activity ON activity.id = record.activity_id
    WHERE record.user_id = ? AND record.record_type = 'recurring_step' AND record.archived_at IS NULL
  `).bind(userId).all<ActivityRecordRow & { activityTitle: string; clientKey: string }>();
  const invalidIds = rows.results.flatMap((row) => {
    const record = parseActivityRecord(row);
    return record && recurringStepRepresentsParentActivity(record, { title: row.activityTitle, clientKey: row.clientKey }) ? [row.id] : [];
  });
  if (!invalidIds.length) return 0;
  await getD1().prepare(`
    UPDATE activity_records SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND id IN (${invalidIds.map(() => "?").join(", ")})
  `).bind(userId, ...invalidIds).run();
  return invalidIds.length;
}

const PARENT_CADENCE_SCHEDULE_BACKFILL = "parent-cadence-schedules-v1";

export async function backfillParentCadenceSchedules(userId: string, routineId: string) {
  const db = getD1();
  const completed = await db.prepare("SELECT id FROM user_migrations WHERE user_id = ? AND migration_key = ? LIMIT 1")
    .bind(userId, PARENT_CADENCE_SCHEDULE_BACKFILL).first<{ id: string }>();
  if (completed) return 0;

  const rows = await db.prepare(`
    SELECT record.id, record.activity_id AS activityId, record.record_key AS recordKey,
           record.subject_key AS subjectKey, record.record_type AS recordType,
           record.title, record.scope, record.scope_date AS scopeDate, record.version,
           record.payload_json AS payloadJson, record.updated_at AS updatedAt,
           activity.title AS activityTitle, activity.client_key AS clientKey
    FROM activity_records record
    JOIN activities activity ON activity.id = record.activity_id
    WHERE record.user_id = ? AND record.record_type = 'recurring_step'
    ORDER BY record.updated_at DESC, record.id
  `).bind(userId).all<ActivityRecordRow & { activityId: string; activityTitle: string; clientKey: string }>();

  const candidates = new Map<string, NonNullable<ReturnType<typeof parentScheduleCadenceFromRecurringStep>>>();
  for (const row of rows.results) {
    if (candidates.has(row.activityId)) continue;
    const record = parseActivityRecord(row);
    if (!record || !recurringStepRepresentsParentActivity(record, { title: row.activityTitle, clientKey: row.clientKey })) continue;
    const cadence = parentScheduleCadenceFromRecurringStep(record);
    if (cadence) candidates.set(row.activityId, cadence);
  }

  const statements = [];
  let migrated = 0;
  for (const [activityId, cadence] of candidates) {
    const pattern = await db.prepare(`
      SELECT pattern.id, pattern.cadence_json AS cadenceJson, pattern.revision
      FROM schedule_patterns pattern
      JOIN schedule_pattern_steps step ON step.pattern_id = pattern.id
      WHERE pattern.user_id = ? AND pattern.routine_id = ? AND pattern.archived_at IS NULL
        AND step.activity_id = ?
        AND (SELECT COUNT(*) FROM schedule_pattern_steps count_steps WHERE count_steps.pattern_id = pattern.id) = 1
      ORDER BY pattern.position, pattern.id
      LIMIT 1
    `).bind(userId, routineId, activityId).first<{ id: string; cadenceJson: string; revision: number }>();
    const existingCadence = pattern ? (() => { try { return parseCadence(JSON.parse(pattern.cadenceJson)); } catch { return null; } })() : null;
    if (!pattern || existingCadence?.kind !== "daily") continue;
    statements.push(
      db.prepare(`
        UPDATE schedule_patterns
        SET cadence_json = ?, anchor_date = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND routine_id = ? AND revision = ?
      `).bind(JSON.stringify(cadence), "anchorDate" in cadence ? cadence.anchorDate : "1970-01-01", pattern.id, userId, routineId, pattern.revision),
      db.prepare(`
        INSERT INTO schedule_action_events
          (id, user_id, action_type, action_json, source, actor, idempotency_key)
        VALUES (?, ?, 'migrate_parent_cadence', ?, 'system', 'system', ?)
      `).bind(
        `schedule-event:${safeId(userId)}:${crypto.randomUUID()}`,
        userId,
        JSON.stringify({ patternId: pattern.id, activityId, cadence }),
        `${PARENT_CADENCE_SCHEDULE_BACKFILL}:${pattern.id}`,
      ),
    );
    migrated += 1;
  }
  if (migrated) {
    statements.push(db.prepare(`
      UPDATE routine_templates
      SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(routineId, userId));
  }
  statements.push(db.prepare("INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)")
    .bind(`migration:${safeId(userId)}:${PARENT_CADENCE_SCHEDULE_BACKFILL}`, userId, PARENT_CADENCE_SCHEDULE_BACKFILL));
  await db.batch(statements);
  return migrated;
}

const EXPLICIT_FOLLOW_UP_BACKFILL = "explicit-follow-ups-v2";
const BOUNDED_SESSION_CHOICE_BACKFILL = "bounded-session-choices-v1";
const MEASURED_SESSION_LOG_BACKFILL = "measured-session-logs-v1";
const STRENGTH_SESSION_BACKFILL = "strength-sessions-v1";
const STRENGTH_WORKOUT_PHASE_BACKFILL = "strength-workout-phases-v1";
const DAILY_SELECTION_BACKFILL = "daily-selections-v1";

export async function backfillExplicitFollowUps(userId: string) {
  const migrationId = `migration:${safeId(userId)}:${EXPLICIT_FOLLOW_UP_BACKFILL}`;
  const db = getD1();
  const completed = await db.prepare("SELECT id FROM user_migrations WHERE user_id = ? AND migration_key = ? LIMIT 1")
    .bind(userId, EXPLICIT_FOLLOW_UP_BACKFILL).first<{ id: string }>();
  if (completed) return 0;
  const messages = await db.prepare(`
    SELECT message.id, message.body, message.created_at AS createdAt,
           conversation.id AS conversationId, activity.id AS activityId, activity.title AS activityTitle
    FROM conversation_messages message
    JOIN conversations conversation ON conversation.id = message.conversation_id
    JOIN activities activity ON activity.id = conversation.activity_id
    WHERE conversation.user_id = ? AND message.role = 'user'
      AND lower(message.body) LIKE '%week%'
      AND (lower(message.body) LIKE '%ask again%' OR lower(message.body) LIKE '%check back%' OR lower(message.body) LIKE '%check in%')
    ORDER BY message.created_at
    LIMIT 50
  `).bind(userId).all<{ id: string; body: string; createdAt: string; conversationId: string; activityId: string; activityTitle: string }>();
  for (const message of messages.results) {
    const storedInstant = /(?:Z|[+-]\d{2}:?\d{2})$/.test(message.createdAt)
      ? message.createdAt
      : `${message.createdAt.replace(" ", "T")}Z`;
    const sourceDate = localDateInTimeZone(storedInstant, "America/Phoenix");
    const mentionsElliptical = /elliptical/i.test(message.body);
    await persistFollowUpActions({
      userId,
      activityId: message.activityId,
      conversationId: message.conversationId,
      actionId: `${migrationId}:${safeId(message.id)}`,
      sourceMessageId: message.id,
      localDate: sourceDate,
      actions: [{
        op: "upsert",
        key: `one-week-trial-${safeId(message.id).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(-48)}`,
        title: mentionsElliptical ? "One-week elliptical trial" : `One-week ${message.activityTitle} trial`,
        question: mentionsElliptical
          ? "How did a week on the elliptical feel, and what would you like to do next?"
          : `How did your one-week ${message.activityTitle.toLowerCase()} trial go, and what would you like to change?`,
        dueDate: addLocalDays(sourceDate, 7),
        inferred: true,
      }],
    });
  }
  await db.prepare("INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)")
    .bind(migrationId, userId, EXPLICIT_FOLLOW_UP_BACKFILL).run();
  return messages.results.length;
}

type ChoiceFollowUpRow = {
  id: string;
  title: string;
  question: string;
  dueDate: string;
  createdAt: string;
};

function storedLocalDate(createdAt: string) {
  const instant = /(?:Z|[+-]\d{2}:?\d{2})$/.test(createdAt)
    ? createdAt
    : `${createdAt.replace(" ", "T")}Z`;
  return localDateInTimeZone(instant, "America/Phoenix");
}

export async function reconcileBoundedSessionChoices(input: { userId: string; activityId: string; actionId: string }) {
  const db = getD1();
  const followUps = await db.prepare(`
    SELECT id, title, question, due_date AS dueDate, created_at AS createdAt
    FROM activity_follow_ups
    WHERE user_id = ? AND activity_id = ? AND status IN ('pending', 'due')
    ORDER BY due_date, created_at
  `).bind(input.userId, input.activityId).all<ChoiceFollowUpRow>();
  if (!followUps.results.length) return 0;

  const choices = (await readActivityRecords(input.activityId)).filter((record) => record.type === "session_choice" && record.scope === "activity");
  let updated = 0;
  for (const choice of choices) {
    const data = choice.data as SessionChoicePlanData;
    const plan = inferSessionChoicePlan(data, followUps.results.map((followUp) => ({
      ...followUp,
      sourceDate: storedLocalDate(followUp.createdAt),
    })));
    if (!plan) continue;
    await persistRecordActions({
      userId: input.userId,
      activityId: input.activityId,
      actionId: `${input.actionId}:${safeId(choice.key)}:${safeId(plan.followUpId)}`,
      sourceAgentJobId: input.actionId,
      actions: [{
        op: "upsert",
        record: {
          key: choice.key,
          subjectKey: choice.subjectKey,
          type: choice.type,
          title: choice.title,
          scope: choice.scope,
          scopeDate: choice.scopeDate,
          data: {
            ...choice.data,
            activeSelection: {
              optionId: plan.optionId,
              startDate: plan.startDate,
              endDate: plan.endDate,
              reason: plan.reason,
            },
          },
        },
      }],
    });
    updated += 1;
  }
  return updated;
}

export async function backfillBoundedSessionChoices(userId: string) {
  const migrationId = `migration:${safeId(userId)}:${BOUNDED_SESSION_CHOICE_BACKFILL}`;
  const db = getD1();
  const completed = await db.prepare("SELECT id FROM user_migrations WHERE user_id = ? AND migration_key = ? LIMIT 1")
    .bind(userId, BOUNDED_SESSION_CHOICE_BACKFILL).first<{ id: string }>();
  if (completed) return 0;
  const activities = await db.prepare(`
    SELECT DISTINCT activity_id AS activityId
    FROM activity_follow_ups
    WHERE user_id = ? AND status IN ('pending', 'due')
  `).bind(userId).all<{ activityId: string }>();
  let updated = 0;
  for (const activity of activities.results) {
    updated += await reconcileBoundedSessionChoices({
      userId,
      activityId: activity.activityId,
      actionId: migrationId,
    });
  }
  await db.prepare("INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)")
    .bind(migrationId, userId, BOUNDED_SESSION_CHOICE_BACKFILL).run();
  return updated;
}

export async function backfillMeasuredSessionLogs(userId: string) {
  const migrationId = `migration:${safeId(userId)}:${MEASURED_SESSION_LOG_BACKFILL}`;
  const db = getD1();
  const completed = await db.prepare("SELECT id FROM user_migrations WHERE user_id = ? AND migration_key = ? LIMIT 1")
    .bind(userId, MEASURED_SESSION_LOG_BACKFILL).first<{ id: string }>();
  if (completed) return 0;
  const activities = await db.prepare(`
    SELECT id, title, category
    FROM activities
    WHERE user_id = ?
    ORDER BY created_at, id
  `).bind(userId).all<{ id: string; title: string; category: string }>();
  let updated = 0;
  for (const activity of activities.results) {
    if (!/cardio|run|walk|hike|ruck|cycle|bike|row|swim|elliptical|stair|conditioning/i.test(`${activity.title} ${activity.category}`)) continue;
    const records = await readActivityRecords(activity.id);
    if (records.some((record) => record.type === "session_log")) continue;
    const choice = records.find((record) => record.type === "session_choice" && record.scope === "activity");
    if (!choice) continue;
    const choiceData = choice.data as SessionChoiceData;
    const options = choiceData.options ?? [];
    if (!options.length) continue;
    const recordKey = "measured-session-log";
    await persistRecordActions({
      userId,
      activityId: activity.id,
      actionId: `${migrationId}:${safeId(activity.id)}:record`,
      sourceAgentJobId: migrationId,
      actions: [{
        op: "upsert",
        record: {
          key: recordKey,
          subjectKey: null,
          type: "session_log",
          title: `${activity.title} sessions`,
          scope: "activity",
          scopeDate: null,
          data: {
            choiceRecordKey: choice.key,
            fields: measuredSessionFields(options),
            entries: [],
          },
        },
      }],
    });
    await persistWorkspaceActions({
      userId,
      activityId: activity.id,
      agentJobId: `${migrationId}:${safeId(activity.id)}:workspace`,
      actions: [{
        op: "upsert",
        component: { id: recordKey, type: "session_log", title: `${activity.title} session`, recordKey, presentation: "featured" },
      }],
    });
    updated += 1;
  }
  await db.prepare("INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)")
    .bind(migrationId, userId, MEASURED_SESSION_LOG_BACKFILL).run();
  return updated;
}

export async function ensureStrengthSessionsForActivity(input: {
  userId: string;
  activityId: string;
  activityVariantId?: string | null;
  actionId: string;
}) {
  const activity = await getD1().prepare("SELECT title FROM activities WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(input.activityId, input.userId).first<{ title: string }>();
  if (!activity) return 0;
  const records = await readActivityRecords(input.activityId, null, input.activityVariantId);
  const targetScope = input.activityVariantId ? "variant" : "activity";
  const workouts = records.filter((record) => record.type === "workout" && record.scope === targetScope);
  let updated = 0;
  for (const workout of workouts) {
    if (records.some((record) => record.type === "strength_session" && record.scope === targetScope && record.data.workoutRecordKey === workout.key)) continue;
    const sessionsByDate = new Map<string, {
      id: string; date: string; workoutTitle: string; startedAt: string; completedAt: string; note: string;
      exercises: Array<{ id: string; exerciseId: string; name: string; sets: Array<Record<string, unknown>> }>;
    }>();
    const workoutExercises = Array.isArray(workout.data.exercises) ? workout.data.exercises as Array<Record<string, unknown>> : [];
    for (const exercise of workoutExercises) {
      const exerciseId = typeof exercise.id === "string" ? exercise.id : "";
      const name = typeof exercise.name === "string" ? exercise.name : "";
      if (!exerciseId || !name || !Array.isArray(exercise.sets)) continue;
      for (const [setIndex, setValue] of exercise.sets.entries()) {
        const set = asObject(setValue);
        const completedAt = typeof set?.completedAt === "string" ? set.completedAt : "";
        const reps = typeof set?.reps === "number" && Number.isFinite(set.reps) ? Math.round(set.reps) : null;
        const date = completedAt.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || reps === null || reps < 1) continue;
        const session = sessionsByDate.get(date) ?? {
          id: `strength-${date}-${workout.key}`,
          date,
          workoutTitle: workout.title,
          startedAt: completedAt,
          completedAt: "",
          note: "",
          exercises: [],
        };
        let result = session.exercises.find((entry) => entry.exerciseId === exerciseId);
        if (!result) {
          result = { id: `performed-${date}-${exerciseId}`, exerciseId, name, sets: [] };
          session.exercises.push(result);
        }
        result.sets.push({
          id: typeof set?.id === "string" ? set.id : `set-${setIndex + 1}`,
          ordinal: result.sets.length + 1,
          type: "working",
          load: typeof set?.load === "string" ? set.load : "",
          reps,
          rir: null,
          completedAt,
        });
        sessionsByDate.set(date, session);
      }
    }
    const recordKey = workouts.length === 1 ? "strength-session-log" : `${workout.key}-sessions`.slice(0, 80);
    await persistRecordActions({
      userId: input.userId,
      activityId: input.activityId,
      activityVariantId: input.activityVariantId,
      actionId: `${input.actionId}:${safeId(workout.key)}:record`,
      sourceAgentJobId: input.actionId,
      actions: [{
        op: "upsert",
        record: {
          key: recordKey,
          subjectKey: null,
          type: "strength_session",
          title: `${activity.title} sessions`,
          scope: targetScope,
          scopeDate: null,
          data: { workoutRecordKey: workout.key, sessions: Array.from(sessionsByDate.values()) },
        },
      }],
    });
    await persistWorkspaceActions({
      userId: input.userId,
      activityId: input.activityId,
      activityVariantId: input.activityVariantId,
      agentJobId: `${input.actionId}:${safeId(workout.key)}:workspace`,
      actions: [{
        op: "upsert",
        component: { id: recordKey, type: "strength_session", title: `${activity.title} workout`, recordKey, presentation: "featured" },
      }],
    });
    updated += 1;
  }
  return updated;
}

export async function backfillStrengthSessions(userId: string) {
  const migrationId = `migration:${safeId(userId)}:${STRENGTH_SESSION_BACKFILL}`;
  const db = getD1();
  const completed = await db.prepare("SELECT id FROM user_migrations WHERE user_id = ? AND migration_key = ? LIMIT 1")
    .bind(userId, STRENGTH_SESSION_BACKFILL).first<{ id: string }>();
  if (completed) return 0;
  const activities = await db.prepare("SELECT id FROM activities WHERE user_id = ? ORDER BY created_at, id")
    .bind(userId).all<{ id: string }>();
  let updated = 0;
  for (const activity of activities.results) {
    updated += await ensureStrengthSessionsForActivity({ userId, activityId: activity.id, actionId: `${migrationId}:${safeId(activity.id)}` });
  }
  await db.prepare("INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)")
    .bind(migrationId, userId, STRENGTH_SESSION_BACKFILL).run();
  return updated;
}

export async function backfillStrengthWorkoutPhases(userId: string) {
  const migrationId = `migration:${safeId(userId)}:${STRENGTH_WORKOUT_PHASE_BACKFILL}`;
  const db = getD1();
  const completed = await db.prepare("SELECT id FROM user_migrations WHERE user_id = ? AND migration_key = ? LIMIT 1")
    .bind(userId, STRENGTH_WORKOUT_PHASE_BACKFILL).first<{ id: string }>();
  if (completed) return 0;

  const activities = await db.prepare("SELECT id FROM activities WHERE user_id = ? ORDER BY created_at, id")
    .bind(userId).all<{ id: string }>();
  let updated = 0;
  for (const activity of activities.results) {
    const records = await readActivityRecords(activity.id);
    const workouts = records.filter((record) => record.type === "workout" && record.scope === "activity");
    if (workouts.length !== 1) continue;
    const workout = workouts[0];
    const candidates = records.filter((record) => {
      if (record.type !== "protocol" || record.scope !== "activity" || record.subjectKey || record.data.workoutRecordKey) return false;
      const text = `${record.title} ${typeof record.data.summary === "string" ? record.data.summary : ""}`;
      return /warm[- ]?up|movement prep|pre-lift|activation/i.test(text);
    });
    for (const protocol of candidates) {
      await persistRecordActions({
        userId,
        activityId: activity.id,
        actionId: `${migrationId}:${safeId(activity.id)}:${safeId(protocol.key)}`,
        sourceAgentJobId: migrationId,
        actions: [{
          op: "upsert",
          record: {
            key: protocol.key,
            subjectKey: null,
            type: "protocol",
            title: protocol.title,
            scope: protocol.scope,
            scopeDate: protocol.scopeDate,
            data: { ...protocol.data, workoutRecordKey: workout.key, phase: "warmup" },
          },
        }],
      });
      updated += 1;
    }
  }
  await db.prepare("INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)")
    .bind(migrationId, userId, STRENGTH_WORKOUT_PHASE_BACKFILL).run();
  return updated;
}

export async function backfillDailySelections(userId: string) {
  const migrationId = `migration:${safeId(userId)}:${DAILY_SELECTION_BACKFILL}`;
  const db = getD1();
  const completed = await db.prepare("SELECT id FROM user_migrations WHERE user_id = ? AND migration_key = ? LIMIT 1")
    .bind(userId, DAILY_SELECTION_BACKFILL).first<{ id: string }>();
  if (completed) return 0;
  const activities = await db.prepare("SELECT id, title FROM activities WHERE user_id = ? ORDER BY created_at, id")
    .bind(userId).all<{ id: string; title: string }>();
  let updated = 0;
  for (const activity of activities.results) {
    const records = await readActivityRecords(activity.id);
    const existing = records.find((record) => record.type === "daily_selection" && /supplement/i.test(`${record.key} ${record.title}`));
    const legacy = records.find((record) => record.type === "checklist" && /supplement/i.test(`${record.key} ${record.title}`));
    const source = existing ?? legacy;
    if (!source) continue;
    const historyRecords = records.filter((record) => record.type === "history" && /supplement/i.test(`${record.key} ${record.title}`));
    const migrated = migrateLegacyDailySelection((legacy ?? existing)?.data ?? {}, historyRecords.map((record) => record.data));
    const data = existing
      ? mergeDailySelectionData(existing.data as DailySelectionData, migrated)
      : migrated;
    await persistRecordActions({
      userId,
      activityId: activity.id,
      actionId: `${migrationId}:${safeId(activity.id)}:records`,
      sourceAgentJobId: migrationId,
      actions: [{
        op: "upsert",
        record: {
          key: source.key,
          subjectKey: null,
          type: "daily_selection",
          title: "Supplements",
          scope: "activity",
          scopeDate: null,
          data,
        },
      }, ...historyRecords.map((record) => ({ op: "remove" as const, recordKey: record.key }))],
    });
    await persistWorkspaceActions({
      userId,
      activityId: activity.id,
      agentJobId: `${migrationId}:${safeId(activity.id)}:workspace`,
      actions: [
        { op: "upsert", component: { id: source.key, type: "daily_selection", title: "Supplements", recordKey: source.key, presentation: "featured" } },
        ...historyRecords.map((record) => ({ op: "remove" as const, componentId: record.key })),
      ],
    });
    updated += 1;
  }
  await db.prepare("INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)")
    .bind(migrationId, userId, DAILY_SELECTION_BACKFILL).run();
  return updated;
}

export async function persistFollowUpActions(input: {
  userId: string;
  activityId: string;
  conversationId: string;
  actionId: string;
  sourceMessageId?: string | null;
  localDate: string;
  actions: FollowUpAction[] | unknown;
}) {
  const actions = validateFollowUpActions(input.actions, input.localDate);
  const db = getD1();
  for (const action of actions) {
    if (action.op === "complete" || action.op === "dismiss") {
      const terminalStatus = action.op === "complete" ? "completed" : "dismissed";
      await db.batch([
        db.prepare(`
          UPDATE agent_jobs
          SET status = 'cancelled', lease_token = NULL, lease_owner = NULL,
              lease_expires_at = NULL, progress_title = NULL, progress_detail = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND status IN ('queued', 'leased', 'running', 'retryable_failure')
            AND id = (
              SELECT trigger_job_id FROM activity_follow_ups
              WHERE user_id = ? AND activity_id = ? AND follow_up_key = ?
            )
        `).bind(input.userId, input.userId, input.activityId, action.key),
        db.prepare(`
          UPDATE activity_follow_ups
          SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
              dismissed_at = CASE WHEN ? = 'dismissed' THEN CURRENT_TIMESTAMP ELSE dismissed_at END,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND activity_id = ? AND follow_up_key = ?
            AND status IN ('pending', 'due', 'asked')
        `).bind(
          terminalStatus, terminalStatus, terminalStatus,
          input.userId, input.activityId, action.key,
        ),
      ]);
      continue;
    }
    const id = `activity-follow-up:${safeId(input.userId)}:${safeId(input.activityId)}:${safeId(action.key)}`;
    await db.prepare(`
      INSERT INTO activity_follow_ups
        (id, user_id, activity_id, conversation_id, follow_up_key, title, question,
         due_date, inferred, source_message_id, source_agent_job_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title, question = excluded.question, due_date = excluded.due_date,
        inferred = excluded.inferred, source_message_id = excluded.source_message_id,
        source_agent_job_id = excluded.source_agent_job_id,
        status = CASE WHEN activity_follow_ups.status IN ('completed', 'dismissed') THEN activity_follow_ups.status ELSE 'pending' END,
        trigger_job_id = CASE WHEN activity_follow_ups.due_date <> excluded.due_date THEN NULL ELSE activity_follow_ups.trigger_job_id END,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      id, input.userId, input.activityId, input.conversationId, action.key, action.title,
      action.question, action.dueDate, action.inferred ? 1 : 0,
      input.sourceMessageId ?? null, input.actionId,
    ).run();
  }
  return { actionsApplied: actions.length, followUps: await readActivityFollowUps(input.activityId) };
}

export async function queueDueFollowUps(userId: string, localDate: string, activityId?: string | null) {
  const db = getD1();
  const due = await db.prepare(`
    SELECT followup.id, followup.activity_id AS activityId, followup.conversation_id AS conversationId,
      followup.due_date AS dueDate
    FROM activity_follow_ups followup
    WHERE followup.user_id = ? AND followup.status = 'pending' AND followup.due_date <= ?
      AND (? IS NULL OR followup.activity_id = ?)
    ORDER BY followup.due_date, followup.created_at
    LIMIT 20
  `).bind(userId, localDate, activityId ?? null, activityId ?? null).all<{
    id: string;
    activityId: string;
    conversationId: string;
    dueDate: string;
  }>();
  for (const followUp of due.results) {
    // The due date is part of the identity so a user can reschedule an already-fired
    // follow-up without colliding with its completed agent job.
    const jobId = `agent-job:${safeId(userId)}:follow-up:${safeId(followUp.id)}:${followUp.dueDate}`;
    await db.batch([
      db.prepare(`
        INSERT OR IGNORE INTO agent_jobs
          (id, user_id, scope_type, activity_id, conversation_id, kind, idempotency_key)
        SELECT ?, ?, 'activity', ?, ?, 'follow_up', ?
        FROM activity_follow_ups
        WHERE id = ? AND user_id = ? AND status = 'pending'
      `).bind(
        jobId, userId, followUp.activityId, followUp.conversationId,
        `follow-up:${followUp.id}:${followUp.dueDate}`, followUp.id, userId,
      ),
      db.prepare(`
        UPDATE activity_follow_ups
        SET status = 'due', trigger_job_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND status = 'pending'
      `).bind(jobId, followUp.id, userId),
    ]);
  }
  return due.results.length;
}

export async function retryFailedConversationJob(userId: string, conversationId: string, jobId: string) {
  const result = await getD1().prepare(`
    UPDATE agent_jobs
    SET status = 'queued', attempts = 0, error = NULL, lease_token = NULL,
        lease_owner = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ? AND conversation_id = ? AND status = 'failed'
      AND kind IN ('workspace_refresh', 'variant_setup', 'follow_up')
  `).bind(jobId, userId, conversationId).run();
  return Boolean(result.meta.changes ?? 0);
}

export async function updateActivityFollowUp(input: {
  userId: string;
  activityId: string;
  followUpId: string;
  operation: "reschedule" | "dismiss";
  dueDate?: string | null;
}) {
  const db = getD1();
  if (input.operation === "dismiss") {
    await db.batch([
      db.prepare(`
        UPDATE agent_jobs
        SET status = 'cancelled', lease_token = NULL, lease_owner = NULL,
            lease_expires_at = NULL, progress_title = NULL, progress_detail = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND status IN ('queued', 'leased', 'running', 'retryable_failure')
          AND id = (
            SELECT trigger_job_id FROM activity_follow_ups
            WHERE id = ? AND user_id = ? AND activity_id = ?
          )
      `).bind(input.userId, input.followUpId, input.userId, input.activityId),
      db.prepare(`
        UPDATE activity_follow_ups SET status = 'dismissed', dismissed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND activity_id = ? AND status IN ('pending', 'due', 'asked')
      `).bind(input.followUpId, input.userId, input.activityId),
    ]);
  } else {
    if (!input.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new Error("Choose a valid follow-up date.");
    await db.prepare(`
      UPDATE activity_follow_ups
      SET due_date = ?, status = 'pending', trigger_job_id = NULL, asked_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND activity_id = ? AND status IN ('pending', 'due', 'asked')
    `).bind(input.dueDate, input.followUpId, input.userId, input.activityId).run();
  }
  return readActivityFollowUps(input.activityId);
}

export async function moveActivityRecords(input: {
  userId: string;
  sourceActivityId: string;
  targetActivityId: string;
  actionId: string;
  recordKeys: string[];
}) {
  const db = getD1();
  const keys = [...new Set(input.recordKeys)].slice(0, 40);
  if (!keys.length || input.sourceActivityId === input.targetActivityId) {
    throw new Error("An activity move needs saved information and a different destination.");
  }
  const target = await db.prepare("SELECT id FROM activities WHERE id = ? AND user_id = ? LIMIT 1")
    .bind(input.targetActivityId, input.userId).first<{ id: string }>();
  if (!target) throw new Error("The destination activity is no longer available.");

  const placeholders = keys.map(() => "?").join(", ");
  const sourceRecords = await db.prepare(`
    SELECT id, record_key AS recordKey, activity_variant_id AS activityVariantId
    FROM activity_records
    WHERE user_id = ? AND activity_id = ? AND record_key IN (${placeholders}) AND archived_at IS NULL
  `).bind(input.userId, input.sourceActivityId, ...keys).all<{ id: string; recordKey: string; activityVariantId: string | null }>();

  if (sourceRecords.results.length !== keys.length) {
    const targetRecords = await db.prepare(`
      SELECT record_key AS recordKey FROM activity_records
      WHERE user_id = ? AND activity_id = ? AND record_key IN (${placeholders}) AND archived_at IS NULL
    `).bind(input.userId, input.targetActivityId, ...keys).all<{ recordKey: string }>();
    if (sourceRecords.results.length === 0 && targetRecords.results.length === keys.length) {
      return { movedRecords: keys.length, movedComponents: 0, alreadyApplied: true };
    }
    throw new Error("Some of the requested information is no longer saved in the source activity.");
  }
  if (sourceRecords.results.some((record) => record.activityVariantId)) {
    throw new Error("Variant-specific information cannot be moved without choosing a destination variant.");
  }
  const destinationConflicts = await db.prepare(`
    SELECT record_key AS recordKey FROM activity_records
    WHERE user_id = ? AND activity_id = ? AND record_key IN (${placeholders})
  `).bind(input.userId, input.targetActivityId, ...keys).all<{ recordKey: string }>();
  if (destinationConflicts.results.length) {
    throw new Error("The destination already has saved information with the same identity; merge it before moving.");
  }

  const [sourceWorkspace, targetWorkspace] = await Promise.all([
    readWorkspaceLayer(input.sourceActivityId, null),
    readWorkspaceLayer(input.targetActivityId, null),
  ]);
  const keySet = new Set(keys);
  const movedComponents = sourceWorkspace.document.components.filter((component) => (
    "recordKey" in component && component.recordKey && keySet.has(component.recordKey)
  ));
  const movedComponentIds = new Set(movedComponents.map((component) => component.id));
  const targetCollision = targetWorkspace.document.components.find((component) => (
    movedComponentIds.has(component.id)
    && !movedComponents.some((moved) => moved.id === component.id && "recordKey" in component && component.recordKey === ("recordKey" in moved ? moved.recordKey : undefined))
  ));
  if (targetCollision) throw new Error(`The destination already uses the workspace slot “${targetCollision.id}”.`);

  const statements = [];
  for (const record of sourceRecords.results) {
    statements.push(
      db.prepare(`
        UPDATE activity_records
        SET activity_id = ?, activity_variant_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND activity_id = ? AND archived_at IS NULL
      `).bind(input.targetActivityId, record.id, input.userId, input.sourceActivityId),
      db.prepare("DELETE FROM record_relations WHERE record_id = ? AND activity_id = ? AND relation_type = 'primary'")
        .bind(record.id, input.sourceActivityId),
      db.prepare(`
        INSERT OR IGNORE INTO record_relations (id, user_id, record_id, activity_id, relation_type)
        VALUES (?, ?, ?, ?, 'primary')
      `).bind(`record-relation:${safeId(record.id)}:${safeId(input.targetActivityId)}:primary`, input.userId, record.id, input.targetActivityId),
    );
  }

  if (movedComponents.length) {
    const sourceDocument = mergeWorkspaceActions(sourceWorkspace.document, movedComponents.map((component) => ({
      op: "remove" as const,
      componentId: component.id,
    })));
    const targetDocument = mergeWorkspaceActions(targetWorkspace.document, movedComponents.map((component) => ({
      op: "upsert" as const,
      component,
    })));
    const sourceWorkspaceId = `workspace:${safeId(input.userId)}:${safeId(input.sourceActivityId)}`;
    const targetWorkspaceId = `workspace:${safeId(input.userId)}:${safeId(input.targetActivityId)}`;
    const sourceRevisionId = `workspace-revision:${safeId(input.actionId)}:move-source`;
    const targetRevisionId = `workspace-revision:${safeId(input.actionId)}:move-target`;
    statements.push(
      db.prepare("INSERT OR IGNORE INTO activity_workspaces (id, user_id, activity_id, activity_variant_id) VALUES (?, ?, ?, NULL)")
        .bind(sourceWorkspaceId, input.userId, input.sourceActivityId),
      db.prepare("INSERT OR IGNORE INTO activity_workspaces (id, user_id, activity_id, activity_variant_id) VALUES (?, ?, ?, NULL)")
        .bind(targetWorkspaceId, input.userId, input.targetActivityId),
      db.prepare(`
        INSERT OR IGNORE INTO workspace_revisions
          (id, workspace_id, revision_number, document_json, source_agent_job_id)
        VALUES (?, ?, ?, ?, ?)
      `).bind(sourceRevisionId, sourceWorkspaceId, sourceWorkspace.revisionNumber + 1, JSON.stringify(sourceDocument), input.actionId),
      db.prepare(`
        INSERT OR IGNORE INTO workspace_revisions
          (id, workspace_id, revision_number, document_json, source_agent_job_id)
        VALUES (?, ?, ?, ?, ?)
      `).bind(targetRevisionId, targetWorkspaceId, targetWorkspace.revisionNumber + 1, JSON.stringify(targetDocument), input.actionId),
      db.prepare("UPDATE activity_workspaces SET current_revision_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(sourceRevisionId, sourceWorkspaceId),
      db.prepare("UPDATE activity_workspaces SET current_revision_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(targetRevisionId, targetWorkspaceId),
    );
  }

  statements.push(db.prepare(`
    UPDATE activity_profiles SET setup_status = 'ready', assessed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND activity_id = ?
  `).bind(input.userId, input.targetActivityId));

  await db.batch(statements);
  return { movedRecords: sourceRecords.results.length, movedComponents: movedComponents.length, alreadyApplied: false };
}

export async function moveActivitySubject(input: {
  userId: string;
  sourceActivityId: string;
  targetActivityId: string;
  actionId: string;
  subjectKey: string;
}) {
  const source = await getD1().prepare(`
    SELECT record_key AS recordKey, subject_key AS subjectKey, record_type AS recordType,
           payload_json AS payloadJson
    FROM activity_records
    WHERE user_id = ? AND activity_id = ? AND activity_variant_id IS NULL AND archived_at IS NULL
    ORDER BY created_at ASC, id ASC
    LIMIT 200
  `).bind(input.userId, input.sourceActivityId).all<{
    recordKey: string;
    subjectKey: string | null;
    recordType: string;
    payloadJson: string;
  }>();
  const records = source.results.flatMap((record) => {
    try {
      const data = JSON.parse(record.payloadJson) as unknown;
      if (!data || typeof data !== "object" || Array.isArray(data)) return [];
      return [{ key: record.recordKey, subjectKey: record.subjectKey, type: record.recordType, data: data as Record<string, unknown> }];
    } catch {
      return [];
    }
  });
  const plan = resolveSubjectMoveRecordKeys(records, input.subjectKey);
  if (plan.ambiguousRecordKeys.length) {
    throw new Error("Some saved information is shared with another product or device. Separate it before moving this item.");
  }
  if (!plan.recordKeys.includes(input.subjectKey)) {
    const existingTarget = await getD1().prepare(`
      SELECT id FROM activity_records
      WHERE user_id = ? AND activity_id = ? AND record_key = ?
        AND record_type = 'product' AND archived_at IS NULL
      LIMIT 1
    `).bind(input.userId, input.targetActivityId, input.subjectKey).first<{ id: string }>();
    if (existingTarget) {
      return { movedRecords: 0, movedComponents: 0, alreadyApplied: true };
    }
    throw new Error("The product or device to move is no longer saved in this activity.");
  }
  return moveActivityRecords({ ...input, recordKeys: plan.recordKeys });
}

const PRODUCT_SUBJECT_OWNERSHIP_MIGRATION = "product-subject-ownership-v2";

function migratedRecordAction(
  record: PersistedActivityRecord,
  subjectKey: string,
  options: { title?: string; data?: Record<string, unknown> } = {},
): RecordAction {
  return {
    op: "upsert",
    record: {
      key: record.key,
      subjectKey,
      type: record.type,
      title: options.title ?? record.title,
      scope: record.scope,
      scopeDate: record.scopeDate,
      data: options.data ?? record.data,
    },
  };
}

function resourceEntries(record: PersistedActivityRecord | undefined) {
  return Array.isArray(record?.data.entries)
    ? record.data.entries.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)))
    : [];
}

/**
 * One-time cleanup for records created before subject ownership became explicit.
 * The mapping is deliberately isolated and versioned; runtime rendering never
 * guesses ownership from titles, adjacency, or product count.
 */
export async function migrateLegacyProductOwnership(userId: string) {
  const db = getD1();
  const migrationId = `migration:${safeId(userId)}:${PRODUCT_SUBJECT_OWNERSHIP_MIGRATION}`;
  const completed = await db.prepare("SELECT id FROM user_migrations WHERE user_id = ? AND migration_key = ? LIMIT 1")
    .bind(userId, PRODUCT_SUBJECT_OWNERSHIP_MIGRATION).first<{ id: string }>();
  if (completed) return { applied: false };

  const activities = await db.prepare(`
    SELECT id, client_key AS clientKey FROM activities
    WHERE user_id = ? AND client_key IN ('skin-routine', 'hair-serum')
  `).bind(userId).all<{ id: string; clientKey: string }>();
  const activityIds = new Map(activities.results.map((activity) => [activity.clientKey, activity.id]));
  const skinActivityId = activityIds.get("skin-routine");
  const hairActivityId = activityIds.get("hair-serum");

  if (!skinActivityId || !hairActivityId) {
    await db.prepare("INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)")
      .bind(migrationId, userId, PRODUCT_SUBJECT_OWNERSHIP_MIGRATION).run();
    return { applied: false };
  }

  const [skinRecords, hairRecords] = await Promise.all([
    readActivityRecords(skinActivityId),
    readActivityRecords(hairActivityId),
  ]);
  const skinByKey = new Map(skinRecords.map((record) => [record.key, record]));
  const hairByKey = new Map(hairRecords.map((record) => [record.key, record]));
  const beardResourceIds = new Set([
    "kestrel-grooming-beard-roller",
    "kestrel-grooming-beard-roller-guide",
    "kestrel-grooming-beard-roller-cleaning",
  ]);

  const skinResources = skinByKey.get("castile-soap-references");
  const existingBeardResources = hairByKey.get("beard-grooming-roller-resources");
  const movedEntries = resourceEntries(skinResources)
    .filter((entry) => beardResourceIds.has(String(entry.id)))
    .map((entry) => ({ ...entry, itemKey: "beard-grooming-roller" }));
  const retainedEntries = resourceEntries(skinResources)
    .filter((entry) => !beardResourceIds.has(String(entry.id)))
    .map((entry) => ({ ...entry, itemKey: "castile-soap" }));

  if (movedEntries.length || existingBeardResources) {
    const mergedEntries = new Map<string, Record<string, unknown>>();
    for (const entry of [...resourceEntries(existingBeardResources), ...movedEntries]) {
      const id = String(entry.id || "");
      if (id) mergedEntries.set(id, { ...entry, itemKey: "beard-grooming-roller" });
    }
    const beardResources: PersistedActivityRecord = existingBeardResources ?? {
      id: "migration-placeholder",
      key: "beard-grooming-roller-resources",
      subjectKey: "beard-grooming-roller",
      type: "resources",
      title: "Beard Grooming Roller Resources",
      scope: "activity",
      scopeDate: null,
      version: 0,
      data: {},
      updatedAt: "",
    };
    const beardActions: RecordAction[] = [];
    if (!hairByKey.has("beard-grooming-roller")) {
      beardActions.push({ op: "upsert", record: {
        key: "beard-grooming-roller",
        subjectKey: "beard-grooming-roller",
        type: "product",
        title: "Kestrel Grooming Beard Roller",
        scope: "activity",
        data: {
          kind: "device",
          name: "Grooming Roller",
          manufacturer: "Kestrel Grooming",
          variant: "Beard Grooming Roller",
          notes: "Used on the scalp as part of Hair Routine.",
        },
      } });
    }
    if (!hairByKey.has("beard-grooming-roller-weekly")) {
      beardActions.push({ op: "upsert", record: {
        key: "beard-grooming-roller-weekly",
        subjectKey: "beard-grooming-roller",
        type: "recurring_step",
        title: "Weekly scalp grooming roller",
        scope: "activity",
        data: {
          label: "Use the grooming roller on the scalp",
          note: "Once a week as part of Hair Routine.",
          itemKey: "beard-grooming-roller",
          anchorDate: "2026-08-21",
          cadence: { kind: "weekly", every: 1 },
          completedDates: ["2026-08-21"],
        },
      } });
    }
    beardActions.push(migratedRecordAction(beardResources, "beard-grooming-roller", {
      title: "Scalp Grooming Roller Resources",
      data: { entries: [...mergedEntries.values()] },
    }));
    await persistRecordActions({
      userId,
      activityId: hairActivityId,
      actionId: `${migrationId}:beard-resources`,
      actions: beardActions,
    });
  }

  const skinActions: RecordAction[] = [];
  const castile = skinByKey.get("castile-soap");
  if (castile) skinActions.push(migratedRecordAction(castile, "castile-soap"));
  if (skinResources) {
    skinActions.push(migratedRecordAction(skinResources, "castile-soap", {
      title: "Castile Soap Resources",
      data: { entries: retainedEntries },
    }));
  }
  const beardHistory = skinByKey.get("beard-grooming-roller-use-history");
  if (beardHistory) skinActions.push(migratedRecordAction(beardHistory, "beard-grooming-roller"));
  if (skinActions.length) {
    await persistRecordActions({
      userId,
      activityId: skinActivityId,
      actionId: `${migrationId}:skin-links`,
      actions: skinActions,
    });
  }

  const hairOwners = new Map<string, { subjectKey: string; title?: string }>([
    ["hair-ll-01", { subjectKey: "hair-ll-01" }],
    ["hair-ll-01-reference", { subjectKey: "hair-ll-01", title: "Lumen Lab LL-01 Resources" }],
    ["hair-ll-01-scalp-routine", { subjectKey: "hair-ll-01" }],
    ["beard-grooming-roller", { subjectKey: "beard-grooming-roller" }],
    ["skin-routine-protocol", { subjectKey: "beard-grooming-roller", title: "Beard Grooming Roller protocol" }],
    ["beard-grooming-roller-weekly", { subjectKey: "beard-grooming-roller" }],
  ]);
  const hairActions = hairRecords.flatMap((record) => {
    const owner = hairOwners.get(record.key);
    if (!owner) return [];
    const data = record.type === "resources"
      ? { entries: resourceEntries(record).map((entry) => ({ ...entry, itemKey: owner.subjectKey })) }
      : record.data;
    return [migratedRecordAction(record, owner.subjectKey, { title: owner.title, data })];
  });
  if (hairActions.length) {
    await persistRecordActions({
      userId,
      activityId: hairActivityId,
      actionId: `${migrationId}:hair-links`,
      actions: hairActions,
    });
  }

  if (beardHistory) {
    await moveActivityRecords({
      userId,
      sourceActivityId: skinActivityId,
      targetActivityId: hairActivityId,
      actionId: `${migrationId}:beard-history`,
      recordKeys: [beardHistory.key],
    });
  }

  await Promise.all([
    persistWorkspaceActions({
      userId,
      activityId: skinActivityId,
      agentJobId: `${migrationId}:skin-workspace`,
      actions: skinResources ? [{
        op: "upsert",
        component: { id: "castile-soap-references", type: "resources", title: "Castile Soap Resources", recordKey: "castile-soap-references", presentation: "compact" },
      }] : [],
    }),
    persistWorkspaceActions({
      userId,
      activityId: hairActivityId,
      agentJobId: `${migrationId}:hair-workspace`,
      actions: [
        ...(hairByKey.has("hair-ll-01-reference") ? [{
          op: "upsert" as const,
          component: { id: "hair-ll-01-reference", type: "resources" as const, title: "Lumen Lab LL-01 Resources", recordKey: "hair-ll-01-reference", presentation: "compact" as const },
        }] : []),
        ...((movedEntries.length || existingBeardResources) ? [{
          op: "upsert" as const,
          component: { id: "beard-grooming-roller", type: "product" as const, title: "Kestrel Grooming Beard Roller", recordKey: "beard-grooming-roller", presentation: "featured" as const },
        }, {
          op: "upsert" as const,
          component: { id: "beard-grooming-roller-weekly", type: "recurring_step" as const, title: "Weekly scalp grooming roller", recordKey: "beard-grooming-roller-weekly", presentation: "compact" as const },
        }, {
          op: "upsert" as const,
          component: { id: "beard-grooming-roller-resources", type: "resources" as const, title: "Scalp Grooming Roller Resources", recordKey: "beard-grooming-roller-resources", presentation: "compact" as const },
        }] : []),
      ],
    }),
  ]);

  await db.prepare("INSERT OR IGNORE INTO user_migrations (id, user_id, migration_key) VALUES (?, ?, ?)")
    .bind(migrationId, userId, PRODUCT_SUBJECT_OWNERSHIP_MIGRATION).run();
  return { applied: true };
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function applyUserRecordMutation(input: {
  userId: string;
  activityId: string;
  recordKey: string;
  actionId: string;
  operation: string;
  payload: Record<string, unknown>;
  planDate?: string | null;
  activityVariantId?: string | null;
}) {
  const records = await readActivityRecords(input.activityId, input.planDate, input.activityVariantId);
  const record = records.find((entry) => entry.key === input.recordKey);
  if (!record) throw new Error("That activity information is no longer available.");
  const data = structuredClone(record.data);

  if (["set_daily_selection", "copy_daily_selection_previous", "add_daily_selection_item"].includes(input.operation) && record.type === "daily_selection") {
    const date = input.planDate;
    if (!date) throw new Error("A date is required.");
    const selection = data as DailySelectionData;
    if (input.operation === "add_daily_selection_item") {
      const label = typeof input.payload.label === "string" ? input.payload.label.trim().slice(0, 300) : "";
      if (!label) throw new Error("Enter a supplement first.");
      const existing = selection.items.find((item) => item.label.localeCompare(label, undefined, { sensitivity: "base" }) === 0);
      const item = existing ?? { id: `item-${crypto.randomUUID()}`, label, detail: "", active: true, source: "You" };
      selection.items = existing
        ? selection.items.map((candidate) => candidate.id === existing.id ? { ...candidate, active: true } : candidate)
        : [...selection.items, item];
      Object.assign(data, withSelectionForDate(selection, date, [...selectionForDate(selection, date), item.id]));
    } else if (input.operation === "copy_daily_selection_previous") {
      Object.assign(data, withSelectionForDate(selection, date, selectionForDate(selection, previousDateKey(date))));
    } else {
      const itemIds = Array.isArray(input.payload.itemIds)
        ? input.payload.itemIds.filter((entry): entry is string => typeof entry === "string").slice(0, 100)
        : [];
      Object.assign(data, withSelectionForDate(selection, date, itemIds));
    }
  } else if (input.operation === "toggle_recurring_step" && record.type === "recurring_step") {
    const date = input.planDate;
    if (!date) throw new Error("A date is required.");
    const completedDates = Array.isArray(data.completedDates) ? data.completedDates.filter((entry): entry is string => typeof entry === "string") : [];
    data.completedDates = completedDates.includes(date) ? completedDates.filter((entry) => entry !== date) : [...completedDates, date];
  } else if (input.operation === "select_session_choice" && record.type === "session_choice") {
    const date = input.planDate;
    const optionId = typeof input.payload.optionId === "string" ? input.payload.optionId : "";
    const options = Array.isArray(data.options) ? data.options as Array<Record<string, unknown>> : [];
    if (!date || !options.some((option) => option.id === optionId)) throw new Error("Choose an available option.");
    const selections = Array.isArray(data.selections) ? data.selections as Array<Record<string, unknown>> : [];
    data.selections = [...selections.filter((entry) => entry.date !== date), { id: `choice-${date}`, date, optionId }];
  } else if (input.operation === "toggle_item") {
    const itemId = typeof input.payload.itemId === "string" ? input.payload.itemId : "";
    const collection = record.type === "protocol" ? "steps" : record.type === "workout" ? "exercises" : "items";
    const items = Array.isArray(data[collection]) ? data[collection] as unknown[] : [];
    let changed = false;
    data[collection] = items.map((item) => {
      const entry = asObject(item);
      if (!entry || entry.id !== itemId) return item;
      changed = true;
      if ((record.type === "protocol" || record.type === "checklist" || record.type === "workout") && input.planDate) {
        const completedDates = Array.isArray(entry.completedDates) ? entry.completedDates.filter((date): date is string => typeof date === "string") : [];
        return { ...entry, completedDates: completedDates.includes(input.planDate) ? completedDates.filter((date) => date !== input.planDate) : [...completedDates, input.planDate] };
      }
      return { ...entry, completed: entry.completed !== true };
    });
    if (!changed) throw new Error("That item could not be found.");
  } else if (input.operation === "add_item" && (record.type === "checklist" || record.type === "item_list")) {
    const label = typeof input.payload.label === "string" ? input.payload.label.trim().slice(0, 300) : "";
    if (!label) throw new Error("Enter an item first.");
    const items = Array.isArray(data.items) ? data.items as unknown[] : [];
    data.items = [...items, { id: `item-${crypto.randomUUID()}`, label, detail: "", completed: false, urgency: "", source: "You" }];
  } else if (input.operation === "add_workout_set" && record.type === "workout") {
    const exerciseId = typeof input.payload.exerciseId === "string" ? input.payload.exerciseId : "";
    const load = typeof input.payload.load === "string" ? input.payload.load.trim().slice(0, 60) : "";
    const reps = typeof input.payload.reps === "number" ? Math.round(input.payload.reps) : Number(input.payload.reps);
    if (!exerciseId || !Number.isFinite(reps) || reps < 0 || reps > 1000) throw new Error("Enter a valid set.");
    const exercises = Array.isArray(data.exercises) ? data.exercises as unknown[] : [];
    let changed = false;
    data.exercises = exercises.map((item) => {
      const exercise = asObject(item);
      if (!exercise || exercise.id !== exerciseId) return item;
      changed = true;
      const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
      return { ...exercise, sets: [...sets, { id: `set-${crypto.randomUUID()}`, load, reps, effort: "", completedAt: new Date().toISOString() }] };
    });
    if (!changed) throw new Error("That exercise could not be found.");
  } else if (["log_strength_set", "remove_strength_set", "save_strength_note", "finish_strength_session"].includes(input.operation) && record.type === "strength_session") {
    const date = input.planDate;
    if (!date) throw new Error("A date is required.");
    const workoutRecordKey = typeof data.workoutRecordKey === "string" ? data.workoutRecordKey : "";
    const workout = records.find((entry) => entry.key === workoutRecordKey && entry.type === "workout");
    if (!workout) throw new Error("The workout plan is no longer available.");
    const plannedExercises = Array.isArray(workout.data.exercises) ? workout.data.exercises as Array<Record<string, unknown>> : [];
    const sessions = Array.isArray(data.sessions) ? data.sessions as Array<Record<string, unknown>> : [];
    const now = new Date().toISOString();
    const existing = sessions.find((entry) => entry.date === date);
    const session: Record<string, unknown> = existing ? structuredClone(existing) : {
      id: `strength-${date}-${workoutRecordKey}`,
      date,
      workoutTitle: workout.title,
      startedAt: now,
      completedAt: "",
      note: "",
      exercises: [],
    };
    const performedExercises = Array.isArray(session.exercises) ? session.exercises as Array<Record<string, unknown>> : [];

    if (input.operation === "log_strength_set") {
      const exerciseId = typeof input.payload.exerciseId === "string" ? input.payload.exerciseId : "";
      const planned = plannedExercises.find((exercise) => exercise.id === exerciseId);
      const reps = typeof input.payload.reps === "number" ? Math.round(input.payload.reps) : Number(input.payload.reps);
      const load = typeof input.payload.load === "string" ? input.payload.load.trim().slice(0, 60) : "";
      const rawRir = input.payload.rir === "" || input.payload.rir === null || input.payload.rir === undefined ? null : Number(input.payload.rir);
      const rir = rawRir === null ? null : Math.round(rawRir);
      const setType = ["working", "warmup", "drop", "failure"].includes(String(input.payload.setType)) ? String(input.payload.setType) : "working";
      if (!planned || !exerciseId || !Number.isFinite(reps) || reps < 1 || reps > 1000 || (rir !== null && (!Number.isFinite(rir) || rir < 0 || rir > 10))) {
        throw new Error("Enter a valid set.");
      }
      let performed = performedExercises.find((exercise) => exercise.exerciseId === exerciseId);
      if (!performed) {
        performed = { id: `performed-${date}-${exerciseId}`, exerciseId, name: planned.name, sets: [] };
        performedExercises.push(performed);
      }
      const sets = Array.isArray(performed.sets) ? performed.sets as Array<Record<string, unknown>> : [];
      performed.sets = [...sets, {
        id: `set-${crypto.randomUUID()}`,
        ordinal: sets.length + 1,
        type: setType,
        load,
        reps,
        rir,
        completedAt: now,
      }];
      session.exercises = performedExercises;
    } else if (input.operation === "remove_strength_set") {
      const exerciseId = typeof input.payload.exerciseId === "string" ? input.payload.exerciseId : "";
      const setId = typeof input.payload.setId === "string" ? input.payload.setId : "";
      let changed = false;
      session.exercises = performedExercises.map((exercise) => {
        if (exercise.exerciseId !== exerciseId || !Array.isArray(exercise.sets)) return exercise;
        const nextSets = (exercise.sets as Array<Record<string, unknown>>).filter((set) => {
          if (set.id !== setId) return true;
          changed = true;
          return false;
        }).map((set, index) => ({ ...set, ordinal: index + 1 }));
        return { ...exercise, sets: nextSets };
      });
      if (!changed) throw new Error("That set could not be found.");
    } else if (input.operation === "save_strength_note") {
      session.note = typeof input.payload.note === "string" ? input.payload.note.trim().slice(0, 800) : "";
    } else if (input.operation === "finish_strength_session") {
      if (!existing) return records;
      session.completedAt = now;
    }
    data.sessions = [...sessions.filter((entry) => entry.date !== date), session];
  } else if (input.operation === "add_quick_log" && record.type === "quick_log") {
    const values = Array.isArray(input.payload.values) ? input.payload.values : [];
    const entries = Array.isArray(data.entries) ? data.entries as unknown[] : [];
    data.entries = [...entries, { id: `entry-${crypto.randomUUID()}`, values, note: "", createdAt: new Date().toISOString() }];
  } else if (input.operation === "save_session_log" && record.type === "session_log") {
    const date = input.planDate;
    const optionId = typeof input.payload.optionId === "string" ? input.payload.optionId.trim().toLowerCase() : "";
    if (!date || !optionId) throw new Error("Choose a session option first.");
    const fields = Array.isArray(data.fields) ? data.fields.flatMap((value) => {
      const field = asObject(value);
      return field && typeof field.id === "string" ? [field] : [];
    }) : [];
    const fieldsById = new Map(fields.map((field) => [field.id as string, field]));
    const values = Array.isArray(input.payload.values) ? input.payload.values.flatMap((value) => {
      const pair = asObject(value);
      const fieldId = typeof pair?.field === "string" ? pair.field : "";
      const field = fieldsById.get(fieldId);
      const rawValue = typeof pair?.value === "string" || typeof pair?.value === "number" ? String(pair.value).trim().slice(0, 120) : "";
      if (!field || !rawValue) return [];
      if (field.input === "number") {
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric) || numeric < 0) return [];
        if (field.kind === "effort" && (numeric < 1 || numeric > 10)) return [];
      }
      return [{ field: fieldId, value: rawValue }];
    }) : [];
    const hasNote = Object.prototype.hasOwnProperty.call(input.payload, "note");
    const note = typeof input.payload.note === "string" ? input.payload.note.trim().slice(0, 500) : "";
    const choiceRecordKey = typeof data.choiceRecordKey === "string" ? data.choiceRecordKey : "";
    if (choiceRecordKey) {
      const choice = records.find((entry) => entry.key === choiceRecordKey && entry.type === "session_choice");
      const options = Array.isArray(choice?.data.options) ? choice.data.options as Array<Record<string, unknown>> : [];
      if (!options.some((option) => option.id === optionId)) throw new Error("Choose an available session option.");
    } else {
      const fallback = asObject(data.defaultOption);
      if (fallback?.id !== optionId) throw new Error("Choose an available session option.");
    }
    const entries = Array.isArray(data.entries) ? data.entries as Array<Record<string, unknown>> : [];
    const existing = entries.find((entry) => entry.date === date && entry.optionId === optionId);
    const existingValues = Array.isArray(existing?.values) ? existing.values.flatMap((value) => {
      const pair = asObject(value);
      return typeof pair?.field === "string" && typeof pair.value === "string" ? [{ field: pair.field, value: pair.value }] : [];
    }) : [];
    const mergedValues = new Map(existingValues.map((pair) => [pair.field, pair.value]));
    for (const pair of values) mergedValues.set(pair.field, pair.value);
    const mergedNote = hasNote ? note : typeof existing?.note === "string" ? existing.note : "";
    if (!mergedValues.size && !mergedNote) throw new Error("Add at least one session detail.");
    const nextEntry = {
      id: typeof existing?.id === "string" ? existing.id : `session-${date}-${optionId}`,
      date,
      optionId,
      values: Array.from(mergedValues, ([field, value]) => ({ field, value })),
      note: mergedNote,
      createdAt: typeof existing?.createdAt === "string" ? existing.createdAt : new Date().toISOString(),
    };
    data.entries = [...entries.filter((entry) => !(entry.date === date && entry.optionId === optionId)), nextEntry];
  } else if (input.operation === "set_adherence" && record.type === "adherence") {
    const date = typeof input.payload.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.payload.date) ? input.payload.date : input.planDate;
    if (!date) throw new Error("A date is required.");
    const entries = Array.isArray(data.entries) ? data.entries as Array<Record<string, unknown>> : [];
    const current = entries.find((entry) => entry.date === date);
    data.entries = current
      ? entries.map((entry) => entry.date === date ? { ...entry, completed: entry.completed !== true } : entry)
      : [...entries, { id: `day-${date}`, date, completed: true, note: "" }];
  } else {
    throw new Error("That action is not supported for this component.");
  }

  const actions = validateRecordActions([{ op: "upsert", record: {
    key: record.key, subjectKey: record.subjectKey, type: record.type, title: record.title, scope: record.scope,
    scopeDate: record.scopeDate, data,
  } }], input.planDate);
  if (!actions.length) throw new Error("The updated information did not pass validation.");
  await persistRecordActions({ userId: input.userId, activityId: input.activityId, activityVariantId: input.activityVariantId, actionId: input.actionId, actions });
  return readActivityRecords(input.activityId, input.planDate, input.activityVariantId);
}

export async function readConversationState(conversationId: string, planDate?: string | null, activityVariantId?: string | null) {
  const db = getD1();
  const conversation = await db.prepare("SELECT activity_id AS activityId FROM conversations WHERE id = ?")
    .bind(conversationId).first<{ activityId: string }>();
  const activeJob = await db.prepare(`
    SELECT status, kind, progress_title AS progressTitle, progress_detail AS progressDetail
    FROM agent_jobs
    WHERE conversation_id = ? AND status IN ('queued', 'leased', 'running', 'retryable_failure')
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(conversationId).first<{ status: string; kind: string; progressTitle: string | null; progressDetail: string | null }>();
  const latestDurableJob = await db.prepare(`
    SELECT id, status, kind, error
    FROM agent_jobs
    WHERE conversation_id = ? AND kind IN ('workspace_refresh', 'variant_setup', 'follow_up')
      AND status IN ('succeeded', 'failed')
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).bind(conversationId).first<{ id: string; status: string; kind: string; error: string | null }>();
  const onlineWorker = await db.prepare(`
    SELECT id FROM agent_workers
    WHERE last_seen_at >= datetime('now', '-20 seconds')
    LIMIT 1
  `).first<{ id: string }>();
  const workspace = conversation ? await readActivityWorkspace(conversation.activityId, activityVariantId) : { revisionId: null, revisionNumber: 0, document: EMPTY_WORKSPACE };
  const records = conversation ? await readActivityRecords(conversation.activityId, planDate, activityVariantId) : [];
  const followUps = conversation ? await readActivityFollowUps(conversation.activityId) : [];
  const recentRuns = conversation
    ? (await db.prepare(`
        SELECT plan_date AS planDate, status, completed_at AS completedAt
        FROM activity_runs
        WHERE activity_id = ?
        ORDER BY plan_date DESC
        LIMIT 90
      `).bind(conversation.activityId).all<{ planDate: string; status: string; completedAt: string | null }>()).results
    : [];
  const scheduleRow = conversation ? await db.prepare(`
    SELECT pattern.id, pattern.name, pattern.position, pattern.cadence_json AS cadenceJson,
           pattern.advancement_json AS advancementJson, pattern.anchor_date AS anchorDate,
           pattern.initial_step_position AS initialStepPosition, pattern.effective_date AS effectiveDate,
           pattern.end_date AS endDate, pattern.revision,
           state.current_step_position AS currentStepPosition
    FROM schedule_patterns pattern
    JOIN schedule_pattern_steps step ON step.pattern_id = pattern.id
    LEFT JOIN schedule_pattern_state state ON state.pattern_id = pattern.id
    WHERE step.activity_id = ? AND pattern.archived_at IS NULL
    ORDER BY pattern.position, step.position
    LIMIT 1
  `).bind(conversation.activityId).first<{
    id: string; name: string; position: number; cadenceJson: string; advancementJson: string;
    anchorDate: string; initialStepPosition: number; effectiveDate: string; endDate: string | null;
    revision: number; currentStepPosition: number | null;
  }>() : null;
  const scheduleSteps = scheduleRow ? (await db.prepare(`
    SELECT step.id, step.activity_id AS activityId, step.activity_variant_id AS activityVariantId,
           step.position, step.duration_minutes AS durationMinutes,
           step.display_label_override AS displayLabelOverride,
           CASE WHEN step.plan_role = 'extra' THEN 'extra' ELSE 'essential' END AS planRole,
           activity.title AS activityTitle, variant.name AS variantName
    FROM schedule_pattern_steps step
    JOIN activities activity ON activity.id = step.activity_id
    LEFT JOIN activity_variants variant ON variant.id = step.activity_variant_id
    WHERE step.pattern_id = ?
    ORDER BY step.position
  `).bind(scheduleRow.id).all<{
    id: string; activityId: string; activityVariantId: string | null; position: number;
    durationMinutes: number; displayLabelOverride: string | null; planRole: "essential" | "extra";
    activityTitle: string; variantName: string | null;
  }>()).results : [];
  const scheduleCadence = scheduleRow ? (() => { try { return parseCadence(JSON.parse(scheduleRow.cadenceJson)); } catch { return null; } })() : null;
  const scheduleAdvancement = scheduleRow ? (() => { try { return parseAdvancement(JSON.parse(scheduleRow.advancementJson)); } catch { return null; } })() : null;
  const schedulePattern: SchedulePattern | null = scheduleRow && scheduleCadence && scheduleAdvancement && scheduleSteps.length ? {
    id: scheduleRow.id,
    name: scheduleRow.name,
    position: scheduleRow.position,
    cadence: scheduleCadence,
    advancement: scheduleAdvancement,
    anchorDate: scheduleRow.anchorDate,
    initialStepPosition: scheduleRow.initialStepPosition,
    effectiveDate: scheduleRow.effectiveDate,
    endDate: scheduleRow.endDate,
    revision: scheduleRow.revision,
    steps: scheduleSteps.map((step) => ({
      id: step.id,
      activityId: step.activityId,
      activityVariantId: step.activityVariantId,
      position: step.position,
      durationMinutes: step.durationMinutes,
      displayLabelOverride: step.displayLabelOverride,
      planRole: step.planRole,
    })),
  } : null;
  const showScheduleSummary = schedulePattern && shouldShowActivitySchedule({
    cadenceKind: schedulePattern.cadence.kind,
    advancementKind: schedulePattern.advancement.kind,
    endDate: schedulePattern.endDate,
    stepCount: schedulePattern.steps.length,
  });
  const scheduleReferenceDate = planDate || localDateInTimeZone(new Date(), "America/Phoenix");
  const currentRun = recentRuns.find((run) => run.planDate === scheduleReferenceDate);
  const previewFrom = currentRun && (currentRun.status === "completed" || currentRun.status === "skipped")
    ? addLocalDays(scheduleReferenceDate, 1)
    : scheduleReferenceDate;
  const stepTitles = new Map(scheduleSteps.map((step) => [step.id, step.displayLabelOverride || step.variantName || step.activityTitle]));
  const scheduleSummary = schedulePattern && showScheduleSummary
    ? {
        patternId: schedulePattern.id,
        name: schedulePattern.name,
        referenceDate: scheduleReferenceDate,
        cadenceLabel: schedulePattern.cadence.kind === "daily"
          ? "Rotates daily"
          : schedulePattern.cadence.kind === "interval_days"
            ? schedulePattern.cadence.every === 2 ? "Every other day" : `Every ${schedulePattern.cadence.every} days`
            : schedulePattern.cadence.weekdays.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", "),
        upcoming: previewPattern(schedulePattern, previewFrom, 3, scheduleRow.currentStepPosition === null ? null : { currentStepPosition: scheduleRow.currentStepPosition })
          .map((occurrence) => ({ date: occurrence.triggerDate, title: stepTitles.get(occurrence.step.id) || schedulePattern.name })),
      }
    : null;
  const proposals = await db.prepare(`
    SELECT id, status, document_json AS documentJson, created_at AS createdAt
    FROM schedule_proposals
    WHERE conversation_id = ? AND status IN ('draft', 'awaiting_clarification', 'ready')
    ORDER BY created_at DESC LIMIT 10
  `).bind(conversationId).all<{ id: string; status: string; documentJson: string; createdAt: string }>();
  return {
    messages: await readConversationMessages(conversationId), activeJob: activeJob ?? null,
    failedJob: latestDurableJob?.status === "failed" ? {
      id: latestDurableJob.id,
      kind: latestDurableJob.kind,
      message: latestDurableJob.kind === "follow_up"
        ? "Luna couldn’t send this check-in."
        : "Luna couldn’t save the latest activity update.",
    } : null,
    agentOnline: Boolean(onlineWorker), workspace, records, recentRuns, followUps, scheduleSummary,
    proposals: proposals.results.flatMap((proposal) => {
      try { return [{ id: proposal.id, status: proposal.status, document: JSON.parse(proposal.documentJson), createdAt: proposal.createdAt }]; } catch { return []; }
    }),
  };
}

export function apiFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected activity service error";
  return Response.json({ error: message }, { status: 500 });
}
