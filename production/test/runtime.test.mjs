import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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

const registry = loadLocaleRegistry();
const seed = loadCmsSeed();

test("runtime resolves locale-prefixed listing and fallback routes from CMS seed", () => {
  const he = renderRuntimePath(registry, seed, "/he/properties/MS-CRAWL-0001");
  const fr = renderRuntimePath(registry, seed, "/fr/");
  const missing = renderRuntimePath(registry, seed, "/he/properties/missing");

  assert.equal(he.status, 200);
  assert.equal(he.dir, "rtl");
  assert.equal(he.indexable, true);
  assert.equal(fr.locale, "en");
  assert.equal(fr.indexable, false);
  assert.equal(missing.status, 404);
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
    route_segments: { listing: "propiedades", search: "buscar" },
  });
  const page = renderRuntimePath(updated, seed, "/es/propiedades/MS-CRAWL-0001", [
    {
      id: "translation-listing-MS-CRAWL-0001-es",
      object_type: "listing",
      object_id: "MS-CRAWL-0001",
      target_locale: "es",
      status: "published",
      human_approved: true,
      public_indexable: true,
    },
  ]);

  assert.equal(page.status, 200);
  assert.equal(page.locale, "es");
  assert.equal(page.indexable, true);
  assert.equal(page.hreflang.some((link) => link.hreflang === "es"), true);
});

test("runtime search uses CMS seed listings and keeps mobile-first contract", () => {
  const search = searchRuntimeListings(registry, seed, { localeCode: "he", query: "Sandanski" });

  assert.equal(search.status, 200);
  assert.equal(search.dir, "rtl");
  assert.equal(search.mobile_policy.list_first_mobile, true);
  assert.ok(search.cards.length > 0);
  assert.ok(search.cards.every((card) => card.path.startsWith("/he/properties/")));
  assert.equal(search.cards.find((card) => card.id === "MS-CRAWL-0001").translation_display, "reviewed_translation");
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
    route_segments: { listing: "propiedades", search: "buscar" },
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
    message: "Interested in this property.",
  });

  assert.equal(lead.original_language, "he");
  assert.equal(lead.original_direction, "rtl");
  assert.equal(lead.admin_locale, "en");
  assert.equal(lead.hermes_reply_draft.can_send_without_approval, false);
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
