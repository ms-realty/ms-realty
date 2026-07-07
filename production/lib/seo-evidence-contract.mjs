export const REQUIRED_EXPORTS = ["search_console", "yandex_webmaster", "backlinks"];
export const REQUIRED_SOURCE_DOMAINS = ["makler-realty.com", "makler-realty.ru"];

export function missingRequiredExport(summary) {
  return (
    summary?.status !== "imported" ||
    summary.matched_rows < 1 ||
    summary.signal_rows < 1 ||
    summary.placeholder_rows > 0 ||
    REQUIRED_SOURCE_DOMAINS.some((domain) => !summary.matched_source_domains?.includes(domain))
  );
}

export function missingRequiredSources(sourceSummaries) {
  const missing = REQUIRED_EXPORTS.filter((source) => missingRequiredExport(sourceSummaries[source]));
  const analyticsReady =
    sourceSummaries.privacy_events?.status === "imported" || sourceSummaries.analytics_export?.status === "imported";
  return analyticsReady ? missing : [...missing, "privacy_or_ga4_analytics"];
}

export function assertSeoEvidence(evidence) {
  if (evidence.summary.crawl_urls !== evidence.url_evidence.length) throw new Error("SEO evidence must cover every crawled URL");
  if (evidence.summary.crawl_urls !== 457) throw new Error("SEO evidence must cover the 457 URL migration inventory");
  if (!evidence.summary.sources.privacy_events) throw new Error("SEO evidence must include privacy analytics status");
  if (!Array.isArray(evidence.summary.missing_required_sources)) throw new Error("SEO evidence must summarize missing required sources");
  for (const source of REQUIRED_EXPORTS) {
    if (!evidence.summary.sources[source]) throw new Error(`SEO evidence missing ${source} source status`);
  }
  const expectedMissing = missingRequiredSources(evidence.summary.sources);
  if (JSON.stringify(evidence.summary.missing_required_sources) !== JSON.stringify(expectedMissing)) {
    throw new Error("SEO evidence missing required sources must match source evidence");
  }
  return true;
}
