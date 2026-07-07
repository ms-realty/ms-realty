import {
  buildListingQualityReport,
  buildListingQualityReviewPacket,
  DEFAULT_LISTING_QUALITY_REVIEW_DRAFT,
  DEFAULT_LISTING_QUALITY_REVIEW_INPUT,
  DEFAULT_LISTING_QUALITY_REVIEW_PACKET,
  renderListingQualityReviewDraft,
  writeListingQualityReviewPacket,
} from "../lib/listing-quality.mjs";
import { applyListingEdits, readListingEdits } from "../lib/listing-edits.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { readTourApprovals } from "../lib/tours.mjs";

const draftCsvPath = process.env.MS_REALTY_LISTING_QUALITY_REVIEW_DRAFT_PATH || DEFAULT_LISTING_QUALITY_REVIEW_DRAFT;
const packetPath = process.env.MS_REALTY_LISTING_QUALITY_REVIEW_PACKET_PATH || DEFAULT_LISTING_QUALITY_REVIEW_PACKET;
const reviewPath = process.env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH || DEFAULT_LISTING_QUALITY_REVIEW_INPUT;
const listingEditPath = process.env.MS_REALTY_LISTING_EDIT_LEDGER_PATH || undefined;
const tourApprovalPath = process.env.MS_REALTY_TOUR_APPROVAL_LEDGER_PATH || undefined;

const report = buildListingQualityReport({
  seed: applyListingEdits(loadCmsSeed(), readListingEdits(listingEditPath)),
  tourApprovals: readTourApprovals(tourApprovalPath),
  generatedAt: "2026-07-06T00:00:00Z",
});

const packet = buildListingQualityReviewPacket({
  draftCsvPath,
  generatedAt: "2026-07-06T00:00:00Z",
  report,
  reviewPath,
});
const result = writeListingQualityReviewPacket(packet, {
  draftCsv: renderListingQualityReviewDraft(report),
  draftCsvPath,
  packetPath,
});

console.log(`Wrote listing quality review packet to ${result.packetPath}`);
console.log(`Wrote listing quality review draft CSV to ${result.draftCsvPath}`);
