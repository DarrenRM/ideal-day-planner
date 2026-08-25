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
  scheduleRevision: integer("schedule_revision").notNull().default(1),
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
  origin: text("origin").notNull().default("user"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("activities_user_client_key_unique").on(table.userId, table.clientKey)]);

export const activityVariants = sqliteTable("activity_variants", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  clientKey: text("client_key").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  defaultDurationMinutes: integer("default_duration_minutes"),
  position: integer("position").notNull(),
  archivedAt: text("archived_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("activity_variants_activity_client_key_unique").on(table.activityId, table.clientKey),
  index("activity_variants_activity_position_idx").on(table.activityId, table.position),
  index("activity_variants_user_idx").on(table.userId),
]);

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

export const schedulePatterns = sqliteTable("schedule_patterns", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  routineId: text("routine_id").notNull().references(() => routineTemplates.id, { onDelete: "cascade" }),
  clientKey: text("client_key").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  cadenceJson: text("cadence_json").notNull(),
  advancementJson: text("advancement_json").notNull(),
  anchorDate: text("anchor_date").notNull(),
  initialStepPosition: integer("initial_step_position").notNull().default(0),
  effectiveDate: text("effective_date").notNull(),
  endDate: text("end_date"),
  revision: integer("revision").notNull().default(1),
  archivedAt: text("archived_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("schedule_patterns_routine_client_key_unique").on(table.routineId, table.clientKey),
  index("schedule_patterns_routine_position_idx").on(table.routineId, table.position),
  index("schedule_patterns_user_idx").on(table.userId),
]);

export const schedulePatternSteps = sqliteTable("schedule_pattern_steps", {
  id: text("id").primaryKey(),
  patternId: text("pattern_id").notNull().references(() => schedulePatterns.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  activityVariantId: text("activity_variant_id").references(() => activityVariants.id, { onDelete: "set null" }),
  position: integer("position").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  displayLabelOverride: text("display_label_override"),
  planRole: text("plan_role").notNull().default("essential"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("schedule_pattern_steps_pattern_position_unique").on(table.patternId, table.position),
  index("schedule_pattern_steps_activity_idx").on(table.activityId),
  index("schedule_pattern_steps_variant_idx").on(table.activityVariantId),
]);

export const schedulePatternState = sqliteTable("schedule_pattern_state", {
  patternId: text("pattern_id").primaryKey().references(() => schedulePatterns.id, { onDelete: "cascade" }),
  currentStepPosition: integer("current_step_position").notNull().default(0),
  lastAdvancedDailyPlanItemId: text("last_advanced_daily_plan_item_id"),
  revision: integer("revision").notNull().default(1),
  updatedAt: updatedAt(),
});

export const dailyPlans = sqliteTable("daily_plans", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planDate: text("plan_date").notNull(),
  templateId: text("template_id").references(() => routineTemplates.id, { onDelete: "set null" }),
  startMinutes: integer("start_minutes").notNull().default(480),
  startedAt: text("started_at"),
  highlightStatus: text("highlight_status").notNull().default("idle"),
  highlightBody: text("highlight_body"),
  highlightKind: text("highlight_kind"),
  highlightRevision: integer("highlight_revision").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("daily_plans_user_date_unique").on(table.userId, table.planDate)]);

export const dailyPlanItems = sqliteTable("daily_plan_items", {
  id: text("id").primaryKey(),
  dailyPlanId: text("daily_plan_id").notNull().references(() => dailyPlans.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  occurrenceKey: text("occurrence_key"),
  schedulePatternId: text("schedule_pattern_id").references(() => schedulePatterns.id, { onDelete: "set null" }),
  schedulePatternStepId: text("schedule_pattern_step_id").references(() => schedulePatternSteps.id, { onDelete: "set null" }),
  activityVariantId: text("activity_variant_id").references(() => activityVariants.id, { onDelete: "set null" }),
  clientKey: text("client_key").notNull(),
  title: text("title").notNull(),
  variantNameSnapshot: text("variant_name_snapshot"),
  displayLabelOverride: text("display_label_override"),
  category: text("category").notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
  position: integer("position").notNull(),
  duration: integer("duration").notNull(),
  planRole: text("plan_role").notNull().default("essential"),
  activatedAt: text("activated_at"),
  completedAt: text("completed_at"),
  skippedAt: text("skipped_at"),
  removedAt: text("removed_at"),
  sourceDate: text("source_date"),
  movedFromDailyPlanItemId: text("moved_from_daily_plan_item_id"),
  revision: integer("revision").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("daily_plan_items_plan_occurrence_key_unique").on(table.dailyPlanId, table.occurrenceKey),
  index("daily_plan_items_plan_position_idx").on(table.dailyPlanId, table.position),
  index("daily_plan_items_pattern_date_idx").on(table.schedulePatternId, table.sourceDate),
  index("daily_plan_items_activity_date_idx").on(table.activityId, table.dailyPlanId),
]);

export const settings = sqliteTable("settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  timeZone: text("time_zone").notNull().default("America/Phoenix"),
  dayTimelineEnabled: integer("day_timeline_enabled", { mode: "boolean" }).notNull().default(false),
  pullForwardAfterEarlyCompletion: integer("pull_forward_after_early_completion", { mode: "boolean" }).notNull().default(false),
  updatedAt: updatedAt(),
});

export const onboardingTestSessions = sqliteTable("onboarding_test_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").notNull(),
  stage: text("stage").notNull().default("welcome"),
  goals: text("goals").notNull().default(""),
  capacity: text("capacity"),
  revisionRequest: text("revision_request"),
  proposalJson: text("proposal_json"),
  confirmationDate: text("confirmation_date"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("onboarding_test_sessions_user_unique").on(table.userId),
  uniqueIndex("onboarding_test_sessions_owner_unique").on(table.ownerUserId),
]);

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scopeType: text("scope_type").notNull().default("activity"),
  activityId: text("activity_id").references(() => activities.id, { onDelete: "cascade" }),
  lastReadAt: text("last_read_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("conversations_user_activity_unique").on(table.userId, table.activityId).where(sql`${table.scopeType} = 'activity'`),
  uniqueIndex("conversations_user_global_unique").on(table.userId).where(sql`${table.scopeType} = 'global'`),
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

export const conversationArtifacts = sqliteTable("conversation_artifacts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  activityId: text("activity_id").references(() => activities.id, { onDelete: "set null" }),
  sourceMessageId: text("source_message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
  sourceAgentJobId: text("source_agent_job_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  metaJson: text("meta_json").notNull().default("{}"),
  viewedAt: text("viewed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("conversation_artifacts_conversation_job_unique").on(table.conversationId, table.sourceAgentJobId),
  index("conversation_artifacts_conversation_created_idx").on(table.conversationId, table.createdAt),
]);

export const capturedIntents = sqliteTable("captured_intents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  sourceMessageId: text("source_message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
  sourceAgentJobId: text("source_agent_job_id"),
  destinationActivityId: text("destination_activity_id").references(() => activities.id, { onDelete: "set null" }),
  captureKind: text("capture_kind").notNull().default("open_item"),
  label: text("label").notNull(),
  normalizedLabel: text("normalized_label").notNull(),
  detail: text("detail").notNull().default(""),
  urgency: text("urgency").notNull().default(""),
  destinationHint: text("destination_hint").notNull().default(""),
  status: text("status").notNull().default("pending_destination"),
  timingStatus: text("timing_status").notNull().default("unspecified"),
  scheduledDate: text("scheduled_date"),
  linkedRecordKey: text("linked_record_key"),
  linkedItemId: text("linked_item_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  dismissedAt: text("dismissed_at"),
  resolvedAt: text("resolved_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("captured_intents_user_idempotency_unique").on(table.userId, table.idempotencyKey),
  index("captured_intents_user_status_idx").on(table.userId, table.status, table.updatedAt),
  index("captured_intents_activity_status_idx").on(table.destinationActivityId, table.status),
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

export const activityFollowUps = sqliteTable("activity_follow_ups", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  followUpKey: text("follow_up_key").notNull(),
  title: text("title").notNull(),
  question: text("question").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("pending"),
  inferred: integer("inferred", { mode: "boolean" }).notNull().default(false),
  sourceMessageId: text("source_message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
  sourceAgentJobId: text("source_agent_job_id"),
  triggerJobId: text("trigger_job_id"),
  askedAt: text("asked_at"),
  completedAt: text("completed_at"),
  dismissedAt: text("dismissed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("activity_follow_ups_activity_key_unique").on(table.activityId, table.followUpKey),
  index("activity_follow_ups_user_due_idx").on(table.userId, table.status, table.dueDate),
  index("activity_follow_ups_activity_status_idx").on(table.activityId, table.status),
]);

export const agentJobs = sqliteTable("agent_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scopeType: text("scope_type").notNull().default("activity"),
  activityId: text("activity_id").references(() => activities.id, { onDelete: "cascade" }),
  activityVariantId: text("activity_variant_id").references(() => activityVariants.id, { onDelete: "set null" }),
  dayPlanId: text("day_plan_id").references(() => dailyPlans.id, { onDelete: "cascade" }),
  dayRevision: integer("day_revision"),
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
  progressTitle: text("progress_title"),
  progressDetail: text("progress_detail"),
  delegationInstruction: text("delegation_instruction"),
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
  activityVariantId: text("activity_variant_id").references(() => activityVariants.id, { onDelete: "cascade" }),
  currentRevisionId: text("current_revision_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("activity_workspaces_user_activity_base_unique").on(table.userId, table.activityId).where(sql`${table.activityVariantId} IS NULL`),
  uniqueIndex("activity_workspaces_user_activity_variant_unique").on(table.userId, table.activityId, table.activityVariantId).where(sql`${table.activityVariantId} IS NOT NULL`),
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
  activityVariantId: text("activity_variant_id").references(() => activityVariants.id, { onDelete: "set null" }),
  dailyPlanItemId: text("daily_plan_item_id").references(() => dailyPlanItems.id, { onDelete: "set null" }),
  planDate: text("plan_date").notNull(),
  status: text("status").notNull().default("completed"),
  allottedDurationSeconds: integer("allotted_duration_seconds"),
  plannedDurationSeconds: integer("planned_duration_seconds"),
  actualElapsedSeconds: integer("actual_elapsed_seconds"),
  timerMode: text("timer_mode"),
  timerComponentId: text("timer_component_id"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  detailsJson: text("details_json"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex("activity_runs_daily_plan_item_unique").on(table.dailyPlanItemId).where(sql`${table.dailyPlanItemId} IS NOT NULL`),
  index("activity_runs_activity_date_idx").on(table.activityId, table.planDate),
]);

export const activityRecords = sqliteTable("activity_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activityId: text("activity_id").notNull().references(() => activities.id, { onDelete: "cascade" }),
  activityVariantId: text("activity_variant_id").references(() => activityVariants.id, { onDelete: "cascade" }),
  recordKey: text("record_key").notNull(),
  subjectKey: text("subject_key"),
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
  uniqueIndex("activity_records_user_activity_base_key_unique").on(table.userId, table.activityId, table.recordKey).where(sql`${table.activityVariantId} IS NULL`),
  uniqueIndex("activity_records_user_activity_variant_key_unique").on(table.userId, table.activityId, table.activityVariantId, table.recordKey).where(sql`${table.activityVariantId} IS NOT NULL`),
  index("activity_records_activity_scope_idx").on(table.activityId, table.scope, table.scopeDate),
  index("activity_records_activity_type_idx").on(table.activityId, table.recordType),
  index("activity_records_activity_subject_idx").on(table.activityId, table.subjectKey),
  index("activity_records_variant_idx").on(table.activityVariantId),
]);

export const scheduleProposals = sqliteTable("schedule_proposals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  sourceMessageId: text("source_message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
  sourceAgentJobId: text("source_agent_job_id"),
  status: text("status").notNull().default("draft"),
  baseRevision: integer("base_revision").notNull(),
  documentJson: text("document_json").notNull(),
  appliedAt: text("applied_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("schedule_proposals_user_status_idx").on(table.userId, table.status),
  index("schedule_proposals_conversation_created_idx").on(table.conversationId, table.createdAt),
]);

export const scheduleActionEvents = sqliteTable("schedule_action_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  sourceMessageId: text("source_message_id").references(() => conversationMessages.id, { onDelete: "set null" }),
  sourceAgentJobId: text("source_agent_job_id"),
  actionType: text("action_type").notNull(),
  actionJson: text("action_json").notNull(),
  source: text("source").notNull(),
  actor: text("actor").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("schedule_action_events_user_idempotency_unique").on(table.userId, table.idempotencyKey),
  index("schedule_action_events_user_created_idx").on(table.userId, table.createdAt),
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
