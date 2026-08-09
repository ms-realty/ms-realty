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
import { assertViewingFollowUpLedger, readViewingFollowUps, resetViewingFollowUpLedger } from "../lib/viewing-follow-ups.mjs";
import {
  assertLeadPipelineOutcomes,
  readLeadPipelineOutcomes,
  resetLeadPipelineOutcomes,
} from "../lib/lead-pipeline-outcomes.mjs";
import { assertSavedSearches, readSavedSearches, resetSavedSearches } from "../lib/saved-searches.mjs";
import { readPublicContacts } from "../lib/public-contact-vault.mjs";
import { assertSellerPipeline, readSellerPipeline, resetSellerPipeline } from "../lib/seller-pipeline.mjs";
import { assertDealLedger, readDeals, resetDealLedger } from "../lib/deal-ledger.mjs";
import { assertBrokerContacts, readBrokerContacts, resetBrokerContacts } from "../lib/broker-contacts.mjs";
import { assertTourApprovals, readTourApprovals, resetTourApprovals } from "../lib/tours.mjs";
import { assertEventLedger, readEventLedger, resetEventLedger } from "../lib/events.mjs";
import { assertConsentLedger, readConsentLedger, resetConsentLedger } from "../lib/consent-ledger.mjs";
import { assertAuditLog, readAuditLog, resetAuditLog } from "../lib/audit-log.mjs";
import { assertSlugHistory, readSlugHistory, resetSlugHistory } from "../lib/slug-history.mjs";
import { assertServerSmoke, close, createNodeServer, jsonFetch, listen, textFetch } from "../lib/node-server.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { approvedPublicSeedFixture } from "../test/approved-public-seed.fixture.mjs";

function compactAdminLocaleResponse(response, { includeLocales = false } = {}) {
  return {
    ...response,
    body: {
      workspace: response.body.workspace,
      ...(includeLocales
        ? {
            locales: response.body.locales.map((locale) => ({
              code: locale.code,
              direction: locale.direction,
              public_enabled: locale.public_enabled,
              indexable: locale.indexable,
            })),
          }
        : {}),
    },
  };
}

const leadLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-leads-")), "leads.jsonl");
const replyOutboxPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-replies-")), "replies.jsonl");
const languageRequestPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-language-")), "requests.jsonl");
const translationLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-translations-")), "translations.jsonl");
const listingEditLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-listing-edits-")), "edits.jsonl");
const viewingLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-viewings-")), "viewings.jsonl");
const viewingFollowUpLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-viewing-follow-ups-")), "viewing-follow-ups.jsonl");
const leadPipelineOutcomeLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-lead-pipeline-")), "outcomes.jsonl");
const savedSearchLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-saved-searches-")), "saved-searches.jsonl");
const sellerPipelinePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-seller-pipeline-")), "seller-pipeline.jsonl");
const dealLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-deals-")), "deals.jsonl");
const brokerContactLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-broker-contacts-")), "broker-contacts.jsonl");
const tourApprovalLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-tour-approvals-")), "tour-approvals.jsonl");
const eventLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-events-")), "events.jsonl");
const consentLedgerPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-consent-")), "consent.jsonl");
const auditLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-audit-")), "audit-log.jsonl");
const slugHistoryPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-slug-history-")), "slug-history.jsonl");
const publicContactVaultPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-public-contacts-")), "contacts.jsonl");
const publicContactKey = "node-smoke-public-contact-key-2026";
resetLeadLedger(leadLedgerPath);
resetReplyOutbox(replyOutboxPath);
resetLanguageRequests(languageRequestPath);
resetTranslationLedger(translationLedgerPath);
resetListingEdits(listingEditLedgerPath);
resetViewingLedger(viewingLedgerPath);
resetViewingFollowUpLedger(viewingFollowUpLedgerPath);
resetLeadPipelineOutcomes(leadPipelineOutcomeLedgerPath);
resetSavedSearches(savedSearchLedgerPath);
resetSellerPipeline(sellerPipelinePath);
resetDealLedger(dealLedgerPath);
resetBrokerContacts(brokerContactLedgerPath);
resetTourApprovals(tourApprovalLedgerPath);
resetEventLedger(eventLedgerPath);
resetConsentLedger(consentLedgerPath);
resetAuditLog(auditLogPath);
resetSlugHistory(slugHistoryPath);
const server = createNodeServer(
  createHttpApp({
    seed: approvedPublicSeedFixture(),
    leadLedgerPath,
    replyOutboxPath,
    languageRequestPath,
    translationLedgerPath,
    listingEditLedgerPath,
    viewingLedgerPath,
    viewingFollowUpLedgerPath,
    leadPipelineOutcomeLedgerPath,
    savedSearchLedgerPath,
    sellerPipelinePath,
    dealLedgerPath,
    brokerContactLedgerPath,
    tourApprovalLedgerPath,
    eventLedgerPath,
    consentLedgerPath,
    auditLogPath,
    slugHistoryPath,
    publicContactVaultPath,
    publicContactKey,
    receivedAt: "2026-07-04T00:00:00Z",
    requestedAt: "2026-07-04T00:01:00Z",
    editedAt: "2026-07-04T00:03:00Z",
    reviewedAt: "2026-07-04T00:05:00Z",
    bookedAt: "2026-07-04T00:06:00Z",
    leadPipelineOutcomeAt: "2026-07-04T00:05:30Z",
    viewingFollowUpAt: "2026-07-06T12:00:00Z",
    savedAt: "2026-07-04T00:07:00Z",
    sellerPipelineCreatedAt: "2026-07-04T00:08:00Z",
    dealClosedAt: "2026-07-10T10:00:00Z",
    slugChangedAt: "2026-07-04T00:09:00Z",
    leadSlaGeneratedAt: "2026-07-06T00:00:00Z",
  }),
);
const address = await listen(server);
const baseUrl = `http://${address.address}:${address.port}`;
const legacyRedirect = JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
const legacyUrl = new URL(legacyRedirect.old_url);

try {
  const leadResponse = await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({
        leadType: "buyer",
        language: "he",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Noa Levi", whatsapp: "+359880000001" },
        contact_preference: "whatsapp",
      }),
    });
  const viewingLeadResponse = await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({
        source: "website_viewing_request",
        leadType: "buyer",
        language: "he",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Noa Levi", phone: "+359880000002" },
        contact_preference: "phone",
        request_details: { viewing_date: "2026-07-06", viewing_time: "10:00" },
        message: "I would like to view this property.",
      }),
    });
  const contactLeadResponse = await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({
        source: "website_contact_callback",
        leadType: "general",
        language: "he",
        contact: { name: "Noa Levi", phone: "+359880000003" },
        contact_preference: "phone",
        request_details: { callback_time: "Weekdays after 14:00" },
        message: "Please call me about buying in Sandanski.",
      }),
    });
  const sellerLeadResponse = await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({
        source: "website_seller_valuation",
        leadType: "seller",
        language: "el",
        contact: { name: "Nikos Papadopoulos", phone: "+359880000004" },
        contact_preference: "phone",
        property: { location: "Sandanski", type: "house" },
        message: "I want a valuation for my property.",
      }),
    });
  // Public intake mints its own ids; correlate downstream steps by what the
  // server actually assigned rather than by a fixture string.
  const leadId = leadResponse.body.lead.id;
  const viewingLeadId = viewingLeadResponse.body.lead.id;
  const contactLeadId = contactLeadResponse.body.lead.id;
  const smoke = {
    fixture_id: "node-server-smoke-20260704",
    baseUrl: "http://127.0.0.1:0",
    server: { host: address.address, port_observed: Number.isInteger(address.port) && address.port > 0 },
    health: await jsonFetch(baseUrl, "/api/health"),
    ready: await jsonFetch(baseUrl, "/api/ready", { captureHeaders: true }),
    legacyRedirect: await textFetch(baseUrl, legacyUrl.pathname, {
      headers: { "x-forwarded-host": legacyRedirect.source_domain },
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
        id: "broker-contact-server-MS-CRAWL-0001",
        listingId: "MS-CRAWL-0001",
        broker: "broker_ru",
        phone: "+447700900001",
        reviewer: "owner",
        sourceReference: "test://broker-contact/MS-CRAWL-0001",
        validationStatus: "broker_verified",
        approved: true,
      }),
    }),
    listingAfterBrokerContact: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
    tourApproval: await jsonFetch(baseUrl, "/api/admin/tours/approve", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        id: "tour-approval-server-MS-CRAWL-0001",
        listingId: "MS-CRAWL-0001",
        panoramaUrl: "https://makler-realty.com/tours/MS-CRAWL-0001.jpg",
        accessibilityCaption: "Reviewed 360 panorama for MS-CRAWL-0001.",
        reviewer: "media_editor",
        reviewConfirmed: true,
      }),
    }),
    listingAfterTourApproval: await jsonFetch(baseUrl, "/he/properties/MS-CRAWL-0001"),
    slugChange: await jsonFetch(baseUrl, "/api/admin/listings/slug", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        id: "slug-change-server-MS-CRAWL-0001",
        listingId: "MS-CRAWL-0001",
        locale: "he",
        oldPath: "/he/properties/old-sandanski-slug",
        editor: "editor_bg",
      }),
    }),
    slugRedirect: await textFetch(baseUrl, "/he/properties/old-sandanski-slug", {
      redirect: "manual",
      captureHeaders: true,
    }),
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
        id: "server-language-request-fr-0001",
        requestedLocale: "fr",
        requestedPath: "/fr/",
        contact: { name: "Claire Martin", email: "claire@example.test" },
        message: "Please notify me when French property pages are reviewed.",
      }),
    }),
    sitemap: await textFetch(baseUrl, "/sitemap.xml"),
    robots: await textFetch(baseUrl, "/robots.txt"),
    favicon: await textFetch(baseUrl, "/favicon.ico", { captureHeaders: true }),
    sellerPage: await jsonFetch(baseUrl, "/he/sell"),
    sellerHtml: await textFetch(baseUrl, "/he/sell", {
      headers: { accept: "text/html" },
    }),
    contact: await jsonFetch(baseUrl, "/he/contact"),
    contactHtml: await textFetch(baseUrl, "/he/contact", {
      headers: { accept: "text/html" },
    }),
    guidePage: await jsonFetch(baseUrl, "/en/guides/foreign-buyers"),
    guideHtml: await textFetch(baseUrl, "/en/guides/foreign-buyers", {
      headers: { accept: "text/html" },
    }),
    savedSearch: await jsonFetch(baseUrl, "/api/saved-searches", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({
        id: "saved-search-server-he-0001",
        locale: "he",
        query: "Sandanski",
        filters: { property_type: "apartment" },
        contact: { name: "Noa Levi", whatsapp: "+359880000001" },
        contact_preference: "whatsapp",
        alertConsent: true,
      }),
    }),
    hermesChatDisabled: await jsonFetch(baseUrl, "/api/hermes/chat", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({ locale: "he", query: "Sandanski" }),
    }),
    lead: leadResponse,
    viewingLead: viewingLeadResponse,
    contactLead: contactLeadResponse,
    sellerLead: sellerLeadResponse,
    badLead: await jsonFetch(baseUrl, "/api/leads", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({
        id: "server-lead-bad-0001",
        leadType: "buyer",
        language: "he",
        listingReference: "missing",
        contact: { name: "Noa Levi", whatsapp: "+359880000005" },
        contact_preference: "whatsapp",
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
        id: "reply-server-lead-he-0001",
        leadId,
        language: "he",
        hermesDraft: "Hermes draft for broker review.",
        reviewedReply: "Reviewed reply approved by broker.",
        reviewer: "broker_ru",
        approved: true,
      }),
    }),
    replyUnauthorized: await jsonFetch(baseUrl, "/api/admin/replies", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({
        leadId,
        reviewedReply: "No auth",
        reviewer: "broker_ru",
        approved: true,
      }),
    }),
    leadQualification: await jsonFetch(baseUrl, "/api/admin/lead-pipeline/outcome", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        id: "qualification-server-lead-he-0001",
        leadId,
        actor: "broker_ru",
        action: "qualify",
        budgetMinEur: 90000,
        budgetMaxEur: 160000,
        locations: ["Sandanski"],
        propertyTypes: ["apartment"],
        bedroomsMin: 2,
        timeline: "Within six months",
        financeStatus: "cash",
      }),
    }),
    viewing: await jsonFetch(baseUrl, "/api/admin/viewings", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        id: "viewing-server-lead-he-0001",
        leadId,
        startsAt: "2026-07-06T10:00:00Z",
        broker: "broker_ru",
      }),
    }),
    viewingFollowUp: await jsonFetch(baseUrl, "/api/admin/viewings/follow-up", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id: "viewing-follow-up-server-0001",
        viewingId: "viewing-server-lead-he-0001",
        actor: "broker_ru",
        action: "complete",
        note: "Broker recorded the completed viewing privately.",
      }).toString(),
    }),
    viewingFollowUpRetry: await jsonFetch(baseUrl, "/api/admin/viewings/follow-up", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        id: "viewing-follow-up-server-0001",
        viewingId: "viewing-server-lead-he-0001",
        actor: "broker_ru",
        action: "complete",
        note: "Broker recorded the completed viewing privately.",
      }),
    }),
    viewingFollowUpUnauthorized: await jsonFetch(baseUrl, "/api/admin/viewings/follow-up", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({ viewingId: "viewing-server-lead-he-0001", actor: "broker_ru", action: "complete" }),
    }),
    viewingUnauthorized: await jsonFetch(baseUrl, "/api/admin/viewings", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({
        leadId,
        startsAt: "2026-07-06T10:00:00Z",
        broker: "broker_ru",
      }),
    }),
    viewingCalendar: await textFetch(baseUrl, "/api/admin/viewings.ics", {
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    viewingCalendarUnauthorized: await jsonFetch(baseUrl, "/api/admin/viewings.ics", { captureHeaders: true }),
    dealClose: await jsonFetch(baseUrl, "/api/admin/deals/close", {
      method: "POST",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: JSON.stringify({
        id: "deal-server-lead-contact-he-0001",
        leadId: contactLeadId,
        broker: "broker_ru",
      }),
    }),
    dealCloseUnauthorized: await jsonFetch(baseUrl, "/api/admin/deals/close", {
      method: "POST",
      captureHeaders: true,
      body: JSON.stringify({
        leadId,
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
      draftOutput: {
        title: "MS-CRAWL-0001 Sandanski el",
        body: "MS-CRAWL-0001 Sandanski reviewed el translation draft",
        seo_title: "MS-CRAWL-0001 Sandanski",
        meta_description: "MS-CRAWL-0001 Sandanski reviewed el translation draft for approved MS Realty listing content.",
        citations: [{ source: "cms", field: "title" }],
      },
    }),
  });
  smoke.translationApprove = await jsonFetch(baseUrl, "/api/admin/translations/approve", {
    method: "POST",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: JSON.stringify({
      taskId: smoke.translationDraft.body.id,
      reviewer: "translator_el",
      approvedAt: "2026-07-04T00:02:00Z",
    }),
  });
  smoke.translationPublish = await jsonFetch(baseUrl, "/api/admin/translations/publish", {
    method: "POST",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: JSON.stringify({
      taskId: smoke.translationApprove.body.id,
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
    bg: compactAdminLocaleResponse(
      await jsonFetch(baseUrl, "/api/admin/locales?locale=bg", {
        headers: { authorization: "Bearer local-admin-smoke" },
      }),
    ),
    ru: compactAdminLocaleResponse(
      await jsonFetch(baseUrl, "/api/admin/locales?locale=ru", {
        headers: { authorization: "Bearer local-admin-smoke" },
      }),
    ),
    en: compactAdminLocaleResponse(
      await jsonFetch(baseUrl, "/api/admin/locales?locale=en", {
        headers: { authorization: "Bearer local-admin-smoke" },
      }),
    ),
    heFallback: compactAdminLocaleResponse(
      await jsonFetch(baseUrl, "/api/admin/locales?locale=he", {
        headers: { authorization: "Bearer local-admin-smoke" },
      }),
      { includeLocales: true },
    ),
  };
  smoke.admin = await jsonFetch(baseUrl, "/api/admin/leads?locale=ru", {
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  smoke.legacyRedirect.headers = { location: smoke.legacyRedirect.headers.location };
  smoke.slugRedirect.headers = { location: smoke.slugRedirect.headers.location };
  for (const name of ["languageRequest", "savedSearch", "lead", "viewingLead", "contactLead", "sellerLead", "badLead"]) {
    smoke[name].headers = { "cache-control": smoke[name].headers["cache-control"] };
  }
  for (const name of ["adminUnauthorized", "replyUnauthorized", "viewingUnauthorized", "viewingFollowUpUnauthorized", "viewingCalendarUnauthorized", "dealCloseUnauthorized"]) {
    smoke[name].headers = {
      "cache-control": smoke[name].headers["cache-control"],
      "www-authenticate": smoke[name].headers["www-authenticate"],
    };
  }
  assertServerSmoke(smoke);
  const ledger = readLeadLedger(leadLedgerPath);
  assertLeadLedger(ledger);
  smoke.leadLedger = { rows: ledger.length };
  const outbox = readReplyOutbox(replyOutboxPath);
  assertReplyOutbox(outbox);
  smoke.replyOutbox = { rows: outbox.length };
  const languageRequests = readLanguageRequests(languageRequestPath);
  assertLanguageRequests(languageRequests);
  if (languageRequests.some((row) => Object.hasOwn(row, "contact") || Object.hasOwn(row, "message"))) {
    throw new Error("Language request workflow ledger must not contain private contact or message data");
  }
  smoke.languageRequestLedger = { rows: languageRequests.length };
  const translations = readTranslationLedger(translationLedgerPath);
  assertTranslationLedger(translations);
  smoke.translationLedger = { rows: translations.length };
  const listingEdits = readListingEdits(listingEditLedgerPath);
  if (listingEdits.length) throw new Error("Legacy listing edit handoff must not write a local edit row");
  smoke.listingEditLedger = { rows: listingEdits.length };
  const viewings = readViewings(viewingLedgerPath);
  assertViewingLedger(viewings);
  smoke.viewingLedger = { rows: viewings.length };
  const viewingFollowUps = readViewingFollowUps(viewingFollowUpLedgerPath);
  assertViewingFollowUpLedger(viewingFollowUps);
  smoke.viewingFollowUpLedger = { rows: viewingFollowUps.length };
  const leadPipelineOutcomes = readLeadPipelineOutcomes(leadPipelineOutcomeLedgerPath);
  assertLeadPipelineOutcomes(leadPipelineOutcomes);
  smoke.leadPipelineOutcomeLedger = { rows: leadPipelineOutcomes.length };
  const savedSearches = readSavedSearches(savedSearchLedgerPath);
  assertSavedSearches(savedSearches);
  if (savedSearches.some((row) => Object.hasOwn(row, "contact"))) {
    throw new Error("Saved search workflow ledger must not contain private contact data");
  }
  if (readPublicContacts(publicContactVaultPath, publicContactKey).size !== 2) {
    throw new Error("Public contact vault must contain the language request and saved search contacts");
  }
  smoke.savedSearchLedger = { rows: savedSearches.length };
  const sellerPipeline = readSellerPipeline(sellerPipelinePath);
  assertSellerPipeline(sellerPipeline);
  smoke.sellerPipelineLedger = { rows: sellerPipeline.length };
  const deals = readDeals(dealLedgerPath);
  assertDealLedger(deals);
  smoke.dealLedger = { rows: deals.length };
  const brokerContacts = readBrokerContacts(brokerContactLedgerPath);
  assertBrokerContacts(brokerContacts);
  smoke.brokerContactLedger = { rows: brokerContacts.length };
  const tourApprovals = readTourApprovals(tourApprovalLedgerPath);
  assertTourApprovals(tourApprovals);
  smoke.tourApprovalLedger = { rows: tourApprovals.length };
  const events = readEventLedger(eventLedgerPath);
  assertEventLedger(events);
  smoke.eventLedger = {
    rows: events.length,
    byType: events.reduce((counts, row) => ({ ...counts, [row.type]: (counts[row.type] || 0) + 1 }), {}),
  };
  const consents = readConsentLedger(consentLedgerPath);
  assertConsentLedger(consents);
  smoke.consentLedger = {
    rows: consents.length,
    byType: consents.reduce((counts, row) => ({ ...counts, [row.consent_type]: (counts[row.consent_type] || 0) + 1 }), {}),
  };
  const auditRows = readAuditLog(auditLogPath);
  assertAuditLog(auditRows);
  smoke.auditLog = {
    rows: auditRows.length,
    byAction: auditRows.reduce((counts, row) => ({ ...counts, [row.action]: (counts[row.action] || 0) + 1 }), {}),
  };
  const slugHistory = readSlugHistory(slugHistoryPath);
  assertSlugHistory(slugHistory);
  smoke.slugHistoryLedger = { rows: slugHistory.length };
  const outPath = fromRoot("production", "data", "node-server-smoke.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(smoke, null, 2)}\n`);
  console.log(`Wrote Node server smoke fixture to ${outPath}`);
} finally {
  await close(server);
}
