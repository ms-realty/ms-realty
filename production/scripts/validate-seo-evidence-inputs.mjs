import { DEFAULT_SEO_EVIDENCE_INPUT_DIR, validateSeoEvidenceInputs } from "../lib/seo-evidence.mjs";

const inputDir = process.argv[2] || process.env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR || DEFAULT_SEO_EVIDENCE_INPUT_DIR;

function printSourceSummaries(result, write = console.log) {
  for (const [source, summary] of Object.entries(result.sources)) {
    const domains = summary.matched_source_domains.join(", ") || "none";
    write(
      `${source}: ${summary.row_count} rows, ${summary.matched_rows} matched, ${summary.unmatched_rows} unmatched, ${summary.duplicate_rows} duplicates, status ${summary.status}, domains ${domains}`,
    );
  }
}

try {
  const result = validateSeoEvidenceInputs({ inputDir, generatedAt: "2026-07-05T00:00:00Z" });
  if (!result.ready) {
    printSourceSummaries(result, console.error);
    throw new Error(`Missing required SEO evidence: ${result.missing_required_sources.join(", ")}`);
  }

  console.log("SEO evidence inputs valid");
  printSourceSummaries(result);
} catch (error) {
  console.error(`SEO EVIDENCE PREFLIGHT FAILED: ${error.message}`);
  process.exitCode = 1;
}
