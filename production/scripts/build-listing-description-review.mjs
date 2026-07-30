import {
  buildListingDescriptionReview,
  DEFAULT_LISTING_DESCRIPTION_EVIDENCE_DIR,
  DEFAULT_LISTING_DESCRIPTION_REVIEW_OUTPUT,
  writeListingDescriptionReview,
} from "../lib/listing-description-review.mjs";

const evidenceDir = process.env.MS_REALTY_LISTING_DESCRIPTION_EVIDENCE_DIR || DEFAULT_LISTING_DESCRIPTION_EVIDENCE_DIR;
const outputPath = process.env.MS_REALTY_LISTING_DESCRIPTION_REVIEW_PATH || DEFAULT_LISTING_DESCRIPTION_REVIEW_OUTPUT;
const generatedAt = process.env.MS_REALTY_LISTING_DESCRIPTION_REVIEW_GENERATED_AT || "2026-07-29T12:39:33+00:00";

const result = writeListingDescriptionReview(
  buildListingDescriptionReview({
    evidenceDir,
    generatedAt,
  }),
  outputPath,
);

console.log(`Wrote listing description review queue to ${result.outPath}`);
console.log(`Rows: ${result.summary.rows}`);
console.log(`P0: ${result.summary.by_priority.P0 || 0}`);
console.log(`P1: ${result.summary.by_priority.P1 || 0}`);
