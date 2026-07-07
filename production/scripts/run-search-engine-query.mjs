import { runSearchEngineQuerySmoke, writeSearchEngineQueryReport } from "../lib/search-engine-sync.mjs";

try {
  const report = await runSearchEngineQuerySmoke({ generatedAt: new Date().toISOString() });
  writeSearchEngineQueryReport(report, process.env.MS_REALTY_SEARCH_QUERY_REPORT_PATH || undefined);
  console.log(`Queried ${report.summary.engines} search engines; first hits: ${report.summary.first_hit_ids.join(", ")}`);
} catch (error) {
  console.error(`SEARCH ENGINE QUERY FAILED: ${error.message}`);
  process.exitCode = 1;
}
