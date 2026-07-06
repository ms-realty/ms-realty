import {
  buildListingVerificationReport,
  DEFAULT_LISTING_VERIFICATION_REPORT,
  writeListingVerificationReport,
} from "../lib/listing-verification.mjs";
import { readListingEdits } from "../lib/listing-edits.mjs";

const outputPath = process.env.MS_REALTY_LISTING_VERIFICATION_REPORT_PATH || DEFAULT_LISTING_VERIFICATION_REPORT;
const edits = readListingEdits(process.env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || undefined);

const report = buildListingVerificationReport({ edits, generatedAt: "2026-07-05T00:00:00Z" });
writeListingVerificationReport(report, outputPath);
console.log(`Wrote listing verification report to ${outputPath}`);
