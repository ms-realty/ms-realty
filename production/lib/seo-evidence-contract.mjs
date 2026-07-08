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

export function assertSeoSourceSummary(summary, source) {
  if (summary?.source && summary.source !== source) throw new Error(`SEO evidence ${source} source name mismatch`);
  for (const key of ["row_count", "matched_rows", "unmatched_rows", "duplicate_rows", "signal_rows", "placeholder_rows"]) {
    if (!Number.isInteger(summary?.[key]) || summary[key] < 0) {
      throw new Error(`SEO evidence ${source} counts must be non-negative integers`);
    }
  }
  if (!Array.isArray(summary.matched_source_domains)) {
    throw new Error(`SEO evidence ${source} matched domains must be an array`);
  }
  const rowCount = summary?.row_count ?? 0;
  const matchedRows = summary?.matched_rows ?? 0;
  const unmatchedRows = summary?.unmatched_rows ?? 0;
  const duplicateRows = summary?.duplicate_rows ?? 0;
  if (rowCount !== matchedRows + unmatchedRows + duplicateRows) {
    throw new Error(`SEO evidence ${source} row counts must match source summary`);
  }
  if ((summary?.signal_rows ?? 0) > matchedRows || (summary?.placeholder_rows ?? 0) > matchedRows) {
    throw new Error(`SEO evidence ${source} signal counts must not exceed matched rows`);
  }
  if ((summary?.matched_source_domains || []).length > matchedRows) {
    throw new Error(`SEO evidence ${source} matched domains must not exceed matched rows`);
  }
}

function assertNonNegativeMetric(row, path) {
  const value = path.split(".").reduce((target, key) => target?.[key], row);
  if (!Number.isFinite(value) || value < 0) throw new Error(`SEO evidence URL metric ${path} must be non-negative`);
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
  for (const row of evidence.url_evidence) {
    if (!row.old_url) throw new Error("SEO evidence URL rows must include old_url");
    if (!REQUIRED_SOURCE_DOMAINS.includes(row.source_domain)) throw new Error("SEO evidence URL rows must include a legacy source domain");
    if (!row.url_type) throw new Error("SEO evidence URL rows must include url_type");
    for (const path of [
      "search_console.clicks",
      "search_console.impressions",
      "search_console.avg_position",
      "yandex_webmaster.rows",
      "yandex_webmaster.issues",
      "backlinks.backlinks",
      "backlinks.referring_domains",
      "analytics.page_views",
      "analytics.searches",
      "analytics.leads",
      "analytics.cta_clicks",
      "analytics.exported_page_views",
    ]) {
      assertNonNegativeMetric(row, path);
    }
  }
  for (const source of REQUIRED_EXPORTS) {
    if (!evidence.summary.sources[source]) throw new Error(`SEO evidence missing ${source} source status`);
    assertSeoSourceSummary(evidence.summary.sources[source], source);
  }
  const expectedMissing = missingRequiredSources(evidence.summary.sources);
  if (JSON.stringify(evidence.summary.missing_required_sources) !== JSON.stringify(expectedMissing)) {
    throw new Error("SEO evidence missing required sources must match source evidence");
  }
  return true;
}
