CREATE TABLE `activity_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`setup_status` text DEFAULT 'preparing' NOT NULL,
	`setup_key` text NOT NULL,
	`setup_question_message_id` text,
	`assessed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_profiles_user_activity_unique` ON `activity_profiles` (`user_id`,`activity_id`);--> statement-breakpoint
CREATE TABLE `activity_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`daily_plan_item_id` text,
	`plan_date` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`allotted_duration_seconds` integer NOT NULL,
	`planned_duration_seconds` integer NOT NULL,
	`actual_elapsed_seconds` integer,
	`timer_mode` text,
	`timer_component_id` text,
	`started_at` text,
	`completed_at` text,
	`details_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`daily_plan_item_id`) REFERENCES `daily_plan_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_runs_user_activity_date_unique` ON `activity_runs` (`user_id`,`activity_id`,`plan_date`);--> statement-breakpoint
CREATE INDEX `activity_runs_activity_date_idx` ON `activity_runs` (`activity_id`,`plan_date`);