import { runSearchEngineSync, writeSearchEngineSyncReport } from "../lib/search-engine-sync.mjs";

const report = await runSearchEngineSync();
writeSearchEngineSyncReport(report);
console.log(`Synced ${report.summary.documents_per_engine.join("/")} search documents to configured engines`);
