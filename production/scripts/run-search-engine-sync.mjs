import { runSearchEngineSync, writeSearchEngineSyncReport } from "../lib/search-engine-sync.mjs";

try {
  const report = await runSearchEngineSync({ generatedAt: new Date().toISOString() });
  writeSearchEngineSyncReport(report, process.env.MS_REALTY_SEARCH_SYNC_REPORT_PATH || undefined);
  console.log(`Synced ${report.summary.documents_per_engine.join("/")} search documents to configured engines`);
} catch (error) {
  console.error(`SEARCH ENGINE SYNC FAILED: ${error.message}`);
  process.exitCode = 1;
}
