import fs from "node:fs";
import { liveServiceReports, payloadRuntimeState } from "../lib/launch-readiness.mjs";
import { liveServiceProvisioningState } from "../lib/live-service-provisioning.mjs";
import { monitoringRollbackState } from "../lib/monitoring-rollback.mjs";
import { productionRecoveryState } from "../lib/production-recovery.mjs";
import { buildSeoEvidence } from "../lib/seo-evidence.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function launchReadinessInputsFromEnv(env = process.env) {
  const inputs = {};
  const now = env.MS_REALTY_GENERATED_AT || Date.now();
  if (env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH) {
    inputs.listingQualityReviewPath = env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH;
  }
  if (env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR) {
    inputs.seoEvidence = buildSeoEvidence({ inputDir: env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR });
  } else if (env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH && fs.existsSync(env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH)) {
    inputs.seoEvidence = readJson(env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH);
  }
  if (
    env.MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH ||
    env.MS_REALTY_SEARCH_SYNC_REPORT_PATH ||
    env.MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH ||
    env.MS_REALTY_SEARCH_QUERY_REPORT_PATH ||
    env.MS_REALTY_HERMES_WORKER_REPORT_PATH
  ) {
    inputs.liveServices = liveServiceReports({
      syncReportPath: env.MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH || env.MS_REALTY_SEARCH_SYNC_REPORT_PATH || undefined,
      queryReportPath: env.MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH || env.MS_REALTY_SEARCH_QUERY_REPORT_PATH || undefined,
      hermesReportPath: env.MS_REALTY_HERMES_WORKER_REPORT_PATH || undefined,
      now,
    });
  }
  if (env.MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH) {
    inputs.liveServiceProvisioning = liveServiceProvisioningState(env.MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH);
  }
  if (env.MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH) {
    inputs.payloadRuntime = payloadRuntimeState(env.MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH, { now });
  }
  if (env.MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH) {
    inputs.productionRecovery = productionRecoveryState(env.MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH, {
      now,
      publicKey: env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY,
    });
    inputs.productionRecoveryPublicKey = env.MS_REALTY_RECOVERY_SIGNING_PUBLIC_KEY;
  }
  if (env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH) {
    inputs.monitoringRollback = monitoringRollbackState(env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH, { now });
  }
  return inputs;
}
