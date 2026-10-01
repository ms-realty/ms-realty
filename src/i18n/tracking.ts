// Runtime IDs are public configuration, never credentials. Source: the recorded live
// WordPress observation; the independent controller baseline remains launch authority.
export const analyticsConsentCookie = "msr_analytics_consent";
export const analyticsConsentVersion = "v1";
export type AnalyticsPreference = "granted" | "denied" | "unset";
export function analyticsPreference(header: string | null): AnalyticsPreference {
  const values = (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${analyticsConsentCookie}=`));
  // Duplicate/unknown cookie values are ambiguous and do not grant consent.
  if (values.length !== 1) return "unset";
  const value = values[0]?.slice(analyticsConsentCookie.length + 1);
  return value === `${analyticsConsentVersion}.granted`
    ? "granted"
    : value === `${analyticsConsentVersion}.denied`
      ? "denied"
      : "unset";
}
export function analyticsConsent(header: string | null): boolean {
  return analyticsPreference(header) === "granted";
}
export function validGtmContainerId(value: string | undefined): string | null {
  return value && /^GTM-[A-Z0-9]{4,20}$/.test(value) ? value : null;
}
export function trackingConfig(env: Record<string, string | undefined> = process.env) {
  return {
    gtmContainerId: validGtmContainerId(env.GTM_CONTAINER_ID),
    googleVerification:
      env.SITE_GOOGLE_VERIFICATION && /^[A-Za-z0-9_-]{10,200}$/.test(env.SITE_GOOGLE_VERIFICATION)
        ? env.SITE_GOOGLE_VERIFICATION
        : null,
  };
}
// Personal service journeys, entered query values and fragments are never sent by this
// integration. Tag contents still require a separate inspection of the real container.
export function analyticsPagePath(path: string, search: string, hash: string): string | null {
  if (search || hash || /[\\\r\n]/.test(path)) return null;
  return /^\/(bg|en|ru|de|nl|el|he)(\/(areas|services|help)\/[^/]+|\/properties\/[^/]+\/[^/]+|\/legacy\/[0-9a-f]{24})?$/.test(
    path,
  )
    ? path
    : null;
}
