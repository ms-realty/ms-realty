import {
  openAiCompatibleHermesProvider,
  runHermesDraftWorker,
  writeHermesDraftWorkerReport,
} from "../lib/hermes-draft-worker.mjs";

const limit = Number(process.env.HERMES_DRAFT_LIMIT || 25);

try {
  const runAt = new Date().toISOString();
  const report = await runHermesDraftWorker({
    provider: openAiCompatibleHermesProvider(),
    filePath: process.env.MS_REALTY_TRANSLATION_LEDGER_PATH || undefined,
    auditPath: process.env.MS_REALTY_HERMES_AUDIT_PATH || undefined,
    auditLogPath: process.env.MS_REALTY_AUDIT_LOG_PATH || undefined,
    limit,
    generatedAt: runAt,
    recordedAt: runAt,
  });
  writeHermesDraftWorkerReport(report, process.env.MS_REALTY_HERMES_WORKER_REPORT_PATH || undefined);
  console.log(`Persisted ${report.summary.persisted}/${report.summary.attempted} Hermes draft outputs`);
} catch (error) {
  console.error(`HERMES DRAFT WORKER FAILED: ${error.message}`);
  process.exitCode = 1;
}
