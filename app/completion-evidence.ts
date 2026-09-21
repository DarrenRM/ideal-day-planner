// A correction changes effective attribution; the original completion snapshot
// remains evidence of what the app recorded at the time.
export function effectiveCompletedSubjects(details: { completedSubjectKeys?: unknown; correctedSubjectKeys?: unknown }) {
  const values = details.correctedSubjectKeys ?? details.completedSubjectKeys;
  return Array.isArray(values) ? values.filter((key): key is string => typeof key === "string") : [];
}
