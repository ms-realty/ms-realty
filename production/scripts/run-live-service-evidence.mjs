import { validateLiveServiceReports } from "../lib/launch-readiness.mjs";
import {
  assertLiveServiceProvisioningReport,
  buildLiveServiceProvisioningReport,
} from "../lib/live-service-provisioning.mjs";
import {
  runSearchEngineQuerySmoke,
  runSearchEngineSync,
  writeSearchEngineQueryReport,
  writeSearchEngineSyncReport,
} from "../lib/search-engine-sync.mjs";
import {
  openAiCompatibleHermesProvider,
  runHermesDraftWorker,
  writeHermesDraftWorkerReport,
} from "../lib/hermes-draft-worker.mjs";

async function capture() {
  const runAt = new Date().toISOString();
  const provisioning = await buildLiveServiceProvisioningReport({ generatedAt: runAt });
  assertLiveServiceProvisioningReport(provisioning);
  if (!provisioning.ready) {
    const failed = provisioning.checks.filter((check) => check.status !== "pass").map((check) => check.id).join(", ");
    throw new Error(`live service provisioning must pass before capture: ${failed}`);
  }

  const syncReport = await runSearchEngineSync({ generatedAt: runAt });
  writeSearchEngineSyncReport(syncReport, process.env.MS_REALTY_SEARCH_SYNC_REPORT_PATH || undefined);

  const queryReport = await runSearchEngineQuerySmoke({ generatedAt: runAt });
  writeSearchEngineQueryReport(queryReport, process.env.MS_REALTY_SEARCH_QUERY_REPORT_PATH || undefined);

  const hermesReport = await runHermesDraftWorker({
    provider: openAiCompatibleHermesProvider(),
    filePath: process.env.MS_REALTY_TRANSLATION_LEDGER_PATH || undefined,
    auditPath: process.env.MS_REALTY_HERMES_AUDIT_PATH || undefined,
    auditLogPath: process.env.MS_REALTY_AUDIT_LOG_PATH || undefined,
    limit: Number(process.env.HERMES_DRAFT_LIMIT || 25),
    generatedAt: runAt,
    recordedAt: runAt,
  });
  writeHermesDraftWorkerReport(hermesReport, process.env.MS_REALTY_HERMES_WORKER_REPORT_PATH || undefined);

  const result = validateLiveServiceReports({
    syncReportPath: process.env.MS_REALTY_SEARCH_SYNC_REPORT_PATH,
    queryReportPath: process.env.MS_REALTY_SEARCH_QUERY_REPORT_PATH,
    hermesReportPath: process.env.MS_REALTY_HERMES_WORKER_REPORT_PATH,
  });
  if (!result.ready) {
    throw new Error(result.reports.filter((report) => report.status !== "pass").map((report) => report.source).join(", "));
  }

  return { syncReport, queryReport, hermesReport };
}

try {
  const { syncReport, queryReport, hermesReport } = await capture();
  console.log(
    [
      `Search sync: ${syncReport.summary.documents_per_engine.join("/")} documents`,
      `Search query: ${queryReport.summary.total_hits} hits`,
      `Hermes drafts: ${hermesReport.summary.persisted}/${hermesReport.summary.attempted} persisted`,
    ].join("\n"),
  );
} catch (error) {
  console.error(`LIVE SERVICE EVIDENCE FAILED: ${error.message}`);
  process.exitCode = 1;
}
