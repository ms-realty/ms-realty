import fs from "node:fs";
import {
  buildListingQualityReport,
  DEFAULT_LISTING_QUALITY_REVIEW_INPUT,
  validateListingQualityReviewCsv,
} from "../lib/listing-quality.mjs";
import { applyListingEdits, readListingEdits } from "../lib/listing-edits.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

const inputPath = process.argv[2] || DEFAULT_LISTING_QUALITY_REVIEW_INPUT;

try {
  if (!fs.existsSync(inputPath)) throw new Error(`Missing listing quality review CSV: ${inputPath}`);
  const report = buildListingQualityReport({
    seed: applyListingEdits(loadCmsSeed(), readListingEdits()),
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const result = validateListingQualityReviewCsv(report, fs.readFileSync(inputPath, "utf8"));

  console.log(`Listing quality review CSV valid: ${result.summary.review_rows} rows`);
  console.log(`Facts review rows: ${result.summary.facts_review_rows}`);
  console.log(`Media review rows: ${result.summary.media_review_rows}`);
} catch (error) {
  console.error(`LISTING QUALITY PREFLIGHT FAILED: ${error.message}`);
  process.exitCode = 1;
}
