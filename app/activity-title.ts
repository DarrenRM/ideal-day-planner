export function derivedDisplayTitle(title: string, variantName?: string | null, label?: string | null) {
  const suffix = label?.trim() || variantName?.trim();
  return suffix ? `${title} — ${suffix}` : title;
}
