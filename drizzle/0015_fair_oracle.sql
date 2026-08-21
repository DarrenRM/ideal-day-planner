ALTER TABLE `agent_jobs` ADD `day_plan_id` text REFERENCES daily_plans(id);--> statement-breakpoint
ALTER TABLE `agent_jobs` ADD `day_revision` integer;--> statement-breakpoint
ALTER TABLE `daily_plans` ADD `highlight_status` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_plans` ADD `highlight_body` text;--> statement-breakpoint
ALTER TABLE `daily_plans` ADD `highlight_kind` text;--> statement-breakpoint
ALTER TABLE `daily_plans` ADD `highlight_revision` integer DEFAULT 0 NOT NULL;