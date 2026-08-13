import { runSearchEngineSync, writeSearchEngineSyncReport } from "../lib/search-engine-sync.mjs";
import { loadPayloadApprovedSearchProjection } from "../lib/payload-search-projection.mjs";

try {
  const projection = await loadPayloadApprovedSearchProjection();
  const report = await runSearchEngineSync({ projection, generatedAt: new Date().toISOString() });
  writeSearchEngineSyncReport(
    report,
    process.env.MS_REALTY_POSTGRES_SEARCH_SYNC_REPORT_PATH || process.env.MS_REALTY_SEARCH_SYNC_REPORT_PATH || undefined,
  );
  console.log(`Verified ${report.summary.documents_per_engine[0]} documents in the Postgres search view`);
} catch (error) {
  console.error(`SEARCH ENGINE SYNC FAILED: ${error.message}`);
  process.exitCode = 1;
}
