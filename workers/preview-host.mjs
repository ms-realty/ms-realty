// The production public site is the exact workers.dev origin below. Isolated
// workers.dev drill hosts remain noindex, keyed on the hostname rather than an
// env flag so a drill cannot accidentally become the public authority.
export const PREVIEW_NOINDEX = "noindex, nofollow, noarchive";
export const PRODUCTION_PUBLIC_ORIGIN = "https://ms-realty.ms-realty-bg.workers.dev";
export const PRODUCTION_PUBLIC_HOST = new URL(PRODUCTION_PUBLIC_ORIGIN).hostname;

function normalizedHostname(hostname) {
  return String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
}

export function isProductionPublicHost(hostname) {
  return normalizedHostname(hostname) === PRODUCTION_PUBLIC_HOST;
}

export function isPreviewHost(hostname) {
  const host = normalizedHostname(hostname);
  return host.endsWith(".workers.dev") && !isProductionPublicHost(host);
}
