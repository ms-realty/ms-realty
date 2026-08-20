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
import { loadPayloadApprovedSearchProjection } from "../lib/payload-search-projection.mjs";
import { loadPayloadCmsImportRuntime } from "../lib/payload-cms-import.mjs";
import {
  openAiCompatibleHermesProvider,
  runHermesDraftWorker,
  writeHermesDraftWorkerReport,
} from "../lib/hermes-draft-worker.mjs";
import { HERMES_LAUNCH_REQUIRED } from "../lib/launch-service-contract.mjs";

const PROVISIONING_NEXT =
  "Next: run `npm run live:provisioning:preflight`; after it passes, rerun `npm run live:capture`, then `npm run live:preflight`.";

const postgresSyncReportPath = () =>
  process.env.MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH || process.env.MS_REALTY_SEARCH_SYNC_REPORT_PATH || undefined;
const postgresQueryReportPath = () =>
  process.env.MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH || process.env.MS_REALTY_SEARCH_QUERY_REPORT_PATH || undefined;

async function capture() {
  const runAt = new Date().toISOString();
  const provisioning = await buildLiveServiceProvisioningReport({ generatedAt: runAt });
  assertLiveServiceProvisioningReport(provisioning);
  if (!provisioning.ready) {
    const failed = provisioning.checks.filter((check) => check.status !== "pass").map((check) => check.id).join(", ");
    throw new Error(`live service provisioning must pass before capture: ${failed}`);
  }

  const payload = await loadPayloadCmsImportRuntime();
  let syncReport;
  let queryReport;
  try {
    const projection = await loadPayloadApprovedSearchProjection({ payload });
    syncReport = await runSearchEngineSync({ postgres: { payload }, projection, generatedAt: runAt });
    writeSearchEngineSyncReport(syncReport, postgresSyncReportPath());

    queryReport = await runSearchEngineQuerySmoke({ postgres: { payload }, projection, generatedAt: runAt });
    writeSearchEngineQueryReport(queryReport, postgresQueryReportPath());
  } finally {
    await payload.destroy?.();
  }

  const hermesReport = HERMES_LAUNCH_REQUIRED
    ? await runHermesDraftWorker({
        provider: openAiCompatibleHermesProvider(),
        filePath: process.env.MS_REALTY_TRANSLATION_LEDGER_PATH || undefined,
        auditPath: process.env.MS_REALTY_HERMES_AUDIT_PATH || undefined,
        auditLogPath: process.env.MS_REALTY_AUDIT_LOG_PATH || undefined,
        limit: Number(process.env.HERMES_DRAFT_LIMIT || 25),
        generatedAt: runAt,
        recordedAt: runAt,
      })
    : null;
  if (hermesReport) {
    writeHermesDraftWorkerReport(hermesReport, process.env.MS_REALTY_HERMES_WORKER_REPORT_PATH || undefined);
  }

  const result = validateLiveServiceReports({
    syncReportPath: postgresSyncReportPath(),
    queryReportPath: postgresQueryReportPath(),
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
      ...(hermesReport
        ? [`Hermes drafts: ${hermesReport.summary.persisted}/${hermesReport.summary.attempted} persisted`]
        : []),
    ].join("\n"),
  );
} catch (error) {
  console.error(`LIVE SERVICE EVIDENCE FAILED: ${error.message}`);
  if (/live service provisioning must pass before capture/.test(error.message)) console.error(PROVISIONING_NEXT);
  process.exitCode = 1;
}
