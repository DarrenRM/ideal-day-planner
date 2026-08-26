import { getD1 } from "../../db";
import {
  deterministicOnboardingProposal,
  emptyOnboardingAnswers,
  onboardingAnswersSummary,
  onboardingReviewDate,
  parseOnboardingAnswers,
  parseOnboardingCapacity,
  parseOnboardingProposal,
  type OnboardingAnswers,
  type OnboardingCapacity,
  type OnboardingProposal,
  type OnboardingStage,
} from "../onboarding-model";
import { isLocalDate } from "../schedule-model";
import { safeId } from "./agent-store";

const TESTING_PREFIX = "testing-onboarding-v2:";
const OWNER_PREFIX = "testing-onboarding-owner-v2:";
const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
  Light: { icon: "sun", color: "#e8b75f" }, Recharge: { icon: "waves", color: "#67b7ce" }, Training: { icon: "dumbbell", color: "#a8c96d" }, Fuel: { icon: "utensils", color: "#d59662" }, Care: { icon: "sparkles", color: "#d58db5" }, Logistics: { icon: "briefcase", color: "#7ba6c9" }, Creativity: { icon: "wand", color: "#b58ad6" }, Spirit: { icon: "heart", color: "#9a8ed8" },
};

export type TestingOnboardingSession = { stage: OnboardingStage; answers: OnboardingAnswers; capacity: OnboardingCapacity | null; revisionRequest: string | null; proposal: OnboardingProposal | null; confirmationDate: string | null; error: string | null };
export type TestingDayItem = { id: string; title: string; category: string; icon: string; color: string; durationMinutes: number; planRole: "essential" | "extra"; activatedAt: string | null; completedAt: string | null };

let schemaPromise: Promise<void> | null = null;
type OnboardingTarget = { direct?: boolean };
export function testingOnboardingUserId(ownerUserId: string, target: OnboardingTarget = {}) { return target.direct ? ownerUserId : `${TESTING_PREFIX}${safeId(ownerUserId).slice(0, 180)}`; }
export function isTestingOnboardingUserId(userId: string) { return userId.startsWith(TESTING_PREFIX) && userId.length > TESTING_PREFIX.length; }
function testingOwnerKey(ownerUserId: string, target: OnboardingTarget = {}) { return `${OWNER_PREFIX}${target.direct ? "direct" : "sandbox"}:${safeId(ownerUserId).slice(0, 170)}`; }

export async function ensureOnboardingTestingSchema() {
  if (!schemaPromise) {
    const db = getD1();
    schemaPromise = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS onboarding_test_sessions (
        id text PRIMARY KEY NOT NULL, user_id text NOT NULL, owner_user_id text NOT NULL,
        stage text DEFAULT 'welcome' NOT NULL, goals text DEFAULT '' NOT NULL, capacity text,
        revision_request text, proposal_json text, confirmation_date text, error text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS onboarding_test_sessions_user_unique ON onboarding_test_sessions (user_id)"),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS onboarding_test_sessions_owner_unique ON onboarding_test_sessions (owner_user_id)"),
    ]).then(() => undefined).catch((error: unknown) => { schemaPromise = null; throw error; });
  }
  return schemaPromise;
}

function sessionIds(ownerUserId: string, target: OnboardingTarget = {}) {
  const userId = testingOnboardingUserId(ownerUserId, target); const segment = safeId(userId);
  return { userId, ownerKey: testingOwnerKey(ownerUserId, target), sessionId: `onboarding-session:${segment}`, conversationId: `conversation:${segment}:onboarding`, templateId: `template:${segment}:default` };
}

function parseStoredAnswers(value: string | null) { if (!value) return emptyOnboardingAnswers(); try { return parseOnboardingAnswers(JSON.parse(value)) || emptyOnboardingAnswers(); } catch { return emptyOnboardingAnswers(); } }
function parseStoredProposal(value: string | null, capacity: OnboardingCapacity | null) { if (!value || !capacity) return null; try { return parseOnboardingProposal(JSON.parse(value), capacity); } catch { return null; } }

export async function ensureTestingSession(ownerUserId: string, target: OnboardingTarget = {}) {
  await ensureOnboardingTestingSchema(); const db = getD1(); const ids = sessionIds(ownerUserId, target);
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").bind(ids.userId),
    db.prepare("INSERT OR IGNORE INTO onboarding_test_sessions (id, user_id, owner_user_id, goals) VALUES (?, ?, ?, ?)").bind(ids.sessionId, ids.userId, ids.ownerKey, JSON.stringify(emptyOnboardingAnswers())),
    db.prepare("INSERT OR IGNORE INTO conversations (id, user_id, scope_type) VALUES (?, ?, 'onboarding')").bind(ids.conversationId, ids.userId),
  ]);
  return ids;
}

export async function readTestingSession(ownerUserId: string, target: OnboardingTarget = {}): Promise<TestingOnboardingSession> {
  const ids = await ensureTestingSession(ownerUserId, target);
  const row = await getD1().prepare(`SELECT stage, goals, capacity, revision_request AS revisionRequest, proposal_json AS proposalJson, confirmation_date AS confirmationDate, error FROM onboarding_test_sessions WHERE user_id = ? AND owner_user_id = ?`).bind(ids.userId, ids.ownerKey).first<{ stage: OnboardingStage; goals: string; capacity: string | null; revisionRequest: string | null; proposalJson: string | null; confirmationDate: string | null; error: string | null }>();
  const answers = parseStoredAnswers(row?.goals || null); const capacity = answers.capacity || parseOnboardingCapacity(row?.capacity);
  return { stage: row?.stage || "welcome", answers: { ...answers, capacity }, capacity, revisionRequest: row?.revisionRequest || null, proposal: parseStoredProposal(row?.proposalJson || null, capacity), confirmationDate: row?.confirmationDate || null, error: row?.error || null };
}

export async function updateTestingStage(ownerUserId: string, input: { stage: OnboardingStage; answers?: OnboardingAnswers; error?: string | null }, target: OnboardingTarget = {}) {
  const ids = await ensureTestingSession(ownerUserId, target); const answers = input.answers ? parseOnboardingAnswers(input.answers) : null;
  if (input.answers && !answers) throw new Error("Those onboarding choices are not valid.");
  await getD1().prepare(`UPDATE onboarding_test_sessions SET stage = ?, goals = COALESCE(?, goals), capacity = COALESCE(?, capacity), error = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND owner_user_id = ?`).bind(input.stage, answers ? JSON.stringify(answers) : null, answers?.capacity || null, input.error ?? null, ids.userId, ids.ownerKey).run();
}

export async function queueOnboardingProposal(ownerUserId: string, input: { answers: OnboardingAnswers; revisionRequest?: string | null; currentProposal?: OnboardingProposal | null }, target: OnboardingTarget = {}) {
  const answers = parseOnboardingAnswers(input.answers); if (!answers?.capacity || !answers.priorities.length || !answers.rhythms.length) throw new Error("Finish the onboarding questions first.");
  const ids = await ensureTestingSession(ownerUserId, target); const db = getD1(); const nonce = crypto.randomUUID(); const messageId = `message:${safeId(ids.userId)}:${nonce}`; const jobId = `agent-job:onboarding:${safeId(ids.userId)}:${nonce}`;
  const prompt = input.revisionRequest ? `Revise my proposed starting Essentials: ${input.revisionRequest}` : `Build candidate starting Essentials from my onboarding choices: ${onboardingAnswersSummary(answers)}`;
  await db.batch([
    db.prepare(`UPDATE onboarding_test_sessions SET stage = 'preparing', goals = ?, capacity = ?, revision_request = ?, proposal_json = COALESCE(?, proposal_json), error = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND owner_user_id = ?`).bind(JSON.stringify(answers), answers.capacity, input.revisionRequest || null, input.currentProposal ? JSON.stringify(input.currentProposal) : null, ids.userId, ids.ownerKey),
    db.prepare("INSERT INTO conversation_messages (id, conversation_id, role, body, source) VALUES (?, ?, 'user', ?, 'onboarding')").bind(messageId, ids.conversationId, prompt),
    db.prepare("INSERT INTO agent_jobs (id, user_id, scope_type, conversation_id, kind, idempotency_key, source_message_id) VALUES (?, ?, 'onboarding', ?, 'onboarding_proposal', ?, ?)").bind(jobId, ids.userId, ids.conversationId, `onboarding:${nonce}`, messageId),
  ]);
  return jobId;
}

export async function onboardingJobContext(userId: string) {
  await ensureOnboardingTestingSchema();
  const row = await getD1().prepare("SELECT goals, capacity, revision_request AS revisionRequest, proposal_json AS proposalJson FROM onboarding_test_sessions WHERE user_id = ?").bind(userId).first<{ goals: string; capacity: string; revisionRequest: string | null; proposalJson: string | null }>();
  const answers = parseStoredAnswers(row?.goals || null); const capacity = answers.capacity || parseOnboardingCapacity(row?.capacity);
  if (!row || !capacity || !answers.priorities.length || !answers.rhythms.length) return null;
  return { scope: "onboarding", answers, goals: onboardingAnswersSummary({ ...answers, capacity }), capacity, revisionRequest: row.revisionRequest, currentProposal: parseStoredProposal(row.proposalJson, capacity) };
}

export async function completeOnboardingProposal(userId: string, value: unknown) {
  const context = await onboardingJobContext(userId); if (!context) return null;
  const proposal = parseOnboardingProposal(value, context.capacity); if (!proposal) return null;
  await getD1().prepare("UPDATE onboarding_test_sessions SET stage = 'proposal', proposal_json = ?, revision_request = NULL, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").bind(JSON.stringify(proposal), userId).run();
  return proposal;
}

export async function buildFallbackProposal(ownerUserId: string, target: OnboardingTarget = {}) {
  const session = await readTestingSession(ownerUserId, target); if (!session.capacity) throw new Error("Finish the onboarding questions first.");
  const proposal = deterministicOnboardingProposal(session.answers); const ids = sessionIds(ownerUserId, target);
  await getD1().prepare("UPDATE onboarding_test_sessions SET stage = 'proposal', proposal_json = ?, revision_request = NULL, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND owner_user_id = ?").bind(JSON.stringify(proposal), ids.userId, ids.ownerKey).run();
  return proposal;
}

export async function failOnboardingProposal(userId: string, message: string) { await ensureOnboardingTestingSchema(); await getD1().prepare("UPDATE onboarding_test_sessions SET stage = 'error', error = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").bind(message.slice(0, 500), userId).run(); }

export async function confirmTestingProposal(ownerUserId: string, date: string, value: unknown, target: OnboardingTarget = {}) {
  if (!isLocalDate(date)) throw new Error("A valid local date is required."); const session = await readTestingSession(ownerUserId, target); if (!session.capacity) throw new Error("Choose a coaching pace before starting.");
  const proposal = parseOnboardingProposal(value, session.capacity); if (!proposal) throw new Error("Choose between three and six starting Essentials.");
  const accepted = proposal.activities.filter((activity) => activity.selected); const ids = sessionIds(ownerUserId, target); const db = getD1(); const planId = `plan:${safeId(ids.userId)}:${date}`; const reviewDate = onboardingReviewDate(date, proposal);
  const statements = [
    db.prepare("INSERT OR IGNORE INTO routine_templates (id, user_id, name, start_minutes) VALUES (?, ?, 'Ideal Day', 480)").bind(ids.templateId, ids.userId),
    db.prepare("INSERT OR IGNORE INTO settings (user_id, day_timeline_enabled, pull_forward_after_early_completion) VALUES (?, 0, 0)").bind(ids.userId),
    db.prepare("INSERT OR IGNORE INTO daily_plans (id, user_id, plan_date, template_id, start_minutes) VALUES (?, ?, ?, ?, 480)").bind(planId, ids.userId, date, ids.templateId),
  ];
  accepted.forEach((activity, position) => {
    const style = CATEGORY_STYLE[activity.category] || CATEGORY_STYLE.Recharge; const activityId = `activity:${safeId(ids.userId)}:${activity.key}`; const patternId = `pattern:${safeId(ids.userId)}:${activity.key}`; const stepId = `pattern-step:${safeId(ids.userId)}:${activity.key}`; const itemId = `item:${safeId(ids.userId)}:${date}:${activity.key}`; const conversationId = `conversation:${safeId(ids.userId)}:${activity.key}`;
    statements.push(
      db.prepare("INSERT OR REPLACE INTO activities (id, user_id, client_key, title, category, icon, color, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'luna', COALESCE((SELECT created_at FROM activities WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)").bind(activityId, ids.userId, activity.key, activity.title, activity.category, style.icon, style.color, activityId),
      db.prepare("INSERT OR REPLACE INTO routine_items (id, routine_id, activity_id, position, duration, created_at, updated_at) VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM routine_items WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)").bind(`routine-item:${safeId(ids.userId)}:${activity.key}`, ids.templateId, activityId, position, activity.durationMinutes, `routine-item:${safeId(ids.userId)}:${activity.key}`),
      db.prepare("INSERT OR REPLACE INTO schedule_patterns (id, user_id, routine_id, client_key, name, position, cadence_json, advancement_json, anchor_date, initial_step_position, effective_date, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '{\"kind\":\"daily\"}', '{\"kind\":\"calendar\"}', ?, 0, ?, 1, COALESCE((SELECT created_at FROM schedule_patterns WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)").bind(patternId, ids.userId, ids.templateId, `daily-${activity.key}`, activity.title, position, date, date, patternId),
      db.prepare("INSERT OR REPLACE INTO schedule_pattern_steps (id, pattern_id, activity_id, position, duration_minutes, plan_role, created_at, updated_at) VALUES (?, ?, ?, 0, ?, 'essential', COALESCE((SELECT created_at FROM schedule_pattern_steps WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)").bind(stepId, patternId, activityId, activity.durationMinutes, stepId),
      db.prepare("INSERT OR REPLACE INTO daily_plan_items (id, daily_plan_id, activity_id, occurrence_key, schedule_pattern_id, schedule_pattern_step_id, client_key, title, category, icon, color, position, duration, plan_role, activated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'essential', CURRENT_TIMESTAMP, COALESCE((SELECT created_at FROM daily_plan_items WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)").bind(itemId, planId, activityId, `${patternId}:${date}`, patternId, stepId, activity.key, activity.title, activity.category, style.icon, style.color, position, activity.durationMinutes, itemId),
      db.prepare("INSERT OR IGNORE INTO conversations (id, user_id, scope_type, activity_id) VALUES (?, ?, 'activity', ?)").bind(conversationId, ids.userId, activityId),
      db.prepare("INSERT OR REPLACE INTO activity_profiles (id, user_id, activity_id, setup_status, setup_key, assessed_at, created_at, updated_at) VALUES (?, ?, ?, 'unnecessary', ?, CURRENT_TIMESTAMP, COALESCE((SELECT created_at FROM activity_profiles WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)").bind(`activity-profile:${safeId(ids.userId)}:${activity.key}`, ids.userId, activityId, `onboarding:${activity.key}`, `activity-profile:${safeId(ids.userId)}:${activity.key}`),
    );
  });
  statements.push(db.prepare("UPDATE routine_templates SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(ids.templateId), db.prepare("UPDATE onboarding_test_sessions SET stage = 'active', proposal_json = ?, confirmation_date = ?, error = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND owner_user_id = ?").bind(JSON.stringify(proposal), date, ids.userId, ids.ownerKey));
  await db.batch(statements); return { proposal, reviewDate };
}

export async function readTestingDay(ownerUserId: string, date: string, target: OnboardingTarget = {}) { if (!isLocalDate(date)) throw new Error("A valid local date is required."); const userId = testingOnboardingUserId(ownerUserId, target); const rows = await getD1().prepare("SELECT dpi.id, dpi.title, dpi.category, dpi.icon, dpi.color, dpi.duration AS durationMinutes, dpi.plan_role AS planRole, dpi.activated_at AS activatedAt, dpi.completed_at AS completedAt FROM daily_plan_items dpi JOIN daily_plans dp ON dp.id = dpi.daily_plan_id WHERE dp.user_id = ? AND dp.plan_date = ? AND dpi.removed_at IS NULL ORDER BY dpi.position").bind(userId, date).all<TestingDayItem>(); return rows.results; }

export async function toggleTestingItem(ownerUserId: string, date: string, itemId: string, completed: boolean, target: OnboardingTarget = {}) {
  if (!isLocalDate(date)) throw new Error("A valid local date is required."); const userId = testingOnboardingUserId(ownerUserId, target); const db = getD1(); const item = await db.prepare("SELECT dpi.id, dpi.activity_id AS activityId FROM daily_plan_items dpi JOIN daily_plans dp ON dp.id = dpi.daily_plan_id WHERE dpi.id = ? AND dp.user_id = ? AND dp.plan_date = ? AND dpi.removed_at IS NULL").bind(itemId, userId, date).first<{ id: string; activityId: string }>(); if (!item) throw new Error("That testing activity is no longer available."); const runId = `activity-run:${safeId(itemId)}`;
  if (completed) await db.batch([db.prepare("UPDATE daily_plan_items SET activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP), completed_at = CURRENT_TIMESTAMP, skipped_at = NULL, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(itemId), db.prepare("INSERT OR REPLACE INTO activity_runs (id, user_id, activity_id, daily_plan_item_id, plan_date, status, planned_duration_seconds, completed_at, created_at, updated_at) SELECT ?, ?, activity_id, id, ?, 'completed', duration * 60, CURRENT_TIMESTAMP, COALESCE((SELECT created_at FROM activity_runs WHERE id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP FROM daily_plan_items WHERE id = ?").bind(runId, userId, date, runId, itemId)]);
  else await db.batch([db.prepare("UPDATE daily_plan_items SET completed_at = NULL, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(itemId), db.prepare("DELETE FROM activity_runs WHERE id = ? AND user_id = ?").bind(runId, userId)]);
}

export async function resetTestingOnboarding(ownerUserId: string, target: OnboardingTarget = {}) { await ensureOnboardingTestingSchema(); const userId = testingOnboardingUserId(ownerUserId, target); if (!target.direct && !isTestingOnboardingUserId(userId)) throw new Error("Testing reset target was invalid."); await getD1().prepare("DELETE FROM users WHERE id = ?").bind(userId).run(); }
