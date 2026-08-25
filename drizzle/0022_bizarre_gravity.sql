CREATE TABLE `onboarding_test_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`stage` text DEFAULT 'welcome' NOT NULL,
	`goals` text DEFAULT '' NOT NULL,
	`capacity` text,
	`revision_request` text,
	`proposal_json` text,
	`confirmation_date` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_test_sessions_user_unique` ON `onboarding_test_sessions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_test_sessions_owner_unique` ON `onboarding_test_sessions` (`owner_user_id`);