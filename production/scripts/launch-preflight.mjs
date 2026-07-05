import { assertLaunchReadinessReport, buildLaunchReadinessReport } from "../lib/launch-readiness.mjs";

const report = buildLaunchReadinessReport();
assertLaunchReadinessReport(report);

if (!report.launch_ready) {
  console.error(`LAUNCH BLOCKED: ${report.blockers.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("LAUNCH READY");
}
