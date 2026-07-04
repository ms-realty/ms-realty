import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { createHttpApp } from "../lib/http.mjs";
import { assertLeadLedger, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { assertLanguageRequests, readLanguageRequests, resetLanguageRequests } from "../lib/language-requests.mjs";
import { assertReplyOutbox, readReplyOutbox, resetReplyOutbox } from "../lib/lead-replies.mjs";
import { assertTranslationLedger, readTranslationLedger, resetTranslationLedger } from "../lib/translation-ledger.mjs";
import { assertListingEdits, readListingEdits, resetListingEdits } from "../lib/listing-edits.mjs";
import { assertViewingLedger, readViewings, resetViewingLedger } from "../lib/viewing-ledger.mjs";
import { assertSavedSearches, readSavedSearches, resetSavedSearches } from "../lib/saved-searches.mjs";
import { assertSellerPipeline, readSellerPipeline, resetSellerPipeline } from "../lib/seller-pipeline.mjs";
import { assertBrokerContacts, readBrokerContacts, resetBrokerContacts } from "../lib/broker-contacts.mjs";
import { assertServerSmoke, close, createNodeServer, jsonFetch, listen, textFetch } from "../lib/node-server.mjs";
import { fromRoot } from "../lib/paths.mjs";

async function withServer(fn) {
  const leadLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-`)}/leads.jsonl`;
  const replyOutboxPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-replies-`)}/replies.jsonl`;
  const languageRequestPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-language-`)}/requests.jsonl`;
  const translationLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-translations-`)}/translations.jsonl`;
  const listingEditLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-listing-edits-`)}/edits.jsonl`;
  const viewingLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-viewings-`)}/viewings.jsonl`;
  const savedSearchLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-saved-searches-`)}/saved-searches.jsonl`;
  const sellerPipelinePath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-seller-pipeline-`)}/seller-pipeline.jsonl`;
  const brokerContactLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-broker-contacts-`)}/broker-contacts.jsonl`;
  resetLeadLedger(leadLedgerPath);
  resetReplyOutbox(replyOutboxPath);
  resetLanguageRequests(languageRequestPath);
  resetTranslationLedger(translationLedgerPath);
  resetListingEdits(listingEditLedgerPath);
  resetViewingLedger(viewingLedgerPath);
  resetSavedSearches(savedSearchLedgerPath);
  resetSellerPipeline(sellerPipelinePath);
  resetBrokerContacts(brokerContactLedgerPath);
  const server = createNodeServer(
    createHttpApp({
      leadLedgerPath,
      replyOutboxPath,
      languageRequestPath,
      translationLedgerPath,
      listingEditLedgerPath,
      viewingLedgerPath,
      savedSearchLedgerPath,
      sellerPipelinePath,
      brokerContactLedgerPath,
      receivedAt: "2026-07-04T00:00:00Z",
      requestedAt: "2026-07-04T00:01:00Z",
      editedAt: "2026-07-04T00:03:00Z",
      reviewedAt: "2026-07-04T00:05:00Z",
      bookedAt: "2026-07-04T00:06:00Z",
      savedAt: "2026-07-04T00:07:00Z",
      sellerPipelineCreatedAt: "2026-07-04T00:08:00Z",
    }),
  );
  const address = await listen(server);
  try {
    return await fn(
      `http://${address.address}:${address.port}`,
      leadLedgerPath,
      replyOutboxPath,
      languageRequestPath,
      translationLedgerPath,
      listingEditLedgerPath,
      viewingLedgerPath,
      savedSearchLedgerPath,
      sellerPipelinePath,
      brokerContactLedgerPath,
    );
  } finally {
    await close(server);
  }
}

function deployableRedirect() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
}

test("Node server serves live listing, search, lead, and viewing endpoints", async () => {
  await withServer(
    async (
      baseUrl,
      leadLedgerPath,
      replyOutboxPath,
      languageRequestPath,
      translationLedgerPath,
      listingEditLedgerPath,
      viewingLedgerPath,
      savedSearchLedgerPath,
      sellerPipelinePath,
      brokerContactLedgerPath,
    ) => {
      const redirect = deployableRedirect();
      const oldUrl = new URL(redirect.old_url);
      const smoke = {
        legacyRedirect: await textFetch(baseUrl, oldUrl.pathname, {
          headers: { "x-forwarded-host": redirect.source_domain },
          redirect: "manual",
          captureHeaders: true,
        }),
        listing: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
        listingHtml: await textFetch(baseUrl, "/he/properties/MS-CRAWL-0001", {
          headers: { accept: "text/html" },
        }),
        brokerContact: await jsonFetch(baseUrl, "/api/admin/broker-contacts", {
          method: "POST",
          headers: { authorization: "Bearer local-admin-smoke" },
          body: JSON.stringify({
            id: "node-server-broker-contact-test",
            listingId: "MS-CRAWL-0001",
            broker: "broker_ru",
            phone: "+359880000000",
            reviewer: "owner",
            approved: true,
          }),
        }),
        listingAfterBrokerContact: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
        search: await jsonFetch(baseUrl, "/api/search?locale=he&q=Sandanski"),
        searchHtml: await textFetch(baseUrl, "/he/search?q=Sandanski", {
          headers: { accept: "text/html" },
        }),
        location: await jsonFetch(baseUrl, "/he/locations/sandanski"),
        locationHtml: await textFetch(baseUrl, "/he/locations/sandanski", {
          headers: { accept: "text/html" },
        }),
        languageRequest: await jsonFetch(baseUrl, "/api/language-requests", {
          method: "POST",
          body: JSON.stringify({
            id: "node-server-language-request-test",
            requestedLocale: "fr",
            requestedPath: "/fr/",
            contact: { name: "Claire Martin" },
            message: "Please notify me when French property pages are reviewed.",
          }),
        }),
        savedSearch: await jsonFetch(baseUrl, "/api/saved-searches", {
          method: "POST",
          body: JSON.stringify({
            id: "node-server-saved-search-test",
            locale: "he",
            query: "Sandanski",
            filters: { property_type: "apartment" },
            contact: { name: "Noa Levi" },
          }),
        }),
        sitemap: await textFetch(baseUrl, "/sitemap.xml"),
        robots: await textFetch(baseUrl, "/robots.txt"),
        sellerPage: await jsonFetch(baseUrl, "/he/sell"),
        sellerHtml: await textFetch(baseUrl, "/he/sell", {
          headers: { accept: "text/html" },
        }),
        lead: await jsonFetch(baseUrl, "/api/leads", {
          method: "POST",
          body: JSON.stringify({
            id: "node-server-lead-test",
            leadType: "buyer",
            language: "he",
            listingReference: "MS-CRAWL-0001",
            contact: { name: "Noa Levi" },
            contact_preference: "whatsapp",
          }),
        }),
        viewingLead: await jsonFetch(baseUrl, "/api/leads", {
          method: "POST",
          body: JSON.stringify({
            id: "node-server-viewing-lead-test",
            source: "website_viewing_request",
            leadType: "buyer",
            language: "he",
            listingReference: "MS-CRAWL-0001",
            contact: { name: "Noa Levi" },
            contact_preference: "phone",
            message: "I would like to view this property.",
          }),
        }),
        sellerLead: await jsonFetch(baseUrl, "/api/leads", {
          method: "POST",
          body: JSON.stringify({
            id: "node-server-seller-lead-test",
            source: "website_seller_valuation",
            leadType: "seller",
            language: "el",
            contact: { name: "Nikos Papadopoulos" },
            message: "I want a valuation for my property.",
          }),
        }),
        badLead: await jsonFetch(baseUrl, "/api/leads", {
          method: "POST",
          body: JSON.stringify({
            id: "node-server-bad-lead-test",
            leadType: "buyer",
            language: "he",
            listingReference: "missing",
            contact: { name: "Noa Levi" },
          }),
        }),
        admin: await jsonFetch(baseUrl, "/api/admin/leads?locale=ru", {
          headers: { authorization: "Bearer local-admin-smoke" },
        }),
        adminUnauthorized: await jsonFetch(baseUrl, "/api/admin/leads?locale=ru"),
        reply: await jsonFetch(baseUrl, "/api/admin/replies", {
          method: "POST",
          headers: { authorization: "Bearer local-admin-smoke" },
          body: JSON.stringify({
            leadId: "node-server-lead-test",
            reviewedReply: "Reviewed reply approved by broker.",
            reviewer: "broker_ru",
            approved: true,
          }),
        }),
        replyUnauthorized: await jsonFetch(baseUrl, "/api/admin/replies", {
          method: "POST",
          body: JSON.stringify({
            leadId: "node-server-lead-test",
            reviewedReply: "No auth",
            reviewer: "broker_ru",
            approved: true,
          }),
        }),
        viewing: await jsonFetch(baseUrl, "/api/admin/viewings", {
          method: "POST",
          headers: { authorization: "Bearer local-admin-smoke" },
          body: JSON.stringify({
            leadId: "node-server-lead-test",
            startsAt: "2026-07-06T10:00:00Z",
            broker: "broker_ru",
          }),
        }),
        viewingUnauthorized: await jsonFetch(baseUrl, "/api/admin/viewings", {
          method: "POST",
          body: JSON.stringify({
            leadId: "node-server-lead-test",
            startsAt: "2026-07-06T10:00:00Z",
            broker: "broker_ru",
          }),
        }),
      };
      smoke.translationDraft = await jsonFetch(baseUrl, "/api/admin/translations/draft", {
        method: "POST",
        headers: { authorization: "Bearer local-admin-smoke" },
        body: JSON.stringify({
          objectType: "listing",
          objectId: "MS-CRAWL-0001",
          sourceLocale: "bg",
          targetLocale: "el",
          sourceContent: {
            title: "Reviewed listing title",
            description: "Reviewed listing description for Sandanski.",
          },
          propertyFacts: { id: "MS-CRAWL-0001", location: "Sandanski" },
        }),
      });
      smoke.translationPublish = await jsonFetch(baseUrl, "/api/admin/translations/publish", {
        method: "POST",
        headers: { authorization: "Bearer local-admin-smoke" },
        body: JSON.stringify({
          taskId: smoke.translationDraft.body.id,
          reviewer: "translator_el",
          approvedAt: "2026-07-04T00:02:00Z",
        }),
      });
      smoke.listingEdit = await jsonFetch(baseUrl, "/api/admin/listings/edit", {
        method: "POST",
        headers: { authorization: "Bearer local-admin-smoke" },
        body: JSON.stringify({
          listingId: "MS-CRAWL-0001",
          editor: "editor_bg",
          patch: { description: "Updated approved source description." },
        }),
      });
      smoke.staleListing = await jsonFetch(baseUrl, "/el/akinita/MS-CRAWL-0001");
      smoke.staleSearch = await jsonFetch(baseUrl, "/api/search?locale=el&q=Sandanski");
      smoke.admin = await jsonFetch(baseUrl, "/api/admin/leads?locale=ru", {
        headers: { authorization: "Bearer local-admin-smoke" },
      });
      assert.equal(assertServerSmoke(smoke), true);
      assert.equal(smoke.legacyRedirect.headers.location, redirect.target_path);
      assert.equal(smoke.listingAfterBrokerContact.body.body.actions.direct_contact.review_status, "approved_broker_contact");
      assert.equal(smoke.location.body.cards.length, 1);
      assert.equal(smoke.lead.body.contact_preference, "whatsapp");
      assert.equal(smoke.viewingLead.body.lead.source, "website_viewing_request");
      assert.equal(assertLeadLedger(readLeadLedger(leadLedgerPath)), true);
      assert.equal(assertReplyOutbox(readReplyOutbox(replyOutboxPath)), true);
      assert.equal(assertLanguageRequests(readLanguageRequests(languageRequestPath)), true);
      assert.equal(assertTranslationLedger(readTranslationLedger(translationLedgerPath)), true);
      assert.equal(assertListingEdits(readListingEdits(listingEditLedgerPath)), true);
      assert.equal(assertViewingLedger(readViewings(viewingLedgerPath)), true);
      assert.equal(assertSavedSearches(readSavedSearches(savedSearchLedgerPath)), true);
      assert.equal(assertSellerPipeline(readSellerPipeline(sellerPipelinePath)), true);
      assert.equal(assertBrokerContacts(readBrokerContacts(brokerContactLedgerPath)), true);
      assert.equal(smoke.staleListing.body.metadata.robots, "noindex,follow");
    },
  );
});

test("generated Node server smoke file is valid when present", () => {
  const file = fromRoot("production", "data", "node-server-smoke.json");
  if (!fs.existsSync(file)) return;
  const smoke = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertServerSmoke(smoke), true);
});
