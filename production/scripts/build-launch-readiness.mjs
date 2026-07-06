import {
  buildLaunchReadinessReport,
  DEFAULT_LAUNCH_READINESS_OUTPUT,
  writeLaunchReadinessReport,
} from "../lib/launch-readiness.mjs";

writeLaunchReadinessReport(
  buildLaunchReadinessReport({
    generatedAt: "2026-07-05T00:00:00Z",
    listingQualityReviewPath: process.env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH || undefined,
  }),
  DEFAULT_LAUNCH_READINESS_OUTPUT,
);
console.log(`Wrote launch readiness report to ${DEFAULT_LAUNCH_READINESS_OUTPUT}`);
