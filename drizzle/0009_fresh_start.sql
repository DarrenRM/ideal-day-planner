DELETE FROM `record_relations`;
--> statement-breakpoint
DELETE FROM `activity_record_revisions`;
--> statement-breakpoint
DELETE FROM `activity_records`;
--> statement-breakpoint
DELETE FROM `workspace_revisions`;
--> statement-breakpoint
DELETE FROM `activity_workspaces`;
--> statement-breakpoint
DELETE FROM `agent_session_bindings`;
--> statement-breakpoint
DELETE FROM `activity_visits`;
--> statement-breakpoint
DELETE FROM `conversation_messages`;
--> statement-breakpoint
DELETE FROM `agent_jobs`;
--> statement-breakpoint
DELETE FROM `conversations`;
--> statement-breakpoint
DELETE FROM `activity_profiles`;
--> statement-breakpoint
DELETE FROM `activity_runs`;
--> statement-breakpoint
UPDATE `daily_plan_items`
SET `completed_at` = NULL,
	`skipped_at` = NULL,
	`updated_at` = CURRENT_TIMESTAMP
WHERE `daily_plan_id` IN (
	SELECT current_plan.`id`
	FROM `daily_plans` current_plan
	WHERE current_plan.`plan_date` = (
		SELECT MAX(candidate.`plan_date`)
		FROM `daily_plans` candidate
		WHERE candidate.`user_id` = current_plan.`user_id`
	)
);
--> statement-breakpoint
UPDATE `daily_plans`
SET `started_at` = NULL,
	`updated_at` = CURRENT_TIMESTAMP
WHERE `plan_date` = (
	SELECT MAX(candidate.`plan_date`)
	FROM `daily_plans` candidate
	WHERE candidate.`user_id` = `daily_plans`.`user_id`
);
