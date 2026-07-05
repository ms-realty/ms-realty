import {
  buildListingVerificationReport,
  DEFAULT_LISTING_VERIFICATION_REPORT,
  writeListingVerificationReport,
} from "../lib/listing-verification.mjs";

const report = buildListingVerificationReport({ generatedAt: "2026-07-05T00:00:00Z" });
writeListingVerificationReport(report);
console.log(`Wrote listing verification report to ${DEFAULT_LISTING_VERIFICATION_REPORT}`);
