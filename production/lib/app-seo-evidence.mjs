import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { REQUIRED_SOURCE_DOMAINS, assertSeoEvidence, missingRequiredSources } from "./seo-evidence-contract.mjs";
import {
  SEO_EXPORTS,
  countUrlsWithSeoEvidence,
  joinExternalRows,
  normalizeExternalRow,
  seoEvidenceIndex,
} from "./seo-evidence-shared.mjs";
import { fromRoot } from "./paths.mjs";

function seoEvidencePath(config) {
  return config.seoEvidenceOutputPath || fromRoot("production", "data", "seo-evidence.json");
}

function seoInputPath(source, config, suffix = "") {
  const filename = SEO_EXPORTS[source];
  if (!filename) throw new Error(`Unknown SEO export source: ${source}`);
  if (config.seoEvidenceInputDir) {
    return path.join(/*turbopackIgnore: true*/ config.seoEvidenceInputDir, `${filename}${suffix}`);
  }
  return fromRoot("migration", "external", "seo", `${filename}${suffix}`);
}

function readDefaultSeoEvidence() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "seo-evidence.json"), "utf8"));
}

function overlayInputDirectoryEvidence(config) {
  const evidence = readDefaultSeoEvidence();
  evidence.generated_at = config.reviewedAt || new Date().toISOString();
  for (const source of Object.keys(SEO_EXPORTS)) {
    const inputPath = seoInputPath(source, config);
    if (!fs.existsSync(/*turbopackIgnore: true*/ inputPath)) continue;
    const csv = fs.readFileSync(/*turbopackIgnore: true*/ inputPath, "utf8");
    const rows = parseCsv(csv).map((row) => normalizeExternalRow(source, row));
    evidence.summary.sources[source] = {
      source,
      input_path: inputPath,
      status: rows.length ? "imported" : "empty_export",
      row_count: rows.length,
      ...joinExternalRows(source, rows, seoEvidenceIndex(evidence), { resetEvidence: evidence }),
    };
  }
  updateMissingRequiredSources(evidence);
  updateEvidenceCounts(evidence);
  return evidence;
}

export function readAppSeoEvidence(config) {
  const candidate = seoEvidencePath(config);
  if (config.seoEvidenceOutputPath && fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
    return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ candidate, "utf8"));
  }
  if (config.seoEvidenceInputDir) return overlayInputDirectoryEvidence(config);
  const filePath = fs.existsSync(/*turbopackIgnore: true*/ candidate) ? candidate : fromRoot("production", "data", "seo-evidence.json");
  return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, "utf8"));
}

function updateMissingRequiredSources(evidence) {
  evidence.summary.missing_required_sources = missingRequiredSources(evidence.summary.sources || {});
}

function updateEvidenceCounts(evidence) {
  evidence.summary.urls_with_any_evidence = countUrlsWithSeoEvidence(evidence);
}

export function seoEvidencePayload(evidence) {
  return {
    missingRequiredSources: evidence.summary.missing_required_sources,
    requiredSourceDomains: REQUIRED_SOURCE_DOMAINS,
    crawlCoverage: {
      urls: evidence.summary.crawl_urls,
      urlTypes: evidence.summary.url_types,
      urlsWithAnyEvidence: evidence.summary.urls_with_any_evidence,
    },
    sources: evidence.summary.sources,
    importEndpoint: "/api/admin/seo-evidence/import",
    templateEndpoint: "/api/admin/seo-evidence/template",
    exportEndpoint: "/api/admin/seo-evidence/export",
  };
}

export function seoEvidenceImportSummary(source, rowCount, evidence) {
  const missing = evidence.summary.missing_required_sources;
  const ready = missing.length === 0;
  return {
    ready,
    status: ready ? "ready" : "blocked",
    importedSource: source,
    rowCount,
    missingRequiredSources: missing,
    requiredSourceDomains: REQUIRED_SOURCE_DOMAINS,
    urlsWithAnyEvidence: evidence.summary.urls_with_any_evidence,
    nextActions: ready
      ? ["Run npm run seo:preflight and npm run launch:preflight with the same SEO evidence paths."]
      : [
          "Import Search Console, Yandex Webmaster, and backlink CSV exports through /api/admin/seo-evidence/import.",
          "Run npm run seo:preflight after all required exports are imported.",
        ],
  };
}

export function readAppSeoEvidenceTemplate(url, config) {
  const source = url.searchParams.get("source");
  const filename = SEO_EXPORTS[source];
  if (!filename) throw new Error(`Unknown SEO export source: ${source}`);
  const templatePath = seoInputPath(source, config, ".example");
  if (!fs.existsSync(/*turbopackIgnore: true*/ templatePath)) throw new Error(`Missing SEO export template for ${source}`);
  return { source, filename: `${filename}.example`, csv: fs.readFileSync(/*turbopackIgnore: true*/ templatePath, "utf8") };
}

export function importAppSeoEvidenceRows(input, config) {
  const filename = SEO_EXPORTS[input.source];
  if (!filename) throw new Error(`Unknown SEO export source: ${input.source}`);
  const evidence = readAppSeoEvidence(config);
  const csv = input.csv || "";
  const rows = parseCsv(csv).map((row) => normalizeExternalRow(input.source, row));
  const outPath = seoInputPath(input.source, config);

  evidence.generated_at = config.reviewedAt || new Date().toISOString();
  evidence.summary.sources[input.source] = {
    source: input.source,
    input_path: outPath,
    status: rows.length ? "imported" : "empty_export",
    row_count: rows.length,
    ...joinExternalRows(input.source, rows, seoEvidenceIndex(evidence), { resetEvidence: evidence }),
  };
  updateMissingRequiredSources(evidence);
  updateEvidenceCounts(evidence);
  assertSeoEvidence(evidence);

  const evidencePath = seoEvidencePath(config);
  fs.mkdirSync(path.dirname(/*turbopackIgnore: true*/ outPath), { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ outPath, csv);
  fs.mkdirSync(path.dirname(/*turbopackIgnore: true*/ evidencePath), { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return {
    imported: { source: input.source, outPath, row_count: rows.length },
    seoImport: seoEvidenceImportSummary(input.source, rows.length, evidence),
    ...seoEvidencePayload(evidence),
  };
}
