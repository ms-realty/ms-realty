import { assertLaunchReadinessReport, buildLaunchReadinessReport } from "../lib/launch-readiness.mjs";

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
      return [gate.message ? `${gate.id}: ${gate.message}` : `${gate.id}: blocked`];
    });
}

const report = buildLaunchReadinessReport();
assertLaunchReadinessReport(report);

if (!report.launch_ready) {
  console.error(`LAUNCH BLOCKED: ${report.blockers.join(", ")}`);
  for (const line of blockerDetails(report)) console.error(`- ${line}`);
  console.error("Next: provide the missing evidence, then run `npm run launch:inputs` and `npm run launch:preflight`.");
  process.exitCode = 1;
} else {
  console.log("LAUNCH READY");
}
