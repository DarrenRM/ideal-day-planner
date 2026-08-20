CREATE TABLE `activity_record_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`title` text NOT NULL,
	`payload_json` text NOT NULL,
	`source_message_id` text,
	`source_agent_job_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `activity_records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_record_revisions_record_number_unique` ON `activity_record_revisions` (`record_id`,`revision_number`);--> statement-breakpoint
CREATE INDEX `activity_record_revisions_record_idx` ON `activity_record_revisions` (`record_id`);--> statement-breakpoint
CREATE TABLE `activity_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`record_key` text NOT NULL,
	`record_type` text NOT NULL,
	`title` text NOT NULL,
	`scope` text DEFAULT 'activity' NOT NULL,
	`scope_date` text,
	`payload_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source_message_id` text,
	`source_agent_job_id` text,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_records_user_activity_key_unique` ON `activity_records` (`user_id`,`activity_id`,`record_key`);--> statement-breakpoint
CREATE INDEX `activity_records_activity_scope_idx` ON `activity_records` (`activity_id`,`scope`,`scope_date`);--> statement-breakpoint
CREATE INDEX `activity_records_activity_type_idx` ON `activity_records` (`activity_id`,`record_type`);--> statement-breakpoint
CREATE TABLE `record_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`record_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`relation_type` text DEFAULT 'related' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`record_id`) REFERENCES `activity_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_relations_record_activity_type_unique` ON `record_relations` (`record_id`,`activity_id`,`relation_type`);--> statement-breakpoint
CREATE INDEX `record_relations_activity_idx` ON `record_relations` (`activity_id`);