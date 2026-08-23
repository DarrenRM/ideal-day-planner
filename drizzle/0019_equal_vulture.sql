CREATE TABLE `captured_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`source_message_id` text,
	`source_agent_job_id` text,
	`destination_activity_id` text,
	`capture_kind` text DEFAULT 'open_item' NOT NULL,
	`label` text NOT NULL,
	`normalized_label` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`urgency` text DEFAULT '' NOT NULL,
	`destination_hint` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending_destination' NOT NULL,
	`timing_status` text DEFAULT 'unspecified' NOT NULL,
	`scheduled_date` text,
	`linked_record_key` text,
	`linked_item_id` text,
	`idempotency_key` text NOT NULL,
	`dismissed_at` text,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`destination_activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `captured_intents_user_idempotency_unique` ON `captured_intents` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `captured_intents_user_status_idx` ON `captured_intents` (`user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `captured_intents_activity_status_idx` ON `captured_intents` (`destination_activity_id`,`status`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `last_read_at` text;