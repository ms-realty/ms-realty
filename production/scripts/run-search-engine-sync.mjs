import { runSearchEngineSync, writeSearchEngineSyncReport } from "../lib/search-engine-sync.mjs";
import { loadPayloadApprovedSearchProjection } from "../lib/payload-search-projection.mjs";

try {
  const projection = await loadPayloadApprovedSearchProjection();
  const report = await runSearchEngineSync({ projection, generatedAt: new Date().toISOString() });
  writeSearchEngineSyncReport(report, process.env.MS_REALTY_SEARCH_SYNC_REPORT_PATH || undefined);
  console.log(`Synced ${report.summary.documents_per_engine.join("/")} search documents to configured engines`);
} catch (error) {
  console.error(`SEARCH ENGINE SYNC FAILED: ${error.message}`);
  process.exitCode = 1;
}
