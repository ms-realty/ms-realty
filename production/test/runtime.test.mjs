import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createBrokerContact } from "../lib/broker-contacts.mjs";
import { addLocaleToRegistry, loadLocaleRegistry } from "../lib/locales.mjs";
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

const registry = loadLocaleRegistry();
const seed = loadCmsSeed();

test("runtime resolves locale-prefixed listing and fallback routes from CMS seed", () => {
  const he = renderRuntimePath(registry, seed, "/he/properties/MS-CRAWL-0001");
  const home = renderRuntimePath(registry, seed, "/he/");
  const seller = renderRuntimePath(registry, seed, "/he/sell");
  const contact = renderRuntimePath(registry, seed, "/he/contact");
  const fr = renderRuntimePath(registry, seed, "/fr/");
  const missing = renderRuntimePath(registry, seed, "/he/properties/missing");

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
  assert.equal(he.body.actions.secondary.find((action) => action.id === "share_family").url, he.path);
  assert.equal(he.body.actions.direct_contact.review_status, "needs_broker_contact_review");
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
  assert.equal(renderRuntimePath(registry, seed, "/he/locations/sandanski").kind, "location");
  assert.equal(renderRuntimePath(registry, seed, "/he/locations/sandanski").cards.length, 1);
  assert.equal(renderRuntimePath(registry, seed, "/he/locations/petrich").status, 404);
  assert.equal(fr.locale, "en");
  assert.equal(fr.indexable, false);
  assert.equal(missing.status, 404);
});

test("runtime overlays approved broker contact links on listing routes", () => {
  const page = renderRuntimePath(registry, seed, "/he/properties/MS-CRAWL-0001", [], [
    createBrokerContact({
      listingId: "MS-CRAWL-0001",
      broker: "broker_ru",
      phone: "+359880000000",
      reviewer: "owner",
      approved: true,
    }),
  ]);

  assert.equal(page.body.actions.direct_contact.review_status, "approved_broker_contact");
  assert.equal(page.body.actions.direct_contact.channels.find((channel) => channel.id === "viber").href, "viber://chat?number=%2B359880000000");
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
          panoramaUrl: "https://cdn.example.test/tours/MS-CRAWL-0001.jpg",
          accessibilityCaption: "Reviewed 360 panorama for MS-CRAWL-0001.",
          reviewer: "media_editor",
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

  assert.equal(stale.status, 200);
  assert.equal(stale.locale, "el");
  assert.equal(stale.indexable, false);
  assert.equal(stale.metadata.robots, "noindex,follow");
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
  assert.equal(search.indexable, true);
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
    contact: { name: "Noa Levi" },
    contact_preference: "whatsapp",
    message: "Interested in this property.",
  });

  assert.equal(lead.original_language, "he");
  assert.equal(lead.original_direction, "rtl");
  assert.equal(lead.admin_locale, "en");
  assert.equal(lead.contact_preference, "whatsapp");
  assert.equal(lead.broker_assignment.broker_id, "broker_international");
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
    contact: { name: "Noa Levi" },
    contact_preference: "phone",
    message: "I would like to view this property.",
  });

  assert.equal(lead.lead.source, "website_viewing_request");
  assert.equal(lead.lead.leadType, "buyer");
  assert.equal(lead.lead.listingReference, "MS-CRAWL-0001");
  assert.equal(lead.original_language, "he");
  assert.equal(lead.admin_locale, "en");
  assert.equal(lead.contact_preference, "phone");
  assert.equal(lead.broker_assignment.broker_id, "broker_international");
  assert.equal(lead.hermes_reply_draft.broker_approval_required, true);
});

test("runtime contact callback lead stays routed through broker-approved CRM flow", () => {
  const lead = submitRuntimeLead(registry, seed, {
    id: "runtime-contact-lead-test",
    source: "website_contact_callback",
    leadType: "general",
    language: "he",
    contact: { name: "Noa Levi" },
    contact_preference: "phone",
    message: "Please call me about buying in Sandanski.",
  });

  assert.equal(lead.lead.source, "website_contact_callback");
  assert.equal(lead.lead.leadType, "general");
  assert.equal(lead.original_language, "he");
  assert.equal(lead.admin_locale, "en");
  assert.equal(lead.contact_preference, "phone");
  assert.equal(lead.broker_assignment.broker_id, "broker_international");
  assert.equal(lead.hermes_reply_draft.broker_approval_required, true);
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
