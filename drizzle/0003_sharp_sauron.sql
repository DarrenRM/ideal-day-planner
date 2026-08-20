CREATE TABLE `activity_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`current_revision_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_workspaces_user_activity_unique` ON `activity_workspaces` (`user_id`,`activity_id`);--> statement-breakpoint
CREATE TABLE `workspace_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`document_json` text NOT NULL,
	`source_agent_job_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `activity_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_revisions_workspace_number_unique` ON `workspace_revisions` (`workspace_id`,`revision_number`);--> statement-breakpoint
CREATE INDEX `workspace_revisions_workspace_idx` ON `workspace_revisions` (`workspace_id`);