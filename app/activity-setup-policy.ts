type ActivitySetupIdentity = {
  category: string;
};

function safeSetupKey(value: string) {
  return encodeURIComponent(value).replaceAll("%", "_");
}

export function activitySetupKey(activity: ActivitySetupIdentity) {
  // This key versions the setup interview, not the component catalog. Catalog
  // additions with deterministic backfills must not make every established
  // activity silently run setup again when it is opened.
  return safeSetupKey(`workspace-catalog-v4:${activity.category.trim().toLowerCase()}`).slice(0, 180);
}

export function activitySetupKeyMatches(setupKey: string, activity: ActivitySetupIdentity) {
  if (setupKey === activitySetupKey(activity)) return true;

  const legacyPrefixes = [safeSetupKey("workspace-catalog-v2:")];
  const legacyCategorySuffix = safeSetupKey(`:${activity.category.trim().toLowerCase()}`);
  return legacyPrefixes.some((prefix) => setupKey.startsWith(prefix)) && setupKey.endsWith(legacyCategorySuffix);
}
