import { runSearchEngineQuerySmoke, writeSearchEngineQueryReport } from "../lib/search-engine-sync.mjs";

try {
  const report = await runSearchEngineQuerySmoke();
  writeSearchEngineQueryReport(report);
  console.log(`Queried ${report.summary.engines} search engines; first hits: ${report.summary.first_hit_ids.join(", ")}`);
} catch (error) {
  console.error(`SEARCH ENGINE QUERY FAILED: ${error.message}`);
  process.exitCode = 1;
}
