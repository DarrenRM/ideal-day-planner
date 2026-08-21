ALTER TABLE `activity_records` ADD `subject_key` text;--> statement-breakpoint
CREATE INDEX `activity_records_activity_subject_idx` ON `activity_records` (`activity_id`,`subject_key`);