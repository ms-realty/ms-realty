import fs from "node:fs";
import { liveServiceReports, payloadRuntimeState } from "../lib/launch-readiness.mjs";
import { liveServiceProvisioningState } from "../lib/live-service-provisioning.mjs";
import { monitoringRollbackState } from "../lib/monitoring-rollback.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { productionRecoveryState } from "../lib/production-recovery.mjs";
import { DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT, summarizeDeployableRedirects } from "../lib/redirect-approvals.mjs";
import { buildSeoEvidence } from "../lib/seo-evidence.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function routeMapInput() {
  return readJson(fromRoot("production", "data", "legacy-route-map.json"));
}

function deployableRedirectsFromEnv(env) {
  const outputPath = env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH || DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT;
  if (!fs.existsSync(outputPath)) {
    return { summary: summarizeDeployableRedirects([]), redirects: [], decisions: [] };
  }
  return readJson(outputPath);
}

export function launchReadinessInputsFromEnv(env = process.env) {
  const inputs = {};
  const now = env.MS_REALTY_GENERATED_AT || Date.now();
  if (env.MS_REALTY_REDIRECT_APPROVALS_PATH || env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH) {
    inputs.routeMap = routeMapInput();
    inputs.deployableRedirects = deployableRedirectsFromEnv(env);
  }
  if (env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH) {
    inputs.listingQualityReviewPath = env.MS_REALTY_LISTING_QUALITY_REVIEW_PATH;
  }
  if (env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR) {
    inputs.seoEvidence = buildSeoEvidence({ inputDir: env.MS_REALTY_SEO_EVIDENCE_INPUT_DIR });
  } else if (env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH && fs.existsSync(env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH)) {
    inputs.seoEvidence = readJson(env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH);
  }
  if (env.MS_REALTY_SEARCH_SYNC_REPORT_PATH || env.MS_REALTY_SEARCH_QUERY_REPORT_PATH || env.MS_REALTY_HERMES_WORKER_REPORT_PATH) {
    inputs.liveServices = liveServiceReports({
      syncReportPath: env.MS_REALTY_SEARCH_SYNC_REPORT_PATH || undefined,
      queryReportPath: env.MS_REALTY_SEARCH_QUERY_REPORT_PATH || undefined,
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
    inputs.productionRecovery = productionRecoveryState(env.MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH, { now });
  }
  if (env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH) {
    inputs.monitoringRollback = monitoringRollbackState(env.MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH, { now });
  }
  return inputs;
}
