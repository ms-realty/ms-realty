import fs from "node:fs";
import {
  DEFAULT_SEARCH_ENGINE_QUERY_SMOKE,
  runSearchEngineQuerySmoke,
  writeSearchEngineQueryReport,
} from "../lib/search-engine-sync.mjs";
import { fromRoot } from "../lib/paths.mjs";

const docs = JSON.parse(fs.readFileSync(fromRoot("search", "data", "index-listings.json"), "utf8"));
const reviewed = docs.find((doc) => doc.id === "MS-CRAWL-0001:bg");

async function fakeFetch(url) {
  if (url.includes("typesense.local")) {
    return { ok: true, status: 200, async json() { return { found: 1, hits: [{ document: reviewed }] }; } };
  }
  return { ok: true, status: 200, async json() { return { estimatedTotalHits: 1, hits: [reviewed] }; } };
}

const report = await runSearchEngineQuerySmoke({
  fetchImpl: fakeFetch,
  typesense: { baseUrl: "http://typesense.local", apiKey: "dev-ms-realty" },
  meilisearch: { baseUrl: "http://meili.local", apiKey: "dev-ms-realty" },
});
writeSearchEngineQueryReport(report, DEFAULT_SEARCH_ENGINE_QUERY_SMOKE);
console.log(`Wrote search engine query smoke report to ${DEFAULT_SEARCH_ENGINE_QUERY_SMOKE}`);
