import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { readConsentLedger, resetConsentLedger } from "../lib/consent-ledger.mjs";
import { readEventLedger, resetEventLedger } from "../lib/events.mjs";
import { readLanguageRequests, resetLanguageRequests } from "../lib/language-requests.mjs";
import { readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { readSavedSearches, resetSavedSearches } from "../lib/saved-searches.mjs";
import { readSellerPipeline, resetSellerPipeline } from "../lib/seller-pipeline.mjs";

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
  const consentLedgerPath = tempLedger("app-api-consent", resetConsentLedger);
  const languageRequestPath = tempLedger("app-api-language-requests", resetLanguageRequests);
  const leadLedgerPath = tempLedger("app-api-leads", resetLeadLedger);
  const launchReadinessPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-app-api-readiness-`)}/launch-readiness.json`;
  const localeRegistryPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-app-api-locales-`)}/registry.json`;
  const savedSearchLedgerPath = tempLedger("app-api-saved-searches", resetSavedSearches);
  const sellerPipelinePath = tempLedger("app-api-seller-pipeline", resetSellerPipeline);
  const registry = JSON.parse(fs.readFileSync("locales/registry.json", "utf8"));
  registry.locales.push({
    code: "fr",
    native_name: "francais",
    admin_name: "French",
    direction: "ltr",
    public_enabled: false,
    indexable: false,
    fallback_locale: "ru",
    translation_provider: "hermes_draft",
    reviewer_role: "translation_editor",
  });
  fs.writeFileSync(localeRegistryPath, `${JSON.stringify(registry, null, 2)}\n`);
  fs.writeFileSync(
    launchReadinessPath,
    `${JSON.stringify({
      status: "blocked",
      launch_ready: false,
      blockers: ["external_seo_exports"],
      gates: [
        {
          id: "external_seo_exports",
          status: "blocked",
          message: "Search Console, Yandex, and backlink exports are required before launch.",
          evidence: {},
        },
      ],
    })}\n`,
  );
  await withEnv(
    {
      MS_REALTY_CONSENT_LEDGER_PATH: consentLedgerPath,
      MS_REALTY_EVENT_LEDGER_PATH: eventLedgerPath,
      MS_REALTY_LANGUAGE_REQUEST_LEDGER_PATH: languageRequestPath,
      MS_REALTY_LAUNCH_READINESS_OUTPUT_PATH: launchReadinessPath,
      MS_REALTY_LEAD_LEDGER_PATH: leadLedgerPath,
      MS_REALTY_LOCALE_REGISTRY_PATH: localeRegistryPath,
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
      const healthBody = await health.json();
      assert.equal(health.status, 200);
      assert.equal(healthBody.status, "ok");
      assert.equal(healthBody.launch_ready, false);
      assert.deepEqual(healthBody.blockers, ["external_seo_exports"]);

      const ready = await readyRoute.GET(new Request("https://example.test/api/ready"));
      const readyBody = await ready.json();
      assert.equal(ready.status, 503);
      assert.equal(readyBody.status, "blocked");
      assert.deepEqual(readyBody.blocked_gates, [
        {
          id: "external_seo_exports",
          status: "blocked",
          message: "Search Console, Yandex, and backlink exports are required before launch.",
        },
      ]);
      assert.equal(ready.headers.get("cache-control"), "no-store");
      assert.equal(ready.headers.get("retry-after"), "60");

      fs.writeFileSync(launchReadinessPath, `${JSON.stringify({ status: "ready", launch_ready: true, blockers: [] })}\n`);
      const readyAfterExport = await readyRoute.GET(new Request("https://example.test/api/ready"));
      const readyAfterExportBody = await readyAfterExport.json();
      assert.equal(readyAfterExport.status, 200);
      assert.equal(readyAfterExportBody.status, "ready");
      assert.equal(readyAfterExportBody.launch_ready, true);
      assert.deepEqual(readyAfterExportBody.blocked_gates, []);
      assert.equal(readyAfterExport.headers.get("cache-control"), "no-store");
      assert.equal(readyAfterExport.headers.get("retry-after"), null);

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
            source: "website_listing_detail",
            intent: "inquiry",
            leadType: "buyer",
            language: "he",
            listingReference: "MS-CRAWL-0001",
            contact: { name: "Noa Levi", whatsapp: "+359880000000" },
            contact_preference: "whatsapp",
            message: "Interested in this property.",
          }),
        }),
      );
      const leadBody = await lead.json();
      assert.equal(lead.status, 201);
      assert.equal(lead.headers.get("cache-control"), "no-store");
      assert.equal(leadBody.lead.listingReference, "MS-CRAWL-0001");
      assert.equal(leadBody.lead.intent, "inquiry");
      assert.equal(leadBody.ledger.intent, "inquiry");

      const sellerFormLead = await leadRoute.POST(
        new Request("https://example.test/api/leads", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            id: "next-api-seller-form-test",
            source: "website_seller_valuation",
            leadType: "seller",
            language: "bg",
            "contact.name": "Mira Petkova",
            "contact.phone": "+359880000000",
            contact_preference: "phone",
            "property.location": "Sandanski",
            "property.type": "apartment",
            message: "Please arrange a broker valuation.",
          }),
        }),
      );
      const sellerFormLeadBody = await sellerFormLead.json();
      assert.equal(sellerFormLead.status, 201);
      assert.deepEqual(sellerFormLeadBody.lead.property, { location: "Sandanski", type: "apartment" });
      assert.deepEqual(sellerFormLeadBody.sellerPipeline.property, { location: "Sandanski", type: "apartment" });

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
      assert.equal(languageRequestBody.fallback_locale, "ru");

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

      const savedSearchForm = await savedSearchRoute.POST(
        new Request("https://example.test/api/saved-searches", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            id: "next-api-saved-search-form-test",
            locale: "he",
            query: "Sandanski",
            filters: JSON.stringify({ location: "Sandanski" }),
            "contact.name": "Noa Levi",
          }),
        }),
      );
      const savedSearchFormBody = await savedSearchForm.json();
      assert.equal(savedSearchForm.status, 201);
      assert.deepEqual(savedSearchFormBody.filters, { location: "Sandanski" });
      assert.equal(savedSearchFormBody.contact.name, "Noa Levi");

      const retiredHermesChatRoute = await import("../../app/api/hermes/chat/route.js");
      const disabledHermesChat = await retiredHermesChatRoute.POST(
        new Request("https://example.test/api/hermes/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locale: "he", query: "Sandanski" }),
        }),
      );
      assert.equal(disabledHermesChat.status, 404);
      assert.equal(disabledHermesChat.headers.get("cache-control"), "no-store");
      assert.equal((await retiredHermesChatRoute.GET(new Request("https://example.test/api/hermes/chat"))).status, 404);
      assert.equal(fs.existsSync("app/api/hermes/chat/route.js"), true);
    },
  );

  assert.equal(readLeadLedger(leadLedgerPath).length, 2);
  assert.equal(readLeadLedger(leadLedgerPath).find((row) => row.lead_id === "next-api-lead-test").intent, "inquiry");
  assert.deepEqual(readLeadLedger(leadLedgerPath).find((row) => row.lead_id === "next-api-seller-form-test").property, {
    location: "Sandanski",
    type: "apartment",
  });
  assert.deepEqual(readSellerPipeline(sellerPipelinePath)[0].property, { location: "Sandanski", type: "apartment" });
  assert.equal(readLanguageRequests(languageRequestPath).length, 1);
  assert.equal(readSavedSearches(savedSearchLedgerPath).length, 2);
  assert.deepEqual(
    readConsentLedger(consentLedgerPath).map((row) => row.consent_type),
    ["inquiry_follow_up", "inquiry_follow_up", "language_request", "saved_search_alerts", "saved_search_alerts"],
  );
  assert.equal(readEventLedger(eventLedgerPath).filter((event) => event.type === "search").length, 1);
  assert.equal(readEventLedger(eventLedgerPath).filter((event) => event.type === "lead_submitted").length, 2);
  assert.equal(readEventLedger(eventLedgerPath).filter((event) => event.type === "cta_click").length, 1);
  assert.equal(readEventLedger(eventLedgerPath).some((event) => event.type === "hermes_chat"), false);
});
