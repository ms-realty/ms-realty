// The exact workers.dev host remains the operational/admin origin. Isolated
// workers.dev drill hosts remain noindex, keyed on the hostname rather than an
// env flag so a drill cannot accidentally become a public authority.
export const PREVIEW_NOINDEX = "noindex, nofollow, noarchive";
export const PRODUCTION_PUBLIC_ORIGIN = "https://ms-realty.ms-realty-bg.workers.dev";
export const PRODUCTION_PUBLIC_HOST = new URL(PRODUCTION_PUBLIC_ORIGIN).hostname;
export const CANONICAL_PUBLIC_HOST = "makler-realty.com";

function normalizedHostname(hostname) {
  return String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
}

export function mediaCandidateKeys(hostname, pathname) {
  const host = normalizedHostname(hostname);
  if (host === PRODUCTION_PUBLIC_HOST) {
    return [
      `${PRODUCTION_PUBLIC_HOST}${pathname}`,
      `makler-realty.com${pathname}`,
      `makler-realty.ru${pathname}`,
    ];
  }
  if (host.endsWith("makler-realty.ru")) return [`makler-realty.ru${pathname}`];
  if (host.endsWith("makler-realty.com")) return [`makler-realty.com${pathname}`];
  return [`makler-realty.com${pathname}`, `makler-realty.ru${pathname}`];
}

export function isProductionPublicHost(hostname) {
  return normalizedHostname(hostname) === PRODUCTION_PUBLIC_HOST;
}

export function isCanonicalPublicHost(hostname) {
  return normalizedHostname(hostname) === CANONICAL_PUBLIC_HOST;
}

export function canonicalLegacyHost(hostname) {
  const host = normalizedHostname(hostname);
  return ["www.makler-realty.com", "www.makler-realty.ru"].includes(host) ? host.slice(4) : "";
}

export function isPreviewHost(hostname) {
  const host = normalizedHostname(hostname);
  return host.endsWith(".workers.dev") && !isProductionPublicHost(host);
}
