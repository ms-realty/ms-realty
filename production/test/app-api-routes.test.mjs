import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { readEventLedger, resetEventLedger } from "../lib/events.mjs";
import { readLanguageRequests, resetLanguageRequests } from "../lib/language-requests.mjs";
import { readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { readSavedSearches, resetSavedSearches } from "../lib/saved-searches.mjs";
import { resetSellerPipeline } from "../lib/seller-pipeline.mjs";

function tempLedger(prefix, reset) {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${prefix}-`)}/${prefix}.jsonl`;
  reset(file);
  return file;
}

async function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    process.env[key] = env[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("Next API routes reuse health, readiness, search, and lead HTTP contracts", async () => {
  const eventLedgerPath = tempLedger("app-api-events", resetEventLedger);
  const languageRequestPath = tempLedger("app-api-language-requests", resetLanguageRequests);
  const leadLedgerPath = tempLedger("app-api-leads", resetLeadLedger);
  const savedSearchLedgerPath = tempLedger("app-api-saved-searches", resetSavedSearches);
  const sellerPipelinePath = tempLedger("app-api-seller-pipeline", resetSellerPipeline);
  await withEnv(
    {
      MS_REALTY_EVENT_LEDGER_PATH: eventLedgerPath,
      MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH: languageRequestPath,
      MS_REALTY_LEAD_LEDGER_PATH: leadLedgerPath,
      MS_REALTY_SAVED_SEARCH_LEDGER_PATH: savedSearchLedgerPath,
      MS_REALTY_SELLER_PIPELINE_PATH: sellerPipelinePath,
    },
    async () => {
      const eventRoute = await import("../../app/api/events/route.js");
      const healthRoute = await import("../../app/api/health/route.js");
      const languageRequestRoute = await import("../../app/api/language-requests/route.js");
      const readyRoute = await import("../../app/api/ready/route.js");
      const savedSearchRoute = await import("../../app/api/saved-searches/route.js");
      const searchRoute = await import("../../app/api/search/route.js");
      const leadRoute = await import("../../app/api/leads/route.js");

      const health = await healthRoute.GET(new Request("https://example.test/api/health"));
      assert.equal(health.status, 200);
      assert.equal((await health.json()).status, "ok");

      const ready = await readyRoute.GET(new Request("https://example.test/api/ready"));
      assert.equal(ready.status, 503);
      assert.equal((await ready.json()).status, "blocked");

      const search = await searchRoute.GET(new Request("https://example.test/api/search?locale=he&q=Sandanski"));
      const searchBody = await search.json();
      assert.equal(search.status, 200);
      assert.equal(searchBody.kind, "search");
      assert.equal(searchBody.search.query, "Sandanski");
      assert.ok(searchBody.search.total_matches > 0);

      const lead = await leadRoute.POST(
        new Request("https://example.test/api/leads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "next-api-lead-test",
            leadType: "buyer",
            language: "he",
            listingReference: "MS-CRAWL-0001",
            contact: { name: "Noa Levi" },
            contact_preference: "whatsapp",
            message: "Interested in this property.",
          }),
        }),
      );
      const leadBody = await lead.json();
      assert.equal(lead.status, 201);
      assert.equal(lead.headers.get("cache-control"), "no-store");
      assert.equal(leadBody.lead.listingReference, "MS-CRAWL-0001");

      const event = await eventRoute.POST(
        new Request("https://example.test/api/events", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ type: "cta_click", path: "/he/properties/MS-CRAWL-0001", locale: "he", action: "call" }),
        }),
      );
      assert.equal(event.status, 201);
      assert.equal((await event.json()).type, "cta_click");

      const languageRequest = await languageRequestRoute.POST(
        new Request("https://example.test/api/language-requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "next-api-language-request-test",
            requestedLocale: "fr",
            requestedPath: "/fr/",
            contact: { name: "Claire" },
            message: "Please notify me when French is available.",
          }),
        }),
      );
      const languageRequestBody = await languageRequest.json();
      assert.equal(languageRequest.status, 201);
      assert.equal(languageRequest.headers.get("cache-control"), "no-store");
      assert.equal(languageRequestBody.public_indexable, false);

      const savedSearch = await savedSearchRoute.POST(
        new Request("https://example.test/api/saved-searches", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "next-api-saved-search-test",
            locale: "he",
            query: "Sandanski",
            filters: { location: "Sandanski" },
            contact: { name: "Noa Levi" },
            alertFrequency: "weekly",
          }),
        }),
      );
      const savedSearchBody = await savedSearch.json();
      assert.equal(savedSearch.status, 201);
      assert.equal(savedSearch.headers.get("cache-control"), "no-store");
      assert.equal(savedSearchBody.status, "active");
      assert.ok(savedSearchBody.match_count > 0);
    },
  );

  assert.equal(readLeadLedger(leadLedgerPath).length, 1);
  assert.equal(readLanguageRequests(languageRequestPath).length, 1);
  assert.equal(readSavedSearches(savedSearchLedgerPath).length, 1);
  assert.equal(readEventLedger(eventLedgerPath).filter((event) => event.type === "search").length, 1);
  assert.equal(readEventLedger(eventLedgerPath).filter((event) => event.type === "lead_submitted").length, 1);
  assert.equal(readEventLedger(eventLedgerPath).filter((event) => event.type === "cta_click").length, 1);
});
