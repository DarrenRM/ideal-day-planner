const RESEARCH_REQUEST_PATTERN = /https?:\/\/\S+|www\.\S+|look\s*(?:up|into)|research|investigat(?:e|ion)|find\s+out|verify|check\s+(?:the|its|these|those|spec|into|on)|web\s+(?:access|search)|specification|manufacturer/i;
const ROUTINE_ITEM_INTRODUCTION_PATTERN = /\b(?:use|uses|using|add|adds|added|adding|include|includes|included|have|has|got|started|switched|switching)\b[^.!?\n]{0,180}\b(?:product|device|equipment|toothpaste|toothbrush|brush|serum|retinol|cleanser|moisturi[sz]er|cream|lotion|shampoo|conditioner|supplement|vitamin|medication|medicine|tracker|watch|ring|scale|roller|razor|machine)\b/i;

export function userMessageRequestsResearch(value) {
  const message = String(value || "");
  return RESEARCH_REQUEST_PATTERN.test(message) || ROUTINE_ITEM_INTRODUCTION_PATTERN.test(message);
}

export function researchAcknowledgement(activityTitle) {
  const title = String(activityTitle || "").trim().toLocaleLowerCase();
  return title
    ? `I’ll take a look and keep the useful details with your ${title}.`
    : "I’ll take a look and keep the useful details here.";
}

export function globalResearchAcknowledgement() {
  return "I’ll take a look and update the right part of your routine.";
}
