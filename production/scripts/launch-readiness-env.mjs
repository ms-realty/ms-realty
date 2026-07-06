import fs from "node:fs";
import { liveServiceReports } from "../lib/launch-readiness.mjs";
import { fromRoot } from "../lib/paths.mjs";
import {
  buildDeployableRedirects,
  readRedirectApprovals,
  summarizeDeployableRedirects,
} from "../lib/redirect-approvals.mjs";
import { buildSeoEvidence } from "../lib/seo-evidence.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function routeMapInput() {
  return readJson(fromRoot("production", "data", "legacy-route-map.json"));
}

function deployableRedirectsFromEnv(env, routeMap) {
  if (env.MS_REALTY_REDIRECT_APPROVALS_PATH) {
    const redirects = buildDeployableRedirects(routeMap.routes, readRedirectApprovals(env.MS_REALTY_REDIRECT_APPROVALS_PATH));
    return { summary: summarizeDeployableRedirects(redirects), redirects };
  }
  if (env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH) {
    if (!fs.existsSync(env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH)) {
      return { summary: summarizeDeployableRedirects([]), redirects: [] };
    }
    return readJson(env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH);
  }
  return null;
}

export function launchReadinessInputsFromEnv(env = process.env) {
  const inputs = {};
  if (env.MS_REALTY_REDIRECT_APPROVALS_PATH || env.MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH) {
    inputs.routeMap = routeMapInput();
    inputs.deployableRedirects = deployableRedirectsFromEnv(env, inputs.routeMap);
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
    });
  }
  return inputs;
}
