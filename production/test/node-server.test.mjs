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
import { assertTourApprovals, readTourApprovals, resetTourApprovals } from "../lib/tours.mjs";
import { assertEventLedger, readEventLedger, resetEventLedger } from "../lib/events.mjs";
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
  const tourApprovalLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-tour-approvals-`)}/tour-approvals.jsonl`;
  const eventLedgerPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-server-events-`)}/events.jsonl`;
  resetLeadLedger(leadLedgerPath);
  resetReplyOutbox(replyOutboxPath);
  resetLanguageRequests(languageRequestPath);
  resetTranslationLedger(translationLedgerPath);
  resetListingEdits(listingEditLedgerPath);
  resetViewingLedger(viewingLedgerPath);
  resetSavedSearches(savedSearchLedgerPath);
  resetSellerPipeline(sellerPipelinePath);
  resetBrokerContacts(brokerContactLedgerPath);
  resetTourApprovals(tourApprovalLedgerPath);
  resetEventLedger(eventLedgerPath);
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
      tourApprovalLedgerPath,
      eventLedgerPath,
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
      tourApprovalLedgerPath,
      eventLedgerPath,
    );
  } finally {
    await close(server);
  }
}

function deployableRedirect() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
}

function assertPrivateSecurityHeaders(headers) {
  assert.equal(headers["cache-control"], "no-store");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["permissions-policy"], "camera=(), microphone=(), geolocation=()");
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
      tourApprovalLedgerPath,
      eventLedgerPath,
    ) => {
      const redirect = deployableRedirect();
      const oldUrl = new URL(redirect.old_url);
      const smoke = {
        health: await jsonFetch(baseUrl, "/api/health"),
        ready: await jsonFetch(baseUrl, "/api/ready"),
        legacyRedirect: await textFetch(baseUrl, oldUrl.pathname, {
          headers: { "x-forwarded-host": redirect.source_domain },
          redirect: "manual",
          captureHeaders: true,
        }),
        home: await jsonFetch(baseUrl, "/he/"),
        homeHtml: await textFetch(baseUrl, "/he/", {
          headers: { accept: "text/html" },
        }),
        listing: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
        listingHtml: await textFetch(baseUrl, "/he/properties/MS-CRAWL-0001", {
          headers: { accept: "text/html" },
        }),
        listingPrint: await textFetch(baseUrl, "/he/properties/MS-CRAWL-0001?print=1"),
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
        tourApproval: await jsonFetch(baseUrl, "/api/admin/tours/approve", {
          method: "POST",
          headers: { authorization: "Bearer local-admin-smoke" },
          body: JSON.stringify({
            id: "node-server-tour-approval-test",
            listingId: "MS-CRAWL-0001",
            panoramaUrl: "https://cdn.example.test/tours/MS-CRAWL-0001.jpg",
            accessibilityCaption: "Reviewed 360 panorama for MS-CRAWL-0001.",
            reviewer: "media_editor",
          }),
        }),
        listingAfterTourApproval: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
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
          captureHeaders: true,
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
          captureHeaders: true,
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
        contact: await jsonFetch(baseUrl, "/he/contact"),
        contactHtml: await textFetch(baseUrl, "/he/contact", {
          headers: { accept: "text/html" },
        }),
        lead: await jsonFetch(baseUrl, "/api/leads", {
          method: "POST",
          captureHeaders: true,
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
          captureHeaders: true,
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
        contactLead: await jsonFetch(baseUrl, "/api/leads", {
          method: "POST",
          captureHeaders: true,
          body: JSON.stringify({
            id: "node-server-contact-lead-test",
            source: "website_contact_callback",
            leadType: "general",
            language: "he",
            contact: { name: "Noa Levi" },
            contact_preference: "phone",
            message: "Please call me about buying in Sandanski.",
          }),
        }),
        sellerLead: await jsonFetch(baseUrl, "/api/leads", {
          method: "POST",
          captureHeaders: true,
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
          captureHeaders: true,
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
        adminUnauthorized: await jsonFetch(baseUrl, "/api/admin/leads?locale=ru", { captureHeaders: true }),
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
          captureHeaders: true,
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
          captureHeaders: true,
          body: JSON.stringify({
            leadId: "node-server-lead-test",
            startsAt: "2026-07-06T10:00:00Z",
            broker: "broker_ru",
          }),
        }),
        viewingCalendar: await textFetch(baseUrl, "/api/admin/viewings.ics", {
          headers: { authorization: "Bearer local-admin-smoke" },
        }),
        viewingCalendarUnauthorized: await jsonFetch(baseUrl, "/api/admin/viewings.ics", { captureHeaders: true }),
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
      smoke.ctaClick = await jsonFetch(baseUrl, "/api/events", {
        method: "POST",
        body: JSON.stringify({
          type: "cta_click",
          path: "/he/properties/MS-CRAWL-0001",
          locale: "he",
          listingReference: "MS-CRAWL-0001",
          action: "sticky_inquiry",
        }),
      });
      smoke.adminLocales = {
        bg: await jsonFetch(baseUrl, "/api/admin/locales?locale=bg", {
          headers: { authorization: "Bearer local-admin-smoke" },
        }),
        ru: await jsonFetch(baseUrl, "/api/admin/locales?locale=ru", {
          headers: { authorization: "Bearer local-admin-smoke" },
        }),
        en: await jsonFetch(baseUrl, "/api/admin/locales?locale=en", {
          headers: { authorization: "Bearer local-admin-smoke" },
        }),
        heFallback: await jsonFetch(baseUrl, "/api/admin/locales?locale=he", {
          headers: { authorization: "Bearer local-admin-smoke" },
        }),
      };
      smoke.admin = await jsonFetch(baseUrl, "/api/admin/leads?locale=ru", {
        headers: { authorization: "Bearer local-admin-smoke" },
      });
      assert.equal(assertServerSmoke(smoke), true);
      assert.equal(smoke.health.body.status, "ok");
      assert.deepEqual(smoke.health.body.blockers, ["redirect_reviews", "external_seo_exports"]);
      assert.equal(smoke.ready.status, 503);
      assert.equal(smoke.ready.body.status, "blocked");
      assert.equal(smoke.legacyRedirect.headers.location, redirect.target_path);
      assert.equal(smoke.home.body.body.search.path, "/he/search");
      assert.equal(smoke.listingPrint.body.includes("data-kind=\"listing-print\""), true);
      assert.equal(smoke.listingPrint.body.includes("data-print-status=\"browser-pdf-ready\""), true);
      assert.equal(smoke.listingAfterBrokerContact.body.body.actions.direct_contact.review_status, "approved_broker_contact");
      assert.equal(smoke.tourApproval.body.is_public, true);
      assert.equal(smoke.listingAfterTourApproval.body.body.media.tour.available, true);
      assert.equal(smoke.listingAfterTourApproval.body.body.media.tour.mount_target, "psv-listing-tour");
      assert.equal(smoke.location.body.cards.length, 1);
      assert.equal(smoke.lead.body.contact_preference, "whatsapp");
      assert.equal(smoke.viewingLead.body.lead.source, "website_viewing_request");
      assert.equal(smoke.contact.body.body.callback.payload.source, "website_contact_callback");
      assert.equal(smoke.contactHtml.body.includes("data-lead-type=\"general\""), true);
      assert.equal(smoke.contactLead.body.lead.leadType, "general");
      assert.equal(smoke.viewingCalendar.body.includes("BEGIN:VCALENDAR"), true);
      assert.equal(smoke.viewingCalendar.body.includes("DTSTART:20260706T100000Z"), true);
      assert.equal(assertLeadLedger(readLeadLedger(leadLedgerPath)), true);
      assert.equal(assertReplyOutbox(readReplyOutbox(replyOutboxPath)), true);
      assert.equal(assertLanguageRequests(readLanguageRequests(languageRequestPath)), true);
      assert.equal(assertTranslationLedger(readTranslationLedger(translationLedgerPath)), true);
      assert.equal(assertListingEdits(readListingEdits(listingEditLedgerPath)), true);
      assert.equal(assertViewingLedger(readViewings(viewingLedgerPath)), true);
      assert.equal(assertSavedSearches(readSavedSearches(savedSearchLedgerPath)), true);
      assert.equal(assertSellerPipeline(readSellerPipeline(sellerPipelinePath)), true);
      assert.equal(assertBrokerContacts(readBrokerContacts(brokerContactLedgerPath)), true);
      assert.equal(assertTourApprovals(readTourApprovals(tourApprovalLedgerPath)), true);
      assert.equal(assertEventLedger(readEventLedger(eventLedgerPath)), true);
      assert.equal(smoke.staleListing.body.metadata.robots, "noindex,follow");
      assert.deepEqual(
        [
          smoke.adminLocales.bg.body.workspace.locale,
          smoke.adminLocales.ru.body.workspace.locale,
          smoke.adminLocales.en.body.workspace.locale,
          smoke.adminLocales.heFallback.body.workspace.locale,
        ],
        ["bg", "ru", "en", "en"],
      );
      assert.deepEqual(smoke.adminLocales.ru.body.workspace.interface_locales, ["bg", "ru", "en"]);
      assert.equal(smoke.adminLocales.heFallback.body.locales.find((locale) => locale.code === "he").direction, "rtl");
      assert.equal(smoke.adminLocales.heFallback.body.locales.find((locale) => locale.code === "el").public_enabled, true);
    },
  );
});

test("Node server rejects oversized request bodies", async () => {
  const server = createNodeServer(createHttpApp(), { maxBodyBytes: 8 });
  const address = await listen(server);
  try {
    const response = await jsonFetch(`http://${address.address}:${address.port}`, "/api/leads", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({ id: "too-large" }),
    });

    assert.equal(response.status, 413);
    assert.equal(response.body.kind, "request_too_large");
    assertPrivateSecurityHeaders(response.headers);
  } finally {
    await close(server);
  }
});

test("Node server hides unexpected app errors behind private JSON responses", async () => {
  const server = createNodeServer(async () => {
    throw new Error("database password leaked");
  });
  const address = await listen(server);
  try {
    const response = await jsonFetch(`http://${address.address}:${address.port}`, "/api/leads", {
      captureHeaders: true,
    });

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { kind: "server_error" });
    assertPrivateSecurityHeaders(response.headers);
  } finally {
    await close(server);
  }
});

test("generated Node server smoke file is valid when present", () => {
  const file = fromRoot("production", "data", "node-server-smoke.json");
  if (!fs.existsSync(file)) return;
  const smoke = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertServerSmoke(smoke), true);
});
