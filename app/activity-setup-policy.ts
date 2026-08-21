type ActivitySetupIdentity = {
  category: string;
};

function safeSetupKey(value: string) {
  return encodeURIComponent(value).replaceAll("%", "_");
}

export function activitySetupKey(activity: ActivitySetupIdentity) {
  return safeSetupKey(`workspace-catalog-v3:${activity.category.trim().toLowerCase()}`).slice(0, 180);
}

export function activitySetupKeyMatches(setupKey: string, activity: ActivitySetupIdentity) {
  if (setupKey === activitySetupKey(activity)) return true;

  const legacyPrefix = safeSetupKey("workspace-catalog-v2:");
  const legacyCategorySuffix = safeSetupKey(`:${activity.category.trim().toLowerCase()}`);
  return setupKey.startsWith(legacyPrefix) && setupKey.endsWith(legacyCategorySuffix);
}
