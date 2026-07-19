import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { assertHttpSmoke, createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { assertLeadLedger, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import {
  assertLanguageRequests,
  readLanguageRequests,
  resetLanguageRequests,
} from "../lib/language-requests.mjs";
import {
  assertTranslationLedger,
  readTranslationLedger,
  resetTranslationLedger,
} from "../lib/translation-ledger.mjs";
import {
  assertListingEdits,
  readListingEdits,
  resetListingEdits,
} from "../lib/listing-edits.mjs";
import {
  DEFAULT_REPLY_OUTBOX_PATH,
  assertReplyOutbox,
  readReplyOutbox,
  resetReplyOutbox,
} from "../lib/lead-replies.mjs";
import {
  assertViewingLedger,
  readViewings,
  resetViewingLedger,
} from "../lib/viewing-ledger.mjs";
import {
  assertViewingFollowUpLedger,
  readViewingFollowUps,
  resetViewingFollowUpLedger,
} from "../lib/viewing-follow-ups.mjs";
import {
  assertSavedSearches,
  readSavedSearches,
  resetSavedSearches,
} from "../lib/saved-searches.mjs";
import {
  assertSellerPipeline,
  readSellerPipeline,
  resetSellerPipeline,
} from "../lib/seller-pipeline.mjs";
import {
  assertDealLedger,
  readDeals,
  resetDealLedger,
} from "../lib/deal-ledger.mjs";
import {
  assertBrokerContacts,
  readBrokerContacts,
  resetBrokerContacts,
} from "../lib/broker-contacts.mjs";
import {
  assertTourApprovals,
  readTourApprovals,
  resetTourApprovals,
} from "../lib/tours.mjs";
import {
  assertEventLedger,
  readEventLedger,
  resetEventLedger,
} from "../lib/events.mjs";
import {
  DEFAULT_CONSENT_LEDGER_PATH,
  assertConsentLedger,
  readConsentLedger,
  resetConsentLedger,
} from "../lib/consent-ledger.mjs";
import {
  DEFAULT_AUDIT_LOG_PATH,
  assertAuditLog,
  readAuditLog,
  resetAuditLog,
} from "../lib/audit-log.mjs";
import {
  assertSlugHistory,
  readSlugHistory,
  resetSlugHistory,
} from "../lib/slug-history.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { fromRoot } from "../lib/paths.mjs";

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

const smokeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-http-smoke-"));
const leadLedgerPath = path.join(smokeDir, "leads.jsonl");
const replyOutboxPath = path.join(smokeDir, "replies.jsonl");
const languageRequestPath = path.join(smokeDir, "language-requests.jsonl");
const translationLedgerPath = path.join(smokeDir, "translation-tasks.jsonl");
const listingEditLedgerPath = path.join(smokeDir, "listing-edits.jsonl");
const viewingLedgerPath = path.join(smokeDir, "viewings.jsonl");
const viewingFollowUpLedgerPath = path.join(smokeDir, "viewing-follow-ups.jsonl");
const savedSearchLedgerPath = path.join(smokeDir, "saved-searches.jsonl");
const sellerPipelinePath = path.join(smokeDir, "seller-pipeline.jsonl");
const dealLedgerPath = path.join(smokeDir, "deals.jsonl");
const brokerContactLedgerPath = path.join(smokeDir, "broker-contacts.jsonl");
const tourApprovalLedgerPath = path.join(smokeDir, "tour-approvals.jsonl");
const eventLedgerPath = path.join(smokeDir, "events.jsonl");
const consentLedgerPath = path.join(smokeDir, "consent.jsonl");
const auditLogPath = path.join(smokeDir, "audit-log.jsonl");
const slugHistoryPath = path.join(smokeDir, "slug-history.jsonl");
const localeRegistryPath = fromRoot("production", "data", "admin-locale-registry-smoke.json");

resetLeadLedger(leadLedgerPath);
resetReplyOutbox(replyOutboxPath);
resetLanguageRequests(languageRequestPath);
resetTranslationLedger(translationLedgerPath);
resetListingEdits(listingEditLedgerPath);
resetViewingLedger(viewingLedgerPath);
resetViewingFollowUpLedger(viewingFollowUpLedgerPath);
resetSavedSearches(savedSearchLedgerPath);
resetSellerPipeline(sellerPipelinePath);
resetDealLedger(dealLedgerPath);
resetBrokerContacts(brokerContactLedgerPath);
resetTourApprovals(tourApprovalLedgerPath);
resetEventLedger(eventLedgerPath);
resetConsentLedger(consentLedgerPath);
resetAuditLog(auditLogPath);
resetSlugHistory(slugHistoryPath);
fs.writeFileSync(localeRegistryPath, `${JSON.stringify(loadLocaleRegistry(), null, 2)}\n`);
const app = createHttpApp({
  leadLedgerPath,
  replyOutboxPath,
  languageRequestPath,
  translationLedgerPath,
  listingEditLedgerPath,
  viewingLedgerPath,
  viewingFollowUpLedgerPath,
  savedSearchLedgerPath,
  sellerPipelinePath,
  dealLedgerPath,
  brokerContactLedgerPath,
  tourApprovalLedgerPath,
  eventLedgerPath,
  consentLedgerPath,
  auditLogPath,
  slugHistoryPath,
  localeRegistryPath,
  receivedAt: "2026-07-04T00:00:00Z",
  requestedAt: "2026-07-04T00:01:00Z",
  editedAt: "2026-07-04T00:03:00Z",
  reviewedAt: "2026-07-04T00:05:00Z",
  bookedAt: "2026-07-04T00:06:00Z",
  viewingFollowUpAt: "2026-07-06T12:00:00Z",
  savedAt: "2026-07-04T00:07:00Z",
  sellerPipelineCreatedAt: "2026-07-04T00:08:00Z",
  dealClosedAt: "2026-07-10T10:00:00Z",
  slugChangedAt: "2026-07-04T00:09:00Z",
  listingQualityGeneratedAt: "2026-07-05T03:01:09.839Z",
  leadSlaGeneratedAt: "2026-07-06T00:00:00Z",
});
const legacyRedirect = JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
const smoke = {
  fixture_id: "http-smoke-20260704",
  health: await dispatchHttp(app, { url: "/api/health" }),
  ready: await dispatchHttp(app, { url: "/api/ready" }),
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
  slugChange: await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listings/slug",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      id: "slug-change-MS-CRAWL-0001",
      listingId: "MS-CRAWL-0001",
      locale: "he",
      oldPath: "/he/properties/old-sandanski-slug",
      editor: "editor_bg",
    },
  }),
  slugRedirect: await dispatchHttp(app, { url: "/he/properties/old-sandanski-slug" }),
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
  favicon: await dispatchHttp(app, { url: "/favicon.ico" }),
  sellerPage: await dispatchHttp(app, { url: "/he/sell" }),
  sellerHtml: await dispatchHttp(app, { url: "/he/sell?format=html" }),
  contact: await dispatchHttp(app, { url: "/he/contact" }),
  contactHtml: await dispatchHttp(app, { url: "/he/contact?format=html" }),
  guidePage: await dispatchHttp(app, { url: "/en/guides/foreign-buyers" }),
  guideHtml: await dispatchHttp(app, { url: "/en/guides/foreign-buyers?format=html" }),
  savedSearch: await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches",
    body: {
      id: "saved-search-he-0001",
      locale: "he",
      query: "Sandanski",
      filters: { property_type: "apartment", unsupported_filter: "ignored" },
      contact: { name: "Noa Levi", whatsapp: "+359880000001" },
    },
  }),
  hermesChatDisabled: await dispatchHttp(app, {
    method: "POST",
    url: "/api/hermes/chat",
    body: {
      locale: "he",
      query: "Sandanski",
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
      contact: { name: "Noa Levi", whatsapp: "+359880000001" },
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
      contact: { name: "Noa Levi", phone: "+359880000002" },
      contact_preference: "phone",
      request_details: { viewing_date: "2026-07-06", viewing_time: "10:00" },
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
      contact: { name: "Noa Levi", phone: "+359880000003" },
      contact_preference: "phone",
      request_details: { callback_time: "Weekdays after 14:00" },
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
      contact: { name: "Nikos Papadopoulos", phone: "+359880000004" },
      contact_preference: "phone",
      property: { location: "Sandanski", type: "house" },
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
smoke.viewingFollowUp = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/viewings/follow-up",
  headers: { authorization: "Bearer local-admin-smoke", "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    id: "viewing-follow-up-http-0001",
    viewingId: "viewing-http-lead-he-0001",
    actor: "broker_ru",
    action: "complete",
    note: "Broker recorded the completed viewing privately.",
  }).toString(),
});
smoke.viewingFollowUpRetry = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/viewings/follow-up",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    id: "viewing-follow-up-http-0001",
    viewingId: "viewing-http-lead-he-0001",
    actor: "broker_ru",
    action: "complete",
    note: "Broker recorded the completed viewing privately.",
  },
});
smoke.viewingFollowUpUnauthorized = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/viewings/follow-up",
  body: { viewingId: "viewing-http-lead-he-0001", actor: "broker_ru", action: "complete" },
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
smoke.dealClose = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/deals/close",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    id: "deal-http-lead-he-0001",
    leadId: "http-lead-he-0001",
    broker: "broker_ru",
  },
});
smoke.dealCloseUnauthorized = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/deals/close",
  body: { leadId: "http-lead-he-0001", broker: "broker_ru" },
});
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
    draftOutput: {
      title: "MS-CRAWL-0001 Sandanski el",
      body: "MS-CRAWL-0001 Sandanski reviewed el translation draft",
      seo_title: "MS-CRAWL-0001 Sandanski",
      meta_description: "MS-CRAWL-0001 Sandanski reviewed el translation draft for approved MS Realty listing content.",
      citations: [{ source: "cms", field: "title" }],
    },
  },
});
smoke.translationApprove = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/translations/approve",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    taskId: smoke.translationDraft.body.id,
    reviewer: "translator_el",
    approvedAt: "2026-07-04T00:02:00Z",
  },
});
smoke.translationPublish = await dispatchHttp(app, {
  method: "POST",
  url: "/api/admin/translations/publish",
  headers: { authorization: "Bearer local-admin-smoke" },
  body: {
    taskId: smoke.translationApprove.body.id,
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
smoke.adminLocales = {
  bg: compactAdminLocaleResponse(
    await dispatchHttp(app, {
      url: "/api/admin/locales?locale=bg",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
  ),
  ru: compactAdminLocaleResponse(
    await dispatchHttp(app, {
      url: "/api/admin/locales?locale=ru",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
  ),
  en: compactAdminLocaleResponse(
    await dispatchHttp(app, {
      url: "/api/admin/locales?locale=en",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
  ),
  heFallback: compactAdminLocaleResponse(
    await dispatchHttp(app, {
      url: "/api/admin/locales?locale=he",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    { includeLocales: true },
  ),
};
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
smoke.ctaClick = await dispatchHttp(app, {
  method: "POST",
  url: "/api/events",
  body: {
    type: "cta_click",
    path: "/he/properties/MS-CRAWL-0001",
    locale: "he",
    listingReference: "MS-CRAWL-0001",
    action: "sticky_inquiry",
  },
});
smoke.admin = await dispatchHttp(app, {
  url: "/api/admin/leads?locale=ru",
  headers: { authorization: "Bearer local-admin-smoke" },
});
smoke.adminHtml = await dispatchHttp(app, {
  url: "/admin/leads?locale=ru",
  headers: { authorization: "Bearer local-admin-smoke" },
});

assertHttpSmoke(smoke);
const ledger = readLeadLedger(leadLedgerPath);
assertLeadLedger(ledger);
smoke.leadLedger = { rows: ledger.length };
const outbox = readReplyOutbox(replyOutboxPath);
assertReplyOutbox(outbox);
fs.copyFileSync(replyOutboxPath, DEFAULT_REPLY_OUTBOX_PATH);
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
const viewingFollowUps = readViewingFollowUps(viewingFollowUpLedgerPath);
assertViewingFollowUpLedger(viewingFollowUps);
smoke.viewingFollowUpLedger = { rows: viewingFollowUps.length };
const savedSearches = readSavedSearches(savedSearchLedgerPath);
assertSavedSearches(savedSearches);
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
fs.copyFileSync(consentLedgerPath, DEFAULT_CONSENT_LEDGER_PATH);
smoke.consentLedger = {
  rows: consents.length,
  byType: consents.reduce((counts, row) => ({ ...counts, [row.consent_type]: (counts[row.consent_type] || 0) + 1 }), {}),
};
const auditRows = readAuditLog(auditLogPath);
assertAuditLog(auditRows);
fs.copyFileSync(auditLogPath, DEFAULT_AUDIT_LOG_PATH);
smoke.auditLog = {
  rows: auditRows.length,
  byAction: auditRows.reduce((counts, row) => ({ ...counts, [row.action]: (counts[row.action] || 0) + 1 }), {}),
};
const slugHistory = readSlugHistory(slugHistoryPath);
assertSlugHistory(slugHistory);
smoke.slugHistoryLedger = { rows: slugHistory.length };
smoke.localeRegistry = { locales: loadLocaleRegistry(localeRegistryPath).locales.length };

const outPath = fromRoot("production", "data", "http-smoke.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(smoke, null, 2)}\n`);
console.log(`Wrote HTTP smoke fixture to ${outPath}`);
