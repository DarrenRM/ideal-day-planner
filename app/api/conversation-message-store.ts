import type { getD1 } from "../../db";

export async function readStoredConversationMessages(db: ReturnType<typeof getD1>, conversationId: string) {
  const result = await db.prepare(`
    SELECT message.id, message.role AS author, message.source,
           CASE WHEN message.source = 'clarification'
             THEN 'Selected option: ' || COALESCE(json_extract(option.value, '$.label'), 'Answer recorded')
               || CASE WHEN COALESCE(json_extract(option.value, '$.detail'), '') <> ''
                 THEN char(10) || json_extract(option.value, '$.detail') ELSE '' END
             ELSE message.body END AS body,
           message.agent_job_id AS agentJobId, message.created_at AS createdAt
    FROM conversation_messages message
    LEFT JOIN conversation_clarifications clarification ON clarification.response_message_id = message.id
    LEFT JOIN json_each(clarification.options_json) option ON json_extract(option.value, '$.id') = clarification.selected_option_id
    WHERE message.conversation_id = ?
    ORDER BY message.created_at ASC, message.id ASC
    LIMIT 200
  `).bind(conversationId).all<{
    id: string; author: "user" | "luna"; source: string; body: string;
    agentJobId: string | null; createdAt: string;
  }>();
  return result.results;
}
