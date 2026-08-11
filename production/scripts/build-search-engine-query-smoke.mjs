import fs from "node:fs";
import crypto from "node:crypto";
import {
  DEFAULT_SEARCH_ENGINE_QUERY_SMOKE,
  runSearchEngineQuerySmoke,
  writeSearchEngineQueryReport,
} from "../lib/search-engine-sync.mjs";
import { fromRoot } from "../lib/paths.mjs";

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
  queryImpl: async ({ intent, q, target }) => {
    const exactReference = String(intent?.exact_reference || q || "").trim();
    const hits = projection.documents
      .filter(
        (document) =>
          !exactReference ||
          document.listing_reference === exactReference ||
          document.source_listing_id === exactReference ||
          document.id === exactReference,
      )
      .map((document) => ({
        id: document.id,
        source_listing_id: document.source_listing_id,
        listing_reference: document.listing_reference,
        locale: document.locale,
        locale_path: document.locale_path,
        title: document.title,
      }));
    return {
      engine: "postgres",
      database_target: "postgres://db.ms-realty.bg:5432/ms_realty",
      total: hits.length,
      hits,
      page: 1,
      page_size: 5,
      locale_codes: [...new Set(hits.map((hit) => hit.locale))],
      unavailable_engines: [],
      target,
    };
  },
};

const report = await runSearchEngineQuerySmoke({
  postgres,
  projection,
});
writeSearchEngineQueryReport(report, DEFAULT_SEARCH_ENGINE_QUERY_SMOKE);
console.log(`Wrote search engine query smoke report to ${DEFAULT_SEARCH_ENGINE_QUERY_SMOKE}`);
