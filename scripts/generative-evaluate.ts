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
const packetFile = resolve(folder, "broker-quality-packet.json");
const reviewFile = resolve(folder, "REVIEW-PACKET.md");
// A setup failure must not inherit a successful metrics/report file from an older run.
for (const file of [metricsFile, reportFile, summaryFile, packetFile, reviewFile])
  rmSync(file, { force: true });
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
    env: {
      ...process.env,
      GENERATIVE_EVALUATION_OUTPUT: metricsFile,
      GENERATIVE_QUALITY_PACKET_OUTPUT: packetFile,
    },
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
const behavioralComplete =
  result.status === 0 &&
  tests?.success === true &&
  tests.numTotalTests > 0 &&
  tests.numPassedTests === tests.numTotalTests &&
  tests.numFailedTests === 0 &&
  tests.numPendingTests === 0;
const packet = read(packetFile);
const packetAvailable =
  packet?.protocol === "broker-quality-packet-v1" &&
  packet.status === "ready_for_human_review" &&
  typeof packet.request?.goal === "string" &&
  Array.isArray(packet.sourceSnapshots) &&
  packet.sourceSnapshots.length >= 2 &&
  Array.isArray(packet.personCommands) &&
  packet.personCommands.length >= 4 &&
  packet.personCommands.every(
    (entry: { receipt?: { status?: string } }) => entry.receipt?.status === "succeeded",
  ) &&
  Array.isArray(packet.artifactSnapshots?.afterMaterialization) &&
  packet.artifactSnapshots.afterMaterialization.length >= 4 &&
  Boolean(
    packet.independentReadback?.task?.id &&
      packet.independentReadback?.brief?.id &&
      packet.independentReadback?.manualHandoff?.result,
  ) &&
  Array.isArray(packet.independentReadback?.forbiddenEffects) &&
  packet.independentReadback.forbiddenEffects.length > 0 &&
  packet.independentReadback.forbiddenEffects.every(
    (effect: { delta?: number }) => effect.delta === 0,
  ) &&
  packet.qualification?.humanScores === null &&
  packet.qualification?.expertBaseline === null &&
  packet.qualification?.brokerComparison === "not_run";
if (!packetAvailable) rmSync(packetFile, { force: true });
const complete = behavioralComplete && packetAvailable;
const exitCode = complete ? 0 : result.status || 1;
if (packetAvailable) {
  const artifacts = packet.artifactSnapshots.afterMaterialization as Array<{
    proposal: { title: string; kind: string };
    state: string;
    version: number;
  }>;
  const cell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
  const guide =
    `# Broker quality review packet\n\n` +
    `Open [the actual saved job packet](broker-quality-packet.json). It contains authorized synthetic data and scripted model turns from the real-PostgreSQL test. No live provider or real broker review produced this work.\n\n` +
    `Behavioral suite: ${behavioralComplete ? "passed" : "failed; this packet covers only the successful buyer job"}. Human factual quality, usefulness scores and the expert baseline remain unrun. Synthetic tariff arithmetic is not a provider bill.\n\n` +
    `Original goal: ${packet.request.goal}\n\n` +
    `| Saved artifact | Kind | State | Version |\n| --- | --- | --- | --- |\n` +
    artifacts
      .map(
        (artifact) =>
          `| ${cell(artifact.proposal.title)} | ${artifact.proposal.kind} | ${artifact.state} | ${artifact.version} |`,
      )
      .join("\n") +
    `\n\nRead the JSON in this order:\n\n` +
    `1. \`request\` and \`sourceSnapshots\`: original constraints, minimized authorized source text, revisions, digests and pins.\n` +
    `2. \`process\`: actual saved clarification, correction, conversation, plans, decisions and tool checkpoints.\n` +
    `3. \`artifactSnapshots\`: original, edited, superseded and materialized versions with their exact citations.\n` +
    `4. \`personCommands\` and \`independentReadback\`: ${packet.personCommands.length} successful ordinary command receipts, identical task replay, saved task, Brief and manual handoff; independently counted forbidden effects.\n` +
    `5. \`usage\`: actual persisted run counters, reservations and synthetic costs.\n\n` +
    `For blind broker comparison, retain this original evidence. A coordinator should prepare separately labelled copies of the model deliverable and an experienced broker's deliverable from the same goal, constraints, sources and clarification transcript. No broker baseline currently exists; obtain it before comparing. Consistently pseudonymize all actor/record identifiers and citation references in both copies, hide generator/provider/process labels, and randomize their order. Preserve property facts, source evidence, uncertainties and resulting records. Use a reviewer who did not author the baseline; record independent scores and adjudicate disagreements using [the evaluation rubric](${resolve("docs/delivery/generative-process-evaluation.md")}). Leave scores pending until that review occurs.\n`;
  writeFileSync(reviewFile, guide);
}
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
  qualityPacket: {
    status: packetAvailable ? "available_for_human_review" : "unavailable",
    json: packetAvailable ? packetFile : null,
    entrypoint: packetAvailable ? reviewFile : null,
    sha256: packetAvailable
      ? createHash("sha256").update(readFileSync(packetFile)).digest("hex")
      : null,
    reason: packetAvailable
      ? null
      : "The successful buyer job did not export a complete reviewable packet; no packet or expert baseline is fabricated.",
  },
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
