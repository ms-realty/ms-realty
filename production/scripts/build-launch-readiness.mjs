import {
  buildLaunchReadinessReport,
  DEFAULT_LAUNCH_READINESS_OUTPUT,
  writeLaunchReadinessReport,
} from "../lib/launch-readiness.mjs";
import { launchReadinessInputsFromEnv } from "./launch-readiness-env.mjs";

const outputPath = process.env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH || DEFAULT_LAUNCH_READINESS_OUTPUT;

writeLaunchReadinessReport(
  buildLaunchReadinessReport({
    ...launchReadinessInputsFromEnv(),
    generatedAt: "2026-07-05T00:00:00Z",
  }),
  outputPath,
);
console.log(`Wrote launch readiness report to ${outputPath}`);
