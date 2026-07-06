import {
  buildListingQualityPreflightReport,
  buildListingQualityReport,
  DEFAULT_LISTING_QUALITY_PREFLIGHT_REPORT,
  DEFAULT_LISTING_QUALITY_REVIEW_INPUT,
  writeListingQualityPreflightReport,
} from "../lib/listing-quality.mjs";
import { applyListingEdits, readListingEdits } from "../lib/listing-edits.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { readTourApprovals } from "../lib/tours.mjs";

const reviewPath = process.env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH || DEFAULT_LISTING_QUALITY_REVIEW_INPUT;
const outputPath = process.env.MS_REALTY_LISTING_QUALITY_PREFLIGHT_REPORT_PATH || DEFAULT_LISTING_QUALITY_PREFLIGHT_REPORT;
const listingEditPath = process.env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || undefined;
const tourApprovalPath = process.env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || undefined;

const report = buildListingQualityReport({
  seed: applyListingEdits(loadCmsSeed(), readListingEdits(listingEditPath)),
  tourApprovals: readTourApprovals(tourApprovalPath),
  generatedAt: "2026-07-06T00:00:00Z",
});

const outPath = writeListingQualityPreflightReport(
  buildListingQualityPreflightReport({
    report,
    reviewPath,
    generatedAt: "2026-07-06T00:00:00Z",
  }),
  outputPath,
);

console.log(`Wrote listing quality preflight report to ${outPath}`);
