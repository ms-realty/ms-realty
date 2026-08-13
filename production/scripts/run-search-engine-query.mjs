import { runSearchEngineQuerySmoke, writeSearchEngineQueryReport } from "../lib/search-engine-sync.mjs";
import { loadPayloadApprovedSearchProjection } from "../lib/payload-search-projection.mjs";

try {
  const projection = await loadPayloadApprovedSearchProjection();
  const report = await runSearchEngineQuerySmoke({ projection, generatedAt: new Date().toISOString() });
  writeSearchEngineQueryReport(
    report,
    process.env.MS_REALTY_POSTGRES_SEARCH_QUERY_REPORT_PATH || process.env.MS_REALTY_SEARCH_QUERY_REPORT_PATH || undefined,
  );
  console.log(`Queried Postgres search; first hits: ${report.summary.first_hit_ids.join(", ")}`);
} catch (error) {
  console.error(`SEARCH ENGINE QUERY FAILED: ${error.message}`);
  process.exitCode = 1;
}
