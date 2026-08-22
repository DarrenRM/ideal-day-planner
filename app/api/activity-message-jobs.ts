import { getD1 } from "../../db";
import { safeId } from "./agent-store";
import { messageHasScheduleIntent } from "../schedule-intent";
import { messageRequestsResearch, researchAcknowledgement } from "../research-intent";

export function activityMessageJobStatements(input: {
  userId: string;
  activityId: string;
  activityVariantId?: string | null;
  conversationId: string;
  sourceMessageId: string;
  clientMessageId: string;
  body: string;
  activityTitle: string;
}) {
  const db = getD1();
  const base = safeId(input.clientMessageId);
  const researchRequested = messageRequestsResearch(input.body);
  const jobKind = researchRequested ? "workspace_refresh" : "user_message";
  const statements = [];
  if (researchRequested) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO conversation_messages
        (id, conversation_id, role, body, source)
      VALUES (?, ?, 'luna', ?, 'agent')
    `).bind(
      `${input.sourceMessageId}:luna-ack`,
      input.conversationId,
      researchAcknowledgement(input.activityTitle),
    ));
  }
  statements.push(db.prepare(`
    INSERT OR IGNORE INTO agent_jobs
      (id, user_id, scope_type, activity_id, activity_variant_id, conversation_id, kind, idempotency_key, source_message_id)
    VALUES (?, ?, 'activity', ?, ?, ?, ?, ?, ?)
  `).bind(
    `agent-job:${safeId(input.userId)}:${researchRequested ? "research" : "message"}:${base}`,
    input.userId,
    input.activityId,
    input.activityVariantId ?? null,
    input.conversationId,
    jobKind,
    `${researchRequested ? "research" : "user-message"}:${input.sourceMessageId}`,
    input.sourceMessageId,
  ));

  if (messageHasScheduleIntent(input.body)) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO agent_jobs
        (id, user_id, scope_type, activity_id, activity_variant_id, conversation_id, kind, idempotency_key, source_message_id)
      VALUES (?, ?, 'global', ?, ?, ?, 'global_message', ?, ?)
    `).bind(
      `agent-job:${safeId(input.userId)}:schedule:${base}`,
      input.userId,
      input.activityId,
      input.activityVariantId ?? null,
      input.conversationId,
      `schedule-message:${input.sourceMessageId}`,
      input.sourceMessageId,
    ));
  }
  return statements;
}
