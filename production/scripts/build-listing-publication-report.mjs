import {
  buildListingPublicationReport,
  DEFAULT_LISTING_PUBLICATION_REPORT,
  writeListingPublicationReport,
} from "../lib/listing-publication.mjs";

const report = buildListingPublicationReport({ generatedAt: "2026-07-05T00:00:00Z" });
writeListingPublicationReport(report);
console.log(`Wrote listing publication report to ${DEFAULT_LISTING_PUBLICATION_REPORT}`);
