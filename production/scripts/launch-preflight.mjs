import { assertLaunchReadinessReport, buildLaunchReadinessReport, launchBlockerSummary } from "../lib/launch-readiness.mjs";
import {
  assertLaunchEvidenceBundle,
  readLaunchEvidenceBundle,
  REQUIRED_LAUNCH_EVIDENCE_ARTIFACT_IDS,
} from "../lib/launch-evidence.mjs";
import { launchReadinessInputsFromEnv } from "./launch-readiness-env.mjs";

function verifyAttestedEvidence(env) {
  const bundlePath = String(env.MS_REALTY_LAUNCH_EVIDENCE_BUNDLE_PATH || "").trim();
  if (!bundlePath) return;
  const signingKey = String(env.MS_REALTY_EVIDENCE_SIGNING_KEY || "");
  if (signingKey.length < 32) throw new Error("MS_REALTY_EVIDENCE_SIGNING_KEY must be at least 32 characters");
  const expectedCommitSha = String(env.MS_REALTY_RELEASE_SHA || env.GITHUB_SHA || "").trim();
  if (!expectedCommitSha) throw new Error("MS_REALTY_RELEASE_SHA or GITHUB_SHA is required with a launch evidence bundle");
  const bundle = readLaunchEvidenceBundle(bundlePath);
  assertLaunchEvidenceBundle(bundle, {
    signingKey,
    expectedCommitSha,
    requiredArtifactIds: REQUIRED_LAUNCH_EVIDENCE_ARTIFACT_IDS,
  });
  console.log(`Launch evidence verified for ${bundle.commit_sha} (${bundle.artifacts.length} artifacts)`);
}

function blockerDetails(report) {
  return report.gates
    .filter((gate) => gate.status === "blocked")
    .flatMap((gate) => {
      if (gate.id === "live_services") {
        return (gate.evidence.reports || []).map((item) => `${item.source}: ${item.status} ${item.path || ""}`.trim());
      }
      if (gate.id === "listing_quality_review") {
        return [
          `listing_quality_review: ${gate.evidence.status} ${gate.evidence.path || ""} ${gate.evidence.error || ""}`.trim(),
        ];
      }
      if (gate.id === "payload_runtime") {
        const missing = gate.evidence.summary?.missing_env || [];
        const failed = (gate.evidence.checks || []).filter((check) => check.status !== "pass").map((check) => check.id);
        return [
          `payload_runtime: ${gate.evidence.status} ${gate.evidence.path || ""} ${missing.length ? `missing ${missing.join(", ")}` : ""} ${failed.length ? `failed ${failed.join(", ")}` : ""}`.trim(),
        ];
      }
      return [gate.message ? `${gate.id}: ${gate.message}` : `${gate.id}: blocked`];
    });
}

function blockerActions(report) {
  return launchBlockerSummary(report).blocked_gates.flatMap((gate) =>
    gate.next_actions.map((action) => `${gate.id} next: ${action}`),
  );
}

try {
  verifyAttestedEvidence(process.env);
} catch (error) {
  console.error(`LAUNCH EVIDENCE VERIFY FAILED: ${error.message}`);
  process.exit(1);
}

const report = buildLaunchReadinessReport(launchReadinessInputsFromEnv());
assertLaunchReadinessReport(report);

if (!report.launch_ready) {
  console.error(`LAUNCH BLOCKED: ${report.blockers.join(", ")}`);
  for (const line of blockerDetails(report)) console.error(`- ${line}`);
  for (const line of blockerActions(report)) console.error(`- ${line}`);
  console.error(
    "Next: provide the missing evidence, review `production/data/launch-input-checklist.md`, then run `npm run launch:inputs` and `npm run launch:preflight`.",
  );
  process.exitCode = 1;
} else {
  console.log("LAUNCH READY");
}
