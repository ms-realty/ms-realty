import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createBrokerContact } from "../lib/broker-contacts.mjs";
import { applyListingEdits, readListingEdits } from "../lib/listing-edits.mjs";
import { addLocaleToRegistry, loadLocaleRegistry } from "../lib/locales.mjs";
import { loadLegacyArchive, validateLegacyArchive } from "../lib/legacy-archive.mjs";
import { fromRoot } from "../lib/paths.mjs";
import {
  assertRuntimeSmoke,
  buildRuntimeSmoke,
  loadCmsSeed,
  renderRuntimePath,
  searchRuntimeListings,
  submitRuntimeLead,
} from "../lib/runtime.mjs";
import { createTourApproval } from "../lib/tours.mjs";

Object.assign(process.env, {
  MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
  PAYLOAD_SECRET: "test-only-runtime-payload-secret-32-characters",
  DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  MS_REALTY_LEAD_CONTACT_KEY: "test-only-runtime-contact-key-32-characters",
  MS_REALTY_WORKSPACE_ID: "workspace-sandanski",
});

const registry = loadLocaleRegistry();
const seed = loadCmsSeed();

test("runtime resolves locale-prefixed listing and fallback routes from CMS seed", () => {
  const he = renderRuntimePath(registry, seed, "/he/properties/MS-CRAWL-0001");
  const enSourceFallback = renderRuntimePath(registry, seed, "/en/properties/MS-CRAWL-0001");
  const home = renderRuntimePath(registry, seed, "/he/");
  const seller = renderRuntimePath(registry, seed, "/he/sell");
  const contact = renderRuntimePath(registry, seed, "/he/contact");
  const guide = renderRuntimePath(registry, seed, "/en/guides/foreign-buyers");
  const bgGuide = renderRuntimePath(registry, seed, "/bg/guides/proverka-na-imot-sandanski");
  const fr = renderRuntimePath(registry, seed, "/fr/");
  const missing = renderRuntimePath(registry, seed, "/he/properties/missing");
  const sourceLanguageRepair = renderRuntimePath(registry, seed, "/bg/imoti/MS-CRAWL-0006");
  const sourceLanguageRecord = seed.records.find((record) => record.id === "MS-CRAWL-0006");

  assert.equal(he.status, 200);
  assert.equal(he.dir, "rtl");
  assert.equal(he.indexable, true);
  assert.ok(he.body.media.gallery_count > 0);
  assert.equal(he.body.media.videos.length, 0);
  assert.equal(he.body.media.review.review_gated_assets, 0);
  assert.equal(he.body.media.tour.provider, "photo-sphere-viewer");
  assert.equal(he.body.media.tour.available, false);
  assert.ok(he.body.media.tour.fallback_gallery.length > 0);
  assert.equal(he.body.actions.primary.find((action) => action.id === "inquiry").endpoint, "/api/leads");
  assert.equal(he.body.actions.primary.find((action) => action.id === "callback").payload.source, "website_callback_request");
  assert.equal(he.body.actions.primary.find((action) => action.id === "request_viewing").payload.source, "website_viewing_request");
  assert.equal(he.body.actions.secondary.find((action) => action.id === "back_to_results").url, "/he/search");
  assert.equal(he.body.actions.secondary.find((action) => action.id === "share_family").url, he.path);
  assert.equal(he.body.actions.direct_contact.review_status, "needs_broker_contact_review");
  assert.equal(enSourceFallback.status, 200);
  assert.equal(enSourceFallback.locale, "en");
  assert.equal(enSourceFallback.fallback.active, true);
  assert.equal(enSourceFallback.indexable, false);
  assert.equal(enSourceFallback.metadata.robots, "noindex,follow");
  assert.equal(enSourceFallback.body.content_locale, "bg");
  assert.equal(home.kind, "home");
  assert.equal(home.body.search.path, "/he/search");
  assert.equal(home.body.seller.path, "/he/sell");
  assert.equal(seller.kind, "seller");
  assert.equal(seller.path, "/he/sell");
  assert.equal(seller.body.valuation.payload.leadType, "seller");
  assert.equal(contact.kind, "contact");
  assert.equal(contact.path, "/he/contact");
  assert.equal(contact.body.callback.payload.source, "website_contact_callback");
  assert.equal(contact.body.callback.payload.leadType, "general");
  assert.equal(guide.kind, "guide");
  assert.equal(guide.status, 200);
  assert.equal(guide.indexable, true);
  assert.equal(guide.body.sections.length, 2);
  assert.match(guide.body.sections[0].facts.join(" "), /Non-EU buyers cannot own Bulgarian land directly/);
  assert.equal(renderRuntimePath(registry, seed, "/he/guides/foreign-buyers").status, 404);
  assert.equal(bgGuide.status, 200);
  assert.equal(bgGuide.indexable, true);
  assert.equal(bgGuide.body.sections[0].sources.length, 3);
  assert.equal(renderRuntimePath(registry, seed, "/en/guides/proverka-na-imot-sandanski").status, 404);
  assert.equal(renderRuntimePath(registry, seed, "/he/locations/sandanski").kind, "location");
  assert.equal(renderRuntimePath(registry, seed, "/he/locations/sandanski").cards.length, 1);
  const petrichFallback = renderRuntimePath(registry, seed, "/he/locations/petrich");
  assert.equal(petrichFallback.status, 200);
  assert.equal(petrichFallback.indexable, false);
  assert.equal(petrichFallback.cards.length > 0, true);
  assert.equal(fr.locale, "en");
  assert.equal(fr.indexable, false);
  assert.equal(missing.status, 404);
  assert.equal(missing.kind, "not_found");
  assert.equal(missing.locale, "he");
  assert.equal(missing.chrome.home.href, "/he");
  assert.equal(missing.metadata.robots, "noindex,follow");
  assert.equal(sourceLanguageRepair.metadata.title, "Дава под наем промишлена сграда в Сандански");
  assert.equal(sourceLanguageRepair.body.description, sourceLanguageRecord.facts.description);
});

test("runtime renders only validated, source-faithful legacy archive entries", () => {
  const archive = loadLegacyArchive();
  const entry = archive.entries[0];
  const missing = renderRuntimePath(registry, seed, "/archive/" + "f".repeat(64));
  const uppercase = renderRuntimePath(registry, seed, `/archive/${entry.archive_id.toUpperCase()}`);

  assert.equal(archive.entries.length, 108);
  for (const archived of archive.entries) {
    const page = renderRuntimePath(registry, seed, `/archive/${archived.archive_id}`);
    assert.equal(page.status, 200, archived.source_url);
    assert.equal(page.kind, "legacy_archive", archived.source_url);
    assert.equal(page.path, `/archive/${archived.archive_id}`, archived.source_url);
    assert.equal(page.canonical, page.path, archived.source_url);
    assert.equal(page.indexable, false, archived.source_url);
    assert.equal(page.metadata.robots, "noindex,nofollow", archived.source_url);
    assert.deepEqual(page.hreflang, [], archived.source_url);
    assert.equal(page.schema, null, archived.source_url);
    assert.equal(page.body.text, archived.extracted_body_text, archived.source_url);
    assert.equal(page.body.source.url, archived.source_url, archived.source_url);
  }
  assert.equal(missing.status, 404);
  assert.equal(uppercase.status, 404);

  assert.throws(
    () => validateLegacyArchive({ ...archive, summary: { ...archive.summary, archive_rows: 1 }, entries: [{ ...entry, source_type: "taxonomy" }] }),
    /invalid or untrusted/,
  );
  assert.throws(
    () => validateLegacyArchive({ ...archive, summary: { ...archive.summary, archive_rows: 1 }, entries: [{ ...entry, content_scope: "document_text_fallback" }] }),
    /invalid or untrusted/,
  );
  assert.throws(
    () => validateLegacyArchive({ ...archive, summary: { ...archive.summary, archive_rows: 1 }, entries: [{ ...entry, extracted_body_text: "changed after capture" }] }),
    /invalid or untrusted/,
  );
});

test("runtime renders every second-batch source-reviewed listing description", () => {
  const reviewedSeed = applyListingEdits(seed, readListingEdits());
  const routes = {
    "MS-CRAWL-0023": "/bg/imoti/MS-CRAWL-0023",
    "MS-CRAWL-0080": "/bg/imoti/MS-CRAWL-0080",
    "MS-CRAWL-0116": "/ru/properties/MS-CRAWL-0116",
    "MS-CRAWL-0120": "/ru/properties/MS-CRAWL-0120",
    "MS-CRAWL-0124": "/ru/properties/MS-CRAWL-0124",
    "MS-CRAWL-0127": "/ru/properties/MS-CRAWL-0127",
    "MS-CRAWL-0128": "/ru/properties/MS-CRAWL-0128",
    "MS-CRAWL-0129": "/ru/properties/MS-CRAWL-0129",
    "MS-CRAWL-0130": "/ru/properties/MS-CRAWL-0130",
    "MS-CRAWL-0139": "/ru/properties/MS-CRAWL-0139",
  };

  for (const [listingId, route] of Object.entries(routes)) {
    const record = reviewedSeed.records.find((candidate) => candidate.id === listingId);
    const page = renderRuntimePath(registry, reviewedSeed, route);
    assert.equal(page.status, 200, listingId);
    assert.equal(page.body.description, record.facts.description, listingId);
  }
});

test("runtime home uses a source-backed curated hero instead of crawler annotation media", () => {
  const home = renderRuntimePath(registry, seed, "/bg/");

  assert.equal(home.body.hero.image.listing_id, "MS-CRAWL-0074");
  assert.doesNotMatch(home.body.hero.image.url, /DJI_0696|907-dron/i);
});

test("runtime overlays approved broker contact links on listing routes", () => {
  const page = renderRuntimePath(registry, seed, "/he/properties/MS-CRAWL-0001", [], [
    createBrokerContact({
      listingId: "MS-CRAWL-0001",
      broker: "broker_ru",
      phone: "+447700900001",
      reviewer: "owner",
      sourceReference: "test://broker-contact/MS-CRAWL-0001",
      validationStatus: "broker_verified",
      approved: true,
    }),
  ]);

  assert.equal(page.body.actions.direct_contact.review_status, "approved_broker_contact");
  assert.equal(page.body.actions.direct_contact.channels.find((channel) => channel.id === "viber").href, "viber://chat?number=%2B447700900001");
});

test("runtime overlays approved 360 tour before public listing render", () => {
  const page = renderRuntimePath(
    registry,
    seed,
    "/he/properties/MS-CRAWL-0001",
    [],
    [],
    [
      createTourApproval(
        seed,
        {
          id: "tour-approval-runtime-test",
          listingId: "MS-CRAWL-0001",
          panoramaUrl: "https://ms-realty.ms-realty-bg.workers.dev/tours/MS-CRAWL-0001.jpg",
          accessibilityCaption: "Reviewed 360 panorama for MS-CRAWL-0001.",
          reviewer: "media_editor",
          reviewConfirmed: true,
        },
        "2026-07-05T00:00:00Z",
      ),
    ],
  );

  assert.equal(page.status, 200);
  assert.equal(page.body.media.tour.available, true);
  assert.equal(page.body.media.tour.mount_target, "psv-listing-tour");
  assert.equal(page.body.media.tour.provider, "photo-sphere-viewer");
});

test("runtime overlays stale translation ledger rows before public rendering", () => {
  const stale = renderRuntimePath(registry, seed, "/el/akinita/MS-CRAWL-0001", [
    {
      id: "translation-listing-MS-CRAWL-0001-el",
      object_type: "listing",
      object_id: "MS-CRAWL-0001",
      target_locale: "el",
      status: "stale",
      human_approved: true,
      public_indexable: false,
    },
  ]);
  const source = renderRuntimePath(registry, seed, "/bg/imoti/MS-CRAWL-0001");

  assert.equal(stale.status, 200);
  assert.equal(stale.locale, "el");
  assert.equal(stale.indexable, false);
  assert.equal(stale.metadata.robots, "noindex,follow");
  assert.equal(stale.body.description, source.body.description);
  assert.equal(stale.hreflang.some((link) => link.hreflang === "el"), false);
});

test("runtime resolves admin-added approved locale listing routes from translation ledger", () => {
  const { registry: updated } = addLocaleToRegistry(registry, {
    code: "es",
    native_name: "Español",
    admin_name: "Spanish",
    public_enabled: true,
    indexable: true,
    route_segments: { listing: "propiedades", search: "buscar", seller: "vender" },
  });
  const translationTasks = [
    {
      id: "translation-listing-MS-CRAWL-0001-es",
      object_type: "listing",
      object_id: "MS-CRAWL-0001",
      target_locale: "es",
      status: "published",
      human_approved: true,
      public_indexable: true,
    },
  ];
  const page = renderRuntimePath(updated, seed, "/es/propiedades/MS-CRAWL-0001", translationTasks);

  assert.equal(page.status, 200);
  assert.equal(page.locale, "es");
  assert.equal(page.indexable, true);
  assert.equal(page.hreflang.some((link) => link.hreflang === "es"), true);
  assert.equal(renderRuntimePath(updated, seed, "/es/", translationTasks).kind, "home");
  assert.equal(renderRuntimePath(updated, seed, "/es/vender").locale, "es");
  assert.equal(renderRuntimePath(updated, seed, "/es/contact").kind, "contact");
  assert.equal(renderRuntimePath(updated, seed, "/es/locations/sandanski", translationTasks).status, 200);
});

test("runtime search uses CMS seed listings and keeps mobile-first contract", () => {
  const search = searchRuntimeListings(registry, seed, { localeCode: "he", query: "Sandanski" });
  const apartmentSearch = searchRuntimeListings(registry, seed, {
    localeCode: "he",
    query: "Sandanski",
    filters: { property_type: "apartment" },
  });

  assert.equal(search.status, 200);
  assert.equal(search.dir, "rtl");
  assert.equal(search.mobile_policy.list_first_mobile, true);
  assert.ok(search.search.total_matches > search.cards.length);
  assert.ok(search.cards.length > 0);
  assert.ok(search.cards.every((card) => card.path.startsWith("/he/properties/")));
  assert.equal(search.cards.find((card) => card.id === "MS-CRAWL-0001").translation_display, "reviewed_translation");
  assert.ok(apartmentSearch.cards.every((card) => card.property_type === "apartment"));
  assert.ok(apartmentSearch.search.total_matches > apartmentSearch.cards.length);
});

test("every source-fallback search card resolves to a noindex listing page", () => {
  const search = searchRuntimeListings(registry, seed, { localeCode: "en", query: "Sandanski" });
  const fallbackCard = search.cards.find((card) => card.translation_display === "fallback_source_locale");
  assert.ok(fallbackCard);
  const listing = renderRuntimePath(registry, seed, fallbackCard.path);

  assert.equal(listing.status, 200);
  assert.equal(listing.kind, "listing");
  assert.equal(listing.path, fallbackCard.path);
  assert.equal(listing.indexable, false);
  assert.equal(listing.metadata.robots, "noindex,follow");
  assert.equal(listing.body.content_locale, fallbackCard.content_locale);
});

test("runtime prioritizes same-language related listings before source fallbacks", () => {
  const listing = renderRuntimePath(registry, seed, "/ru/properties/MS-CRAWL-0114");

  assert.equal(listing.body.related_listings.length, 3);
  assert.ok(listing.body.related_listings.every((card) => card.content_locale === "ru"));
  assert.ok(listing.body.related_listings.every((card) => card.source_locale === "ru"));
  assert.ok(listing.body.related_listings.every((card) => card.translation_indexable));
});

test("runtime keeps sold listing pages live while removing them from active inventory", () => {
  const soldSeed = applyListingEdits(seed, [
    {
      listing_id: "MS-CRAWL-0001",
      patch: { listing_status: "sold" },
    },
  ]);
  const listing = renderRuntimePath(registry, soldSeed, "/he/properties/MS-CRAWL-0001");
  const search = searchRuntimeListings(registry, soldSeed, { localeCode: "he", query: "Sandanski" });
  const location = renderRuntimePath(registry, soldSeed, "/he/locations/sandanski");

  assert.equal(listing.status, 200);
  assert.equal(listing.indexable, true);
  assert.equal(listing.body.facts.listing_status, "sold");
  assert.equal(listing.body.lifecycle.active_in_search, false);
  assert.equal(listing.body.lifecycle.seo_kept_live, true);
  assert.equal(listing.body.related_listings.length > 0, true);
  assert.equal(search.cards.some((card) => card.id === "MS-CRAWL-0001"), false);
  assert.equal((location.cards || []).some((card) => card.id === "MS-CRAWL-0001"), false);
});

test("runtime search overlays stale translation ledger rows before card rendering", () => {
  const search = searchRuntimeListings(registry, seed, {
    localeCode: "el",
    query: "Sandanski",
    translationTasks: [
      {
        id: "translation-listing-MS-CRAWL-0001-el",
        object_type: "listing",
        object_id: "MS-CRAWL-0001",
        target_locale: "el",
        status: "stale",
        human_approved: true,
        public_indexable: false,
      },
    ],
  });
  const card = search.cards.find((candidate) => candidate.id === "MS-CRAWL-0001");

  assert.equal(search.status, 200);
  assert.equal(card.translation_display, "stale_translation_fallback");
  assert.equal(card.translation_status, "stale");
  assert.equal(card.translation_indexable, false);
});

test("runtime search shows reviewed cards for admin-added approved locales", () => {
  const { registry: updated } = addLocaleToRegistry(registry, {
    code: "es",
    native_name: "Español",
    admin_name: "Spanish",
    public_enabled: true,
    indexable: true,
    route_segments: { listing: "propiedades", search: "buscar", seller: "vender" },
  });
  const search = searchRuntimeListings(updated, seed, {
    localeCode: "es",
    query: "Sandanski",
    translationTasks: [
      {
        id: "translation-listing-MS-CRAWL-0001-es",
        object_type: "listing",
        object_id: "MS-CRAWL-0001",
        target_locale: "es",
        status: "published",
        human_approved: true,
        public_indexable: true,
      },
    ],
  });
  const card = search.cards.find((candidate) => candidate.id === "MS-CRAWL-0001");

  assert.equal(search.path, "/es/buscar");
  assert.equal(search.indexable, false);
  assert.equal(search.metadata.robots, "noindex,follow");
  assert.equal(card.path, "/es/propiedades/MS-CRAWL-0001");
  assert.equal(card.translation_display, "reviewed_translation");
  assert.equal(card.translation_indexable, true);
});

test("runtime lead intake stores language and keeps Hermes reply review-gated", () => {
  const lead = submitRuntimeLead(registry, seed, {
    id: "runtime-lead-test",
    leadType: "buyer",
    language: "he",
    listingReference: "MS-CRAWL-0001",
    contact: { name: "Noa Levi", whatsapp: "+359880000001" },
    contact_preference: "whatsapp",
    message: "Interested in this property.",
  });

  assert.equal(lead.original_language, "he");
  assert.equal(lead.original_direction, "rtl");
  assert.equal(lead.admin_locale, "en");
  assert.equal(lead.contact_preference, "whatsapp");
  assert.equal(lead.broker_assignment.broker_id, null);
  assert.equal(lead.broker_assignment.method, "manager_queue");
  assert.equal(lead.broker_assignment.criteria.location, "Sandanski");
  assert.equal(lead.broker_assignment.criteria.property_type, "commercial");
  assert.equal(lead.hermes_reply_draft.can_send_without_approval, false);
});

test("runtime viewing request lead stays routed through broker-approved CRM flow", () => {
  const lead = submitRuntimeLead(registry, seed, {
    id: "runtime-viewing-lead-test",
    source: "website_viewing_request",
    leadType: "buyer",
    language: "he",
    listingReference: "MS-CRAWL-0001",
    contact: { name: "Noa Levi", phone: "+359880000001" },
    contact_preference: "phone",
    request_details: { viewing_date: "2026-07-20", viewing_time: "14:00" },
    message: "I would like to view this property.",
  });

  assert.equal(lead.lead.source, "website_viewing_request");
  assert.equal(lead.lead.intent, "viewing");
  assert.equal(lead.lead.leadType, "renter");
  assert.equal(lead.lead.listingReference, "MS-CRAWL-0001");
  assert.equal(lead.original_language, "he");
  assert.equal(lead.admin_locale, "en");
  assert.equal(lead.contact_preference, "phone");
  assert.deepEqual(lead.lead.request_details, { viewing_date: "2026-07-20", viewing_time: "14:00" });
  assert.equal(lead.broker_assignment.broker_id, null);
  assert.equal(lead.broker_assignment.method, "manager_queue");
  assert.equal(lead.hermes_reply_draft.broker_approval_required, true);
});

test("runtime canonicalizes explicit listing CTA intents and validates their contact channels", () => {
  const inquiry = submitRuntimeLead(registry, seed, {
    id: "runtime-inquiry-intent-test",
    source: "website_listing_detail",
    intent: "inquiry",
    leadType: "buyer",
    language: "ru",
    listingReference: "MS-CRAWL-0001",
    contact: { name: "Nina", whatsapp: "+359880000000" },
    contact_preference: "whatsapp",
  });
  const callback = submitRuntimeLead(registry, seed, {
    id: "runtime-callback-intent-test",
    source: "website_callback_request",
    intent: "callback",
    leadType: "buyer",
    language: "ru",
    listingReference: "MS-CRAWL-0001",
    contact: { name: "Nina", phone: "+359880000000" },
    contact_preference: "phone",
  });
  const viewing = submitRuntimeLead(registry, seed, {
    id: "runtime-viewing-intent-test",
    source: "website_viewing_request",
    intent: "viewing",
    leadType: "buyer",
    language: "ru",
    listingReference: "MS-CRAWL-0001",
    contact: { name: "Nina", phone: "+359880000000" },
    contact_preference: "phone",
    request_details: { viewing_date: "2026-07-20", viewing_time: "14:00" },
  });

  assert.deepEqual([inquiry.lead.intent, callback.lead.intent, viewing.lead.intent], ["inquiry", "callback", "viewing"]);
  assert.deepEqual(
    [inquiry.lead.source, callback.lead.source, viewing.lead.source],
    ["website_listing_detail", "website_callback_request", "website_viewing_request"],
  );
  assert.equal(viewing.hermes_reply_draft.can_send_without_approval, false);
  assert.deepEqual(viewing.lead.request_details, { viewing_date: "2026-07-20", viewing_time: "14:00" });
  assert.equal("viewing" in viewing, false);
  assert.throws(
    () =>
      submitRuntimeLead(registry, seed, {
        source: "website_viewing_request",
        intent: "callback",
        leadType: "buyer",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Nina", phone: "+359880000000" },
      }),
    /intent must match source/,
  );
  assert.throws(
    () =>
      submitRuntimeLead(registry, seed, {
        source: "website_callback_request",
        intent: "callback",
        leadType: "buyer",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Nina" },
      }),
    /requires a phone/,
  );
  assert.throws(
    () =>
      submitRuntimeLead(registry, seed, {
        source: "website_listing_detail",
        intent: "inquiry",
        leadType: "buyer",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Nina" },
      }),
    /reachable contact channel/,
  );
  assert.throws(
    () =>
      submitRuntimeLead(registry, seed, {
        source: "website_viewing_request",
        intent: "viewing",
        leadType: "buyer",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Nina", phone: "+359880000000" },
      }),
    /preferred date/,
  );
  assert.throws(
    () =>
      submitRuntimeLead(registry, seed, {
        source: "website_untrusted",
        intent: "inquiry",
        leadType: "buyer",
        listingReference: "MS-CRAWL-0001",
        contact: { name: "Nina", phone: "+359880000000" },
      }),
    /known canonical source/,
  );
});

test("runtime contact callback lead stays routed through broker-approved CRM flow", () => {
  const lead = submitRuntimeLead(registry, seed, {
    id: "runtime-contact-lead-test",
    source: "website_contact_callback",
    intent: "callback",
    leadType: "general",
    language: "he",
    contact: { name: "Noa Levi", phone: "+359880000001" },
    contact_preference: "phone",
    request_details: { callback_time: "Weekdays after 14:00" },
    message: "Please call me about buying in Sandanski.",
  });

  assert.equal(lead.lead.source, "website_contact_callback");
  assert.equal(lead.lead.leadType, "general");
  assert.equal(lead.lead.intent, "callback");
  assert.equal(lead.lead.request_details.callback_time, "Weekdays after 14:00");
  assert.equal(lead.original_language, "he");
  assert.equal(lead.admin_locale, "en");
  assert.equal(lead.contact_preference, "phone");
  assert.equal(lead.broker_assignment.broker_id, null);
  assert.equal(lead.broker_assignment.method, "manager_queue");
  assert.equal(lead.hermes_reply_draft.broker_approval_required, true);
  assert.throws(
    () =>
      submitRuntimeLead(registry, seed, {
        source: "website_contact_callback",
        leadType: "general",
        contact: { name: "Noa Levi" },
      }),
    /requires a phone/,
  );
});

test("runtime smoke fixture proves listing, search, fallback, and lead flow", () => {
  const smoke = buildRuntimeSmoke(registry, seed);
  assert.equal(assertRuntimeSmoke(smoke), true);
});

test("generated runtime smoke file is valid when present", () => {
  const file = fromRoot("production", "data", "runtime-smoke.json");
  if (!fs.existsSync(file)) return;
  const smoke = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(assertRuntimeSmoke(smoke), true);
});
