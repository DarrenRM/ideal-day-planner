import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () => text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  createdAt: createdAt(),
});

export const userMigrations = sqliteTable("user_migrations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  migrationKey: text("migration_key").notNull(),
  completedAt: text("completed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("user_migrations_user_key_unique").on(table.userId, table.migrationKey),
]);

export const routineTemplates = sqliteTable("routine_templates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Ideal Day"),
  startMinutes: integer("start_minutes").notNull().default(480),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("routine_templates_user_idx").on(table.userId)]);

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientKey: text("client_key").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("activities_user_client_key_unique").on(table.userId, table.clientKey)]);

export const routineItems = sqliteTable("routine_items", {
  id: text("id").primaryKey(),
  routineId: text("routine_id").notNull().references(() => routineTemplates.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  duration: integer("duration").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("routine_items_routine_activity_unique").on(table.routineId, table.activityId),
  index("routine_items_routine_position_idx").on(table.routineId, table.position),
]);

export const dailyPlans = sqliteTable("daily_plans", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planDate: text("plan_date").notNull(),
  templateId: text("template_id").references(() => routineTemplates.id, { onDelete: "set null" }),
  startMinutes: integer("start_minutes").notNull().default(480),
  startedAt: text("started_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("daily_plans_user_date_unique").on(table.userId, table.planDate)]);

export const dailyPlanItems = sqliteTable("daily_plan_items", {
  id: text("id").primaryKey(),
  dailyPlanId: text("daily_plan_id").notNull().references(() => dailyPlans.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  clientKey: text("client_key").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull(),
  duration: integer("duration").notNull(),
  completedAt: text("completed_at"),
  skippedAt: text("skipped_at"),
  removedAt: text("removed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("daily_plan_items_plan_client_key_unique").on(table.dailyPlanId, table.clientKey),
  index("daily_plan_items_plan_position_idx").on(table.dailyPlanId, table.position),
]);

export const settings = sqliteTable("settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  pullForwardAfterEarlyCompletion: integer("pull_forward_after_early_completion", { mode: "boolean" }).notNull().default(false),
  updatedAt: updatedAt(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("conversations_user_activity_unique").on(table.userId, table.activityId),
  index("conversations_user_idx").on(table.userId),
]);

export const conversationMessages = sqliteTable("conversation_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  body: text("body").notNull(),
  source: text("source").notNull(),
  agentJobId: text("agent_job_id"),
  createdAt: createdAt(),
}, (table) => [
  index("conversation_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
]);

export const activityVisits = sqliteTable("activity_visits", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  clientVisitId: text("client_visit_id").notNull(),
  contextJson: text("context_json"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("activity_visits_user_client_unique").on(table.userId, table.clientVisitId),
  index("activity_visits_activity_opened_idx").on(table.activityId, table.createdAt),
]);

export const agentJobs = sqliteTable("agent_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  sourceMessageId: text("source_message_id"),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  leaseToken: text("lease_token"),
  leaseOwner: text("lease_owner"),
  leasedAt: text("leased_at"),
  leaseExpiresAt: text("lease_expires_at"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("agent_jobs_user_idempotency_unique").on(table.userId, table.idempotencyKey),
  index("agent_jobs_status_created_idx").on(table.status, table.createdAt),
  index("agent_jobs_conversation_idx").on(table.conversationId),
]);

export const agentSessionBindings = sqliteTable("agent_session_bindings", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  runtime: text("runtime").notNull(),
  runtimeSessionId: text("runtime_session_id").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("agent_session_bindings_conversation_runtime_unique").on(table.conversationId, table.runtime),
]);

export const agentWorkers = sqliteTable("agent_workers", {
  id: text("id").primaryKey(),
  runtime: text("runtime").notNull(),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("agent_workers_last_seen_idx").on(table.lastSeenAt),
]);

export const activityWorkspaces = sqliteTable("activity_workspaces", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  currentRevisionId: text("current_revision_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("activity_workspaces_user_activity_unique").on(table.userId, table.activityId),
]);

export const activityProfiles = sqliteTable("activity_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  setupStatus: text("setup_status").notNull().default("preparing"),
  setupKey: text("setup_key").notNull(),
  setupQuestionMessageId: text("setup_question_message_id"),
  assessedAt: text("assessed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("activity_profiles_user_activity_unique").on(table.userId, table.activityId),
]);

export const activityRuns = sqliteTable("activity_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  dailyPlanItemId: text("daily_plan_item_id").references(() => dailyPlanItems.id, { onDelete: "set null" }),
  planDate: text("plan_date").notNull(),
  status: text("status").notNull().default("completed"),
  allottedDurationSeconds: integer("allotted_duration_seconds").notNull(),
  plannedDurationSeconds: integer("planned_duration_seconds").notNull(),
  actualElapsedSeconds: integer("actual_elapsed_seconds"),
  timerMode: text("timer_mode"),
  timerComponentId: text("timer_component_id"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  detailsJson: text("details_json"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("activity_runs_user_activity_date_unique").on(table.userId, table.activityId, table.planDate),
  index("activity_runs_activity_date_idx").on(table.activityId, table.planDate),
]);

export const activityRecords = sqliteTable("activity_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  recordKey: text("record_key").notNull(),
  recordType: text("record_type").notNull(),
  title: text("title").notNull(),
  scope: text("scope").notNull().default("activity"),
  scopeDate: text("scope_date"),
  payloadJson: text("payload_json").notNull(),
  version: integer("version").notNull().default(1),
  sourceMessageId: text("source_message_id"),
  sourceAgentJobId: text("source_agent_job_id"),
  archivedAt: text("archived_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("activity_records_user_activity_key_unique").on(table.userId, table.activityId, table.recordKey),
  index("activity_records_activity_scope_idx").on(table.activityId, table.scope, table.scopeDate),
  index("activity_records_activity_type_idx").on(table.activityId, table.recordType),
]);

export const activityRecordRevisions = sqliteTable("activity_record_revisions", {
  id: text("id").primaryKey(),
  recordId: text("record_id").notNull().references(() => activityRecords.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  title: text("title").notNull(),
  payloadJson: text("payload_json").notNull(),
  sourceMessageId: text("source_message_id"),
  sourceAgentJobId: text("source_agent_job_id"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("activity_record_revisions_record_number_unique").on(table.recordId, table.revisionNumber),
  index("activity_record_revisions_record_idx").on(table.recordId),
]);

export const recordRelations = sqliteTable("record_relations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recordId: text("record_id").notNull().references(() => activityRecords.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  relationType: text("relation_type").notNull().default("related"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("record_relations_record_activity_type_unique").on(table.recordId, table.activityId, table.relationType),
  index("record_relations_activity_idx").on(table.activityId),
]);

export const workspaceRevisions = sqliteTable("workspace_revisions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => activityWorkspaces.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  documentJson: text("document_json").notNull(),
  sourceAgentJobId: text("source_agent_job_id"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("workspace_revisions_workspace_number_unique").on(table.workspaceId, table.revisionNumber),
  index("workspace_revisions_workspace_idx").on(table.workspaceId),
]);
