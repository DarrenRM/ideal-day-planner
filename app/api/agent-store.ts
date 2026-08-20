import { getD1 } from "../../db";
import { applyWorkspaceActions as mergeWorkspaceActions, EMPTY_WORKSPACE, type WorkspaceAction, type WorkspaceDocument } from "../workspace-model";

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
        activity_id text NOT NULL,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_activity_unique ON conversations (user_id, activity_id)"),
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
      db.prepare(`CREATE TABLE IF NOT EXISTS activity_visits (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        activity_id text NOT NULL,
        conversation_id text NOT NULL,
        client_visit_id text NOT NULL,
        context_json text,
        opened_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_visits_user_client_unique ON activity_visits (user_id, client_visit_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS activity_visits_activity_opened_idx ON activity_visits (activity_id, opened_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS agent_jobs (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        activity_id text NOT NULL,
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
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS agent_jobs_user_idempotency_unique ON agent_jobs (user_id, idempotency_key)"),
      db.prepare("CREATE INDEX IF NOT EXISTS agent_jobs_status_created_idx ON agent_jobs (status, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS agent_jobs_conversation_idx ON agent_jobs (conversation_id)"),
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
        current_revision_id text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_workspaces_user_activity_unique ON activity_workspaces (user_id, activity_id)"),
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
        daily_plan_item_id text,
        plan_date text NOT NULL,
        status text DEFAULT 'completed' NOT NULL,
        allotted_duration_seconds integer NOT NULL,
        planned_duration_seconds integer NOT NULL,
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
        FOREIGN KEY (daily_plan_item_id) REFERENCES daily_plan_items(id) ON DELETE SET NULL
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_runs_user_activity_date_unique ON activity_runs (user_id, activity_id, plan_date)"),
      db.prepare("CREATE INDEX IF NOT EXISTS activity_runs_activity_date_idx ON activity_runs (activity_id, plan_date)"),
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
      components: parsed.components.map((component) => component.type === "countdown" && !component.durationSource
        ? { ...component, durationSource: "activity" as const }
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

function activitySetupKey(activity: ActivityRecord) {
  return safeId(`${activity.title.trim().toLowerCase()}:${activity.category.trim().toLowerCase()}`).slice(0, 180);
}

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
  if (profile?.setupKey === setupKey) return profile;

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
  hasWorkspaceActions: boolean;
}) {
  const status = input.messageId ? "question_pending" : input.hasWorkspaceActions ? "ready" : "unnecessary";
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
    WHERE activity_id = ? AND setup_status = 'question_pending'
  `).bind(activityId).run();
}

export async function readActivityWorkspace(activityId: string) {
  const row = await getD1().prepare(`
    SELECT aw.current_revision_id AS revisionId, wr.revision_number AS revisionNumber,
           wr.document_json AS documentJson
    FROM activity_workspaces aw
    LEFT JOIN workspace_revisions wr ON wr.id = aw.current_revision_id
    WHERE aw.activity_id = ?
    LIMIT 1
  `).bind(activityId).first<WorkspaceRecord>();
  return {
    revisionId: row?.revisionId ?? null,
    revisionNumber: row?.revisionNumber ?? 0,
    document: parseWorkspaceDocument(row?.documentJson ?? null),
  };
}

export async function persistWorkspaceActions(input: {
  userId: string;
  activityId: string;
  agentJobId: string;
  actions: WorkspaceAction[];
}) {
  if (!input.actions.length) return readActivityWorkspace(input.activityId);
  const db = getD1();
  const workspaceId = `workspace:${safeId(input.userId)}:${safeId(input.activityId)}`;
  const revisionId = `workspace-revision:${safeId(input.agentJobId)}`;
  const existingRevision = await db.prepare(`
    SELECT revision_number AS revisionNumber, document_json AS documentJson
    FROM workspace_revisions WHERE id = ?
  `).bind(revisionId).first<{ revisionNumber: number; documentJson: string }>();
  if (existingRevision) {
    return { revisionId, revisionNumber: existingRevision.revisionNumber, document: parseWorkspaceDocument(existingRevision.documentJson) };
  }

  const current = await readActivityWorkspace(input.activityId);
  const nextDocument = mergeWorkspaceActions(current.document, input.actions);
  const revisionNumber = current.revisionNumber + 1;
  await db.batch([
    db.prepare(`
      INSERT OR IGNORE INTO activity_workspaces (id, user_id, activity_id)
      VALUES (?, ?, ?)
    `).bind(workspaceId, input.userId, input.activityId),
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

export async function readConversationState(conversationId: string) {
  const db = getD1();
  const conversation = await db.prepare("SELECT activity_id AS activityId FROM conversations WHERE id = ?")
    .bind(conversationId).first<{ activityId: string }>();
  const activeJob = await db.prepare(`
    SELECT status, kind
    FROM agent_jobs
    WHERE conversation_id = ? AND status IN ('queued', 'leased', 'running')
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(conversationId).first<{ status: string; kind: string }>();
  const workspace = conversation ? await readActivityWorkspace(conversation.activityId) : { revisionId: null, revisionNumber: 0, document: EMPTY_WORKSPACE };
  return { messages: await readConversationMessages(conversationId), activeJob: activeJob ?? null, workspace };
}

export function apiFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected activity service error";
  return Response.json({ error: message }, { status: 500 });
}
