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
  if (!evidence.generated_at || Number.isNaN(Date.parse(evidence.generated_at))) {
    throw new Error("SEO evidence must include valid generated_at");
  }
  if (evidence.summary.crawl_urls !== evidence.url_evidence.length) throw new Error("SEO evidence must cover every crawled URL");
  if (evidence.summary.crawl_urls !== 457) throw new Error("SEO evidence must cover the 457 URL migration inventory");
  const urlTypeTotal = Object.values(evidence.summary.url_types || {}).reduce((sum, count) => sum + count, 0);
  if (urlTypeTotal !== evidence.summary.crawl_urls) throw new Error("SEO evidence URL type counts must match crawl URLs");
  const urlsWithAnyEvidence = evidence.url_evidence.filter(
    (row) =>
      row.search_console?.impressions ||
      row.yandex_webmaster?.rows ||
      row.backlinks?.backlinks ||
      row.analytics?.page_views ||
      row.analytics?.exported_page_views,
  ).length;
  if (evidence.summary.urls_with_any_evidence !== urlsWithAnyEvidence) {
    throw new Error("SEO evidence URL evidence count must match URL rows");
  }
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
