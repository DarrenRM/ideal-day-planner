const RESEARCH_REQUEST_PATTERN = /https?:\/\/\S+|www\.\S+|look\s*up|research|verify|check\s+(?:the|its|these|those|spec)|web\s+(?:access|search)|specification|manufacturer/i;

export function userMessageRequestsResearch(value) {
  return RESEARCH_REQUEST_PATTERN.test(String(value || ""));
}

export function researchAcknowledgement(activityTitle) {
  const title = String(activityTitle || "").trim().toLocaleLowerCase();
  return title
    ? `I’ll take a look and keep the useful details with your ${title}.`
    : "I’ll take a look and keep the useful details here.";
}
