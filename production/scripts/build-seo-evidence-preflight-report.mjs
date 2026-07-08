import {
  buildSeoEvidencePreflightReport,
  DEFAULT_SEO_EVIDENCE_INPUT_DIR,
  DEFAULT_SEO_PREFLIGHT_REPORT,
  writeSeoEvidencePreflightReport,
} from "../lib/seo-evidence.mjs";

const inputDir = process.env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR || DEFAULT_SEO_EVIDENCE_INPUT_DIR;
const outputPath = process.env.MS_REALTY_SEO_PREFLIGHT_REPORT_PATH || DEFAULT_SEO_PREFLIGHT_REPORT;

const report = buildSeoEvidencePreflightReport({ inputDir, generatedAt: "2026-07-06T00:00:00Z" });
const outPath = writeSeoEvidencePreflightReport(report, outputPath);

console.log(`Wrote SEO evidence preflight report to ${outPath}`);

if (!report.ready) {
  console.log(`SEO evidence blocked: ${report.summary.missing_required_sources.join(", ")}`);
  console.log(
    `Next: export Search Console, Yandex Webmaster, and backlink CSVs into ${inputDir} or set MS_REALTY_SEO_EVIDENCE_INPUT_DIR, then run \`npm run seo:evidence\` and \`npm run seo:preflight\`.`,
  );
}
