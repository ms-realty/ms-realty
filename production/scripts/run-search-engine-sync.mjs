import { runSearchEngineSync, writeSearchEngineSyncReport } from "../lib/search-engine-sync.mjs";

try {
  const report = await runSearchEngineSync();
  writeSearchEngineSyncReport(report);
  console.log(`Synced ${report.summary.documents_per_engine.join("/")} search documents to configured engines`);
} catch (error) {
  console.error(`SEARCH ENGINE SYNC FAILED: ${error.message}`);
  process.exitCode = 1;
}
