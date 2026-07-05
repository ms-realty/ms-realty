import {
  buildListingQualityReport,
  DEFAULT_LISTING_QUALITY_REPORT,
  DEFAULT_LISTING_QUALITY_WORKBOOK,
  writeListingQualityReport,
  writeListingQualityWorkbook,
} from "../lib/listing-quality.mjs";
import { applyListingEdits, readListingEdits } from "../lib/listing-edits.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";

const report = buildListingQualityReport({
  seed: applyListingEdits(loadCmsSeed(), readListingEdits()),
  generatedAt: "2026-07-05T00:00:00Z",
});
writeListingQualityReport(report);
writeListingQualityWorkbook(report);
console.log(`Wrote listing quality report to ${DEFAULT_LISTING_QUALITY_REPORT}`);
console.log(`Wrote listing quality workbook to ${DEFAULT_LISTING_QUALITY_WORKBOOK}`);
