import { runSearchEngineQuerySmoke, writeSearchEngineQueryReport } from "../lib/search-engine-sync.mjs";

const report = await runSearchEngineQuerySmoke();
writeSearchEngineQueryReport(report);
console.log(`Queried ${report.summary.engines} search engines; first hits: ${report.summary.first_hit_ids.join(", ")}`);
