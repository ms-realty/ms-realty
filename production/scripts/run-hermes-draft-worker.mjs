import {
  openAiCompatibleHermesProvider,
  runHermesDraftWorker,
  writeHermesDraftWorkerReport,
} from "../lib/hermes-draft-worker.mjs";

const limit = Number(process.env.HERMES_DRAFT_LIMIT || 25);

try {
  const report = await runHermesDraftWorker({
    provider: openAiCompatibleHermesProvider(),
    limit,
  });
  writeHermesDraftWorkerReport(report);
  console.log(`Persisted ${report.summary.persisted}/${report.summary.attempted} Hermes draft outputs`);
} catch (error) {
  console.error(`HERMES DRAFT WORKER FAILED: ${error.message}`);
  process.exitCode = 1;
}
