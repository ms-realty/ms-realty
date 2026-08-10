import {
  buildLaunchReadinessReport,
  DEFAULT_LAUNCH_READINESS_OUTPUT,
  writeLaunchReadinessReport,
} from "../lib/launch-readiness.mjs";
import { launchReadinessInputsFromEnv } from "./launch-readiness-env.mjs";

const outputPath = process.env.MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH || DEFAULT_LAUNCH_READINESS_OUTPUT;
const generatedAt = process.env.MS_REALTY_GENERATED_AT || new Date().toISOString();

writeLaunchReadinessReport(
  buildLaunchReadinessReport({
    ...launchReadinessInputsFromEnv(),
    generatedAt,
  }),
  outputPath,
);
console.log(`Wrote launch readiness report to ${outputPath}`);
