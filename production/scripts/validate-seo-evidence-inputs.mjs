import { DEFAULT_SEO_EVIDENCE_INPUT_DIR, validateSeoEvidenceInputs } from "../lib/seo-evidence.mjs";

const inputDir = process.argv[2] || DEFAULT_SEO_EVIDENCE_INPUT_DIR;

try {
  const result = validateSeoEvidenceInputs({ inputDir, generatedAt: "2026-07-05T00:00:00Z" });
  if (!result.ready) {
    throw new Error(`Missing required SEO evidence: ${result.missing_required_sources.join(", ")}`);
  }

  console.log("SEO evidence inputs valid");
  for (const [source, summary] of Object.entries(result.sources)) {
    console.log(
      `${source}: ${summary.row_count} rows, ${summary.matched_rows} matched, domains ${summary.matched_source_domains.join(", ")}`,
    );
  }
} catch (error) {
  console.error(`SEO EVIDENCE PREFLIGHT FAILED: ${error.message}`);
  process.exitCode = 1;
}
