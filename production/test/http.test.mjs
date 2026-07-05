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
import { assertBrokerContacts, readBrokerContacts, resetBrokerContacts } from "../lib/broker-contacts.mjs";
import { assertTourApprovals, readTourApprovals, resetTourApprovals } from "../lib/tours.mjs";
import { assertEventLedger, readEventLedger, resetEventLedger } from "../lib/events.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
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

function tempRedirectApprovals() {
  return `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-redirect-approvals-`)}/redirect-approvals.jsonl`;
}

function tempRegistry() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-locales-`)}/registry.json`;
  fs.writeFileSync(file, `${JSON.stringify(loadLocaleRegistry(), null, 2)}\n`);
  return file;
}

function deployableRedirect() {
  return JSON.parse(fs.readFileSync(fromRoot("production", "data", "deployable-redirects.json"), "utf8")).redirects[0];
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
  const brokerContactLedgerPath = tempBrokerContacts();
  const tourApprovalLedgerPath = tempTourApprovals();
  const eventLedgerPath = tempEvents();
  const app = createHttpApp({
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
  });
  const redirect = deployableRedirect();
  const smoke = {
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
    sitemap: await dispatchHttp(app, { url: "/sitemap.xml" }),
    robots: await dispatchHttp(app, { url: "/robots.txt" }),
    sellerPage: await dispatchHttp(app, { url: "/he/sell" }),
    sellerHtml: await dispatchHttp(app, { url: "/he/sell?format=html" }),
    contact: await dispatchHttp(app, { url: "/he/contact" }),
    contactHtml: await dispatchHttp(app, { url: "/he/contact?format=html" }),
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
  assert.equal(smoke.listing.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(smoke.sitemap.headers["content-type"], "application/xml; charset=utf-8");
  assert.equal(smoke.legacyRedirect.headers.location, redirect.target_path);
  assert.equal(smoke.home.body.body.search.path, "/he/search");
  assert.equal(smoke.homeHtml.body.includes("data-kind=\"home\""), true);
  assert.equal(smoke.listingPrint.body.includes("data-kind=\"listing-print\""), true);
  assert.equal(smoke.listingPrint.body.includes("data-print-status=\"browser-pdf-ready\""), true);
  assert.equal(smoke.search.body.cards.length > 0, true);
  assert.equal(smoke.location.body.cards.length, 1);
  assert.equal(smoke.locationHtml.body.includes("data-location=\"Sandanski\""), true);
  assert.deepEqual(smoke.savedSearch.body.filters, { property_type: "apartment" });
  assert.equal(smoke.lead.body.contact_preference, "whatsapp");
  assert.equal(smoke.viewingLead.body.lead.source, "website_viewing_request");
  assert.equal(smoke.contact.body.body.callback.payload.source, "website_contact_callback");
  assert.equal(smoke.contactHtml.body.includes("data-lead-type=\"general\""), true);
  assert.equal(smoke.contactLead.body.lead.leadType, "general");
  assert.equal(smoke.listingAfterBrokerContact.body.body.actions.direct_contact.review_status, "approved_broker_contact");
  assert.equal(smoke.tourApproval.body.is_public, true);
  assert.equal(smoke.listingAfterTourApproval.body.body.media.tour.available, true);
  assert.equal(smoke.listingAfterTourApproval.body.body.media.tour.mount_target, "psv-listing-tour");
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
  assert.equal(readEventLedger(eventLedgerPath).some((row) => row.type === "cta_click" && row.action === "sticky_inquiry"), true);
  assert.equal(smoke.staleListing.body.metadata.robots, "noindex,follow");
  assert.equal(smoke.admin.body.leads.length, 4);
  assert.equal(smoke.admin.body.languageRequests.length, 1);
  assert.equal(smoke.adminHtml.body.includes("data-kind=\"admin-lead-inbox\""), true);
  assert.equal(smoke.adminHtml.body.includes("data-interface-locales=\"bg,ru,en\""), true);
  assert.equal(smoke.listingEditorHtml.body.includes("data-kind=\"admin-listing-editor\""), true);
  assert.equal(smoke.listingEditorHtml.body.includes("data-listing-id=\"MS-CRAWL-0001\""), true);
  assert.equal(smoke.admin.body.savedSearches.length, 1);
  assert.equal(smoke.admin.body.sellerPipeline.length, 1);
  assert.equal(smoke.admin.body.translationTasks.some((task) => task.status === "stale"), true);
  assert.equal(smoke.admin.body.listingEdits.length, 1);
  assert.equal(smoke.admin.body.viewings.length, 1);
  assert.equal(smoke.adminMigrationReview.body.workspace.locale, "bg");
  assert.equal(smoke.adminMigrationReview.body.dashboard.media_reconciliation.media_rows, 11859);
  assert.equal(smoke.adminMigrationReview.body.routeMap.total, 457);
  assert.equal(smoke.adminMigrationReview.body.routeMap.mappedListings, 165);
  assert.equal(smoke.adminMigrationReviewHtml.body.includes("data-kind=\"admin-migration-review\""), true);
  assert.equal(smoke.adminMigrationReviewHtml.body.includes("data-approvable-listing=\"true\""), true);
  assert.equal(smoke.adminMigrationReviewUnauthorized.status, 401);
  assert.equal(smoke.viewingCalendar.body.includes("BEGIN:VCALENDAR"), true);
  assert.equal(smoke.viewingCalendar.body.includes("DTSTART:20260706T100000Z"), true);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.lead_type === "seller" && lead.original_language === "el"), true);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.source === "website_viewing_request"), true);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.source === "website_contact_callback"), true);
  assert.deepEqual(smoke.admin.body.workspace.interface_locales, ["bg", "ru", "en"]);
});

test("HTTP admin can append reviewed redirect approvals without broad homepage mappings", async () => {
  const redirectApprovalPath = tempRedirectApprovals();
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const listing = routeMap.find((route) => route.url_type === "listing" && route.target_locale === "bg" && route.target_path);
  const importListing = routeMap.find(
    (route) => route.url_type === "listing" && route.target_locale === "bg" && route.target_path && route.old_url !== listing.old_url,
  );
  const taxonomy = routeMap.find((route) => route.url_type === "taxonomy");
  const app = createHttpApp({ routeMap, redirectApprovalPath, reviewedAt: "2026-07-05T00:00:00Z" });

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
      oldUrl: routeMap.find((route) => route.url_type === "listing" && route.target_locale === "ru" && route.target_path).old_url,
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
  const imported = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/redirect-approvals/import",
    headers: {
      authorization: "Bearer local-admin-smoke",
      "content-type": "text/csv",
    },
    body: `old_url,equivalent_content,reviewer,approved_at,reason\n${importListing.old_url},true,editor_bg,2026-07-05T00:01:00Z,Reviewed via CSV\n`,
  });
  const review = await dispatchHttp(app, {
    url: "/api/admin/migration/review?locale=ru",
    headers: { authorization: "Bearer local-admin-smoke" },
  });

  assert.equal(approved.status, 201);
  assert.equal(approved.body.approval.old_url, listing.old_url);
  assert.equal(approved.body.approval.deployable, true);
  assert.equal(approved.body.deployablePreview.length, 1);
  assert.equal(approved.body.deployablePreview[0].target_path, listing.target_path);
  assert.equal(formApproved.status, 201);
  assert.equal(formApproved.body.deployablePreview.length, 2);
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.message, /Only mapped 301 routes/);
  assert.equal(unauthorized.status, 401);
  assert.equal(importUnauthorized.status, 401);
  assert.equal(imported.status, 201);
  assert.equal(imported.body.imported, 1);
  assert.equal(imported.body.approvals[0].old_url, importListing.old_url);
  assert.equal(imported.body.deployablePreview.length, 3);
  assert.equal(review.body.workspace.locale, "ru");
  assert.equal(review.body.redirectApprovals.length, 3);
  assert.equal(review.body.deployablePreview.length, 3);
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

test("HTTP app only redirects rows in the reviewed deployable export", async () => {
  const app = createHttpApp();
  const approved = deployableRedirect();
  const routeMap = JSON.parse(fs.readFileSync(fromRoot("production", "data", "legacy-route-map.json"), "utf8")).routes;
  const unapproved = routeMap.find(
    (route) => route.url_type === "listing" && route.target_path && route.old_url !== approved.old_url,
  );

  assert.equal((await dispatchHttp(app, { url: approved.old_url })).status, 301);
  assert.notEqual((await dispatchHttp(app, { url: unapproved.old_url })).status, 301);
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
  const fallback = await dispatchHttp(app, { url: "/es/" });
  const stored = loadLocaleRegistry(localeRegistryPath);

  assert.equal(created.status, 201);
  assert.equal(created.body.locale.code, "es");
  assert.equal(created.body.locale.public_enabled, false);
  assert.equal(created.body.locale.indexable, false);
  assert.deepEqual(created.body.admin_locales, ["bg", "ru", "en"]);
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
    },
  });
  const publish = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/translations/publish",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      taskId: draft.body.id,
      reviewer: "translator_es",
      approvedAt: "2026-07-05T00:00:00Z",
    },
  });
  const page = await dispatchHttp(app, { url: "/es/propiedades/MS-CRAWL-0001" });
  const sitemap = await dispatchHttp(app, { url: "/sitemap.xml" });
  const search = await dispatchHttp(app, { url: "/api/search?locale=es&q=Sandanski" });
  const card = search.body.cards.find((candidate) => candidate.id === "MS-CRAWL-0001");

  assert.equal(draft.status, 201);
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
