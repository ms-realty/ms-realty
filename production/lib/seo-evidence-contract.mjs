export const REQUIRED_EXPORTS = ["search_console", "yandex_webmaster", "backlinks"];
export const REQUIRED_SOURCE_DOMAINS = ["makler-realty.com", "makler-realty.ru"];
const SEO_SOURCE_STATUSES = new Set(["missing_export", "empty_export", "imported"]);

export function missingRequiredExport(summary) {
  if (
    summary?.status === "imported" &&
    summary.verified_zero_result === true &&
    summary.row_count === 0 &&
    /^[a-f0-9]{64}$/.test(summary.input_sha256 || "")
  ) {
    return false;
  }
  return (
    summary?.status !== "imported" ||
    summary.matched_rows < 1 ||
    summary.template_copy === true ||
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
  if (!SEO_SOURCE_STATUSES.has(summary?.status)) throw new Error(`SEO evidence ${source} status must be known`);
  if (summary.status !== "missing_export") {
    if (!/^[a-f0-9]{64}$/.test(summary.input_sha256 || "")) {
      throw new Error(`SEO evidence ${source} input hash must be a lowercase SHA-256 digest`);
    }
    if (!Number.isInteger(summary.input_bytes) || summary.input_bytes < 1) {
      throw new Error(`SEO evidence ${source} input bytes must be a positive integer`);
    }
  }
  for (const key of ["row_count", "matched_rows", "unmatched_rows", "duplicate_rows", "signal_rows", "placeholder_rows"]) {
    if (!Number.isInteger(summary?.[key]) || summary[key] < 0) {
      throw new Error(`SEO evidence ${source} counts must be non-negative integers`);
    }
  }
  if (!Array.isArray(summary.matched_source_domains)) {
    throw new Error(`SEO evidence ${source} matched domains must be an array`);
  }
  if (!Array.isArray(summary.signal_source_domains)) {
    throw new Error(`SEO evidence ${source} signal domains must be an array`);
  }
  if (new Set(summary.matched_source_domains).size !== summary.matched_source_domains.length) {
    throw new Error(`SEO evidence ${source} matched domains must be unique`);
  }
  if (new Set(summary.signal_source_domains).size !== summary.signal_source_domains.length) {
    throw new Error(`SEO evidence ${source} signal domains must be unique`);
  }
  for (const domain of summary.matched_source_domains) {
    if (!REQUIRED_SOURCE_DOMAINS.includes(domain)) {
      throw new Error(`SEO evidence ${source} matched domains must be legacy source domains`);
    }
  }
  for (const domain of summary.signal_source_domains) {
    if (!REQUIRED_SOURCE_DOMAINS.includes(domain)) {
      throw new Error(`SEO evidence ${source} signal domains must be legacy source domains`);
    }
    if (!summary.matched_source_domains.includes(domain)) {
      throw new Error(`SEO evidence ${source} signal domains must match matched domains`);
    }
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
  if ((summary?.signal_source_domains || []).length > (summary?.signal_rows ?? 0)) {
    throw new Error(`SEO evidence ${source} signal domains must not exceed signal rows`);
  }
  if (summary.verified_zero_result === true) {
    if (
      summary.status !== "imported" ||
      [rowCount, matchedRows, unmatchedRows, duplicateRows, summary.signal_rows, summary.placeholder_rows].some((value) => value !== 0)
    ) {
      throw new Error(`SEO evidence ${source} verified zero result must describe an empty imported artifact`);
    }
  } else if (summary.status === "imported" && rowCount === 0) {
    throw new Error(`SEO evidence ${source} empty imported artifact must be verified`);
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

function seoPreflightSourceSummaries(sourceSummaries) {
  return Object.fromEntries(
    [...REQUIRED_EXPORTS, "analytics_export", "privacy_events"]
      .filter((source) => sourceSummaries[source])
      .map((source) => [source, sourceSummaries[source]]),
  );
}

export function buildSeoEvidencePreflightReportFromEvidence(evidence) {
  assertSeoEvidence(evidence);
  const missing = evidence.summary.missing_required_sources;
  return {
    generated_at: evidence.generated_at,
    ready: missing.length === 0,
    status: missing.length ? "blocked" : "ready",
    summary: {
      crawl_urls: evidence.summary.crawl_urls,
      urls_with_any_evidence: evidence.summary.urls_with_any_evidence,
      missing_required_sources: missing,
      sources: seoPreflightSourceSummaries(evidence.summary.sources),
    },
    next_actions: missing.length
      ? [
          "Export Search Console, Yandex Webmaster, and backlink CSVs for both legacy domains.",
          "Place them in migration/external/seo or set MS_REALTY_SEO_EVIDENCE_INPUT_DIR.",
          "Run npm run seo:preflight before launch:preflight.",
        ]
      : ["Run npm run seo:preflight, then npm run launch:preflight with the same SEO evidence input path."],
  };
}

export function assertSeoEvidencePreflightReport(report) {
  if (!report.generated_at || Number.isNaN(Date.parse(report.generated_at))) {
    throw new Error("SEO preflight report must include valid generated_at");
  }
  if (!report.summary || !Array.isArray(report.summary.missing_required_sources)) {
    throw new Error("SEO preflight report must summarize missing required sources");
  }
  const sourceStatuses = {};
  for (const source of REQUIRED_EXPORTS) {
    const sourceStatus = report.summary.sources?.[source];
    if (!sourceStatus) throw new Error(`SEO preflight report missing ${source} source status`);
    assertSeoSourceSummary(sourceStatus, source);
    sourceStatuses[source] = sourceStatus;
  }
  const ready = report.summary.missing_required_sources.length === 0;
  if (report.ready !== ready) throw new Error("SEO preflight ready flag must match missing required sources");
  if (report.status !== (ready ? "ready" : "blocked")) throw new Error("SEO preflight status must match ready flag");
  if (!Array.isArray(report.next_actions) || report.next_actions.length === 0) {
    throw new Error("SEO preflight report must include next actions");
  }
  if (!ready && !report.next_actions.some((action) => action.includes("seo:preflight"))) {
    throw new Error("SEO preflight blocked report must point to seo:preflight");
  }
  if (
    ready &&
    !report.next_actions.some((action) => action.includes("seo:preflight") && action.includes("launch:preflight"))
  ) {
    throw new Error("SEO preflight ready report must point to seo:preflight before launch:preflight");
  }
  for (const source of REQUIRED_EXPORTS) {
    if (ready && missingRequiredExport(sourceStatuses[source])) {
      throw new Error(`SEO preflight ready report requires complete ${source} evidence`);
    }
  }
  const expectedMissing = missingRequiredSources({ ...report.summary.sources, ...sourceStatuses });
  if (report.summary.missing_required_sources.join("|") !== expectedMissing.join("|")) {
    throw new Error("SEO preflight missing required sources must match source statuses");
  }
  return true;
}
