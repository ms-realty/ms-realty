import {
  buildLaunchReadinessReport,
  DEFAULT_LAUNCH_READINESS_OUTPUT,
  writeLaunchReadinessReport,
} from "../lib/launch-readiness.mjs";
import { launchReadinessInputsFromEnv } from "./launch-readiness-env.mjs";

writeLaunchReadinessReport(
  buildLaunchReadinessReport({
    ...launchReadinessInputsFromEnv(),
    generatedAt: "2026-07-05T00:00:00Z",
  }),
  DEFAULT_LAUNCH_READINESS_OUTPUT,
);
console.log(`Wrote launch readiness report to ${DEFAULT_LAUNCH_READINESS_OUTPUT}`);
