CREATE TABLE `agent_workers` (
	`id` text PRIMARY KEY NOT NULL,
	`runtime` text NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agent_workers_last_seen_idx` ON `agent_workers` (`last_seen_at`);