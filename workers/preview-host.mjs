// The sitemap and every canonical URL point at makler-realty.com, so anything a
// *.workers.dev host serves is a duplicate of the domain that is supposed to
// keep 13 years of search equity. Keyed on the hostname, not an env flag, so
// attaching the real domain switches indexing on by itself.
export const PREVIEW_NOINDEX = "noindex, nofollow, noarchive";

export function isPreviewHost(hostname) {
  return String(hostname || "")
    .toLowerCase()
    .endsWith(".workers.dev");
}
