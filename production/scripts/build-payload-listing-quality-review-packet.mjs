import {
  assertListingQualityReport,
  assertListingQualityReviewPacket,
  buildListingQualityReport,
  buildListingQualityReviewPacket,
  DEFAULT_LISTING_QUALITY_REPORT,
  DEFAULT_LISTING_QUALITY_REVIEW_DRAFT,
  DEFAULT_LISTING_QUALITY_REVIEW_INPUT,
  DEFAULT_LISTING_QUALITY_REVIEW_PACKET,
  DEFAULT_LISTING_QUALITY_WORKBOOK,
  renderListingQualityReviewDraft,
  writeListingQualityReport,
  writeListingQualityReviewPacket,
  writeListingQualityWorkbook,
} from "../lib/listing-quality.mjs";
import {
  buildListingQualitySourceSnapshot,
  DEFAULT_LISTING_QUALITY_SOURCE_SNAPSHOT,
  writeListingQualitySourceSnapshot,
} from "../lib/listing-quality-source-snapshot.mjs";
import { loadPayloadCmsImportRuntime } from "../lib/payload-cms-import.mjs";

const generatedAt = process.env.MS_REALTY_GENERATED_AT || new Date().toISOString();
const sourcePath = process.env.MS_REALTY_LISTING_QUALITY_SOURCE_SNAPSHOT_PATH || DEFAULT_LISTING_QUALITY_SOURCE_SNAPSHOT;
const reportPath = process.env.MS_REALTY_LISTING_QUALITY_REPORT_PATH || DEFAULT_LISTING_QUALITY_REPORT;
const workbookPath = process.env.MS_REALTY_LISTING_QUALITY_WORKBOOK_PATH || DEFAULT_LISTING_QUALITY_WORKBOOK;
const packetPath = process.env.MS_REALTY_LISTING_QUALITY_REVIEW_PACKET_PATH || DEFAULT_LISTING_QUALITY_REVIEW_PACKET;
const draftCsvPath = process.env.MS_REALTY_LISTING_QUALITY_REVIEW_DRAFT_PATH || DEFAULT_LISTING_QUALITY_REVIEW_DRAFT;
const reviewPath = process.env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH || DEFAULT_LISTING_QUALITY_REVIEW_INPUT;

let exitCode = 0;
let payload;
try {
  payload = await loadPayloadCmsImportRuntime();
  const seed = await buildListingQualitySourceSnapshot({ capturedAt: generatedAt, payload });
  const report = buildListingQualityReport({ seed, tourApprovals: [], generatedAt });
  const packet = buildListingQualityReviewPacket({ draftCsvPath, generatedAt, report, reviewPath });
  assertListingQualityReport(report);
  assertListingQualityReviewPacket(packet);

  writeListingQualitySourceSnapshot(seed, sourcePath);
  writeListingQualityReport(report, reportPath);
  writeListingQualityWorkbook(report, workbookPath);
  writeListingQualityReviewPacket(packet, {
    draftCsv: renderListingQualityReviewDraft(report),
    draftCsvPath,
    packetPath,
  });
  console.log(`Wrote Payload listing quality source snapshot to ${sourcePath}`);
  console.log(`Wrote Payload listing quality review packet to ${packetPath}`);
} catch (error) {
  console.error(`PAYLOAD LISTING QUALITY PACKET FAILED: ${error.message}`);
  exitCode = 1;
} finally {
  await payload?.destroy?.();
}

process.exit(exitCode);
