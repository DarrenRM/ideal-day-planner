import { getD1 } from "../../db";
import { parseScheduleProposal, type SchedulePattern, type ScheduleProposalDocument } from "../schedule-model";
import { safeId } from "./agent-store";
import { resolveDay } from "./schedule-store";

type ProposalRow = {
  id: string;
  status: string;
  baseRevision: number;
  documentJson: string;
  conversationId: string;
  sourceMessageId: string | null;
  sourceAgentJobId: string | null;
};

const CATEGORY_STYLE: Record<string, { icon: string; color: string }> = {
  Light: { icon: "☼", color: "#f2c75c" }, Recharge: { icon: "◒", color: "#6fc7d9" },
  Training: { icon: "↑", color: "#a8c96d" }, Fuel: { icon: "◇", color: "#e3a35f" },
  Care: { icon: "✦", color: "#d886b7" }, Logistics: { icon: "□", color: "#87a7d6" },
  Creativity: { icon: "✎", color: "#b898d8" }, Spirit: { icon: "◌", color: "#d8c878" },
};

function patternStatements(db: ReturnType<typeof getD1>, userId: string, routineId: string, patternId: string, clientKey: string, pattern: Omit<SchedulePattern, "id" | "revision">, mode: "create" | "replace", expectedRevision?: number) {
  const statements = mode === "replace"
    ? [
        db.prepare(`
          UPDATE schedule_patterns
          SET name = ?, position = ?, cadence_json = ?, advancement_json = ?, anchor_date = ?,
              initial_step_position = ?, effective_date = ?, end_date = ?, revision = revision + 1,
              archived_at = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ? AND routine_id = ? AND revision = ?
        `).bind(
          pattern.name, pattern.position, JSON.stringify(pattern.cadence), JSON.stringify(pattern.advancement),
          pattern.anchorDate, pattern.initialStepPosition, pattern.effectiveDate, pattern.endDate,
          patternId, userId, routineId, expectedRevision,
        ),
        db.prepare("DELETE FROM schedule_pattern_steps WHERE pattern_id = ?").bind(patternId),
      ]
    : [db.prepare(`
        INSERT INTO schedule_patterns
          (id, user_id, routine_id, client_key, name, position, cadence_json,
           advancement_json, anchor_date, initial_step_position, effective_date, end_date, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(
        patternId, userId, routineId, clientKey, pattern.name, pattern.position,
        JSON.stringify(pattern.cadence), JSON.stringify(pattern.advancement), pattern.anchorDate,
        pattern.initialStepPosition, pattern.effectiveDate, pattern.endDate,
      )];
  statements.push(...pattern.steps.map((step, index) => db.prepare(`
    INSERT INTO schedule_pattern_steps
      (id, pattern_id, activity_id, activity_variant_id, position, duration_minutes, display_label_override, plan_role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    `schedule-step:${safeId(patternId)}:${index}`,
    patternId,
    step.activityId,
    step.activityVariantId,
    index,
    step.durationMinutes,
    step.displayLabelOverride,
    step.planRole,
  )));
  return statements;
}

export async function applyScheduleProposal(userId: string, proposalId: string) {
  const db = getD1();
  const proposalRow = await db.prepare(`
    SELECT id, status, base_revision AS baseRevision, document_json AS documentJson,
           conversation_id AS conversationId, source_message_id AS sourceMessageId,
           source_agent_job_id AS sourceAgentJobId
    FROM schedule_proposals WHERE id = ? AND user_id = ?
  `).bind(proposalId, userId).first<ProposalRow>();
  if (!proposalRow) return { error: "That proposal is no longer available.", status: 404 } as const;
  if (proposalRow.status === "applied") return { applied: true, alreadyApplied: true } as const;
  if (proposalRow.status !== "ready") return { error: "That proposal cannot be applied in its current state.", status: 409 } as const;

  let parsedJson: unknown;
  try { parsedJson = JSON.parse(proposalRow.documentJson); } catch { parsedJson = null; }
  const proposal = parseScheduleProposal(parsedJson);
  if (!proposal) return { error: "That proposal is invalid and was not applied.", status: 409 } as const;
  const routine = await db.prepare(`
    SELECT id, schedule_revision AS revision, start_minutes AS startMinutes FROM routine_templates
    WHERE user_id = ? ORDER BY created_at LIMIT 1
  `).bind(userId).first<{ id: string; revision: number; startMinutes: number }>();
  if (!routine) return { error: "Your routine is not ready yet.", status: 409 } as const;
  if (routine.revision !== proposal.baseRevision || proposalRow.baseRevision !== proposal.baseRevision) {
    await db.prepare("UPDATE schedule_proposals SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .bind(proposalId, userId).run();
    return { error: "Your schedule changed after this was prepared. Ask Luna to refresh the proposal.", code: "stale_revision", status: 409 } as const;
  }

  const activities = await db.prepare("SELECT id, client_key AS clientKey, title, category, icon, color FROM activities WHERE user_id = ?")
    .bind(userId).all<{ id: string; clientKey: string; title: string; category: string; icon: string; color: string }>();
  const ownedActivities = new Set(activities.results.map((row) => row.id));
  const activityMeta = new Map(activities.results.map((row) => [row.id, row]));
  const variants = await db.prepare("SELECT id, activity_id AS activityId, name FROM activity_variants WHERE user_id = ? AND archived_at IS NULL")
    .bind(userId).all<{ id: string; activityId: string; name: string }>();
  const ownedVariants = new Map(variants.results.map((row) => [row.id, row.activityId]));
  const variantNames = new Map(variants.results.map((row) => [row.id, row.name]));
  const patterns = await db.prepare("SELECT id, revision FROM schedule_patterns WHERE user_id = ? AND routine_id = ?")
    .bind(userId, routine.id).all<{ id: string; revision: number }>();
  const ownedPatterns = new Map(patterns.results.map((row) => [row.id, row.revision]));
  const createdActivityIds = new Map<string, string>();
  const createdVariantIds = new Map<string, string>();

  for (const action of proposal.actions) {
    if (action.type !== "create_activity") continue;
    const activityId = `activity:${safeId(userId)}:${safeId(action.clientKey)}`;
    createdActivityIds.set(`proposal:${action.clientKey}`, activityId);
    ownedActivities.add(activityId);
    const style = CATEGORY_STYLE[action.category];
    activityMeta.set(activityId, { id: activityId, clientKey: action.clientKey, title: action.title, category: action.category, icon: style.icon, color: style.color });
  }
  const resolveActivityId = (activityId: string) => createdActivityIds.get(activityId) ?? activityId;

  for (const action of proposal.actions) {
    if (action.type !== "create_variant") continue;
    const activityId = resolveActivityId(action.activityId);
    if (!ownedActivities.has(activityId)) return { error: "A proposed variant references an unavailable activity.", status: 400 } as const;
    const variantId = `activity-variant:${safeId(userId)}:${safeId(action.clientKey)}`;
    createdVariantIds.set(`proposal:${action.clientKey}`, variantId);
    ownedVariants.set(variantId, activityId);
    variantNames.set(variantId, action.name);
  }

  const resolvePattern = (pattern: Omit<SchedulePattern, "id" | "revision">) => ({
    ...pattern,
    steps: pattern.steps.map((step) => ({
      ...step,
      activityId: resolveActivityId(step.activityId),
      activityVariantId: step.activityVariantId ? createdVariantIds.get(step.activityVariantId) ?? step.activityVariantId : null,
    })),
  });

  for (const action of proposal.actions) {
    if (action.type === "create_activity" || action.type === "create_variant") {
      continue;
    } else if (action.type === "update_variant" || action.type === "archive_variant") {
      if (!ownedVariants.has(action.variantId)) return { error: "A proposed variant is unavailable.", status: 400 } as const;
    } else if (action.type === "replace_pattern" || action.type === "archive_pattern") {
      if (ownedPatterns.get(action.patternId) !== action.expectedRevision) return { error: "A schedule in this proposal changed elsewhere.", code: "stale_revision", status: 409 } as const;
    }
    if (action.type === "create_pattern" || action.type === "replace_pattern") {
      const validSteps = resolvePattern(action.pattern).steps.every((step) => (
        ownedActivities.has(step.activityId)
        && (!step.activityVariantId || ownedVariants.get(step.activityVariantId) === step.activityId)
      ));
      if (!validSteps) return { error: "A proposed schedule step references an unavailable activity or variant.", status: 400 } as const;
    } else if (action.type === "add_occurrence") {
      const activityId = resolveActivityId(action.activityId);
      const variantId = action.activityVariantId ? createdVariantIds.get(action.activityVariantId) ?? action.activityVariantId : null;
      if (!ownedActivities.has(activityId) || variantId && ownedVariants.get(variantId) !== activityId) {
        return { error: "A proposed day occurrence references an unavailable activity or variant.", status: 400 } as const;
      }
    }
  }

  const occurrenceDates = [...new Set(proposal.actions.flatMap((action) => action.type === "add_occurrence" ? [action.date] : []))];
  for (const date of occurrenceDates) {
    await resolveDay(userId, date, routine.id, `plan:${safeId(userId)}:${date}`, routine.startMinutes);
  }

  const statements = [];
  for (const [actionIndex, action] of proposal.actions.entries()) {
    if (action.type === "create_activity") {
      const style = CATEGORY_STYLE[action.category];
      statements.push(db.prepare(`
        INSERT INTO activities (id, user_id, client_key, title, category, icon, color, origin)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'luna')
      `).bind(createdActivityIds.get(`proposal:${action.clientKey}`), userId, action.clientKey, action.title, action.category, style.icon, style.color));
    } else if (action.type === "create_variant") {
      const activityId = resolveActivityId(action.activityId);
      const activity = activityMeta.get(activityId)!;
      const variantId = createdVariantIds.get(`proposal:${action.clientKey}`)!;
      const conversationId = `conversation:${safeId(userId)}:${safeId(activity.clientKey)}`;
      statements.push(db.prepare(`
        INSERT INTO activity_variants
          (id, user_id, activity_id, client_key, name, description, default_duration_minutes, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM activity_variants WHERE activity_id = ?), 0))
      `).bind(
        variantId, userId, activityId, action.clientKey,
        action.name, action.description ?? null, action.defaultDurationMinutes ?? null, activityId,
      ));
      statements.push(
        db.prepare(`
          INSERT OR IGNORE INTO conversations (id, user_id, scope_type, activity_id)
          VALUES (?, ?, 'activity', ?)
        `).bind(conversationId, userId, activityId),
        db.prepare(`
          INSERT OR IGNORE INTO agent_jobs
            (id, user_id, scope_type, activity_id, activity_variant_id, conversation_id,
             kind, idempotency_key, source_message_id)
          VALUES (?, ?, 'activity', ?, ?, ?, 'variant_setup', ?, ?)
        `).bind(
          `agent-job:${safeId(userId)}:variant-setup:${safeId(variantId)}`,
          userId, activityId, variantId, conversationId,
          `variant-setup:${proposalId}:${action.clientKey}`,
          proposalRow.sourceMessageId,
        ),
      );
    } else if (action.type === "update_variant") {
      statements.push(db.prepare(`
        UPDATE activity_variants SET
          name = CASE WHEN ? THEN ? ELSE name END,
          description = CASE WHEN ? THEN ? ELSE description END,
          default_duration_minutes = CASE WHEN ? THEN ? ELSE default_duration_minutes END,
          position = CASE WHEN ? THEN ? ELSE position END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).bind(
        action.name !== undefined ? 1 : 0, action.name ?? null,
        action.description !== undefined ? 1 : 0, action.description ?? null,
        action.defaultDurationMinutes !== undefined ? 1 : 0, action.defaultDurationMinutes ?? null,
        action.position !== undefined ? 1 : 0, action.position ?? null,
        action.variantId, userId,
      ));
    } else if (action.type === "archive_variant") {
      statements.push(db.prepare("UPDATE activity_variants SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(action.variantId, userId));
    } else if (action.type === "add_occurrence") {
      const activityId = resolveActivityId(action.activityId);
      const activity = activityMeta.get(activityId)!;
      const variantId = action.activityVariantId ? createdVariantIds.get(action.activityVariantId) ?? action.activityVariantId : null;
      const occurrenceId = `day-item:${safeId(userId)}:${action.date}:proposal:${safeId(proposalId)}:${actionIndex}`;
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO daily_plan_items
          (id, daily_plan_id, activity_id, occurrence_key, activity_variant_id,
           client_key, title, variant_name_snapshot, category, icon, color,
           position, duration, source_date, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(
        occurrenceId, `plan:${safeId(userId)}:${action.date}`, activityId,
        `proposal:${proposalId}:${actionIndex}`, variantId, activity.clientKey, activity.title,
        variantId ? variantNames.get(variantId) ?? null : null, activity.category, activity.icon,
        activity.color, action.position ?? 999, action.durationMinutes, action.date,
      ));
    } else if (action.type === "create_pattern") {
      const patternId = `schedule-pattern:${safeId(userId)}:${safeId(action.clientKey)}`;
      statements.push(...patternStatements(db, userId, routine.id, patternId, action.clientKey, resolvePattern(action.pattern), "create"));
    } else if (action.type === "replace_pattern") {
      statements.push(...patternStatements(db, userId, routine.id, action.patternId, "", resolvePattern(action.pattern), "replace", action.expectedRevision));
    } else if (action.type === "archive_pattern") {
      statements.push(db.prepare(`
        UPDATE schedule_patterns SET archived_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND routine_id = ? AND revision = ?
      `).bind(action.patternId, userId, routine.id, action.expectedRevision));
    }
  }
  statements.push(
    db.prepare("UPDATE routine_templates SET schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND schedule_revision = ?")
      .bind(routine.id, routine.revision),
    db.prepare("UPDATE schedule_proposals SET status = 'applied', applied_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND status = 'ready'")
      .bind(proposalId, userId),
    db.prepare(`
      INSERT OR IGNORE INTO schedule_action_events
        (id, user_id, conversation_id, source_message_id, source_agent_job_id,
         action_type, action_json, source, actor, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'apply_proposal', ?, 'user', ?, ?)
    `).bind(
      `schedule-event:${safeId(userId)}:${safeId(proposalId)}`,
      userId,
      proposalRow.conversationId,
      proposalRow.sourceMessageId,
      proposalRow.sourceAgentJobId,
      JSON.stringify(proposal as ScheduleProposalDocument),
      userId,
      `apply-proposal:${proposalId}`,
    ),
  );
  await db.batch(statements);
  return { applied: true, alreadyApplied: false, revision: routine.revision + 1 } as const;
}
