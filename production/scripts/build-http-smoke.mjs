import fs from "node:fs";
import path from "node:path";
import { assertHttpSmoke, createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { assertLeadLedger, DEFAULT_LEAD_LEDGER_PATH, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import {
  assertLanguageRequests,
  DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
  readLanguageRequests,
  resetLanguageRequests,
} from "../lib/language-requests.mjs";
import {
  assertTranslationLedger,
  DEFAULT_TRANSLATION_LEDGER_PATH,
  readTranslationLedger,
  resetTranslationLedger,
} from "../lib/translation-ledger.mjs";
import {
  assertListingEdits,
  DEFAULT_LISTING_EDIT_LEDGER_PATH,
  readListingEdits,
  resetListingEdits,
} from "../lib/listing-edits.mjs";
import {
  assertReplyOutbox,
  DEFAULT_REPLY_OUTBOX_PATH,
  readReplyOutbox,
  resetReplyOutbox,
} from "../lib/lead-replies.mjs";
import {
  assertViewingLedger,
  DEFAULT_VIEWING_LEDGER_PATH,
  readViewings,
  resetViewingLedger,
} from "../lib/viewing-ledger.mjs";
import {
  assertSavedSearches,
  DEFAULT_SAVED_SEARCH_LEDGER_PATH,
  readSavedSearches,
  resetSavedSearches,
} from "../lib/saved-searches.mjs";
import {
  assertSellerPipeline,
  DEFAULT_SELLER_PIPELINE_PATH,
  readSellerPipeline,
  resetSellerPipeline,
} from "../lib/seller-pipeline.mjs";
import {
  assertBrokerContacts,
  DEFAULT_BROKER_CONTACT_LEDGER_PATH,
  readBrokerContacts,
  resetBrokerContacts,
} from "../lib/broker-contacts.mjs";
import {
  assertTourApprovals,
  DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
  readTourApprovals,
  resetTourApprovals,
} from "../lib/tours.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";

resetLeadLedger(DEFAULT_LEAD_LEDGER_PATH);
resetReplyOutbox(DEFAULT_REPLY_OUTBOX_PATH);
resetLanguageRequests(DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH);
resetTranslationLedger(DEFAULT_TRANSLATION_LEDGER_PATH);
resetListingEdits(DEFAULT_LISTING_EDIT_LEDGER_PATH);
resetViewingLedger(DEFAULT_VIEWING_LEDGER_PATH);
resetSavedSearches(DEFAULT_SAVED_SEARCH_LEDGER_PATH);
resetSellerPipeline(DEFAULT_SELLER_PIPELINE_PATH);
resetBrokerContacts(DEFAULT_BROKER_CONTACT_LEDGER_PATH);
resetTourApprovals(DEFAULT_TOUR_APPROVAL_LEDGER_PATH);
const localeRegistryPath = fromRoot("production", "data", "admin-locale-registry-smoke.json");
fs.writeFileSync(localeRegistryPath, `${JSON.stringify(loadLocaleRegistry(), null, 2)}\n`);
const app = createHttpApp({
  leadLedgerPath: DEFAULT_LEAD_LEDGER_PATH,
  replyOutboxPath: DEFAULT_REPLY_OUTBOX_PATH,
  languageRequestPath: DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH,
  translationLedgerPath: DEFAULT_TRANSLATION_LEDGER_PATH,
  listingEditLedgerPath: DEFAULT_LISTING_EDIT_LEDGER_PATH,
  viewingLedgerPath: DEFAULT_VIEWING_LEDGER_PATH,
  savedSearchLedgerPath: DEFAULT_SAVED_SEARCH_LEDGER_PATH,
  sellerPipelinePath: DEFAULT_SELLER_PIPELINE_PATH,
  brokerContactLedgerPath: DEFAULT_BROKER_CONTACT_LEDGER_PATH,
  tourApprovalLedgerPath: DEFAULT_TOUR_APPROVAL_LEDGER_PATH,
  localeRegistryPath,
  receivedAt: "2026-07-04T00:00:00Z",
  requestedAt: "2026-07-04T00:01:00Z",
  editedAt: "2026-07-04T00:03:00Z",
  reviewedAt: "2026-07-04T00:05:00Z",
  bookedAt: "2026-07-04T00:06:00Z",
  savedAt: "2026-07-04T00:07:00Z",
  sellerPipelineCreatedAt: "2026-07-04T00:08:00Z",
});
const legacyRedirect = JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
const smoke = {
  fixture_id: "http-smoke-20260704",
  legacyRedirect: await dispatchHttp(app, { url: legacyRedirect.old_url }),
  home: await dispatchHttp(app, { url: "/he/" }),
  homeHtml: await dispatchHttp(app, { url: "/he/?format=html" }),
  listing: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
  listingHtml: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001?format=html" }),
  listingPrint: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001?print=1" }),
  brokerContact: await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/broker-contacts",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      id: "broker-contact-MS-CRAWL-0001",
      listingId: "MS-CRAWL-0001",
      broker: "broker_ru",
      phone: "+359880000000",
      reviewer: "owner",
      approved: true,
    },
  }),
  listingAfterBrokerContact: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
  tourApproval: await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/tours/approve",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      id: "tour-approval-MS-CRAWL-0001",
      listingId: "MS-CRAWL-0001",
      panoramaUrl: "https://cdn.example.test/tours/MS-CRAWL-0001.jpg",
      accessibilityCaption: "Reviewed 360 panorama for MS-CRAWL-0001.",
      reviewer: "media_editor",
    },
  }),
  listingAfterTourApproval: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
  search: await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski" }),
  searchHtml: await dispatchHttp(app, { url: "/he/search?format=html&q=Sandanski" }),
  location: await dispatchHttp(app, { url: "/he/locations/sandanski" }),
  locationHtml: await dispatchHttp(app, { url: "/he/locations/sandanski?format=html" }),
  searchFiltered: await dispatchHttp(app, { url: "/api/search?locale=he&q=Sandanski&property_type=apartment" }),
  fallback: await dispatchHttp(app, { url: "/fr/" }),
  languageRequest: await dispatchHttp(app, {
    method: "POST",
    url: "/api/language-requests",
    body: {
      id: "language-request-fr-0001",
      requestedLocale: "fr",
      requestedPath: "/fr/",
      contact: { name: "Claire Martin" },
      message: "Please notify me when French property pages are reviewed.",
    },
  }),
  sitemap: await dispatchHttp(app, { url: "/sitemap.xml" }),
  robots: await dispatchHttp(app, { url: "/robots.txt" }),
  sellerPage: await dispatchHttp(app, { url: "/he/sell" }),
  sellerHtml: await dispatchHttp(app, { url: "/he/sell?format=html" }),
  contact: await dispatchHttp(app, { url: "/he/contact" }),
  contactHtml: await dispatchHttp(app, { url: "/he/contact?format=html" }),
  savedSearch: await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches",
    body: {
      id: "saved-search-he-0001",
      locale: "he",
      query: "Sandanski",
      filters: { property_type: "apartment", unsupported_filter: "ignored" },
      contact: { name: "Noa Levi" },
    },
  }),
  lead: await dispatchHttp(app, {
    method: "POST",
    url: "/api/leads",
    body: {
      id: "http-lead-he-0001",
      leadType: "buyer",
      language: "he",
      listingReference: "MS-CRAWL-0001",
      contact: { name: "Noa Levi" },
      contact_preference: "whatsapp",
      message: "Interested in this property.",
    },
  }),
  viewingLead: await dispatchHttp(app, {
    method: "POST",
    url: "/api/leads",
    body: {
      id: "http-viewing-lead-he-0001",
      source: "website_viewing_request",
      leadType: "buyer",
      language: "he",
      listingReference: "MS-CRAWL-0001",
      contact: { name: "Noa Levi" },
      contact_preference: "phone",
      message: "I would like to view this property.",
    },
  }),
  contactLead: await dispatchHttp(app, {
    method: "POST",
    url: "/api/leads",
    body: {
      id: "http-lead-contact-he-0001",
      source: "website_contact_callback",
      leadType: "general",
      language: "he",
      contact: { name: "Noa Levi" },
      contact_preference: "phone",
      message: "Please call me about buying in Sandanski.",
    },
  }),
  sellerLead: await dispatchHttp(app, {
    method: "POST",
    url: "/api/leads",
    body: {
      id: "http-lead-seller-el-0001",
      source: "website_seller_valuation",
      leadType: "seller",
      language: "el",
      contact: { name: "Nikos Papadopoulos" },
      message: "I want a valuation for my property.",
    },
  }),
  admin: null,
  adminMigrationReview: null,
  adminUnauthorized: null,
};
smoke.admin = await dispatchHttp(app, {
  url: "/api/admin/leads?locale=ru",
  headers: { authorization: "Bearer local-admin-smoke" },
});
smoke.adminMigrationReview = await dispatchHttp(app, {
  url: "/api/admin/migration/review?locale=bg",
  headers: { authorization: "Bearer local-admin-smoke" },
});
smoke.adminMigrationReviewHtml = await dispatchHttp(app, {
  url: "/admin/migration/review?locale=bg",
  headers: { authorization: "Bearer local-admin-smoke" },
});
smoke.adminUnauthorized = await dispatchHttp(app, { url: "/api/admin/leads?locale=ru" });
smoke.reply = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/replies",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    id: "reply-http-lead-he-0001",
    leadId: "http-lead-he-0001",
    language: "he",
    hermesDraft: "Hermes draft for broker review.",
    reviewedReply: "Reviewed reply approved by broker.",
    reviewer: "broker_ru",
    approved: true,
  },
});
smoke.formReply = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/replies",
  headers: {
    authorization: "Bearer local-admin-smoke",
    "content-type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    leadId: "http-lead-contact-he-0001",
    language: "he",
    reviewedReply: "Reviewed callback reply approved by broker.",
    reviewer: "broker_en",
    approved: "true",
  }).toString(),
});
smoke.replyUnauthorized = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/replies",
  body: { leadId: "http-lead-he-0001", reviewedReply: "No auth", reviewer: "broker_ru", approved: true },
});
smoke.viewing = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/viewings",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    id: "viewing-http-lead-he-0001",
    leadId: "http-lead-he-0001",
    startsAt: "2026-07-06T10:00:00Z",
    broker: "broker_ru",
  },
});
smoke.viewingUnauthorized = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/viewings",
  body: { leadId: "http-lead-he-0001", startsAt: "2026-07-06T10:00:00Z", broker: "broker_ru" },
});
smoke.viewingCalendar = await dispatchHttp(app, {
  url: "/api/admin/viewings.ics",
  headers: { authorization: "Bearer local-admin-smoke" },
});
smoke.viewingCalendarUnauthorized = await dispatchHttp(app, { url: "/api/admin/viewings.ics" });
smoke.translationDraft = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/translations/draft",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    objectType: "listing",
    objectId: "MS-CRAWL-0001",
    sourceLocale: "bg",
    targetLocale: "el",
    sourceContent: {
      title: "Reviewed listing title",
      description: "Reviewed listing description for Sandanski.",
    },
    propertyFacts: { id: "MS-CRAWL-0001", location: "Sandanski" },
  },
});
smoke.translationPublish = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/translations/publish",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    taskId: smoke.translationDraft.body.id,
    reviewer: "translator_el",
    approvedAt: "2026-07-04T00:02:00Z",
  },
});
smoke.listingEditorHtml = await dispatchHttp(app, {
  url: "/admin/listings/edit?locale=bg&listingId=MS-CRAWL-0001",
  headers: { authorization: "Bearer local-admin-smoke" },
});
smoke.listingEdit = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/listings/edit",
  headers: {
    authorization: "Bearer local-admin-smoke",
    "content-type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    listingId: "MS-CRAWL-0001",
    editor: "editor_bg",
    description: "Updated approved source description.",
  }).toString(),
});
smoke.staleListing = await dispatchHttp(app, { url: "/el/akinita/MS-CRAWL-0001" });
smoke.staleSearch = await dispatchHttp(app, { url: "/api/search?locale=el&q=Sandanski" });
smoke.localeCreate = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/locales",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    code: "es",
    native_name: "Español",
    admin_name: "Spanish",
    route_segments: { listing: "propiedades", search: "buscar" },
  },
});
smoke.localeFallback = await dispatchHttp(app, { url: "/es/" });
smoke.admin = await dispatchHttp(app, {
  url: "/api/admin/leads?locale=ru",
  headers: { authorization: "Bearer local-admin-smoke" },
});
smoke.adminHtml = await dispatchHttp(app, {
  url: "/admin/leads?locale=ru",
  headers: { authorization: "Bearer local-admin-smoke" },
});

assertHttpSmoke(smoke);
const ledger = readLeadLedger(DEFAULT_LEAD_LEDGER_PATH);
assertLeadLedger(ledger);
smoke.leadLedger = { path: DEFAULT_LEAD_LEDGER_PATH, rows: ledger.length };
const outbox = readReplyOutbox(DEFAULT_REPLY_OUTBOX_PATH);
assertReplyOutbox(outbox);
smoke.replyOutbox = { path: DEFAULT_REPLY_OUTBOX_PATH, rows: outbox.length };
const languageRequests = readLanguageRequests(DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH);
assertLanguageRequests(languageRequests);
smoke.languageRequestLedger = { path: DEFAULT_LANGUAGE_REQUEST_LEDGER_PATH, rows: languageRequests.length };
const translations = readTranslationLedger(DEFAULT_TRANSLATION_LEDGER_PATH);
assertTranslationLedger(translations);
smoke.translationLedger = { path: DEFAULT_TRANSLATION_LEDGER_PATH, rows: translations.length };
const listingEdits = readListingEdits(DEFAULT_LISTING_EDIT_LEDGER_PATH);
assertListingEdits(listingEdits);
smoke.listingEditLedger = { path: DEFAULT_LISTING_EDIT_LEDGER_PATH, rows: listingEdits.length };
const viewings = readViewings(DEFAULT_VIEWING_LEDGER_PATH);
assertViewingLedger(viewings);
smoke.viewingLedger = { path: DEFAULT_VIEWING_LEDGER_PATH, rows: viewings.length };
const savedSearches = readSavedSearches(DEFAULT_SAVED_SEARCH_LEDGER_PATH);
assertSavedSearches(savedSearches);
smoke.savedSearchLedger = { path: DEFAULT_SAVED_SEARCH_LEDGER_PATH, rows: savedSearches.length };
const sellerPipeline = readSellerPipeline(DEFAULT_SELLER_PIPELINE_PATH);
assertSellerPipeline(sellerPipeline);
smoke.sellerPipelineLedger = { path: DEFAULT_SELLER_PIPELINE_PATH, rows: sellerPipeline.length };
const brokerContacts = readBrokerContacts(DEFAULT_BROKER_CONTACT_LEDGER_PATH);
assertBrokerContacts(brokerContacts);
smoke.brokerContactLedger = { path: DEFAULT_BROKER_CONTACT_LEDGER_PATH, rows: brokerContacts.length };
const tourApprovals = readTourApprovals(DEFAULT_TOUR_APPROVAL_LEDGER_PATH);
assertTourApprovals(tourApprovals);
smoke.tourApprovalLedger = { path: DEFAULT_TOUR_APPROVAL_LEDGER_PATH, rows: tourApprovals.length };
smoke.localeRegistry = { path: localeRegistryPath, locales: loadLocaleRegistry(localeRegistryPath).locales.length };

const outPath = fromRoot("production", "data", "http-smoke.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(smoke, null, 2)}\n`);
console.log(`Wrote HTTP smoke fixture to ${outPath}`);
