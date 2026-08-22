const RESEARCH_REQUEST_PATTERN = /https?:\/\/\S+|www\.\S+|look\s*(?:up|into)|research|investigat(?:e|ion)|find\s+out|verify|check\s+(?:the|its|these|those|spec|into|on)|web\s+(?:access|search)|specification|manufacturer/i;

export function messageRequestsResearch(value: string | null | undefined) {
  return RESEARCH_REQUEST_PATTERN.test(value || "");
}

export function researchAcknowledgement(activityTitle: string | null | undefined) {
  const title = String(activityTitle || "").trim().toLocaleLowerCase();
  return title
    ? `I’ll take a look and keep the useful details with your ${title}.`
    : "I’ll take a look and keep the useful details here.";
}
