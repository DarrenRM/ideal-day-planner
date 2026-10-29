PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`time_zone` text DEFAULT 'UTC' NOT NULL,
	`day_timeline_enabled` integer DEFAULT false NOT NULL,
	`pull_forward_after_early_completion` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_settings`("user_id", "time_zone", "day_timeline_enabled", "pull_forward_after_early_completion", "updated_at") SELECT "user_id", "time_zone", "day_timeline_enabled", "pull_forward_after_early_completion", "updated_at" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;