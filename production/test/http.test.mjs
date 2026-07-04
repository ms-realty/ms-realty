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
    listing: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001" }),
    listingHtml: await dispatchHttp(app, { url: "/he/properties/MS-CRAWL-0001?format=html" }),
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
  };
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
  smoke.listingEdit = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listings/edit",
    headers: { authorization: "Bearer local-admin-smoke" },
    body: {
      listingId: "MS-CRAWL-0001",
      editor: "editor_bg",
      patch: { description: "Updated approved source description." },
    },
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

  assert.equal(assertHttpSmoke(smoke), true);
  assert.equal(smoke.listing.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(smoke.sitemap.headers["content-type"], "application/xml; charset=utf-8");
  assert.equal(smoke.legacyRedirect.headers.location, redirect.target_path);
  assert.equal(smoke.search.body.cards.length > 0, true);
  assert.equal(smoke.location.body.cards.length, 1);
  assert.equal(smoke.locationHtml.body.includes("data-location=\"Sandanski\""), true);
  assert.deepEqual(smoke.savedSearch.body.filters, { property_type: "apartment" });
  assert.equal(smoke.lead.body.contact_preference, "whatsapp");
  assert.equal(smoke.viewingLead.body.lead.source, "website_viewing_request");
  assert.equal(smoke.listingAfterBrokerContact.body.body.actions.direct_contact.review_status, "approved_broker_contact");
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
  assert.equal(smoke.admin.body.leads.length, 3);
  assert.equal(smoke.admin.body.languageRequests.length, 1);
  assert.equal(smoke.admin.body.savedSearches.length, 1);
  assert.equal(smoke.admin.body.sellerPipeline.length, 1);
  assert.equal(smoke.admin.body.translationTasks.some((task) => task.status === "stale"), true);
  assert.equal(smoke.admin.body.listingEdits.length, 1);
  assert.equal(smoke.admin.body.viewings.length, 1);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.lead_type === "seller" && lead.original_language === "el"), true);
  assert.equal(smoke.admin.body.leads.some((lead) => lead.source === "website_viewing_request"), true);
  assert.deepEqual(smoke.admin.body.workspace.interface_locales, ["bg", "ru", "en"]);
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
