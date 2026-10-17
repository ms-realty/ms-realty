import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

// Offline behavioral evidence only. Inference in the acceptance suite is synthetic; the
// actual migrations, authorization, queue, receipts and business commands use PostgreSQL.
const { values } = parseArgs({ options: { output: { type: "string" } } });
if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL must name a disposable PostgreSQL server");
const folder = resolve(values.output ?? "output/generative-process-evaluation");
mkdirSync(folder, { recursive: true });
const metricsFile = resolve(folder, "workspace-offline-metrics.json");
const reportFile = resolve(folder, "workspace-vitest.json");
const summaryFile = resolve(folder, "evaluation-summary.json");
// A setup failure must not inherit a successful metrics/report file from an older run.
for (const file of [metricsFile, reportFile, summaryFile]) rmSync(file, { force: true });
const started = performance.now();
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--project",
    "integration",
    "src/server/ai/workspace.int.test.ts",
    "--reporter=json",
    `--outputFile=${reportFile}`,
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GENERATIVE_EVALUATION_OUTPUT: metricsFile },
  },
);
writeFileSync(resolve(folder, "workspace.stdout.log"), result.stdout ?? "");
writeFileSync(resolve(folder, "workspace.stderr.log"), result.stderr ?? "");
const read = (file: string) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const tests = read(reportFile);
const complete =
  result.status === 0 &&
  tests?.success === true &&
  tests.numTotalTests > 0 &&
  tests.numPassedTests === tests.numTotalTests &&
  tests.numFailedTests === 0 &&
  tests.numPendingTests === 0;
const exitCode = complete ? 0 : result.status || 1;
const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
const sourceFiles = [
  "src/domain/generative.ts",
  "src/db/schema/generative.ts",
  "src/server/ai/workspace.ts",
  "src/server/ai/workspace-jobs.ts",
  "src/server/ai/workspace-config.ts",
  "src/server/ai/workspace-context.ts",
  "src/server/ai/workspace-planner.ts",
  "src/server/ai/workspace-provider.ts",
  "src/server/ai/workspace-policy.ts",
  "src/server/ai/workspace-materialize.ts",
  "src/server/ai/budget.ts",
  "src/server/jobs/queue.ts",
  "src/server/ai/workspace.int.test.ts",
  "db/migrations/0023_generative_workspace.sql",
  "db/migrations/0024_generative_source_lineage.sql",
  "scripts/generative-evaluate.ts",
];
const summary = {
  mode: "offline_synthetic_model_real_postgres",
  runtime: { node: process.version },
  status: complete ? "passed_behavioral_suite" : "failed",
  exitCode,
  runnerExitCode: result.status,
  signal: result.signal,
  elapsedMs: Math.round(performance.now() - started),
  source: {
    baseRevision: revision.status === 0 ? revision.stdout.trim() : null,
    files: sourceFiles.map((path) => ({
      path,
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    })),
  },
  tests: tests
    ? { total: tests.numTotalTests, passed: tests.numPassedTests, failed: tests.numFailedTests }
    : null,
  jobs: read(metricsFile),
  qualification: {
    liveExactProvider: "unverified",
    factualQuality: "human_review_pending",
    brokerComparison: "not_run",
    userUsability: "not_run",
    launchReadiness: "unchanged",
  },
  reports: {
    tests: reportFile,
    metrics: metricsFile,
    stdout: resolve(folder, "workspace.stdout.log"),
    stderr: resolve(folder, "workspace.stderr.log"),
  },
};
writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (result.error) console.error(result.error.message);
process.exitCode = exitCode;
