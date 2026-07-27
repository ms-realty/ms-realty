import { runHermesDraftWorker, writeHermesDraftWorkerReport } from "../lib/hermes-draft-worker.mjs";
import {
  hermesProviderForBackend,
  hermesProviderMetadataForBackend,
  readHermesBackend,
} from "../lib/hermes-backend.mjs";

const limit = Number(process.env.HERMES_DRAFT_LIMIT || 25);

try {
  const runAt = new Date().toISOString();
  // The backend switch (npm run hermes:backend) decides who generates:
  // openrouter spends per token, claude-cli/codex-cli ride the operator's
  // desktop subscriptions. CLI backends fail closed in production.
  const backend = readHermesBackend().backend;
  console.log(`Hermes backend: ${backend}`);
  const providerMetadata = hermesProviderMetadataForBackend(backend);
  const report = await runHermesDraftWorker({
    provider: hermesProviderForBackend(backend),
    ...(providerMetadata ? { providerMetadata } : {}),
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
