import fs from "node:fs";
import path from "node:path";
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

const leadLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-leads-")), "leads.jsonl");
const replyOutboxPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-replies-")), "replies.jsonl");
const languageRequestPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-language-")), "requests.jsonl");
const translationLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-translations-")), "translations.jsonl");
const listingEditLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-listing-edits-")), "edits.jsonl");
const viewingLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-viewings-")), "viewings.jsonl");
const savedSearchLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-saved-searches-")), "saved-searches.jsonl");
const sellerPipelinePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-seller-pipeline-")), "seller-pipeline.jsonl");
const brokerContactLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-broker-contacts-")), "broker-contacts.jsonl");
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
const baseUrl = `http://${address.address}:${address.port}`;
const legacyRedirect = JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
const legacyUrl = new URL(legacyRedirect.old_url);

try {
  const smoke = {
    fixture_id: "node-server-smoke-20260704",
    baseUrl: "http://127.0.0.1:0",
    legacyRedirect: await textFetch(baseUrl, legacyUrl.pathname, {
      headers: { "x-forwarded-host": legacyRedirect.source_domain },
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
        id: "broker-contact-server-MS-CRAWL-0001",
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
    languageRequest: await jsonFetch(baseUrl, "/api/language-requests", {
      method: "POST",
      body: JSON.stringify({
        id: "server-language-request-fr-0001",
        requestedLocale: "fr",
        requestedPath: "/fr/",
        contact: { name: "Claire Martin" },
        message: "Please notify me when French property pages are reviewed.",
      }),
    }),
    sitemap: await textFetch(baseUrl, "/sitemap.xml"),
    robots: await textFetch(baseUrl, "/robots.txt"),
    sellerPage: await jsonFetch(baseUrl, "/he/sell"),
    sellerHtml: await textFetch(baseUrl, "/he/sell", {
      headers: { accept: "text/html" },
    }),
    savedSearch: await jsonFetch(baseUrl, "/api/saved-searches", {
      method: "POST",
      body: JSON.stringify({
        id: "saved-search-server-he-0001",
        locale: "he",
        query: "Sandanski",
        filters: { property_type: "apartment" },
        contact: { name: "Noa Levi" },
      }),
    }),
    lead: await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      body: JSON.stringify({
        id: "server-lead-he-0001",
        leadType: "buyer",
        language: "he",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Noa Levi" },
        contact_preference: "whatsapp",
      }),
    }),
    sellerLead: await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      body: JSON.stringify({
        id: "server-lead-seller-el-0001",
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
        id: "server-lead-bad-0001",
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
        id: "reply-server-lead-he-0001",
        leadId: "server-lead-he-0001",
        language: "he",
        hermesDraft: "Hermes draft for broker review.",
        reviewedReply: "Reviewed reply approved by broker.",
        reviewer: "broker_ru",
        approved: true,
      }),
    }),
    replyUnauthorized: await jsonFetch(baseUrl, "/api/admin/replies", {
      method: "POST",
      body: JSON.stringify({
        leadId: "server-lead-he-0001",
        reviewedReply: "No auth",
        reviewer: "broker_ru",
        approved: true,
      }),
    }),
    viewing: await jsonFetch(baseUrl, "/api/admin/viewings", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        id: "viewing-server-lead-he-0001",
        leadId: "server-lead-he-0001",
        startsAt: "2026-07-06T10:00:00Z",
        broker: "broker_ru",
      }),
    }),
    viewingUnauthorized: await jsonFetch(baseUrl, "/api/admin/viewings", {
      method: "POST",
      body: JSON.stringify({
        leadId: "server-lead-he-0001",
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
  smoke.legacyRedirect.headers = { location: smoke.legacyRedirect.headers.location };
  assertServerSmoke(smoke);
  const ledger = readLeadLedger(leadLedgerPath);
  assertLeadLedger(ledger);
  smoke.leadLedger = { rows: ledger.length };
  const outbox = readReplyOutbox(replyOutboxPath);
  assertReplyOutbox(outbox);
  smoke.replyOutbox = { rows: outbox.length };
  const languageRequests = readLanguageRequests(languageRequestPath);
  assertLanguageRequests(languageRequests);
  smoke.languageRequestLedger = { rows: languageRequests.length };
  const translations = readTranslationLedger(translationLedgerPath);
  assertTranslationLedger(translations);
  smoke.translationLedger = { rows: translations.length };
  const listingEdits = readListingEdits(listingEditLedgerPath);
  assertListingEdits(listingEdits);
  smoke.listingEditLedger = { rows: listingEdits.length };
  const viewings = readViewings(viewingLedgerPath);
  assertViewingLedger(viewings);
  smoke.viewingLedger = { rows: viewings.length };
  const savedSearches = readSavedSearches(savedSearchLedgerPath);
  assertSavedSearches(savedSearches);
  smoke.savedSearchLedger = { rows: savedSearches.length };
  const sellerPipeline = readSellerPipeline(sellerPipelinePath);
  assertSellerPipeline(sellerPipeline);
  smoke.sellerPipelineLedger = { rows: sellerPipeline.length };
  const brokerContacts = readBrokerContacts(brokerContactLedgerPath);
  assertBrokerContacts(brokerContacts);
  smoke.brokerContactLedger = { rows: brokerContacts.length };
  const outPath = fromRoot("production", "data", "node-server-smoke.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(smoke, null, 2)}\n`);
  console.log(`Wrote Node server smoke fixture to ${outPath}`);
} finally {
  await close(server);
}
