import {
  DEFAULT_SEARCH_ENGINE_SYNC_SMOKE,
  runSearchEngineSync,
  writeSearchEngineSyncReport,
} from "../lib/search-engine-sync.mjs";
import { fromRoot } from "../lib/paths.mjs";
import fs from "node:fs";
import crypto from "node:crypto";

const calls = [];
const docs = JSON.parse(fs.readFileSync(fromRoot("search", "data", "index-listings.json"), "utf8"));
const reviewed = docs.find((doc) => doc.id === "MS-CRAWL-0001:bg");
const documents = reviewed ? [reviewed] : [];
const projection = {
  schema_version: 1,
  documents,
  summary: { input_rows: documents.length, projected_documents: documents.length, skipped_rows: 0 },
  source: {
    kind: "payload_postgres",
    authoritative: true,
    listing_rows: documents.length,
    eligible_translation_rows: documents.length,
    projected_documents: documents.length,
    locale_codes: [...new Set(documents.map((document) => document.locale))],
    digest: crypto.createHash("sha256").update(JSON.stringify(documents)).digest("hex"),
  },
};
const postgres = {
  env: {
    DATABASE_URL: "postgres://db.ms-realty.bg:5432/ms_realty",
    PAYLOAD_SECRET: "dev-ms-realty-payload-secret",
  },
  snapshotQueryImpl: async () => projection.documents,
};

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
  postgres,
  projection,
  fetchImpl: fakeFetch,
});
writeSearchEngineSyncReport({ ...report, calls }, DEFAULT_SEARCH_ENGINE_SYNC_SMOKE);
console.log(`Wrote search engine sync smoke report to ${DEFAULT_SEARCH_ENGINE_SYNC_SMOKE}`);
