import {
  buildListingQualityReport,
  DEFAULT_LISTING_QUALITY_REPORT,
  DEFAULT_LISTING_QUALITY_WORKBOOK,
  writeListingQualityReport,
  writeListingQualityWorkbook,
} from "../lib/listing-quality.mjs";
import { applyListingEdits, readListingEdits } from "../lib/listing-edits.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { readTourApprovals } from "../lib/tours.mjs";

const reportPath = process.env.MS_REALTY_LISTING_QUALITY_REPORT_PATH || DEFAULT_LISTING_QUALITY_REPORT;
const workbookPath = process.env.MS_REALTY_LISTING_QUALITY_WORKBOOK_PATH || DEFAULT_LISTING_QUALITY_WORKBOOK;
const listingEditPath = process.env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || undefined;
const tourApprovalPath = process.env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || undefined;

const report = buildListingQualityReport({
  seed: applyListingEdits(loadCmsSeed(), readListingEdits(listingEditPath)),
  tourApprovals: readTourApprovals(tourApprovalPath),
  generatedAt: "2026-07-05T00:00:00Z",
});
writeListingQualityReport(report, reportPath);
writeListingQualityWorkbook(report, workbookPath);
console.log(`Wrote listing quality report to ${reportPath}`);
console.log(`Wrote listing quality workbook to ${workbookPath}`);
