ALTER TABLE `activities` ADD `origin` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
UPDATE `activities` SET `origin` = 'imported';--> statement-breakpoint
ALTER TABLE `daily_plan_items` ADD `plan_role` text DEFAULT 'essential' NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_plan_items` ADD `activated_at` text;--> statement-breakpoint
ALTER TABLE `schedule_pattern_steps` ADD `plan_role` text DEFAULT 'essential' NOT NULL;
