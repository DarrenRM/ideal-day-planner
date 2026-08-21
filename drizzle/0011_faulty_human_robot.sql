CREATE TABLE `activity_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`client_key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`default_duration_minutes` integer,
	`position` integer NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_variants_activity_client_key_unique` ON `activity_variants` (`activity_id`,`client_key`);--> statement-breakpoint
CREATE INDEX `activity_variants_activity_position_idx` ON `activity_variants` (`activity_id`,`position`);--> statement-breakpoint
CREATE INDEX `activity_variants_user_idx` ON `activity_variants` (`user_id`);--> statement-breakpoint
CREATE TABLE `schedule_action_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`source_message_id` text,
	`source_agent_job_id` text,
	`action_type` text NOT NULL,
	`action_json` text NOT NULL,
	`source` text NOT NULL,
	`actor` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_action_events_user_idempotency_unique` ON `schedule_action_events` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `schedule_action_events_user_created_idx` ON `schedule_action_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `schedule_pattern_state` (
	`pattern_id` text PRIMARY KEY NOT NULL,
	`current_step_position` integer DEFAULT 0 NOT NULL,
	`last_advanced_daily_plan_item_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`pattern_id`) REFERENCES `schedule_patterns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `schedule_pattern_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`pattern_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`activity_variant_id` text,
	`position` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`display_label_override` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`pattern_id`) REFERENCES `schedule_patterns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_variant_id`) REFERENCES `activity_variants`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_pattern_steps_pattern_position_unique` ON `schedule_pattern_steps` (`pattern_id`,`position`);--> statement-breakpoint
CREATE INDEX `schedule_pattern_steps_activity_idx` ON `schedule_pattern_steps` (`activity_id`);--> statement-breakpoint
CREATE INDEX `schedule_pattern_steps_variant_idx` ON `schedule_pattern_steps` (`activity_variant_id`);--> statement-breakpoint
CREATE TABLE `schedule_patterns` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`routine_id` text NOT NULL,
	`client_key` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`cadence_json` text NOT NULL,
	`advancement_json` text NOT NULL,
	`anchor_date` text NOT NULL,
	`initial_step_position` integer DEFAULT 0 NOT NULL,
	`effective_date` text NOT NULL,
	`end_date` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `routine_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_patterns_routine_client_key_unique` ON `schedule_patterns` (`routine_id`,`client_key`);--> statement-breakpoint
CREATE INDEX `schedule_patterns_routine_position_idx` ON `schedule_patterns` (`routine_id`,`position`);--> statement-breakpoint
CREATE INDEX `schedule_patterns_user_idx` ON `schedule_patterns` (`user_id`);--> statement-breakpoint
CREATE TABLE `schedule_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`source_message_id` text,
	`source_agent_job_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`base_revision` integer NOT NULL,
	`document_json` text NOT NULL,
	`applied_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `schedule_proposals_user_status_idx` ON `schedule_proposals` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `schedule_proposals_conversation_created_idx` ON `schedule_proposals` (`conversation_id`,`created_at`);--> statement-breakpoint
DROP INDEX `activity_runs_user_activity_date_unique`;--> statement-breakpoint
ALTER TABLE `activity_runs` ADD `activity_variant_id` text REFERENCES activity_variants(id);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_runs_daily_plan_item_unique` ON `activity_runs` (`daily_plan_item_id`) WHERE "activity_runs"."daily_plan_item_id" IS NOT NULL;--> statement-breakpoint
DROP INDEX `activity_workspaces_user_activity_unique`;--> statement-breakpoint
ALTER TABLE `activity_workspaces` ADD `activity_variant_id` text REFERENCES activity_variants(id);--> statement-breakpoint
CREATE UNIQUE INDEX `activity_workspaces_user_activity_base_unique` ON `activity_workspaces` (`user_id`,`activity_id`) WHERE "activity_workspaces"."activity_variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `activity_workspaces_user_activity_variant_unique` ON `activity_workspaces` (`user_id`,`activity_id`,`activity_variant_id`) WHERE "activity_workspaces"."activity_variant_id" IS NOT NULL;--> statement-breakpoint
DROP INDEX `daily_plan_items_plan_client_key_unique`;--> statement-breakpoint
ALTER TABLE `daily_plan_items` ADD `occurrence_key` text;--> statement-breakpoint
ALTER TABLE `daily_plan_items` ADD `schedule_pattern_id` text REFERENCES schedule_patterns(id);--> statement-breakpoint
ALTER TABLE `daily_plan_items` ADD `schedule_pattern_step_id` text REFERENCES schedule_pattern_steps(id);--> statement-breakpoint
ALTER TABLE `daily_plan_items` ADD `activity_variant_id` text REFERENCES activity_variants(id);--> statement-breakpoint
ALTER TABLE `daily_plan_items` ADD `variant_name_snapshot` text;--> statement-breakpoint
ALTER TABLE `daily_plan_items` ADD `display_label_override` text;--> statement-breakpoint
ALTER TABLE `daily_plan_items` ADD `source_date` text;--> statement-breakpoint
ALTER TABLE `daily_plan_items` ADD `moved_from_daily_plan_item_id` text;--> statement-breakpoint
ALTER TABLE `daily_plan_items` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `daily_plan_items_plan_occurrence_key_unique` ON `daily_plan_items` (`daily_plan_id`,`occurrence_key`);--> statement-breakpoint
CREATE INDEX `daily_plan_items_pattern_date_idx` ON `daily_plan_items` (`schedule_pattern_id`,`source_date`);--> statement-breakpoint
CREATE INDEX `daily_plan_items_activity_date_idx` ON `daily_plan_items` (`activity_id`,`daily_plan_id`);--> statement-breakpoint
CREATE TABLE `__backup_conversation_messages` AS SELECT * FROM `conversation_messages`;--> statement-breakpoint
CREATE TABLE `__backup_activity_visits` AS SELECT * FROM `activity_visits`;--> statement-breakpoint
CREATE TABLE `__backup_agent_session_bindings` AS SELECT * FROM `agent_session_bindings`;--> statement-breakpoint
CREATE TABLE `__backup_agent_jobs` AS SELECT * FROM `agent_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope_type` text DEFAULT 'activity' NOT NULL,
	`activity_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("id", "user_id", "scope_type", "activity_id", "created_at", "updated_at") SELECT "id", "user_id", 'activity', "activity_id", "created_at", "updated_at" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_user_activity_unique` ON `conversations` (`user_id`,`activity_id`) WHERE "conversations"."scope_type" = 'activity';--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_user_global_unique` ON `conversations` (`user_id`) WHERE "conversations"."scope_type" = 'global';--> statement-breakpoint
CREATE INDEX `conversations_user_idx` ON `conversations` (`user_id`);--> statement-breakpoint
INSERT INTO `conversation_messages`("id", "conversation_id", "role", "body", "source", "agent_job_id", "created_at") SELECT "id", "conversation_id", "role", "body", "source", "agent_job_id", "created_at" FROM `__backup_conversation_messages`;--> statement-breakpoint
INSERT INTO `activity_visits`("id", "user_id", "activity_id", "conversation_id", "client_visit_id", "created_at", "context_json") SELECT "id", "user_id", "activity_id", "conversation_id", "client_visit_id", "created_at", "context_json" FROM `__backup_activity_visits`;--> statement-breakpoint
INSERT INTO `agent_session_bindings`("id", "conversation_id", "runtime", "runtime_session_id", "created_at", "updated_at") SELECT "id", "conversation_id", "runtime", "runtime_session_id", "created_at", "updated_at" FROM `__backup_agent_session_bindings`;--> statement-breakpoint
INSERT INTO `agent_jobs`("id", "user_id", "activity_id", "conversation_id", "kind", "idempotency_key", "source_message_id", "status", "attempts", "lease_token", "lease_owner", "leased_at", "lease_expires_at", "error", "progress_title", "progress_detail", "created_at", "updated_at") SELECT "id", "user_id", "activity_id", "conversation_id", "kind", "idempotency_key", "source_message_id", "status", "attempts", "lease_token", "lease_owner", "leased_at", "lease_expires_at", "error", "progress_title", "progress_detail", "created_at", "updated_at" FROM `__backup_agent_jobs`;--> statement-breakpoint
DROP TABLE `__backup_conversation_messages`;--> statement-breakpoint
DROP TABLE `__backup_activity_visits`;--> statement-breakpoint
DROP TABLE `__backup_agent_session_bindings`;--> statement-breakpoint
DROP TABLE `__backup_agent_jobs`;--> statement-breakpoint
CREATE TABLE `__new_agent_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope_type` text DEFAULT 'activity' NOT NULL,
	`activity_id` text,
	`conversation_id` text NOT NULL,
	`kind` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`source_message_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_owner` text,
	`leased_at` text,
	`lease_expires_at` text,
	`error` text,
	`progress_title` text,
	`progress_detail` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent_jobs`("id", "user_id", "scope_type", "activity_id", "conversation_id", "kind", "idempotency_key", "source_message_id", "status", "attempts", "lease_token", "lease_owner", "leased_at", "lease_expires_at", "error", "progress_title", "progress_detail", "created_at", "updated_at") SELECT "id", "user_id", 'activity', "activity_id", "conversation_id", "kind", "idempotency_key", "source_message_id", "status", "attempts", "lease_token", "lease_owner", "leased_at", "lease_expires_at", "error", "progress_title", "progress_detail", "created_at", "updated_at" FROM `agent_jobs`;--> statement-breakpoint
DROP TABLE `agent_jobs`;--> statement-breakpoint
ALTER TABLE `__new_agent_jobs` RENAME TO `agent_jobs`;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_jobs_user_idempotency_unique` ON `agent_jobs` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `agent_jobs_status_created_idx` ON `agent_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_jobs_conversation_idx` ON `agent_jobs` (`conversation_id`);--> statement-breakpoint
ALTER TABLE `activity_records` ADD `activity_variant_id` text REFERENCES activity_variants(id);--> statement-breakpoint
CREATE INDEX `activity_records_variant_idx` ON `activity_records` (`activity_variant_id`);--> statement-breakpoint
ALTER TABLE `routine_templates` ADD `schedule_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
INSERT INTO `schedule_patterns` (
	`id`, `user_id`, `routine_id`, `client_key`, `name`, `position`,
	`cadence_json`, `advancement_json`, `anchor_date`, `initial_step_position`,
	`effective_date`, `revision`, `created_at`, `updated_at`
)
SELECT
	'schedule-pattern:' || ri.`id`, rt.`user_id`, ri.`routine_id`,
	'legacy-' || ri.`position` || '-' || a.`client_key`, a.`title`, ri.`position`,
	'{"kind":"daily"}', '{"kind":"calendar"}', '1970-01-01', 0,
	'1970-01-01', 1, ri.`created_at`, ri.`updated_at`
FROM `routine_items` ri
JOIN `routine_templates` rt ON rt.`id` = ri.`routine_id`
JOIN `activities` a ON a.`id` = ri.`activity_id`;--> statement-breakpoint
INSERT INTO `schedule_pattern_steps` (
	`id`, `pattern_id`, `activity_id`, `position`, `duration_minutes`, `created_at`, `updated_at`
)
SELECT
	'schedule-step:' || ri.`id`, 'schedule-pattern:' || ri.`id`, ri.`activity_id`,
	0, ri.`duration`, ri.`created_at`, ri.`updated_at`
FROM `routine_items` ri;--> statement-breakpoint
UPDATE `daily_plan_items`
SET
	`occurrence_key` = COALESCE(
		(
			SELECT 'pattern:' || sp.`id` || ':' || dp.`plan_date`
			FROM `daily_plans` dp
			JOIN `schedule_patterns` sp ON sp.`routine_id` = dp.`template_id`
			JOIN `schedule_pattern_steps` sps ON sps.`pattern_id` = sp.`id`
			WHERE dp.`id` = `daily_plan_items`.`daily_plan_id`
				AND sps.`activity_id` = `daily_plan_items`.`activity_id`
			ORDER BY sp.`position`
			LIMIT 1
		),
		'legacy:' || `daily_plan_items`.`id`
	),
	`schedule_pattern_id` = (
		SELECT sp.`id`
		FROM `daily_plans` dp
		JOIN `schedule_patterns` sp ON sp.`routine_id` = dp.`template_id`
		JOIN `schedule_pattern_steps` sps ON sps.`pattern_id` = sp.`id`
		WHERE dp.`id` = `daily_plan_items`.`daily_plan_id`
			AND sps.`activity_id` = `daily_plan_items`.`activity_id`
		ORDER BY sp.`position`
		LIMIT 1
	),
	`schedule_pattern_step_id` = (
		SELECT sps.`id`
		FROM `daily_plans` dp
		JOIN `schedule_patterns` sp ON sp.`routine_id` = dp.`template_id`
		JOIN `schedule_pattern_steps` sps ON sps.`pattern_id` = sp.`id`
		WHERE dp.`id` = `daily_plan_items`.`daily_plan_id`
			AND sps.`activity_id` = `daily_plan_items`.`activity_id`
		ORDER BY sp.`position`
		LIMIT 1
	),
	`source_date` = (
		SELECT dp.`plan_date`
		FROM `daily_plans` dp
		WHERE dp.`id` = `daily_plan_items`.`daily_plan_id`
	);
