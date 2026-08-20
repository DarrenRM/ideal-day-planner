CREATE TABLE `activity_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`client_visit_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_visits_user_client_unique` ON `activity_visits` (`user_id`,`client_visit_id`);--> statement-breakpoint
CREATE INDEX `activity_visits_activity_opened_idx` ON `activity_visits` (`activity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
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
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_jobs_user_idempotency_unique` ON `agent_jobs` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `agent_jobs_status_created_idx` ON `agent_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_jobs_conversation_idx` ON `agent_jobs` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `agent_session_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`runtime` text NOT NULL,
	`runtime_session_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_session_bindings_conversation_runtime_unique` ON `agent_session_bindings` (`conversation_id`,`runtime`);--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`source` text NOT NULL,
	`agent_job_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_messages_conversation_created_idx` ON `conversation_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_user_activity_unique` ON `conversations` (`user_id`,`activity_id`);--> statement-breakpoint
CREATE INDEX `conversations_user_idx` ON `conversations` (`user_id`);