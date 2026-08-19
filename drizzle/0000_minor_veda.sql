CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_key` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_user_client_key_unique` ON `activities` (`user_id`,`client_key`);--> statement-breakpoint
CREATE TABLE `daily_plan_items` (
	`id` text PRIMARY KEY NOT NULL,
	`daily_plan_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`client_key` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`position` integer NOT NULL,
	`duration` integer NOT NULL,
	`completed_at` text,
	`removed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`daily_plan_id`) REFERENCES `daily_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_plan_items_plan_client_key_unique` ON `daily_plan_items` (`daily_plan_id`,`client_key`);--> statement-breakpoint
CREATE INDEX `daily_plan_items_plan_position_idx` ON `daily_plan_items` (`daily_plan_id`,`position`);--> statement-breakpoint
CREATE TABLE `daily_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_date` text NOT NULL,
	`template_id` text,
	`start_minutes` integer DEFAULT 480 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `routine_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_plans_user_date_unique` ON `daily_plans` (`user_id`,`plan_date`);--> statement-breakpoint
CREATE TABLE `routine_items` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`position` integer NOT NULL,
	`duration` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routine_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_items_routine_activity_unique` ON `routine_items` (`routine_id`,`activity_id`);--> statement-breakpoint
CREATE INDEX `routine_items_routine_position_idx` ON `routine_items` (`routine_id`,`position`);--> statement-breakpoint
CREATE TABLE `routine_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text DEFAULT 'Ideal Day' NOT NULL,
	`start_minutes` integer DEFAULT 480 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routine_templates_user_idx` ON `routine_templates` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`pull_forward_after_early_completion` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_migrations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`migration_key` text NOT NULL,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_migrations_user_key_unique` ON `user_migrations` (`user_id`,`migration_key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
