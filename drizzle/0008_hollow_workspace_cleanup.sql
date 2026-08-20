DELETE FROM `activity_record_revisions`
WHERE `record_id` IN (
	SELECT ar.`id`
	FROM `activity_records` ar
	JOIN `activities` a ON a.`id` = ar.`activity_id`
	WHERE (a.`client_key` = 'cardio' AND ar.`record_key` = 'cardio-overview')
		OR (a.`client_key` = 'hair-serum' AND ar.`record_key` = 'hair-serum-use-details-needed')
		OR (a.`client_key` = 'kettlebells' AND ar.`record_key` = 'kettlebell-strength-workout')
		OR (a.`client_key` = 'lift' AND ar.`record_key` = 'lift-workout')
		OR (a.`client_key` = 'shower' AND ar.`record_key` = 'shower-routine')
		OR (a.`client_key` = 'stretch' AND ar.`record_key` = 'stretch-yoga-routine')
);
--> statement-breakpoint
DELETE FROM `record_relations`
WHERE `record_id` IN (
	SELECT ar.`id`
	FROM `activity_records` ar
	JOIN `activities` a ON a.`id` = ar.`activity_id`
	WHERE (a.`client_key` = 'cardio' AND ar.`record_key` = 'cardio-overview')
		OR (a.`client_key` = 'hair-serum' AND ar.`record_key` = 'hair-serum-use-details-needed')
		OR (a.`client_key` = 'kettlebells' AND ar.`record_key` = 'kettlebell-strength-workout')
		OR (a.`client_key` = 'lift' AND ar.`record_key` = 'lift-workout')
		OR (a.`client_key` = 'shower' AND ar.`record_key` = 'shower-routine')
		OR (a.`client_key` = 'stretch' AND ar.`record_key` = 'stretch-yoga-routine')
);
--> statement-breakpoint
DELETE FROM `activity_records`
WHERE `id` IN (
	SELECT ar.`id`
	FROM `activity_records` ar
	JOIN `activities` a ON a.`id` = ar.`activity_id`
	WHERE (a.`client_key` = 'cardio' AND ar.`record_key` = 'cardio-overview')
		OR (a.`client_key` = 'hair-serum' AND ar.`record_key` = 'hair-serum-use-details-needed')
		OR (a.`client_key` = 'kettlebells' AND ar.`record_key` = 'kettlebell-strength-workout')
		OR (a.`client_key` = 'lift' AND ar.`record_key` = 'lift-workout')
		OR (a.`client_key` = 'shower' AND ar.`record_key` = 'shower-routine')
		OR (a.`client_key` = 'stretch' AND ar.`record_key` = 'stretch-yoga-routine')
);
--> statement-breakpoint
DELETE FROM `workspace_revisions`
WHERE `workspace_id` IN (
	SELECT aw.`id`
	FROM `activity_workspaces` aw
	JOIN `activities` a ON a.`id` = aw.`activity_id`
	WHERE a.`client_key` IN ('cardio', 'hair-serum', 'kettlebells', 'lift', 'shower', 'stretch')
);
--> statement-breakpoint
DELETE FROM `activity_workspaces`
WHERE `activity_id` IN (
	SELECT `id` FROM `activities`
	WHERE `client_key` IN ('cardio', 'hair-serum', 'kettlebells', 'lift', 'shower', 'stretch')
);
--> statement-breakpoint
DELETE FROM `agent_jobs`
WHERE `kind` = 'activity_setup'
	AND `activity_id` IN (
		SELECT `id` FROM `activities`
		WHERE `client_key` IN ('cardio', 'hair-serum', 'stretch')
	);
--> statement-breakpoint
UPDATE `activity_profiles`
SET `setup_status` = 'preparing',
	`setup_key` = 'useful-content-reassessment-v1',
	`setup_question_message_id` = NULL,
	`assessed_at` = NULL,
	`updated_at` = CURRENT_TIMESTAMP
WHERE `activity_id` IN (
	SELECT `id` FROM `activities`
	WHERE `client_key` IN ('cardio', 'hair-serum', 'stretch')
);
