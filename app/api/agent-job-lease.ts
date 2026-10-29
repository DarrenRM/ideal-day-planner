// A job whose lease runs out is leased again, up to three attempts. When the third attempt stops
// responding there is no retry left, so the job is marked failed. Without this it would stay
// "in progress" in the conversation forever, and the retry action only offers failed jobs.
export const MAX_JOB_ATTEMPTS = 3;

export const FAIL_ABANDONED_FINAL_ATTEMPTS = `
  UPDATE agent_jobs
  SET status = 'failed', lease_token = NULL, lease_owner = NULL, lease_expires_at = NULL,
      error = 'The final attempt stopped responding before it finished.',
      updated_at = CURRENT_TIMESTAMP
  WHERE status IN ('leased', 'running')
    AND attempts >= ${MAX_JOB_ATTEMPTS}
    AND lease_expires_at < CURRENT_TIMESTAMP
`;
