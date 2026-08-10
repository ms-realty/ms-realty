import {
  DEFAULT_SEARCH_ENGINE_SYNC_SMOKE,
  runSearchEngineSync,
  writeSearchEngineSyncReport,
} from "../lib/search-engine-sync.mjs";

const calls = [];
const PUBLIC_LOOKUP = async () => [{ address: "1.1.1.1", family: 4 }];

async function fakeFetch(url, options) {
  calls.push({
    method: options.method,
    url,
    content_type: options.headers["content-type"],
    bytes: Buffer.byteLength(options.body || ""),
  });
  return { ok: true, status: options.method === "POST" ? 201 : 202 };
}

const report = await runSearchEngineSync({
  fetchImpl: fakeFetch,
  typesense: { baseUrl: "https://typesense.ms-realty.bg", apiKey: "dev-ms-realty", lookupImpl: PUBLIC_LOOKUP },
  meilisearch: { baseUrl: "https://meili.ms-realty.bg", apiKey: "dev-ms-realty", lookupImpl: PUBLIC_LOOKUP },
});
writeSearchEngineSyncReport({ ...report, calls }, DEFAULT_SEARCH_ENGINE_SYNC_SMOKE);
console.log(`Wrote search engine sync smoke report to ${DEFAULT_SEARCH_ENGINE_SYNC_SMOKE}`);
