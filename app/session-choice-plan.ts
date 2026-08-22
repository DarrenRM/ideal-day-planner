export type SessionChoicePlanData = {
  options?: Array<{ id: string; label: string }>;
  selections?: Array<{ date: string; optionId: string }>;
  activeSelection?: { optionId: string; startDate: string; endDate: string; reason?: string };
};

export type SessionChoiceFollowUp = {
  id: string;
  title: string;
  question: string;
  dueDate: string;
  sourceDate: string;
};

export function inferSessionChoicePlan(data: SessionChoicePlanData, followUps: SessionChoiceFollowUp[]) {
  if (data.activeSelection || !data.options?.length) return null;
  for (const followUp of followUps) {
    const language = `${followUp.title} ${followUp.question}`.toLowerCase();
    if (!/(trial|week|month|until|check[ -]?(?:back|in)|for the next)/i.test(language)) continue;
    const matchedOptions = data.options.filter((option) => language.includes(option.label.toLowerCase()));
    if (matchedOptions.length !== 1 || followUp.dueDate < followUp.sourceDate) continue;
    const optionId = matchedOptions[0].id;
    const selectedStart = (data.selections ?? [])
      .filter((selection) => selection.optionId === optionId && selection.date >= followUp.sourceDate && selection.date <= followUp.dueDate)
      .map((selection) => selection.date)
      .sort()[0];
    return {
      followUpId: followUp.id,
      optionId,
      startDate: selectedStart ?? followUp.sourceDate,
      endDate: followUp.dueDate,
      reason: followUp.title,
    };
  }
  return null;
}
