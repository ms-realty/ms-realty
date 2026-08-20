import fs from "node:fs";
import {
  approvedLaunchFreezeRouteArtifact,
  buildRedirectApprovalWorkbook,
  renderRedirectApprovalWorkbook,
} from "../lib/redirect-approvals.mjs";
import { DEFAULT_SEO_EVIDENCE_OUTPUT } from "../lib/seo-evidence.mjs";
import { buildLaunchReadinessReport } from "../lib/launch-readiness.mjs";
import {
  DEFAULT_LAUNCH_INPUT_CHECKLIST_OUTPUT,
  renderLaunchInputChecklist,
  writeLaunchInputChecklist,
} from "../lib/launch-inputs.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { liveServiceProvisioningState } from "../lib/live-service-provisioning.mjs";
import { loadMigrationRecords } from "../lib/content.mjs";
import { attachMigrationReviewEvidence } from "../lib/migration-review.mjs";
import { launchReadinessInputsFromEnv } from "./launch-readiness-env.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function currentSeoEvidence(inputs) {
  if (inputs.seoEvidence) return inputs.seoEvidence;
  const outputPath = process.env.MS_REALTY_SEO_EVIDENCE_OUTPUT_PATH || DEFAULT_SEO_EVIDENCE_OUTPUT;
  return readJson(fs.existsSync(outputPath) ? outputPath : DEFAULT_SEO_EVIDENCE_OUTPUT);
}

const generatedAt = process.env.MS_REALTY_GENERATED_AT || new Date().toISOString();
const inputs = launchReadinessInputsFromEnv();
const routeMap = inputs.routeMap || readJson(fromRoot("production", "data", "legacy-route-map.json"));
const seoEvidence = currentSeoEvidence(inputs);
const deployableRedirects = approvedLaunchFreezeRouteArtifact();
const liveServiceProvisioning = liveServiceProvisioningState(process.env.MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH || undefined);
const outputPath = process.env.MS_REALTY_LAUNCH_INPUT_CHECKLIST_OUTPUT_PATH || DEFAULT_LAUNCH_INPUT_CHECKLIST_OUTPUT;

const outPath = writeLaunchInputChecklist(
  renderLaunchInputChecklist({
    generatedAt,
    launchReadiness: buildLaunchReadinessReport({
      ...inputs,
      generatedAt,
      routeMap,
      seoEvidence,
      deployableRedirects,
    }),
    seoEvidence,
    redirectWorkbookCsv: renderRedirectApprovalWorkbook(
      buildRedirectApprovalWorkbook(attachMigrationReviewEvidence(routeMap.routes, loadMigrationRecords())),
    ),
    deployableRedirects,
    routeMap,
    liveServiceProvisioning,
  }),
  outputPath,
);

console.log(`Wrote launch input checklist to ${outPath}`);
