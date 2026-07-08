import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { assertHttpSmoke, createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { assertLeadLedger, readLeadLedger, resetLeadLedger } from "../lib/lead-ledger.mjs";
import { assertLanguageRequests, readLanguageRequests, resetLanguageRequests } from "../lib/language-requests.mjs";
import { assertReplyOutbox, readReplyOutbox, resetReplyOutbox } from "../lib/lead-replies.mjs";
import { assertTranslationLedger, readTranslationLedger, resetTranslationLedger } from "../lib/translation-ledger.mjs";
import { assertListingEdits, readListingEdits, resetListingEdits } from "../lib/listing-edits.mjs";
import { assertViewingLedger, readViewings, resetViewingLedger } from "../lib/viewing-ledger.mjs";
import { assertSavedSearches, readSavedSearches, resetSavedSearches } from "../lib/saved-searches.mjs";
import { assertSellerPipeline, readSellerPipeline, resetSellerPipeline } from "../lib/seller-pipeline.mjs";
import { assertDealLedger, readDeals, resetDealLedger } from "../lib/deal-ledger.mjs";
import { assertBrokerContacts, readBrokerContacts, resetBrokerContacts } from "../lib/broker-contacts.mjs";
import { assertTourApprovals, readTourApprovals, resetTourApprovals } from "../lib/tours.mjs";
import { assertEventLedger, readEventLedger, resetEventLedger } from "../lib/events.mjs";
import { assertConsentLedger, readConsentLedger, resetConsentLedger } from "../lib/consent-ledger.mjs";
import { assertAuditLog, readAuditLog, resetAuditLog } from "../lib/audit-log.mjs";
import { assertSlugHistory, readSlugHistory, resetSlugHistory } from "../lib/slug-history.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import {
  buildLiveServiceProvisioningReport,
} from "../lib/live-service-provisioning.mjs";
import { buildPayloadRuntimeReport } from "../lib/payload-runtime.mjs";
import { parseCsv } from "../lib/csv.mjs";
import { fromRoot } from "../lib/paths.mjs";

function tempLedger() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-http-`)}/leads.jsonl`;
  resetLeadLedger(file);
  return file;
}

function tempOutbox() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-replies-`)}/replies.jsonl`;
  resetReplyOutbox(file);
  return file;
}

function tempLanguageRequests() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-language-`)}/requests.jsonl`;
  resetLanguageRequests(file);
  return file;
}

function tempTranslations() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-translations-`)}/translations.jsonl`;
  resetTranslationLedger(file);
  return file;
}

function tempListingEdits() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-edits-`)}/edits.jsonl`;
  resetListingEdits(file);
  return file;
}

function tempDefaultListingEdits() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-edits-`)}/edits.jsonl`;
  fs.copyFileSync(fromRoot("production", "data", "listing-edits.jsonl"), file);
  return file;
}

function tempViewings() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-viewings-`)}/viewings.jsonl`;
  resetViewingLedger(file);
  return file;
}

function tempSavedSearches() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-saved-searches-`)}/saved-searches.jsonl`;
  resetSavedSearches(file);
  return file;
}

function tempSellerPipeline() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seller-pipeline-`)}/seller-pipeline.jsonl`;
  resetSellerPipeline(file);
  return file;
}

function tempDeals() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-deals-`)}/deals.jsonl`;
  resetDealLedger(file);
  return file;
}

function tempBrokerContacts() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-broker-contacts-`)}/broker-contacts.jsonl`;
  resetBrokerContacts(file);
  return file;
}

function tempTourApprovals() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-tour-approvals-`)}/tour-approvals.jsonl`;
  resetTourApprovals(file);
  return file;
}

function tempEvents() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-events-`)}/events.jsonl`;
  resetEventLedger(file);
  return file;
}

function tempConsents() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-consents-`)}/consents.jsonl`;
  resetConsentLedger(file);
  return file;
}

function tempAuditLog() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-audit-`)}/audit-log.jsonl`;
  resetAuditLog(file);
  return file;
}

function tempSlugHistory() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-slug-history-`)}/slug-history.jsonl`;
  resetSlugHistory(file);
  return file;
}

function tempRedirectApprovals() {
  return `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-redirect-approvals-`)}/redirect-approvals.jsonl`;
}

function tempDeployableRedirects() {
  return `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-deployable-redirects-`)}/deployable-redirects.json`;
}

function tempSeoEvidenceDir() {
  return fs.mkdtempSync(`${os.tmpdir()}/ms-realty-seo-evidence-`);
}

function tempListingQualityReviewPath() {
  return `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-listing-quality-review-`)}/listing-quality.csv`;
}

function tempRegistry() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-locales-`)}/registry.json`;
  fs.writeFileSync(file, `${JSON.stringify(loadLocaleRegistry(), null, 2)}\n`);
  return file;
}

function hermesDraftOutput(propertyFacts, targetLocale = "el") {
  const factText = Object.values(propertyFacts)
    .filter((value) => ["string", "number"].includes(typeof value))
    .map(String)
    .filter(Boolean)
    .join(" ");
  return {
    title: `${propertyFacts.id} ${propertyFacts.location} ${targetLocale}`,
    body: `${factText} reviewed ${targetLocale} translation draft`,
    seo_title: `${propertyFacts.id} ${propertyFacts.location}`,
    meta_description: `${factText} reviewed ${targetLocale} translation draft for approved MS Realty listing content.`,
    citations: [{ source: "cms", field: "title" }],
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function completeListingQualityReviewCsv(workbookCsv, limit = null) {
  const headers = [
    "listing_id",
    "price_eur",
    "bedrooms",
    "location",
    "description",
    "facts_reviewer",
    "media_reviewer",
    "review_notes",
    "editor_path",
    "review_status",
    "issues",
    "required_editor_fields",
    "public_gallery_assets",
    "public_gallery_sample",
    "missing_alt_text_assets",
  ];
  const workbookRows = parseCsv(workbookCsv);
  const reviewRows = limit === null ? workbookRows : workbookRows.slice(0, limit);
  const rows = reviewRows.map((row) => {
    const fields = (row.required_editor_fields || "").split("|").filter(Boolean);
    const needsFacts = fields.some((field) => ["price_eur", "bedrooms", "location", "description"].includes(field));
    const needsMedia = fields.some((field) => ["media_review", "media_alt_text", "public_gallery", "tour_review"].includes(field));
    return [
      row.listing_id,
      fields.includes("price_eur") ? row.price_eur || 123000 : "",
      fields.includes("bedrooms") ? row.bedrooms || 2 : "",
      fields.includes("location") ? row.location || "Sandanski" : "",
      fields.includes("description") ? "Reviewed listing description" : "",
      needsFacts ? "editor_bg" : "",
      needsMedia ? "media_editor" : "",
      "Reviewed source gallery evidence from admin listing-quality workbook",
      row.editor_path,
      row.review_status,
      row.issues,
      row.required_editor_fields,
      row.public_gallery_assets,
      row.public_gallery_sample,
      row.missing_alt_text_assets,
    ]
      .map(csvCell)
      .join(",");
  });
  return `${[headers.join(","), ...rows].join("\n")}\n`;
}

function deployableRedirect() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
}

function actionCounts(rows) {
  return rows.reduce((counts, row) => {
    counts[row.action] = (counts[row.action] || 0) + 1;
    return counts;
  }, {});
}

test("HTTP app serves listing, search, fallback, and lead JSON contracts", async () => {
  const leadLedgerPath = tempLedger();
  const replyOutboxPath = tempOutbox();
  const languageRequestPath = tempLanguageRequests();
  const translationLedgerPath = tempTranslations();
  const listingEditLedgerPath = tempListingEdits();
  const viewingLedgerPath = tempViewings();
  const savedSearchLedgerPath = tempSavedSearches();
  const sellerPipelinePath = tempSellerPipeline();
  const dealLedgerPath = tempDeals();
  const brokerContactLedgerPath = tempBrokerContacts();
  const tourApprovalLedgerPath = tempTourApprovals();
  const eventLedgerPath = tempEvents();
  const consentLedgerPath = tempConsents();
  const auditLogPath = tempAuditLog();
  const slugHistoryPath = tempSlugHistory();
  const app = createHttpApp({
    leadLedgerPath,
    replyOutboxPath,
    languageRequestPath,
    translationLedgerPath,
    listingEditLedgerPath,
    viewingLedgerPath,
    savedSearchLedgerPath,
    sellerPipelinePath,
    dealLedgerPath,
    brokerContactLedgerPath,
    tourApprovalLedgerPath,
    eventLedgerPath,
    consentLedgerPath,
    auditLogPath,
    slugHistoryPath,
    receivedAt: "2026-07-04T00:00:00Z",
    requestedAt: "2026-07-04T00:01:00Z",
    editedAt: "2026-07-04T00:03:00Z",
    reviewedAt: "2026-07-04T00:05:00Z",
    bookedAt: "2026-07-04T00:06:00Z",
    savedAt: "2026-07-04T00:07:00Z",
    sellerPipelineCreatedAt: "2026-07-04T00:08:00Z",
    dealClosedAt: "2026-07-10T10:00:00Z",
    slugChangedAt: "2026-07-04T00:09:00Z",
    leadSlaGeneratedAt: "2026-07-06T00:00:00Z",
  });
  const redirect = deployableRedirect();
  const smoke = {
    health: await dispatchHttp(app, { url: "/api/health" }),
    ready: await dispatchHttp(app, { url: "/api/ready" }),
    legacyRedirect: await dispatchHttp(app, { url: redirect.old_url }),
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
        id: "broker-contact-test",
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
        id: "tour-approval-test",
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
        id: "slug-change-http-test",
        listingId: "MS-CRAWL-0001",
        locale: "he",
        oldPath: "/he/properties/old-sandanski-slug",
        editor: "editor_bg",
      },
    }),
    slugChangeUnauthorized: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/listings/slug",
      body: {
        listingId: "MS-CRAWL-0001",
        locale: "he",
        oldPath: "/he/properties/no-auth-old-slug",
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
        id: "http-language-request-test",
        requestedLocale: "fr",
        requestedPath: "/fr/",
        contact: { name: "Claire Martin" },
        message: "Please notify me when French property pages are reviewed.",
      },
    }),
    savedSearch: await dispatchHttp(app, {
      method: "POST",
      url: "/api/saved-searches",
      body: {
        id: "http-saved-search-test",
        locale: "he",
        query: "Sandanski",
        filters: { property_type: "apartment", unsupported_filter: "ignored" },
        contact: { name: "Noa Levi" },
      },
    }),
    hermesChat: await dispatchHttp(app, {
      method: "POST",
      url: "/api/hermes/chat",
      body: {
        locale: "he",
        query: "Sandanski",
      },
    }),
    hermesProcessChat: await dispatchHttp(app, {
      method: "POST",
      url: "/api/hermes/chat",
      body: {
        locale: "he",
        query: "Can a non-EU buyer own land in Bulgaria through an OOD?",
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
    lead: await dispatchHttp(app, {
      method: "POST",
      url: "/api/leads",
      body: {
        id: "http-lead-test",
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
        id: "http-viewing-lead-test",
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
        id: "http-contact-lead-test",
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
        id: "http-seller-lead-test",
        source: "website_seller_valuation",
        leadType: "seller",
        language: "el",
        contact: { name: "Nikos Papadopoulos" },
        message: "I want a valuation for my property.",
      },
    }),
    admin: await dispatchHttp(app, {
      url: "/api/admin/leads?locale=ru",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    adminMigrationReview: await dispatchHttp(app, {
      url: "/api/admin/migration/review?locale=bg",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    adminMigrationReviewUnauthorized: await dispatchHttp(app, { url: "/api/admin/migration/review?locale=bg" }),
    adminUnauthorized: await dispatchHttp(app, { url: "/api/admin/leads?locale=ru" }),
    reply: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/replies",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: {
        leadId: "http-lead-test",
        reviewedReply: "Reviewed reply approved by broker.",
        reviewer: "broker_ru",
        approved: true,
      },
    }),
    replyUnauthorized: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/replies",
      body: { leadId: "http-lead-test", reviewedReply: "No auth", reviewer: "broker_ru", approved: true },
    }),
    viewing: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/viewings",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: {
        leadId: "http-lead-test",
        startsAt: "2026-07-06T10:00:00Z",
        broker: "broker_ru",
      },
    }),
    viewingUnauthorized: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/viewings",
      body: { leadId: "http-lead-test", startsAt: "2026-07-06T10:00:00Z", broker: "broker_ru" },
    }),
    viewingCalendar: await dispatchHttp(app, {
      url: "/api/admin/viewings.ics",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    viewingCalendarUnauthorized: await dispatchHttp(app, { url: "/api/admin/viewings.ics" }),
    dealClose: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/deals/close",
      headers: { authorization: "Bearer local-admin-smoke" },
      body: { leadId: "http-lead-test", broker: "broker_ru" },
    }),
    dealCloseUnauthorized: await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/deals/close",
      body: { leadId: "http-lead-test", broker: "broker_ru" },
    }),
  };
  smoke.formReply = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/replies",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      leadId: "http-contact-lead-test",
      language: "he",
      reviewedReply: "Reviewed callback reply approved by broker.",
      reviewer: "broker_en",
      approved: "true",
    }).toString(),
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
      draftOutput: hermesDraftOutput({ id: "MS-CRAWL-0001", location: "Sandanski" }, "el"),
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
    bg: await dispatchHttp(app, {
      url: "/api/admin/locales?locale=bg",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    ru: await dispatchHttp(app, {
      url: "/api/admin/locales?locale=ru",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    en: await dispatchHttp(app, {
      url: "/api/admin/locales?locale=en",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
    heFallback: await dispatchHttp(app, {
      url: "/api/admin/locales?locale=he",
      headers: { authorization: "Bearer local-admin-smoke" },
    }),
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
  smoke.adminMigrationReview = await dispatchHttp(app, {
    url: "/api/admin/migration/review?locale=bg",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  smoke.adminMigrationReviewHtml = await dispatchHttp(app, {
    url: "/admin/migration/review?locale=bg",
    headers: { authorization: "Bearer local-admin-smoke" },
  });

  assert.equal(assertHttpSmoke(smoke), true);
  assert.equal(smoke.health.body.status, "ok");
  assert.deepEqual(smoke.health.body.blockers, [
    "external_seo_exports",
    "listing_quality_review",
    "live_services",
    "payload_runtime",
  ]);
  assert.equal(smoke.ready.status, 503);
  assert.equal(smoke.ready.body.status, "blocked");
  assert.deepEqual(
    smoke.ready.body.blocked_gates.map((gate) => gate.id),
    ["external_seo_exports", "listing_quality_review", "live_services", "payload_runtime"],
  );
  assert.equal(smoke.ready.headers["cache-control"], "no-store");
  assert.equal(smoke.ready.headers["retry-after"], "60");
  assert.equal(smoke.health.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(smoke.homeHtml.headers["x-frame-options"], "DENY");
  assert.equal(smoke.listing.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(smoke.sitemap.headers["content-type"], "application/xml; charset=utf-8");
  assert.equal(smoke.favicon.headers["content-type"], "image/svg+xml; charset=utf-8");
  assert.match(smoke.favicon.body, /#DB3E3E/);
  assert.equal(smoke.legacyRedirect.headers.location, redirect.target_path);
  assert.equal(smoke.home.body.body.search.path, "/he/search");
  assert.equal(smoke.homeHtml.body.includes("data-kind=\"home\""), true);
  assert.equal(smoke.homeHtml.body.includes("data-react-public-ui=\"home\""), true);
  assert.equal(smoke.listingPrint.body.includes("data-kind=\"listing-print\""), true);
  assert.equal(smoke.listingPrint.body.includes("data-react-public-ui="), false);
  assert.equal(smoke.listingPrint.body.includes("data-print-status=\"browser-pdf-ready\""), true);
  assert.equal(smoke.search.body.cards.length > 0, true);
  assert.equal(smoke.location.body.cards.length, 1);
  assert.equal(smoke.locationHtml.body.includes("data-location=\"Sandanski\""), true);
  assert.deepEqual(smoke.savedSearch.body.filters, { property_type: "apartment" });
  assert.equal(smoke.savedSearch.headers["cache-control"], "no-store");
  assert.equal(smoke.hermesChat.body.kind, "hermes_public_chat");
  assert.equal(smoke.hermesChat.body.mode, "retrieval_only");
  assert.equal(smoke.hermesChat.body.can_publish, false);
  assert.equal(smoke.hermesChat.body.citations.length > 0, true);
  assert.equal(smoke.hermesChat.headers["cache-control"], "no-store");
  assert.equal(smoke.hermesProcessChat.body.citations[0].type, "cms_page");
  assert.match(smoke.hermesProcessChat.body.answer, /Non-EU buyers cannot own Bulgarian land directly/);
  assert.equal(smoke.lead.body.contact_preference, "whatsapp");
  assert.equal(smoke.lead.body.broker_assignment.broker_id, "broker_international");
  assert.equal(smoke.lead.body.broker_assignment.criteria.location, "Sandanski");
  assert.equal(smoke.lead.headers["cache-control"], "no-store");
  assert.equal(smoke.viewingLead.body.lead.source, "website_viewing_request");
  assert.equal(smoke.viewingLead.body.broker_assignment.broker_id, "broker_international");
  assert.equal(smoke.viewing.body.feedback_request.status, "open");
  assert.equal(smoke.viewing.body.feedback_request.channel, "whatsapp");
  assert.equal(smoke.dealClose.body.testimonial_request.status, "open");
  assert.equal(smoke.dealClose.body.referral_request.status, "open");
  assert.equal(smoke.dealClose.body.testimonial_request.channel, "whatsapp");
  assert.equal(smoke.contact.body.body.callback.payload.source, "website_contact_callback");
  assert.equal(smoke.contactHtml.body.includes("data-lead-type=\"general\""), true);
  assert.equal(smoke.contactLead.body.lead.leadType, "general");
  assert.equal(smoke.guidePage.body.kind, "guide");
  assert.equal(smoke.guidePage.body.indexable, true);
  assert.match(smoke.guidePage.body.body.sections[0].facts.join(" "), /Non-EU buyers cannot own Bulgarian land directly/);
  assert.match(smoke.guideHtml.body, /data-kind="guide"/);
  assert.match(smoke.guideHtml.body, /data-react-public-ui="guide"/);
  assert.equal(smoke.languageRequest.headers["cache-control"], "no-store");
  assert.equal(smoke.listingAfterBrokerContact.body.body.actions.direct_contact.review_status, "approved_broker_contact");
  assert.equal(smoke.tourApproval.body.is_public, true);
  assert.equal(smoke.listingAfterTourApproval.body.body.media.tour.available, true);
  assert.equal(smoke.listingAfterTourApproval.body.body.media.tour.mount_target, "psv-listing-tour");
  assert.equal(smoke.slugChange.body.new_path, "/he/properties/MS-CRAWL-0001");
  assert.equal(smoke.slugRedirect.headers.location, "/he/properties/MS-CRAWL-0001");
  assert.equal(smoke.slugChangeUnauthorized.status, 401);
  assert.equal(assertLeadLedger(readLeadLedger(leadLedgerPath)), true);
  assert.equal(assertReplyOutbox(readReplyOutbox(replyOutboxPath)), true);
  assert.equal(assertLanguageRequests(readLanguageRequests(languageRequestPath)), true);
  assert.equal(assertTranslationLedger(readTranslationLedger(translationLedgerPath)), true);
  assert.equal(assertListingEdits(readListingEdits(listingEditLedgerPath)), true);
  assert.equal(assertViewingLedger(readViewings(viewingLedgerPath)), true);
  assert.equal(assertSavedSearches(readSavedSearches(savedSearchLedgerPath)), true);
  assert.equal(assertSellerPipeline(readSellerPipeline(sellerPipelinePath)), true);
  assert.equal(assertDealLedger(readDeals(dealLedgerPath)), true);
  assert.equal(assertBrokerContacts(readBrokerContacts(brokerContactLedgerPath)), true);
  assert.equal(assertTourApprovals(readTourApprovals(tourApprovalLedgerPath)), true);
  assert.equal(assertEventLedger(readEventLedger(eventLedgerPath)), true);
  assert.equal(assertConsentLedger(readConsentLedger(consentLedgerPath)), true);
  assert.equal(assertSlugHistory(readSlugHistory(slugHistoryPath)), true);
  assert.deepEqual(
    readConsentLedger(consentLedgerPath).reduce((counts, row) => {
      counts[row.consent_type] = (counts[row.consent_type] || 0) + 1;
      return counts;
    }, {}),
    { language_request: 1, saved_search_alerts: 1, inquiry_follow_up: 4 },
  );
  const auditRows = readAuditLog(auditLogPath);
  assert.equal(assertAuditLog(auditRows), true);
  assert.deepEqual(actionCounts(auditRows), {
    broker_contact_approved: 1,
    tour_approved: 1,
    listing_slug_changed: 1,
    reply_approved: 2,
    viewing_booked: 1,
    deal_closed: 1,
    translation_drafted: 1,
    translation_approved: 1,
    translation_published: 1,
    listing_edited: 1,
    locale_created: 1,
  });
  assert.equal(readEventLedger(eventLedgerPath).some((row) => row.type === "cta_click" && row.action === "sticky_inquiry"), true);
  assert.equal(readEventLedger(eventLedgerPath).some((row) => row.type === "hermes_chat" && row.path === "/api/hermes/chat"), true);
  assert.equal(smoke.staleListing.body.metadata.robots, "noindex,follow");
  assert.equal(smoke.staleListing.body.body.description, "Updated approved source description.");
  assert.equal(smoke.admin.body.leads.length, 4);
  assert.equal(smoke.admin.body.leadSla.summary.total_leads, 4);
  assert.equal(smoke.admin.body.leadSla.summary.manager_escalation_required, 2);
  assert.equal(smoke.admin.body.summary.leadSlaManagerEscalations, 2);
  assert.equal(smoke.admin.headers["cache-control"], "no-store");
  assert.equal(smoke.admin.body.languageRequests.length, 1);
  assert.equal(smoke.adminHtml.body.includes("data-kind=\"admin-lead-inbox\""), true);
  assert.equal(smoke.adminHtml.body.includes("data-react-admin-ui=\"lead-inbox\""), true);
  assert.equal(smoke.adminHtml.body.includes("Manager escalations"), true);
  assert.equal(smoke.adminHtml.body.includes('data-sla-status="manager_escalation_required"'), true);
  assert.equal(smoke.adminHtml.body.includes("Escalation due"), true);
  assert.equal(smoke.adminHtml.headers["cache-control"], "no-store");
  assert.equal(smoke.adminHtml.body.includes("data-interface-locales=\"bg,ru,en\""), true);
  assert.equal(smoke.listingEditorHtml.body.includes("data-kind=\"admin-listing-editor\""), true);
  assert.equal(smoke.listingEditorHtml.body.includes("data-react-admin-ui=\"listing-editor\""), true);
  assert.equal(smoke.listingEditorHtml.body.includes("data-listing-id=\"MS-CRAWL-0001\""), true);
  assert.equal(smoke.admin.body.savedSearches.length, 1);
  assert.equal(smoke.admin.body.sellerPipeline.length, 1);
  assert.equal(smoke.admin.body.deals.length, 1);
  assert.equal(smoke.admin.body.translationTasks.some((task) => task.status === "stale"), true);
  assert.equal(smoke.admin.body.listingEdits.length, 1);
  assert.equal(smoke.admin.body.viewings.length, 1);
  assert.equal(smoke.adminMigrationReview.body.workspace.locale, "bg");
  assert.equal(smoke.adminMigrationReview.body.dashboard.media_reconciliation.media_rows, 11859);
  assert.equal(smoke.adminMigrationReview.body.routeMap.total, 457);
  assert.equal(smoke.adminMigrationReview.body.routeMap.mappedListings, 165);
  assert.equal(smoke.adminMigrationReview.headers["cache-control"], "no-store");
  assert.equal(smoke.adminMigrationReviewHtml.body.includes("data-kind=\"admin-migration-review\""), true);
  assert.equal(smoke.adminMigrationReviewHtml.body.includes("data-react-admin-ui=\"migration-review\""), true);
  assert.equal(smoke.adminMigrationReviewHtml.body.includes("data-approvable-listing=\"true\""), true);
  assert.equal(smoke.adminMigrationReviewUnauthorized.status, 401);
  assert.equal(smoke.adminMigrationReviewUnauthorized.headers["cache-control"], "no-store");
  assert.equal(smoke.adminMigrationReviewUnauthorized.headers["www-authenticate"], 'Bearer realm="ms-realty-admin"');
  assert.deepEqual(
    Object.values(smoke.adminLocales).map((response) => response.body.workspace.interface_locales),
    [
      ["bg", "ru", "en"],
      ["bg", "ru", "en"],
      ["bg", "ru", "en"],
      ["bg", "ru", "en"],
    ],
  );
  assert.deepEqual(
    [
      smoke.adminLocales.bg.body.workspace.locale,
      smoke.adminLocales.ru.body.workspace.locale,
      smoke.adminLocales.en.body.workspace.locale,
      smoke.adminLocales.heFallback.body.workspace.locale,
    ],
    ["bg", "ru", "en", "en"],
  );
  assert.equal(smoke.adminLocales.heFallback.body.locales.find((locale) => locale.code === "he").direction, "rtl");
  assert.equal(smoke.adminLocales.heFallback.body.locales.find((locale) => locale.code === "el").public_enabled, true);
  assert.equal(smoke.viewingCalendar.body.includes("BEGIN:VCALENDAR"), true);
  assert.equal(smoke.viewingCalendar.body.includes("DTSTART:20260706T100000Z"), true);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.lead_type === "seller" && lead.original_language === "el"), true);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.source === "website_viewing_request"), true);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.source === "website_contact_callback"), true);
  assert.deepEqual(smoke.admin.body.workspace.interface_locales, ["bg", "ru", "en"]);
});

test("HTTP admin can append reviewed redirect approvals without broad homepage mappings", async () => {
  const redirectApprovalPath = tempRedirectApprovals();
  const deployableRedirectOutputPath = tempDeployableRedirects();
  const listingEditLedgerPath = tempListingEdits();
  const translationLedgerPath = tempTranslations();
  const auditLogPath = tempAuditLog();
  const liveServiceProvisioningReportPath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-live-provisioning-`)}/mounted-live-service-provisioning-report.json`;
  fs.copyFileSync(fromRoot("production", "data", "live-service-provisioning-report.json"), liveServiceProvisioningReportPath);
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const listing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg" && route.target_path);
  const importListing = routeMap.find(
    (route) => route.url_type === "listing" && route.target_locale === "bg" && route.target_path && route.old_url !== listing.old_url,
  );
  const ruListing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "ru" && route.target_path);
  const importRuListing = routeMap.find(
    (route) => route.url_type === "listing" && route.target_locale === "ru" && route.target_path && route.old_url !== ruListing.old_url,
  );
  const taxonomy = routeMap.find((route) => route.url_type === "taxonomy");
  const app = createHttpApp({
    routeMap,
    redirectApprovalPath,
    deployableRedirectOutputPath,
    listingEditLedgerPath,
    translationLedgerPath,
    auditLogPath,
    liveServiceProvisioningReportPath,
    reviewedAt: "2026-07-05T00:00:00Z",
    editedAt: "2026-07-05T00:03:00Z",
    listingQualityGeneratedAt: "2026-07-05T00:09:00Z",
  });

  const approved = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      oldUrl: listing.old_url,
      equivalentContent: true,
      reviewer: "editor_bg",
      reason: "Reviewed listing parity in migration workbench.",
    },
  });
  const formApproved = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      oldUrl: ruListing.old_url,
      equivalentContent: "true",
      reviewer: "ru_preservation_editor",
      reason: "Reviewed same-content Russian route mapping.",
    }).toString(),
  });
  const rejected = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      oldUrl: taxonomy.old_url,
      equivalentContent: true,
      reviewer: "editor_bg",
    },
  });
  const unauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals",
    body: {
      oldUrl: listing.old_url,
      equivalentContent: true,
      reviewer: "editor_bg",
    },
  });
  const importUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals/import",
    headers: { "content-type": "text/csv" },
    body: `old_url,equivalent_content,reviewer,reason\n${importListing.old_url},true,editor_bg,Reviewed via CSV\n`,
  });
  const workbookUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/redirect-approval-workbook",
  });
  const workbook = await dispatchHttp(app, {
    url: "/api/admin/redirect-approval-workbook",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const qualityWorkbookUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-workbook",
  });
  const qualityWorkbook = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-workbook",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const qualityReviewDraftUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-review-draft",
  });
  const qualityReviewDraft = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-review-draft",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const qualityImportUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listing-quality/import",
    headers: { "content-type": "text/csv" },
    body: completeListingQualityReviewCsv(qualityReviewDraft.body, 1),
  });
  const qualityImported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listing-quality/import",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "text/csv",
    },
    body: completeListingQualityReviewCsv(qualityReviewDraft.body, 1),
  });
  const launchChecklistUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/launch-input-checklist",
  });
  const launchChecklist = await dispatchHttp(app, {
    url: "/api/admin/launch-input-checklist",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const preflightReportsUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/preflight-reports",
  });
  const preflightReports = await dispatchHttp(app, {
    url: "/api/admin/preflight-reports",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const seoPreflightUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/seo-preflight",
  });
  const seoPreflight = await dispatchHttp(app, {
    url: "/api/admin/seo-preflight",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const liveServicesUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/live-services",
  });
  const liveServices = await dispatchHttp(app, {
    url: "/api/admin/live-services",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const liveServiceProvisioningUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/live-service-provisioning",
  });
  const liveServiceProvisioning = await dispatchHttp(app, {
    url: "/api/admin/live-service-provisioning",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const payloadRuntimeUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/payload-runtime",
  });
  const payloadRuntime = await dispatchHttp(app, {
    url: "/api/admin/payload-runtime",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const payloadRuntimeBootstrapUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/payload-runtime-bootstrap",
  });
  const payloadRuntimeBootstrap = await dispatchHttp(app, {
    url: "/api/admin/payload-runtime-bootstrap",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const listingQualityUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/listing-quality",
  });
  const listingQualityStatus = await dispatchHttp(app, {
    url: "/api/admin/listing-quality",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const listingQualityReviewPacketUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-review-packet",
  });
  const listingQualityReviewPacket = await dispatchHttp(app, {
    url: "/api/admin/listing-quality-review-packet",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const cmsCollectionsUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/cms-collections",
  });
  const cmsCollections = await dispatchHttp(app, {
    url: "/api/admin/cms-collections",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const payloadCollectionsUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/payload-collections",
  });
  const payloadCollections = await dispatchHttp(app, {
    url: "/api/admin/payload-collections",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const imported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals/import",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "text/csv",
    },
    body: `old_url,equivalent_content,reviewer,approved_at,reason\n${importListing.old_url},true,editor_bg,2026-07-05T00:01:00Z,Reviewed via CSV\n`,
  });
  const formImported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals/import",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csv: `old_url,equivalent_content,reviewer,approved_at,reason\n${importRuListing.old_url},true,ru_preservation_editor,2026-07-05T00:02:00Z,Reviewed via pasted CSV\n`,
    }).toString(),
  });
  const pendingWorkbook = await dispatchHttp(app, {
    url: "/api/admin/redirect-approval-workbook?pending=1",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const exportUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/deployable-redirects/export",
  });
  const exported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/deployable-redirects/export",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const review = await dispatchHttp(app, {
    url: "/api/admin/migration/review?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const reviewHtml = await dispatchHttp(app, {
    url: "/admin/migration/review?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });

  assert.equal(approved.status, 201);
  assert.equal(approved.body.approval.old_url, listing.old_url);
  assert.equal(approved.body.approval.deployable, true);
  assert.equal(approved.body.deployablePreview.length, 1);
  assert.equal(approved.body.deployablePreview[0].target_path, listing.target_path);
  assert.equal(approved.body.report.gates.find((gate) => gate.id === "redirect_reviews").status, "blocked");
  assert.equal(formApproved.status, 201);
  assert.equal(formApproved.body.deployablePreview.length, 2);
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.message, /Only mapped 301 routes/);
  assert.equal(unauthorized.status, 401);
  assert.equal(importUnauthorized.status, 401);
  assert.equal(workbookUnauthorized.status, 401);
  assert.equal(workbook.status, 200);
  assert.equal(workbook.headers["cache-control"], "no-store");
  assert.equal(workbook.headers["content-type"], "text/csv; charset=utf-8");
  assert.equal(parseCsv(workbook.body).length, 165);
  assert.equal(qualityWorkbookUnauthorized.status, 401);
  assert.equal(qualityWorkbook.status, 200);
  assert.equal(qualityWorkbook.headers["content-type"], "text/csv; charset=utf-8");
  assert.ok(parseCsv(qualityWorkbook.body).length >= review.body.listingQuality.summary.affected_listings);
  assert.equal(qualityReviewDraftUnauthorized.status, 401);
  assert.equal(qualityReviewDraft.status, 200);
  assert.equal(qualityReviewDraft.headers["content-type"], "text/csv; charset=utf-8");
  assert.equal(qualityReviewDraft.headers["content-disposition"], 'attachment; filename="listing-quality-review-draft.csv"');
  assert.ok(parseCsv(qualityReviewDraft.body).every((row) => row.facts_reviewer === "" && row.media_reviewer === ""));
  assert.equal(qualityImportUnauthorized.status, 401);
  assert.equal(qualityImported.status, 202);
  assert.equal(qualityImported.body.imported, 1);
  assert.equal(qualityImported.body.edited, 1);
  assert.equal(qualityImported.body.mediaReviewRows, 1);
  assert.equal(qualityImported.body.reviewSummary.review_rows, qualityImported.body.imported);
  assert.equal(qualityImported.body.reviewSummary.missing_review_rows, qualityImported.body.missingReviewRows);
  assert.equal(
    qualityImported.body.reviewSummary.expected_review_rows,
    qualityImported.body.imported + qualityImported.body.missingReviewRows,
  );
  assert.equal(qualityImported.body.reviewImport.ready, false);
  assert.equal(qualityImported.body.reviewImport.status, "blocked");
  assert.equal(qualityImported.body.reviewImport.reviewRows, qualityImported.body.imported);
  assert.equal(qualityImported.body.reviewImport.missingReviewRows, qualityImported.body.missingReviewRows);
  assert.ok(qualityImported.body.reviewImport.pendingReviewSample.length > 0);
  assert.equal(qualityImported.body.report.gates.find((gate) => gate.id === "listing_quality_review").status, "blocked");
  assert.equal(qualityImported.body.report.blockers.includes("listing_quality_review"), true);
  assert.equal(qualityImported.body.reviewPersisted, false);
  assert.equal(qualityImported.body.reviewPath, null);
  assert.equal(readListingEdits(listingEditLedgerPath).length, 1);
  assert.deepEqual(readListingEdits(listingEditLedgerPath)[0].patch, {});
  assert.equal(readListingEdits(listingEditLedgerPath)[0].media_reviewer, "media_editor");
  assert.equal(launchChecklistUnauthorized.status, 401);
  assert.equal(launchChecklist.status, 200);
  assert.equal(launchChecklist.headers["content-type"], "text/markdown; charset=utf-8");
  assert.match(launchChecklist.body, /POST \/api\/admin\/redirect-approvals\/import/);
  assert.match(launchChecklist.body, /POST \/api\/admin\/seo-evidence\/import/);
  assert.match(launchChecklist.body, /POST \/api\/admin\/listing-quality\/import/);
  assert.ok(launchChecklist.body.includes(liveServiceProvisioningReportPath));
  assert.equal(preflightReportsUnauthorized.status, 401);
  assert.equal(preflightReports.status, 200);
  assert.equal(preflightReports.body.kind, "admin_preflight_reports");
  assert.equal(preflightReports.body.checklist.endpoint, "/api/admin/launch-input-checklist");
  assert.equal(preflightReports.body.checklist.path, "production/data/launch-input-checklist.md");
  assert.equal(preflightReports.body.checklist.refresh_command, "npm run launch:inputs");
  assert.deepEqual(preflightReports.body.launch_readiness.blockers, review.body.launchBlockers.blockers);
  assert.ok(preflightReports.body.launch_readiness.blocked_gates.every((gate) => gate.next_actions.length > 0));
  assert.equal(preflightReports.body.reports.seo.status, "blocked");
  assert.ok(preflightReports.body.reports.seo.next_actions.some((action) => action.includes("seo:preflight")));
  assert.equal(preflightReports.body.reports.listing_quality.status, "blocked");
  assert.ok(preflightReports.body.reports.listing_quality.next_actions.some((action) => action.includes("listing:preflight")));
  assert.equal(preflightReports.body.reports.live_services.status, "blocked");
  assert.equal(preflightReports.body.reports.live_service_provisioning.status, "blocked_report");
  assert.ok(preflightReports.body.reports.live_service_provisioning.summary.missing_env.includes("TYPESENSE_URL"));
  assert.ok(preflightReports.body.reports.live_service_provisioning.next_actions.some((action) => action.includes("live:provisioning")));
  assert.equal(preflightReports.body.reports.payload_runtime.status, "missing_report");
  assert.ok(preflightReports.body.reports.payload_runtime.next_actions.some((action) => action.includes("payload:bootstrap")));
  assert.equal(seoPreflightUnauthorized.status, 401);
  assert.equal(seoPreflight.status, 200);
  assert.equal(seoPreflight.body.kind, "admin_seo_preflight");
  assert.equal(seoPreflight.body.seo.status, "blocked");
  assert.ok(seoPreflight.body.seo.summary.missing_required_sources.includes("search_console"));
  assert.equal(seoPreflight.body.seo.summary.sources.privacy_events.status, "imported");
  assert.equal(liveServicesUnauthorized.status, 401);
  assert.equal(liveServices.status, 200);
  assert.equal(liveServices.body.kind, "admin_live_services");
  assert.equal(liveServices.body.live_services.status, "blocked");
  assert.ok(liveServices.body.live_services.summary.missing_report > 0);
  assert.equal(liveServiceProvisioningUnauthorized.status, 401);
  assert.equal(liveServiceProvisioning.status, 200);
  assert.equal(liveServiceProvisioning.body.kind, "admin_live_service_provisioning");
  assert.equal(liveServiceProvisioning.body.provisioning.status, "blocked_report");
  assert.ok(liveServiceProvisioning.body.provisioning.summary.missing_env.includes("TYPESENSE_URL"));
  assert.ok(liveServiceProvisioning.body.provisioning.next_actions.some((action) => action.includes("live:provisioning")));
  assert.equal(liveServiceProvisioning.body.provisioning.hermes.install_command, "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash");
  assert.equal(liveServiceProvisioning.body.provisioning.hermes.safety.can_publish, false);
  assert.equal(payloadRuntimeUnauthorized.status, 401);
  assert.equal(payloadRuntime.status, 200);
  assert.equal(payloadRuntime.body.kind, "admin_payload_runtime");
  assert.equal(payloadRuntime.body.runtime.status, "missing_report");
  assert.ok(payloadRuntime.body.runtime.next_actions.some((action) => action.includes("payload:bootstrap")));
  assert.equal(payloadRuntimeBootstrapUnauthorized.status, 401);
  assert.equal(payloadRuntimeBootstrap.status, 200);
  assert.equal(payloadRuntimeBootstrap.body.kind, "admin_payload_runtime_bootstrap");
  assert.match(payloadRuntimeBootstrap.body.env_example, /PAYLOAD_SECRET=replace-with-output-of-openssl-rand-base64-32/);
  assert.match(payloadRuntimeBootstrap.body.compose_file, /payload-postgres/);
  assert.ok(payloadRuntimeBootstrap.body.checklist.some((item) => item.includes("npm run payload:runtime")));
  assert.equal(listingQualityUnauthorized.status, 401);
  assert.equal(listingQualityStatus.status, 200);
  assert.equal(listingQualityStatus.body.kind, "admin_listing_quality");
  assert.equal(listingQualityStatus.body.listing_quality.status, "blocked");
  assert.ok(listingQualityStatus.body.listing_quality.next_actions.some((action) => action.includes("listing:preflight")));
  assert.ok(listingQualityStatus.body.listing_quality.summary.affected_listings > 0);
  assert.equal(listingQualityReviewPacketUnauthorized.status, 401);
  assert.equal(listingQualityReviewPacket.status, 200);
  assert.equal(listingQualityReviewPacket.body.kind, "listing_quality_review_packet");
  assert.equal(listingQualityReviewPacket.body.status, "draft_not_launch_evidence");
  assert.equal(listingQualityReviewPacket.body.admin.review_packet_endpoint, "GET /api/admin/listing-quality-review-packet");
  assert.ok(listingQualityReviewPacket.body.summary.expected_review_rows > 0);
  assert.equal(cmsCollectionsUnauthorized.status, 401);
  assert.equal(cmsCollections.status, 200);
  assert.equal(cmsCollections.headers["cache-control"], "no-store");
  assert.equal(cmsCollections.body.kind, "admin_cms_collections");
  assert.equal(cmsCollections.body.summary.records.listings, 165);
  assert.equal(cmsCollections.body.summary.records.listing_tours, 165);
  assert.equal(cmsCollections.body.collections.every((collection) => collection.publish_requires_human_review), true);
  assert.equal(payloadCollectionsUnauthorized.status, 401);
  assert.equal(payloadCollections.status, 200);
  assert.equal(payloadCollections.headers["cache-control"], "no-store");
  assert.equal(payloadCollections.body.kind, "admin_payload_collections");
  assert.equal(payloadCollections.body.collections.length, 4);
  assert.equal(payloadCollections.body.collections.every((collection) => collection.versions.drafts), true);
  assert.equal(imported.status, 201);
  assert.equal(imported.body.imported, 1);
  assert.equal(imported.body.approvals[0].old_url, importListing.old_url);
  assert.equal(imported.body.deployablePreview.length, 3);
  assert.equal(imported.body.report.gates.find((gate) => gate.id === "redirect_reviews").status, "blocked");
  assert.equal(formImported.status, 201);
  assert.equal(formImported.body.imported, 1);
  assert.equal(formImported.body.deployablePreview.length, 4);
  assert.equal(formImported.body.report.gates.find((gate) => gate.id === "redirect_reviews").status, "blocked");
  const pendingRows = parseCsv(pendingWorkbook.body);
  assert.equal(pendingRows.length, 161);
  assert.equal(pendingRows.some((row) => row.old_url === listing.old_url), false);
  assert.equal(pendingRows.some((row) => row.old_url === importRuListing.old_url), false);
  assert.equal(exportUnauthorized.status, 401);
  assert.equal(exported.status, 201);
  assert.equal(exported.body.exported, 4);
  assert.equal(exported.body.summary.total, 4);
  assert.equal(exported.body.report.gates.find((gate) => gate.id === "redirect_reviews").status, "blocked");
  assert.equal(fs.existsSync(deployableRedirectOutputPath), true);
  assert.equal(JSON.parse(fs.readFileSync(deployableRedirectOutputPath, "utf8")).redirects.length, 4);
  assert.equal(review.body.workspace.locale, "ru");
  assert.equal(review.body.redirectApprovalImport.endpoint, "/api/admin/redirect-approvals/import");
  assert.equal(review.body.redirectApprovalImport.exportEndpoint, "/api/admin/deployable-redirects/export");
  assert.equal(review.body.redirectApprovalImport.workbookEndpoint, "/api/admin/redirect-approval-workbook");
  assert.equal(review.body.redirectApprovalImport.pendingWorkbookEndpoint, "/api/admin/redirect-approval-workbook?pending=1");
  assert.equal(review.body.listingQualityWorkbookEndpoint, "/api/admin/listing-quality-workbook");
  assert.equal(review.body.listingQualityReviewDraftEndpoint, "/api/admin/listing-quality-review-draft");
  assert.equal(review.body.listingQualityImportEndpoint, "/api/admin/listing-quality/import");
  assert.equal(review.body.launchReadinessEndpoint, "/api/admin/launch-readiness");
  assert.equal(review.body.launchReadinessExportEndpoint, "/api/admin/launch-readiness/export");
  assert.equal(review.body.launchInputChecklistEndpoint, "/api/admin/launch-input-checklist");
  assert.equal(review.body.preflightReportsEndpoint, "/api/admin/preflight-reports");
  assert.equal(review.body.seoPreflightEndpoint, "/api/admin/seo-preflight");
  assert.equal(review.body.liveServicesEndpoint, "/api/admin/live-services");
  assert.equal(review.body.liveServiceProvisioningEndpoint, "/api/admin/live-service-provisioning");
  assert.equal(review.body.liveServiceProvisioningImportEndpoint, "/api/admin/live-service-provisioning/import");
  assert.equal(review.body.payloadRuntimeEndpoint, "/api/admin/payload-runtime");
  assert.equal(review.body.payloadRuntimeBootstrapEndpoint, "/api/admin/payload-runtime-bootstrap");
  assert.equal(review.body.cmsCollectionsEndpoint, "/api/admin/cms-collections");
  assert.equal(review.body.payloadCollectionsEndpoint, "/api/admin/payload-collections");
  assert.equal(review.body.listingQualityEndpoint, "/api/admin/listing-quality");
  assert.ok(review.body.launchBlockers.blockers.includes("redirect_reviews"));
  assert.ok(review.body.launchBlockers.blockers.includes("external_seo_exports"));
  assert.ok(review.body.launchBlockers.blockers.includes("listing_quality_review"));
  assert.ok(review.body.launchBlockers.blockers.includes("live_services"));
  assert.ok(review.body.launchBlockers.blockers.includes("payload_runtime"));
  assert.ok(review.body.launchBlockers.blocked_gates.every((gate) => gate.next_actions.length > 0));
  const migrationReviewBlockers = review.body.launchBlockers.blockers.join(",");
  const migrationReviewActionCount = review.body.launchBlockers.blocked_gates.reduce((count, gate) => count + gate.next_actions.length, 0);
  assert.equal(review.body.listingQuality.generated_at, "2026-07-05T00:09:00Z");
  assert.equal(review.body.listingQuality.summary.listings, 165);
  assert.equal(Object.hasOwn(review.body.listingQuality.summary.issue_counts, "missing_price"), true);
  assert.equal(Object.hasOwn(review.body.listingQuality.summary.issue_counts, "missing_bedrooms"), true);
  assert.ok(review.body.listingQuality.summary.issue_counts.thin_public_gallery > 0);
  assert.equal(Object.hasOwn(review.body.listingQuality.summary.issue_counts, "missing_alt_text"), true);
  assert.ok(review.body.listingQuality.rows.every((row) => Number.isInteger(row.missing_alt_text_assets)));
  assert.ok(review.body.listingQuality.rows.some((row) => row.editor_path.includes("/admin/listings/edit?listingId=")));
  assert.equal(review.body.redirectApprovals.length, 4);
  assert.equal(review.body.deployablePreview.length, 4);
  assert.equal(reviewHtml.body.includes('data-redirect-import-endpoint="/api/admin/redirect-approvals/import"'), true);
  assert.equal(reviewHtml.body.includes('data-redirect-export-endpoint="/api/admin/deployable-redirects/export"'), true);
  assert.equal(reviewHtml.body.includes('data-redirect-workbook-endpoint="/api/admin/redirect-approval-workbook"'), true);
  assert.equal(reviewHtml.body.includes('data-pending-redirect-workbook-endpoint="/api/admin/redirect-approval-workbook?pending=1"'), true);
  assert.equal(reviewHtml.body.includes('data-launch-status="blocked"'), true);
  assert.equal(
    reviewHtml.body.includes(`data-launch-blockers="${migrationReviewBlockers}"`),
    true,
  );
  assert.equal(reviewHtml.body.includes(`data-launch-action-count="${migrationReviewActionCount}"`), true);
  assert.equal(reviewHtml.body.includes('data-launch-readiness-endpoint="/api/admin/launch-readiness"'), true);
  assert.equal(reviewHtml.body.includes('data-launch-readiness-export-endpoint="/api/admin/launch-readiness/export"'), true);
  assert.equal(reviewHtml.body.includes('data-launch-input-checklist-endpoint="/api/admin/launch-input-checklist"'), true);
  assert.equal(reviewHtml.body.includes('data-preflight-reports-endpoint="/api/admin/preflight-reports"'), true);
  assert.equal(reviewHtml.body.includes('data-seo-preflight-endpoint="/api/admin/seo-preflight"'), true);
  assert.equal(reviewHtml.body.includes('data-live-services-endpoint="/api/admin/live-services"'), true);
  assert.equal(reviewHtml.body.includes('data-live-service-provisioning-endpoint="/api/admin/live-service-provisioning"'), true);
  assert.equal(
    reviewHtml.body.includes('data-live-service-provisioning-import-endpoint="/api/admin/live-service-provisioning/import"'),
    true,
  );
  assert.equal(reviewHtml.body.includes('data-payload-runtime-endpoint="/api/admin/payload-runtime"'), true);
  assert.equal(reviewHtml.body.includes('data-payload-runtime-bootstrap-endpoint="/api/admin/payload-runtime-bootstrap"'), true);
  assert.equal(reviewHtml.body.includes('data-cms-collections-endpoint="/api/admin/cms-collections"'), true);
  assert.equal(reviewHtml.body.includes('data-payload-collections-endpoint="/api/admin/payload-collections"'), true);
  assert.equal(reviewHtml.body.includes('data-listing-quality-endpoint="/api/admin/listing-quality"'), true);
  assert.equal(reviewHtml.body.includes('data-quality-workbook-endpoint="/api/admin/listing-quality-workbook"'), true);
  assert.equal(reviewHtml.body.includes('data-quality-review-draft-endpoint="/api/admin/listing-quality-review-draft"'), true);
  assert.equal(reviewHtml.body.includes('data-quality-import-endpoint="/api/admin/listing-quality/import"'), true);
  assert.equal(
    reviewHtml.body.includes(`data-quality-affected-listings="${review.body.listingQuality.summary.affected_listings}"`),
    true,
  );
  assert.equal(reviewHtml.body.includes('data-quality-listing="true"'), true);
  const auditRows = readAuditLog(auditLogPath);
  assert.equal(assertAuditLog(auditRows), true);
  assert.deepEqual(actionCounts(auditRows), {
    redirect_approval_created: 2,
    listing_quality_imported: 1,
    redirect_approvals_imported: 2,
    deployable_redirects_exported: 1,
  });
});

test("HTTP admin persists complete listing quality review CSV as launch evidence", async () => {
  const listingEditLedgerPath = tempDefaultListingEdits();
  const translationLedgerPath = tempTranslations();
  const listingQualityReviewPath = tempListingQualityReviewPath();
  const auditLogPath = tempAuditLog();
  const app = createHttpApp({
    listingEditLedgerPath,
    translationLedgerPath,
    listingQualityReviewPath,
    auditLogPath,
    editedAt: "2026-07-05T00:03:00Z",
  });
  const workbookCsv = fs.readFileSync(fromRoot("production", "data", "listing-quality-workbook.csv"), "utf8");
  const reviewCsv = completeListingQualityReviewCsv(workbookCsv);

  const imported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listing-quality/import",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "text/csv",
    },
    body: reviewCsv,
  });
  const readiness = await dispatchHttp(app, {
    url: "/api/admin/launch-readiness",
    headers: { authorization: "Bearer local-admin-smoke" },
  });

  assert.equal(imported.status, 201);
  assert.equal(imported.body.imported, parseCsv(workbookCsv).length);
  assert.equal(imported.body.reviewPersisted, true);
  assert.equal(imported.body.reviewImport.ready, true);
  assert.equal(imported.body.reviewImport.status, "ready");
  assert.deepEqual(imported.body.reviewImport.pendingReviewSample, []);
  assert.equal(imported.body.reviewPath, listingQualityReviewPath);
  assert.equal(imported.body.reviewPersistenceError, "");
  assert.equal(imported.body.report.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
  assert.equal(imported.body.report.blockers.includes("listing_quality_review"), false);
  assert.equal(fs.readFileSync(listingQualityReviewPath, "utf8"), reviewCsv);
  assert.equal(readiness.body.gates.find((gate) => gate.id === "listing_quality_review").status, "pass");
  assert.equal(readiness.body.blockers.includes("listing_quality_review"), false);
  const auditRows = readAuditLog(auditLogPath);
  assert.equal(assertAuditLog(auditRows), true);
  assert.deepEqual(actionCounts(auditRows), { listing_quality_imported: 1 });
});

test("HTTP app rejects invalid language requests", async () => {
  const response = await dispatchHttp(createHttpApp(), {
    method: "POST",
    url: "/api/language-requests",
    body: { requestedLocale: "not a locale", requestedPath: "/x/" },
  });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /BCP 47/);
});

test("HTTP app rejects malformed JSON request bodies", async () => {
  const response = await dispatchHttp(createHttpApp(), {
    method: "POST",
    url: "/api/leads",
    body: "{bad",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Invalid JSON request body");
});

test("HTTP admin auth does not accept local smoke token in production without configured secret", async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldAdminToken = process.env.MS_REALTY_ADMIN_TOKEN;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    const app = createHttpApp();

    const defaultToken = await dispatchHttp(app, {
      url: "/api/admin/leads",
      headers: { authorization: "Bearer local-admin-smoke" },
    });

    process.env.MS_REALTY_ADMIN_TOKEN = "real-admin-token";
    const wrongToken = await dispatchHttp(app, {
      url: "/api/admin/leads",
      headers: { authorization: "Bearer local-admin-smoke" },
    });
    const nearMatchToken = await dispatchHttp(app, {
      url: "/api/admin/leads",
      headers: { authorization: "Bearer real-admin-token-extra" },
    });
    const configuredToken = await dispatchHttp(app, {
      url: "/api/admin/leads",
      headers: { authorization: "Bearer real-admin-token" },
    });

    assert.equal(defaultToken.status, 401);
    assert.equal(wrongToken.status, 401);
    assert.equal(nearMatchToken.status, 401);
    assert.equal(configuredToken.status, 200);
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldAdminToken === undefined) delete process.env.MS_REALTY_ADMIN_TOKEN;
    else process.env.MS_REALTY_ADMIN_TOKEN = oldAdminToken;
  }
});

test("HTTP admin can import external SEO evidence without broad launch assumptions", async () => {
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const com = routeMap.find((route) => route.url_type === "listing" && route.source_domain === "makler-realty.com");
  const ru = routeMap.find((route) => route.url_type === "listing" && route.source_domain === "makler-realty.ru");
  const seoEvidenceInputDir = tempSeoEvidenceDir();
  const seoEvidenceOutputPath = `${seoEvidenceInputDir}/seo-evidence.json`;
  const launchReadinessOutputPath = `${seoEvidenceInputDir}/launch-readiness.json`;
  const searchSyncReportPath = `${seoEvidenceInputDir}/search-engine-sync-report.json`;
  const searchQueryReportPath = `${seoEvidenceInputDir}/search-engine-query-report.json`;
  const hermesWorkerReportPath = `${seoEvidenceInputDir}/hermes-draft-worker-report.json`;
  const liveServiceProvisioningReportPath = `${seoEvidenceInputDir}/live-service-provisioning-report.json`;
  const payloadRuntimeReportPath = `${seoEvidenceInputDir}/payload-runtime-report.json`;
  const syncReport = JSON.parse(fs.readFileSync(fromRoot("production", "data", "search-engine-sync-report.json.example"), "utf8"));
  const queryReport = JSON.parse(fs.readFileSync(fromRoot("production", "data", "search-engine-query-report.json.example"), "utf8"));
  const hermesReport = JSON.parse(fs.readFileSync(fromRoot("production", "data", "hermes-draft-worker-report.json.example"), "utf8"));
  const payloadReport = await buildPayloadRuntimeReport({
    databaseProbe: async ({ database, host, port }) => ({ database, host, port, status: "pass" }),
    env: {
      DATABASE_URL: "postgres://payload:secret@db.ms-realty.bg:5432/ms_realty",
      PAYLOAD_SECRET: "not-written-to-report-32-byte-minimum",
    },
    generatedAt: "2026-07-06T00:00:00Z",
  });
  const blockedPayloadReport = await buildPayloadRuntimeReport({
    env: {},
    generatedAt: "2026-07-06T00:00:00Z",
  });
  const liveServiceProvisioningReport = await buildLiveServiceProvisioningReport({
    env: {
      TYPESENSE_URL: "https://typesense.ms-realty.bg",
      TYPESENSE_API_KEY: "typesense-key",
      MEILI_URL: "https://meili.ms-realty.bg",
      MEILI_API_KEY: "meili-key",
      HERMES_CHAT_COMPLETIONS_URL: "https://hermes.ms-realty.bg/v1/chat/completions",
      HERMES_API_KEY: "hermes-key",
    },
    fetchImpl: async () => ({ ok: true, status: 200 }),
    generatedAt: "2026-07-06T00:00:00Z",
  });
  delete syncReport.example;
  delete queryReport.example;
  delete hermesReport.example;
  for (const engine of syncReport.engines) {
    const host = engine.engine === "typesense" ? "typesense.ms-realty.bg" : "meili.ms-realty.bg";
    for (const operation of engine.operations) {
      operation.url = operation.url.replace(`${engine.engine === "typesense" ? "typesense" : "meili"}.example.com`, host);
    }
  }
  for (const engine of queryReport.engines) {
    const baseUrl = engine.engine === "typesense" ? "https://typesense.ms-realty.bg" : "https://meili.ms-realty.bg";
    engine.operation.url = engine.operation.url.replace(engine.service_url, baseUrl);
    engine.service_url = baseUrl;
  }
  hermesReport.provider.endpoint = "https://hermes.ms-realty.bg/v1/chat/completions";
  const app = createHttpApp({
    routeMap,
    seoEvidenceInputDir,
    seoEvidenceOutputPath,
    launchReadinessOutputPath,
    searchSyncReportPath,
    searchQueryReportPath,
    hermesWorkerReportPath,
    liveServiceProvisioningReportPath,
    payloadRuntimeReportPath,
    reviewedAt: "2026-07-05T00:00:00Z",
  });

  const unauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seo-evidence/import",
    body: { source: "search_console", csv: "url,clicks\n" },
  });
  const templateUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/seo-evidence/template?source=search_console",
  });
  const exportUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/seo-evidence/export",
  });
  const template = await dispatchHttp(app, {
    url: "/api/admin/seo-evidence/template?source=search_console",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const badTemplate = await dispatchHttp(app, {
    url: "/api/admin/seo-evidence/template?source=unknown",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const invalidSearchConsole = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seo-evidence/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      source: "search_console",
      csv: `url,clicks,impressions,position\n${com.old_url},-3,30,7\n`,
    },
  });
  const invalidSearchConsolePersisted = fs.existsSync(`${seoEvidenceInputDir}/search-console.csv`);
  const searchConsole = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seo-evidence/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      source: "search_console",
      csv: `url,clicks,impressions,position\n${com.old_url},3,30,7\n${ru.old_url},2,20,8\n`,
    },
  });
  const yandex = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seo-evidence/import",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      source: "yandex_webmaster",
      csv: `url,indexed,issue\n${com.old_url},yes,\n${ru.old_url},yes,\n`,
    }).toString(),
  });
  const backlinks = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/seo-evidence/import?source=backlinks",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "text/csv",
    },
    body: `target_url,source_url,referring_domain\n${com.old_url},https://regionalbroker.bg/a,regionalbroker.bg\n${ru.old_url},https://partnerrealty.de/b,partnerrealty.de\n`,
  });
  const exportedEvidence = await dispatchHttp(app, {
    url: "/api/admin/seo-evidence/export",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const review = await dispatchHttp(app, {
    url: "/api/admin/migration/review?locale=en",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const reviewHtml = await dispatchHttp(app, {
    url: "/admin/migration/review?locale=en",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const launchUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/launch-readiness",
  });
  const launch = await dispatchHttp(app, {
    url: "/api/admin/launch-readiness",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const launchExportUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/launch-readiness/export",
  });
  const launchExport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/launch-readiness/export",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const liveTemplateUnauthorized = await dispatchHttp(app, {
    url: "/api/admin/live-service-report-template?source=typesense_meilisearch_sync",
  });
  const liveTemplate = await dispatchHttp(app, {
    url: "/api/admin/live-service-report-template?source=typesense_meilisearch_sync",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const liveImportUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-reports/import?source=typesense_meilisearch_sync",
    body: syncReport,
  });
  const liveProvisioningImportUnauthorized = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-provisioning/import",
    body: liveServiceProvisioningReport,
  });
  const liveProvisioningImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-provisioning/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: liveServiceProvisioningReport,
  });
  const liveSyncImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-reports/import?source=typesense_meilisearch_sync",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: syncReport,
  });
  const liveQueryImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-reports/import?source=typesense_meilisearch_query",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: queryReport,
  });
  const liveHermesImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/live-service-reports/import?source=hermes_draft_worker",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: hermesReport,
  });
  const payloadBlockedImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/payload-runtime/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: blockedPayloadReport,
  });
  const payloadExampleImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/payload-runtime/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: JSON.parse(fs.readFileSync("production/data/payload-runtime-report.json.example", "utf8")),
  });
  const payloadImport = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/payload-runtime/import",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: payloadReport,
  });
  const launchAfterLive = await dispatchHttp(app, {
    url: "/api/admin/launch-readiness",
    headers: { authorization: "Bearer local-admin-smoke" },
  });

  assert.equal(unauthorized.status, 401);
  assert.equal(templateUnauthorized.status, 401);
  assert.equal(exportUnauthorized.status, 401);
  assert.equal(template.status, 200);
  assert.equal(template.headers["content-type"], "text/csv; charset=utf-8");
  assert.match(template.body, /url,clicks,impressions,position/);
  assert.equal(badTemplate.status, 400);
  assert.equal(invalidSearchConsole.status, 400);
  assert.equal(invalidSearchConsolePersisted, false);
  assert.equal(searchConsole.status, 202);
  assert.equal(searchConsole.body.crawlCoverage.urls, 457);
  assert.deepEqual(searchConsole.body.crawlCoverage.urlTypes, { page: 104, post: 42, taxonomy: 146, listing: 165 });
  assert.equal(searchConsole.body.crawlCoverage.urlsWithAnyEvidence, 3);
  assert.deepEqual(searchConsole.body.requiredSourceDomains, ["makler-realty.com", "makler-realty.ru"]);
  assert.deepEqual(searchConsole.body.missingRequiredSources, ["yandex_webmaster", "backlinks"]);
  assert.equal(searchConsole.body.seoImport.ready, false);
  assert.equal(searchConsole.body.seoImport.status, "blocked");
  assert.equal(searchConsole.body.seoImport.importedSource, "search_console");
  assert.deepEqual(searchConsole.body.seoImport.missingRequiredSources, ["yandex_webmaster", "backlinks"]);
  assert.equal(searchConsole.body.report.gates.find((gate) => gate.id === "external_seo_exports").status, "blocked");
  assert.equal(searchConsole.body.report.blockers.includes("external_seo_exports"), true);
  assert.deepEqual(searchConsole.body.sources.search_console.matched_source_domains, [
    "makler-realty.com",
    "makler-realty.ru",
  ]);
  assert.equal(yandex.status, 202);
  assert.deepEqual(yandex.body.missingRequiredSources, ["backlinks"]);
  assert.equal(backlinks.status, 201);
  assert.deepEqual(backlinks.body.missingRequiredSources, []);
  assert.equal(backlinks.body.seoImport.ready, true);
  assert.equal(backlinks.body.seoImport.status, "ready");
  assert.deepEqual(backlinks.body.seoImport.missingRequiredSources, []);
  assert.equal(backlinks.body.report.gates.find((gate) => gate.id === "external_seo_exports").status, "pass");
  assert.equal(backlinks.body.report.blockers.includes("external_seo_exports"), false);
  assert.equal(backlinks.body.exportEndpoint, "/api/admin/seo-evidence/export");
  assert.equal(exportedEvidence.status, 200);
  assert.equal(exportedEvidence.headers["content-disposition"], 'attachment; filename="seo-evidence.json"');
  const exportedEvidenceBody = JSON.parse(exportedEvidence.body);
  assert.deepEqual(exportedEvidenceBody.summary.missing_required_sources, []);
  assert.ok(exportedEvidenceBody.url_evidence.length > 0);
  assert.equal(fs.existsSync(seoEvidenceOutputPath), true);
  assert.equal(review.body.seoEvidence.importEndpoint, "/api/admin/seo-evidence/import");
  assert.equal(review.body.seoEvidence.templateEndpoint, "/api/admin/seo-evidence/template");
  assert.equal(review.body.seoEvidence.exportEndpoint, "/api/admin/seo-evidence/export");
  assert.equal(review.body.seoEvidence.crawlCoverage.urls, 457);
  assert.deepEqual(review.body.seoEvidence.requiredSourceDomains, ["makler-realty.com", "makler-realty.ru"]);
  assert.deepEqual(review.body.seoEvidence.missingRequiredSources, []);
  assert.equal(reviewHtml.body.includes('data-seo-import-endpoint="/api/admin/seo-evidence/import"'), true);
  assert.equal(reviewHtml.body.includes('data-seo-template-endpoint="/api/admin/seo-evidence/template"'), true);
  assert.equal(launchUnauthorized.status, 401);
  assert.equal(launch.status, 200);
  assert.deepEqual(launch.body.blockers, ["listing_quality_review", "live_services", "payload_runtime"]);
  assert.equal(launch.body.gates.find((gate) => gate.id === "external_seo_exports").status, "pass");
  assert.equal(launch.body.gates.find((gate) => gate.id === "listing_quality_review").status, "blocked");
  assert.equal(launch.body.gates.find((gate) => gate.id === "live_services").status, "blocked");
  assert.equal(launch.body.gates.find((gate) => gate.id === "redirect_reviews").status, "pass");
  assert.equal(launchExportUnauthorized.status, 401);
  assert.equal(launchExport.status, 201);
  assert.equal(fs.existsSync(launchReadinessOutputPath), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(launchReadinessOutputPath, "utf8")).blockers, [
    "listing_quality_review",
    "live_services",
    "payload_runtime",
  ]);
  assert.equal(liveTemplateUnauthorized.status, 401);
  assert.equal(liveTemplate.status, 200);
  assert.equal(liveTemplate.headers["content-disposition"], 'attachment; filename="search-engine-sync-report.json.example"');
  assert.equal(JSON.parse(liveTemplate.body).example, true);
  assert.equal(JSON.parse(liveTemplate.body).summary.engines, 2);
  assert.equal(liveImportUnauthorized.status, 401);
  assert.equal(liveProvisioningImportUnauthorized.status, 401);
  assert.equal(liveProvisioningImport.status, 201);
  assert.equal(liveProvisioningImport.body.imported.outPath, liveServiceProvisioningReportPath);
  assert.equal(liveProvisioningImport.body.provisioning.status, "pass");
  assert.equal(liveProvisioningImport.body.provisioning.summary.missing_env.length, 0);
  assert.equal(liveSyncImport.status, 202);
  assert.equal(liveSyncImport.body.imported.outPath, searchSyncReportPath);
  assert.equal(liveSyncImport.body.livePreflight.status, "blocked");
  assert.equal(liveSyncImport.body.livePreflight.summary.pass, 1);
  assert.equal(liveSyncImport.body.livePreflight.summary.missing_report, 2);
  assert.equal(liveSyncImport.body.liveImport.ready, false);
  assert.equal(liveSyncImport.body.liveImport.status, "blocked");
  assert.equal(liveSyncImport.body.liveImport.importedSource, "typesense_meilisearch_sync");
  assert.deepEqual(
    liveSyncImport.body.liveImport.blockedReports.map((report) => report.source),
    ["typesense_meilisearch_query", "hermes_draft_worker"],
  );
  assert.equal(liveQueryImport.status, 202);
  assert.equal(liveHermesImport.status, 201);
  assert.equal(liveHermesImport.body.liveImport.ready, true);
  assert.equal(liveHermesImport.body.liveImport.status, "ready");
  assert.deepEqual(liveHermesImport.body.liveImport.blockedReports, []);
  assert.equal(liveHermesImport.body.livePreflight.ready, true);
  assert.equal(liveHermesImport.body.livePreflight.summary.pass, 3);
  assert.equal(payloadBlockedImport.status, 202);
  assert.equal(payloadBlockedImport.body.runtime.ready, false);
  assert.equal(payloadBlockedImport.body.runtime.status, "blocked");
  assert.deepEqual(payloadBlockedImport.body.runtime.missingEnv, ["PAYLOAD_SECRET", "DATABASE_URL"]);
  assert.deepEqual(payloadBlockedImport.body.runtime.placeholderEnv, []);
  assert.deepEqual(payloadBlockedImport.body.runtime.weakEnv, []);
  assert.ok(payloadBlockedImport.body.runtime.blockedChecks.includes("payload_secret"));
  assert.ok(payloadBlockedImport.body.runtime.blockedChecks.includes("database_url"));
  assert.ok(payloadBlockedImport.body.runtime.blockedChecks.includes("database_tcp"));
  assert.equal(payloadBlockedImport.body.report.gates.find((gate) => gate.id === "payload_runtime").status, "blocked");
  assert.equal(payloadExampleImport.status, 400);
  assert.match(payloadExampleImport.body.message, /example reports cannot/);
  assert.equal(payloadImport.status, 201);
  assert.equal(payloadImport.body.imported.outPath, payloadRuntimeReportPath);
  assert.equal(payloadImport.body.runtime.ready, true);
  assert.deepEqual(payloadImport.body.runtime.blockedChecks, []);
  assert.equal(fs.existsSync(searchSyncReportPath), true);
  assert.equal(fs.existsSync(searchQueryReportPath), true);
  assert.equal(fs.existsSync(hermesWorkerReportPath), true);
  assert.equal(fs.existsSync(liveServiceProvisioningReportPath), true);
  assert.equal(fs.existsSync(payloadRuntimeReportPath), true);
  assert.deepEqual(launchAfterLive.body.blockers, ["listing_quality_review"]);
  assert.equal(launchAfterLive.body.status, "blocked");
});

test("HTTP app only redirects rows in the reviewed deployable export", async () => {
  const app = createHttpApp();
  const approved = deployableRedirect();
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const notDeployable = routeMap.find((route) => route.url_type === "taxonomy" && route.old_url);

  assert.equal((await dispatchHttp(app, { url: approved.old_url })).status, 301);
  assert.notEqual((await dispatchHttp(app, { url: notDeployable.old_url })).status, 301);
});

test("HTTP sitemap honors mounted listing edit ledger", async () => {
  const listingEditLedgerPath = tempListingEdits();
  fs.appendFileSync(
    listingEditLedgerPath,
    `${JSON.stringify({
      listing_id: "MS-CRAWL-0001",
      editor: "seo_editor",
      patch: { location: "Runtime Only City" },
      source_hash_after: "runtime-only-city",
      stale_translation_count: 1,
    })}\n`,
  );
  const sitemap = await dispatchHttp(createHttpApp({ listingEditLedgerPath }), { url: "/sitemap.xml" });

  assert.equal(sitemap.status, 200);
  assert.match(sitemap.body, /\/he\/locations\/runtime-only-city/);
});

test("HTTP app rejects unknown buyer listing references", async () => {
  const response = await dispatchHttp(createHttpApp(), {
    method: "POST",
    url: "/api/leads",
    body: {
      id: "bad-lead-test",
      leadType: "buyer",
      language: "he",
      listingReference: "missing",
      contact: { name: "Noa Levi" },
    },
  });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /known listingReference/);
});

test("HTTP admin can add a non-indexable website locale without changing admin languages", async () => {
  const localeRegistryPath = tempRegistry();
  const app = createHttpApp({ registry: loadLocaleRegistry(localeRegistryPath), localeRegistryPath });

  const created = await dispatchHttp(app, {
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
  const listed = await dispatchHttp(app, {
    url: "/api/admin/locales?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  const invalidFallback = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/locales",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      code: "it",
      native_name: "Italiano",
      fallback_locale: "fr",
    },
  });
  const fallback = await dispatchHttp(app, { url: "/es/" });
  const stored = loadLocaleRegistry(localeRegistryPath);

  assert.equal(created.status, 201);
  assert.equal(created.body.locale.code, "es");
  assert.equal(created.body.locale.public_enabled, false);
  assert.equal(created.body.locale.indexable, false);
  assert.deepEqual(created.body.required_admin_locales, ["bg", "ru", "en"]);
  assert.deepEqual(created.body.admin_locales, ["bg", "ru", "en"]);
  assert.deepEqual(created.body.required_public_locales, ["bg", "en", "de", "nl", "ru", "el", "he"]);
  assert.equal(created.body.website_language_coverage.find((item) => item.market === "Israel").locale, "he");
  assert.equal(created.body.website_language_coverage.find((item) => item.market === "Greece").locale, "el");
  assert.equal(invalidFallback.status, 400);
  assert.match(invalidFallback.body.message, /must be public and indexable/);
  assert.equal(listed.body.workspace.locale, "ru");
  assert.equal(listed.body.locales.some((locale) => locale.code === "es"), true);
  assert.equal(fallback.body.locale, "en");
  assert.equal(fallback.body.indexable, false);
  assert.equal(stored.locales.some((locale) => locale.code === "es"), true);
});

test("HTTP admin can publish an approved translation for a newly added public locale", async () => {
  const localeRegistryPath = tempRegistry();
  const translationLedgerPath = tempTranslations();
  const app = createHttpApp({ registry: loadLocaleRegistry(localeRegistryPath), localeRegistryPath, translationLedgerPath });

  await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/locales",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      code: "es",
      native_name: "Español",
      admin_name: "Spanish",
      public_enabled: true,
      indexable: true,
      route_segments: { listing: "propiedades", search: "buscar" },
    },
  });
  const draft = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/translations/draft",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      objectType: "listing",
      objectId: "MS-CRAWL-0001",
      sourceLocale: "bg",
      targetLocale: "es",
      sourceContent: {
        title: "Reviewed listing title",
        description: "Reviewed listing description for Sandanski.",
      },
      propertyFacts: { id: "MS-CRAWL-0001", location: "Sandanski" },
      draftOutput: hermesDraftOutput({ id: "MS-CRAWL-0001", location: "Sandanski" }, "es"),
    },
  });
  const approve = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/translations/approve",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      taskId: draft.body.id,
      reviewer: "translator_es",
      approvedAt: "2026-07-05T00:00:00Z",
    },
  });
  const publish = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/translations/publish",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      taskId: approve.body.id,
    },
  });
  const page = await dispatchHttp(app, { url: "/es/propiedades/MS-CRAWL-0001" });
  const sitemap = await dispatchHttp(app, { url: "/sitemap.xml" });
  const search = await dispatchHttp(app, { url: "/api/search?locale=es&q=Sandanski" });
  const card = search.body.cards.find((candidate) => candidate.id === "MS-CRAWL-0001");

  assert.equal(draft.status, 201);
  assert.equal(approve.status, 201);
  assert.equal(publish.status, 201);
  assert.equal(page.status, 200);
  assert.equal(page.body.locale, "es");
  assert.equal(page.body.indexable, true);
  assert.equal(page.body.hreflang.some((link) => link.hreflang === "es"), true);
  assert.match(sitemap.body, /\/es\/propiedades\/MS-CRAWL-0001/);
  assert.equal(search.body.path, "/es/buscar");
  assert.equal(card.path, "/es/propiedades/MS-CRAWL-0001");
  assert.equal(card.translation_display, "reviewed_translation");
  assert.equal(card.translation_indexable, true);
});

test("generated HTTP smoke file is valid when present", () => {
  const file = fromRoot("production", "data", "http-smoke.json");
  if (!fs.existsSync(file)) return;
  const smoke = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertHttpSmoke(smoke), true);
});
