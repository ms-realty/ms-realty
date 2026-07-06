import { liveServiceReports } from "../lib/launch-readiness.mjs";
import { buildSeoEvidence } from "../lib/seo-evidence.mjs";

export function launchReadinessInputsFromEnv(env = process.env) {
  const inputs = {};
  if (env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH) {
    inputs.listingQualityReviewPath = env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH;
  }
  if (env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR) {
    inputs.seoEvidence = buildSeoEvidence({ inputDir: env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR });
  }
  if (env.MS_REALTY_SEARCH_SYNC_REPORT_PATH || env.MS_REALTY_SEARCH_QUERY_REPORT_PATH || env.MS_REALTY_HERMES_WORKER_REPORT_PATH) {
    inputs.liveServices = liveServiceReports({
      syncReportPath: env.MS_REALTY_SEARCH_SYNC_REPORT_PATH || undefined,
      queryReportPath: env.MS_REALTY_SEARCH_QUERY_REPORT_PATH || undefined,
      hermesReportPath: env.MS_REALTY_HERMES_WORKER_REPORT_PATH || undefined,
    });
  }
  return inputs;
}
