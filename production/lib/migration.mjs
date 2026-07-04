import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_ARTIFACT_DIR = fromRoot("migration", "artifacts", "20260704-211155");
export const DEFAULT_OUTPUT = fromRoot("production", "data", "migration-records.json");
export const DEFAULT_ARTIFACT_ID = "20260704-211155";

function readCsv(filePath) {
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

function keyFor(row) {
  return `${row.source_domain}|${row.sitemap_source}|${row.url}`;
}

function metadataKey(row) {
  return `${row.source_domain}|${row.sitemap_source}|${row.url}`;
}

function redirectKey(row) {
  return row.old_url;
}

function isRootUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" || parsed.pathname === "";
  } catch {
    return false;
  }
}

function metadataGaps(meta) {
  return {
    missingTitle: !meta?.title,
    missingDescription: !meta?.meta_description,
    missingH1: !meta?.h1,
    missingSchema: meta?.schema_present !== "yes" && meta?.schema_present !== "true",
    zeroImages: Number(meta?.image_count || 0) === 0,
  };
}

function reviewState(record) {
  if (record.status !== 200) return "fetch_review";
  if (Object.values(record.metadata_gaps).some(Boolean)) return "metadata_review";
  if (record.redirect.status !== "200_candidate") return "redirect_review";
  return "same_url_candidate";
}

export function loadCrawlArtifact(artifactDir = DEFAULT_ARTIFACT_DIR) {
  return {
    urlRows: readCsv(path.join(artifactDir, "url-inventory.csv")),
    metadataRows: readCsv(path.join(artifactDir, "metadata-inventory.csv")),
    redirectRows: readCsv(path.join(artifactDir, "redirect-map-draft.csv")),
  };
}

export function normalizeMigrationRecords(artifact = loadCrawlArtifact()) {
  const metadataByKey = new Map(artifact.metadataRows.map((row) => [metadataKey(row), row]));
  const redirectByUrl = new Map(artifact.redirectRows.map((row) => [redirectKey(row), row]));

  return artifact.urlRows.map((row, index) => {
    const meta = metadataByKey.get(keyFor(row)) || {};
    const redirect = redirectByUrl.get(row.url) || {};
    const status = Number(meta.status || 0);
    const gaps = metadataGaps(meta);
    const record = {
      id: `url-${String(index + 1).padStart(4, "0")}`,
      source_domain: row.source_domain,
      sitemap_source: row.sitemap_source,
      old_url: row.url,
      url_type: row.url_type,
      status,
      final_url: meta.final_url || "",
      title: meta.title || "",
      h1: meta.h1 || "",
      canonical: meta.canonical || "",
      robots_meta: meta.robots_meta || "",
      hreflang: meta.hreflang || "",
      word_count: Number(meta.word_count || 0),
      image_count: Number(meta.image_count || 0),
      internal_link_count: Number(meta.internal_link_count || 0),
      metadata_gaps: gaps,
      redirect: {
        target: redirect.new_url || row.url,
        status: redirect.status || "missing_review",
        reason: redirect.reason || "Missing redirect review row.",
      },
      migration_action: redirect.status === "200_candidate" ? "preserve_same_url" : "review_redirect",
    };
    return { ...record, review_state: reviewState(record) };
  });
}

export function summarizeMigrationRecords(records) {
  const counts = {
    total: records.length,
    byDomain: {},
    byType: {},
    byStatus: {},
    byReviewState: {},
    homepageRedirectTargets: 0,
    missingMetadataRows: 0,
    redirectRowsMissing: 0,
  };

  for (const record of records) {
    counts.byDomain[record.source_domain] = (counts.byDomain[record.source_domain] || 0) + 1;
    counts.byType[record.url_type] = (counts.byType[record.url_type] || 0) + 1;
    counts.byStatus[record.status] = (counts.byStatus[record.status] || 0) + 1;
    counts.byReviewState[record.review_state] = (counts.byReviewState[record.review_state] || 0) + 1;
    if (!record.status) counts.missingMetadataRows += 1;
    if (record.redirect.status === "missing_review") counts.redirectRowsMissing += 1;
    if (!isRootUrl(record.old_url) && isRootUrl(record.redirect.target)) counts.homepageRedirectTargets += 1;
  }

  return counts;
}

export function assertMigrationLaunchGate(records) {
  const summary = summarizeMigrationRecords(records);
  if (summary.total !== 457) throw new Error(`Expected 457 migration records, got ${summary.total}`);
  if (summary.byDomain["makler-realty.com"] !== 278) throw new Error("Expected 278 .com records");
  if (summary.byDomain["makler-realty.ru"] !== 179) throw new Error("Expected 179 .ru records");
  if (summary.byStatus[200] !== 457) throw new Error("All crawled URLs must be HTTP 200 in the baseline artifact");
  if (summary.homepageRedirectTargets !== 0) throw new Error("Homepage redirect targets are not allowed");
  if (summary.redirectRowsMissing !== 0) throw new Error("Every URL needs a redirect review row");
  return summary;
}

export function writeMigrationRecords(records, outPath = DEFAULT_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const summary = assertMigrationLaunchGate(records);
  fs.writeFileSync(outPath, `${JSON.stringify({ artifact_id: DEFAULT_ARTIFACT_ID, summary, records }, null, 2)}\n`);
  return { outPath, summary };
}
