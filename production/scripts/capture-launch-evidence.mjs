import fs from "node:fs";
import {
  buildLaunchEvidenceBundle,
  REQUIRED_LAUNCH_EVIDENCE_ARTIFACT_IDS,
  writeLaunchEvidenceBundle,
} from "../lib/launch-evidence.mjs";
import { assertLaunchReadinessReport, buildLaunchReadinessReport } from "../lib/launch-readiness.mjs";
import { monitoringRollbackState } from "../lib/monitoring-rollback.mjs";
import { launchReadinessInputsFromEnv } from "./launch-readiness-env.mjs";

const REQUIRED_ARTIFACT_ENV = {
  deployable_redirects: "MS_REALTY_DEPLOYABLE_REDIRECTS_OUTPUT_PATH",
  listing_quality_review: "MS_REALTY_LISTING_QUALITY_REVIEW_PATH",
  live_service_provisioning: "MS_REALTY_LIVE_SERVICE_PROVISIONING_REPORT_PATH",
  search_sync: ["MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH", "MS_REALTY_SEARCH_SYNC_REPORT_PATH"],
  search_query: ["MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH", "MS_REALTY_SEARCH_QUERY_REPORT_PATH"],
  hermes_worker: "MS_REALTY_HERMES_WORKER_REPORT_PATH",
  monitoring_rollback: "MS_REALTY_MONITORING_ROLLBACK_REPORT_PATH",
  payload_runtime: "MS_REALTY_PAYLOAD_RUNTIME_REPORT_PATH",
  r2_media_coverage: "MS_REALTY_R2_MEDIA_COVERAGE_REPORT_PATH",
  production_recovery: "MS_REALTY_PRODUCTION_RECOVERY_REPORT_PATH",
};

function required(env, key) {
  const keys = Array.isArray(key) ? key : [key];
  const value = keys.map((name) => String(env[name] || "").trim()).find(Boolean);
  if (!value) throw new Error(`Missing ${keys[0]}`);
  return value;
}

function evidenceArtifactPaths(env) {
  const entries = REQUIRED_LAUNCH_EVIDENCE_ARTIFACT_IDS.map((id) => [id, required(env, REQUIRED_ARTIFACT_ENV[id])]);
  const missingFiles = entries.filter(([, filePath]) => !fs.existsSync(filePath)).map(([id]) => id);
  if (missingFiles.length) throw new Error(`Missing mounted evidence artifacts: ${missingFiles.join(", ")}`);
  return Object.fromEntries(entries);
}

function evidenceTtlMs(env) {
  const hours = Number(env.MS_REALTY_EVIDENCE_TTL_HOURS || "24");
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
    throw new Error("MS_REALTY_EVIDENCE_TTL_HOURS must be between 0 and 168");
  }
  return hours * 60 * 60 * 1000;
}

try {
  const env = process.env;
  const signingKey = required(env, "MS_REALTY_EVIDENCE_SIGNING_KEY");
  if (signingKey.length < 32) throw new Error("MS_REALTY_EVIDENCE_SIGNING_KEY must be at least 32 characters");

  const artifactPaths = evidenceArtifactPaths(env);
  const monitoring = monitoringRollbackState(artifactPaths.monitoring_rollback);
  if (monitoring.status !== "pass") {
    throw new Error(`Monitoring and rollback evidence is not pass: ${monitoring.status}${monitoring.error ? ` ${monitoring.error}` : ""}`);
  }

  const readiness = buildLaunchReadinessReport(launchReadinessInputsFromEnv(env));
  assertLaunchReadinessReport(readiness);
  if (!readiness.launch_ready) throw new Error(`Launch readiness remains blocked: ${readiness.blockers.join(", ")}`);

  const generatedAt = env.MS_REALTY_GENERATED_AT || new Date().toISOString();
  const commitSha = String(env.MS_REALTY_RELEASE_SHA || env.GITHUB_SHA || "").trim();
  if (!commitSha) throw new Error("Missing MS_REALTY_RELEASE_SHA or GITHUB_SHA");
  const bundle = buildLaunchEvidenceBundle({
    artifactPaths,
    signingKey,
    issuer: required(env, "MS_REALTY_EVIDENCE_ISSUER"),
    commitSha,
    generatedAt,
    expiresAt: new Date(Date.parse(generatedAt) + evidenceTtlMs(env)).toISOString(),
  });
  const outPath = writeLaunchEvidenceBundle(bundle, required(env, "MS_REALTY_LAUNCH_EVIDENCE_OUTPUT_PATH"));
  console.log(`Attested ${bundle.artifacts.length} launch evidence artifacts to ${outPath}`);
} catch (error) {
  console.error(`LAUNCH EVIDENCE CAPTURE FAILED: ${error.message}`);
  console.error(
    "Next: mount validated production evidence paths, run npm run monitoring:preflight and npm run launch:preflight, then rerun npm run launch:evidence:capture.",
  );
  process.exitCode = 1;
}
