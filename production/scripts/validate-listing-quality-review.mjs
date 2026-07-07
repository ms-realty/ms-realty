import fs from "node:fs";
import {
  buildListingQualityReport,
  DEFAULT_LISTING_QUALITY_REVIEW_INPUT,
  validateListingQualityReviewCsv,
} from "../lib/listing-quality.mjs";
import { applyListingEdits, readListingEdits } from "../lib/listing-edits.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { readTourApprovals } from "../lib/tours.mjs";

const inputPath = process.argv[2] || process.env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH || DEFAULT_LISTING_QUALITY_REVIEW_INPUT;
const listingEditPath = process.env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || undefined;
const tourApprovalPath = process.env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || undefined;

try {
  if (!fs.existsSync(inputPath)) {
    throw new Error(
      `Missing listing quality review CSV: ${inputPath}\nNext: run \`npm run listing:review-pack\`, complete the draft review CSV with reviewer signoff, write migration/reviews/listing-quality.csv or set MS_REALTY_LISTING_QUALITY_REVIEW_PATH, then run \`npm run listing:preflight\`.`,
    );
  }
  const report = buildListingQualityReport({
    seed: applyListingEdits(loadCmsSeed(), readListingEdits(listingEditPath)),
    tourApprovals: readTourApprovals(tourApprovalPath),
    generatedAt: "2026-07-05T00:00:00Z",
  });
  const result = validateListingQualityReviewCsv(report, fs.readFileSync(inputPath, "utf8"), { requireComplete: true });

  console.log(`Listing quality review CSV valid: ${result.summary.review_rows} rows`);
  console.log(`Facts review rows: ${result.summary.facts_review_rows}`);
  console.log(`Media review rows: ${result.summary.media_review_rows}`);
} catch (error) {
  console.error(`LISTING QUALITY PREFLIGHT FAILED: ${error.message}`);
  process.exitCode = 1;
}
