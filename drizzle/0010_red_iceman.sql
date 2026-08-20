PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_activity_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`daily_plan_item_id` text,
	`plan_date` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`allotted_duration_seconds` integer,
	`planned_duration_seconds` integer,
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
INSERT INTO `__new_activity_runs`("id", "user_id", "activity_id", "daily_plan_item_id", "plan_date", "status", "allotted_duration_seconds", "planned_duration_seconds", "actual_elapsed_seconds", "timer_mode", "timer_component_id", "started_at", "completed_at", "details_json", "created_at", "updated_at") SELECT "id", "user_id", "activity_id", "daily_plan_item_id", "plan_date", "status", "allotted_duration_seconds", "planned_duration_seconds", "actual_elapsed_seconds", "timer_mode", "timer_component_id", "started_at", "completed_at", "details_json", "created_at", "updated_at" FROM `activity_runs`;--> statement-breakpoint
DROP TABLE `activity_runs`;--> statement-breakpoint
ALTER TABLE `__new_activity_runs` RENAME TO `activity_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `activity_runs_user_activity_date_unique` ON `activity_runs` (`user_id`,`activity_id`,`plan_date`);--> statement-breakpoint
CREATE INDEX `activity_runs_activity_date_idx` ON `activity_runs` (`activity_id`,`plan_date`);--> statement-breakpoint
ALTER TABLE `settings` ADD `day_timeline_enabled` integer DEFAULT false NOT NULL;