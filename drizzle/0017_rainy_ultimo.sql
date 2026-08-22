CREATE TABLE `activity_follow_ups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`follow_up_key` text NOT NULL,
	`title` text NOT NULL,
	`question` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`inferred` integer DEFAULT false NOT NULL,
	`source_message_id` text,
	`source_agent_job_id` text,
	`trigger_job_id` text,
	`asked_at` text,
	`completed_at` text,
	`dismissed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `conversation_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_follow_ups_activity_key_unique` ON `activity_follow_ups` (`activity_id`,`follow_up_key`);--> statement-breakpoint
CREATE INDEX `activity_follow_ups_user_due_idx` ON `activity_follow_ups` (`user_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `activity_follow_ups_activity_status_idx` ON `activity_follow_ups` (`activity_id`,`status`);