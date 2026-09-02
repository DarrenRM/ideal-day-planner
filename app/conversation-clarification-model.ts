export type ConversationClarificationOption = {
  id: string;
  label: string;
  detail: string;
  response: string;
};

export type ConversationClarificationDraft = {
  body: string;
  options: ConversationClarificationOption[];
};

export type ConversationClarification = ConversationClarificationDraft & {
  id: string;
  status: "pending" | "answered";
  selectedOptionId: string | null;
  sourceAgentJobId: string;
  createdAt: string;
  answeredAt: string | null;
};

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maximum ? text : null;
}

export function parseConversationClarificationDraft(value: unknown): ConversationClarificationDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const body = boundedText(source.body, 500);
  if (!body) return null;
  if (source.options === undefined) return { body, options: [] };
  if (!Array.isArray(source.options) || source.options.length < 2 || source.options.length > 4) return null;

  const options: ConversationClarificationOption[] = [];
  const ids = new Set<string>();
  for (const candidate of source.options) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const option = candidate as Record<string, unknown>;
    const id = boundedText(option.id, 64);
    const label = boundedText(option.label, 90);
    const detail = option.detail === undefined || option.detail === "" ? "" : boundedText(option.detail, 180);
    const response = boundedText(option.response, 800);
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id) || ids.has(id) || !label || detail === null || !response) return null;
    ids.add(id);
    options.push({ id, label, detail, response });
  }
  return { body, options };
}

export function parseStoredClarificationOptions(value: string) {
  try {
    const parsed = parseConversationClarificationDraft({ body: "Stored question", options: JSON.parse(value) });
    return parsed?.options ?? [];
  } catch {
    return [];
  }
}
