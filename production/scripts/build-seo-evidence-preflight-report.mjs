import {
  buildSeoEvidencePreflightReport,
  DEFAULT_SEO_EVIDENCE_INPUT_DIR,
  DEFAULT_SEO_PREFLIGHT_REPORT,
  writeSeoEvidencePreflightReport,
} from "../lib/seo-evidence.mjs";

const inputDir = process.env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR || DEFAULT_SEO_EVIDENCE_INPUT_DIR;
const outputPath = process.env.MS_REALTY_SEO_PREFLIGHT_REPORT_PATH || DEFAULT_SEO_PREFLIGHT_REPORT;

const outPath = writeSeoEvidencePreflightReport(
  buildSeoEvidencePreflightReport({ inputDir, generatedAt: "2026-07-06T00:00:00Z" }),
  outputPath,
);

console.log(`Wrote SEO evidence preflight report to ${outPath}`);
