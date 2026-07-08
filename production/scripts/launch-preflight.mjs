import { assertLaunchReadinessReport, buildLaunchReadinessReport, launchBlockerSummary } from "../lib/launch-readiness.mjs";
import { launchReadinessInputsFromEnv } from "./launch-readiness-env.mjs";

function blockerDetails(report) {
  return report.gates
    .filter((gate) => gate.status === "blocked")
    .flatMap((gate) => {
      if (gate.id === "external_seo_exports") {
        return [`external_seo_exports missing: ${(gate.evidence.missing_required_sources || []).join(", ")}`];
      }
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
