import { getD1 } from "../../db";
import { parseActivityRecord, validateRecordActions, type ActivityRecord as PersistedActivityRecord, type RecordAction } from "../activity-record-model";
import { activitySetupKey, activitySetupKeyMatches } from "../activity-setup-policy";
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
        scope_type text DEFAULT 'activity' NOT NULL,
        activity_id text,
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
      db.prepare(`CREATE TABLE IF NOT EXISTS activity_visits (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        activity_id text NOT NULL,
        conversation_id text NOT NULL,
        client_visit_id text NOT NULL,
        context_json text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS activity_visits_user_client_unique ON activity_visits (user_id, client_visit_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS activity_visits_activity_opened_idx ON activity_visits (activity_id, created_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS agent_jobs (
        id text PRIMARY KEY NOT NULL,
        user_id text NOT NULL,
        scope_type text DEFAULT 'activity' NOT NULL,
        activity_id text,
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
      const conversationColumns = await db.prepare("PRAGMA table_info(conversations)").all<{ name: string }>();
      if (!conversationColumns.results.some((column) => column.name === "scope_type")) {
        await db.prepare("ALTER TABLE conversations ADD COLUMN scope_type text DEFAULT 'activity' NOT NULL").run();
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

export async function readGlobalConversationState(conversationId: string, userId: string) {
  const db = getD1();
  const activeJob = await db.prepare(`
    SELECT status, kind, progress_title AS progressTitle, progress_detail AS progressDetail
    FROM agent_jobs
    WHERE conversation_id = ? AND scope_type = 'global'
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
    WHERE activity_id = ? AND setup_status = 'question_pending'
  `).bind(activityId).run();
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
    SELECT id, record_key AS recordKey, record_type AS recordType, title, scope,
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
  for (const action of input.actions) {
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
      SELECT version FROM activity_records
      WHERE user_id = ? AND activity_id = ? AND record_key = ?
        AND ${variantId ? "activity_variant_id = ?" : "activity_variant_id IS NULL"}
      LIMIT 1
    `).bind(...(variantId
      ? [input.userId, input.activityId, action.record.key, variantId]
      : [input.userId, input.activityId, action.record.key])).first<{ version: number }>();
    const nextVersion = (current?.version ?? 0) + 1;
    const payloadJson = JSON.stringify(action.record.data);
    await db.batch([
      db.prepare(`
        INSERT INTO activity_records
          (id, user_id, activity_id, activity_variant_id, record_key, record_type, title, scope, scope_date,
           payload_json, version, source_message_id, source_agent_job_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(${variantId ? "user_id, activity_id, activity_variant_id, record_key" : "user_id, activity_id, record_key"})
        WHERE activity_variant_id IS ${variantId ? "NOT " : ""}NULL DO UPDATE SET
          record_type = excluded.record_type, title = excluded.title, scope = excluded.scope,
          scope_date = excluded.scope_date, payload_json = excluded.payload_json,
          version = excluded.version, source_message_id = excluded.source_message_id,
          source_agent_job_id = excluded.source_agent_job_id, archived_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        recordId, input.userId, input.activityId, variantId, action.record.key, action.record.type,
        action.record.title, action.record.scope ?? "activity", action.record.scopeDate ?? null,
        payloadJson, nextVersion, input.sourceMessageId ?? null, input.sourceAgentJobId ?? null,
      ),
      db.prepare(`
        INSERT OR IGNORE INTO activity_record_revisions
          (id, record_id, revision_number, title, payload_json, source_message_id, source_agent_job_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(revisionId, recordId, nextVersion, action.record.title, payloadJson, input.sourceMessageId ?? null, input.sourceAgentJobId ?? null),
      db.prepare(`
        INSERT OR IGNORE INTO record_relations (id, user_id, record_id, activity_id, relation_type)
        VALUES (?, ?, ?, ?, 'primary')
      `).bind(`record-relation:${safeId(recordId)}:${safeId(input.activityId)}:primary`, input.userId, recordId, input.activityId),
    ]);
  }
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

  if (input.operation === "toggle_item") {
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
  } else if (input.operation === "add_quick_log" && record.type === "quick_log") {
    const values = Array.isArray(input.payload.values) ? input.payload.values : [];
    const entries = Array.isArray(data.entries) ? data.entries as unknown[] : [];
    data.entries = [...entries, { id: `entry-${crypto.randomUUID()}`, values, note: "", createdAt: new Date().toISOString() }];
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
    key: record.key, type: record.type, title: record.title, scope: record.scope,
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
  const onlineWorker = await db.prepare(`
    SELECT id FROM agent_workers
    WHERE last_seen_at >= datetime('now', '-20 seconds')
    LIMIT 1
  `).first<{ id: string }>();
  const workspace = conversation ? await readActivityWorkspace(conversation.activityId, activityVariantId) : { revisionId: null, revisionNumber: 0, document: EMPTY_WORKSPACE };
  const records = conversation ? await readActivityRecords(conversation.activityId, planDate, activityVariantId) : [];
  const recentRuns = conversation
    ? (await db.prepare(`
        SELECT plan_date AS planDate, status, completed_at AS completedAt
        FROM activity_runs
        WHERE activity_id = ?
        ORDER BY plan_date DESC
        LIMIT 90
      `).bind(conversation.activityId).all<{ planDate: string; status: string; completedAt: string | null }>()).results
    : [];
  const proposals = await db.prepare(`
    SELECT id, status, document_json AS documentJson, created_at AS createdAt
    FROM schedule_proposals
    WHERE conversation_id = ? AND status IN ('draft', 'awaiting_clarification', 'ready')
    ORDER BY created_at DESC LIMIT 10
  `).bind(conversationId).all<{ id: string; status: string; documentJson: string; createdAt: string }>();
  return {
    messages: await readConversationMessages(conversationId), activeJob: activeJob ?? null,
    agentOnline: Boolean(onlineWorker), workspace, records, recentRuns,
    proposals: proposals.results.flatMap((proposal) => {
      try { return [{ id: proposal.id, status: proposal.status, document: JSON.parse(proposal.documentJson), createdAt: proposal.createdAt }]; } catch { return []; }
    }),
  };
}

export function apiFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected activity service error";
  return Response.json({ error: message }, { status: 500 });
}
