import test from "node:test";
import assert from "node:assert/strict";
import {
  addLocaleToRegistry,
  loadLocaleRegistry,
  assertLocaleRegistry,
  requiredAdminLocales,
  requiredPublicLocales,
  resolvePublicLocale,
  websiteLanguageCoverage,
} from "../lib/locales.mjs";
import {
  contactPath,
  homePath,
  listingPath,
  locationPath,
  sellerPath,
  hreflangForListing,
  sitemapEntriesForListing,
} from "../lib/seo.mjs";
import { approveHumanTranslation, contentHash, markStaleWhenSourceChanges } from "../lib/translations.mjs";
import { assertHermesActionAllowed, translationPrompt, validateHermesTranslationDraft } from "../lib/hermes.mjs";
import { createLeadDraft } from "../lib/leads.mjs";

const registry = loadLocaleRegistry();

test("locale registry supports dynamic approved website languages and admin language limits", () => {
  assert.equal(assertLocaleRegistry(registry), true);
  assert.deepEqual(requiredAdminLocales(registry), ["bg", "ru", "en"]);
  assert.deepEqual(registry.admin_locales, ["bg", "ru", "en"]);
  assert.deepEqual(requiredPublicLocales(registry), ["bg", "en", "de", "nl", "ru", "el", "he"]);
  assert.equal(registry.locales.find((locale) => locale.code === "he").direction, "rtl");
  assert.equal(registry.locales.find((locale) => locale.code === "el").indexable, true);
  assert.deepEqual(
    websiteLanguageCoverage(registry).map((item) => [item.market, item.country_code, item.locale, item.public_route_prefix]),
    [
      ["Greece", "GR", "el", "/el/"],
      ["Israel", "IL", "he", "/he/"],
    ],
  );
});

test("locale routes and hreflang only include human-approved translations", () => {
  assert.equal(listingPath(registry, "el", "ms-987"), "/el/akinita/ms-987");
  assert.equal(listingPath(registry, "he", "ms-987"), "/he/properties/ms-987");
  assert.equal(homePath(registry, "he"), "/he/");
  assert.equal(locationPath(registry, "he", "Sandanski"), "/he/locations/sandanski");
  assert.equal(sellerPath(registry, "he"), "/he/sell");
  assert.equal(contactPath(registry, "he"), "/he/contact");

  const links = hreflangForListing(registry, "ms-987", [
    { locale: "bg", status: "published", human_approved: true },
    { locale: "el", status: "approved", human_approved: true },
    { locale: "he", status: "approved", human_approved: true },
    { locale: "fr", status: "hermes_drafted", human_approved: false },
  ]);

  assert.deepEqual(
    links.map((link) => link.hreflang).sort(),
    ["bg", "el", "he", "x-default"].sort(),
  );
});

test("localized sitemap entries are generated only for approved translations", () => {
  const entries = sitemapEntriesForListing(registry, "ms-987", [
    { locale: "bg", status: "published", human_approved: true },
    { locale: "he", status: "approved", human_approved: true },
    { locale: "fr", status: "hermes_drafted", human_approved: false },
  ]);

  assert.deepEqual(
    entries.map((entry) => entry.locale).sort(),
    ["bg", "he"],
  );
  assert.equal(entries.some((entry) => entry.loc.startsWith("/fr/")), false);
});

test("unavailable language falls back without becoming indexable", () => {
  const resolved = resolvePublicLocale(registry, "fr");
  assert.equal(resolved.available, false);
  assert.equal(resolved.locale.code, "en");
});

test("admin-added locales are valid but not public indexable by default", () => {
  const { registry: updated, locale } = addLocaleToRegistry(registry, {
    code: "es",
    native_name: "Español",
    admin_name: "Spanish",
    route_segments: { listing: "propiedades", search: "buscar" },
  });

  assert.equal(assertLocaleRegistry(updated), true);
  assert.equal(locale.public_enabled, false);
  assert.equal(locale.indexable, false);
  assert.equal(locale.route_segments.seller, "sell");
  assert.equal(locale.route_segments.contact, "contact");
  assert.equal(locale.route_segments.location, "locations");
  assert.deepEqual(updated.admin_locales, ["bg", "ru", "en"]);
  assert.deepEqual(requiredAdminLocales(updated), ["bg", "ru", "en"]);
  assert.deepEqual(requiredPublicLocales(updated), ["bg", "en", "de", "nl", "ru", "el", "he"]);
  assert.equal(resolvePublicLocale(updated, "es").locale.code, "en");
});

test("locale fallbacks must resolve to approved public languages", () => {
  assert.throws(
    () =>
      addLocaleToRegistry(registry, {
        code: "it",
        native_name: "Italiano",
        admin_name: "Italian",
        fallback_locale: "fr",
      }),
    /must be public and indexable/,
  );
});

test("translation workflow marks stale content and human approval explicitly", () => {
  const oldHash = contentHash({ title: "Old" });
  const newHash = contentHash({ title: "New" });
  const stale = markStaleWhenSourceChanges(newHash, {
    locale: "en",
    status: "published",
    source_hash: oldHash,
  });
  assert.equal(stale.status, "stale");
  assert.equal(stale.review_task_required, true);

  const approved = approveHumanTranslation({ locale: "en", status: "human_edited" }, "editor_en", "2026-07-04T00:00:00Z");
  assert.equal(approved.human_approved, true);
  assert.equal(approved.status, "approved");
});

test("Hermes can draft translations but cannot publish or send", () => {
  assert.equal(assertHermesActionAllowed("draft_translation"), true);
  assert.throws(() => assertHermesActionAllowed("publish"), /cannot perform/);
  const prompt = translationPrompt({
    sourceLocale: "bg",
    targetLocale: "he",
    sourceText: "Светъл апартамент в Сандански.",
    propertyFacts: { location: "Sandanski" },
  });
  assert.match(prompt.rules.join(" "), /Sandanski/);
  assert.match(prompt.forbiddenClaims.join(" "), /Sandanski/);
  assert.equal(prompt.seoTargets.title_max_chars, 60);
  assert.equal(prompt.capabilities.can_publish, false);
  const draft = validateHermesTranslationDraft({
    propertyFacts: { id: "MS-1", location: "Sandanski" },
    sourceSnapshot: { source_hash: "source-1" },
    draft: {
      title: "MS-1 Sandanski",
      body: "MS-1 Sandanski",
      seo_title: "MS-1 Sandanski",
      meta_description: "MS-1 Sandanski",
      citations: [{ source: "cms", field: "title" }],
    },
  });
  assert.equal(draft.public_indexable, false);
  assert.equal(draft.source_snapshot.source_hash, "source-1");
  assert.throws(
    () =>
      validateHermesTranslationDraft({
        propertyFacts: { id: "MS-1", location: "Sandanski" },
        sourceSnapshot: { source_hash: "source-1" },
        draft: { body: "MS-1 Sandanski tax guarantee", citations: [{ source: "cms", field: "title" }] },
      }),
    /legal\/tax\/process/,
  );
});

test("lead intake accepts Greek and Hebrew website languages but routes admin work to BG/RU/EN", () => {
  const greekLead = createLeadDraft(registry, {
    source: "website_listing_detail",
    leadType: "buyer",
    language: "el",
    contact: { name: "Nikos" },
  });
  assert.equal(greekLead.language.language, "el");
  assert.equal(greekLead.language.adminLocale, "en");
  assert.equal(greekLead.requiresBrokerApproval, true);

  const hebrewLead = createLeadDraft(registry, {
    source: "website_listing_detail",
    leadType: "buyer",
    language: "he",
    contact: { name: "Noa" },
    contact_preference: "WhatsApp",
  });
  assert.equal(hebrewLead.language.direction, "rtl");
  assert.equal(hebrewLead.language.requiresTranslation, true);
  assert.equal(hebrewLead.contact_preference, "whatsapp");
  const formLead = createLeadDraft(registry, {
    source: "website_seller_valuation",
    leadType: "seller",
    language: "bg",
    "contact.name": "  Mira Petkova ",
    "contact.phone": " +359 88 000 0000 ",
    "property.location": " Sandanski ",
    "property.type": " apartment ",
  });
  assert.deepEqual(formLead.contact, { name: "Mira Petkova", phone: "+359 88 000 0000" });
  assert.deepEqual(formLead.property, { location: "Sandanski", type: "apartment" });
  assert.throws(
    () =>
      createLeadDraft(registry, {
        source: "website_listing_detail",
        leadType: "buyer",
        language: "he",
        contact: { name: "Noa" },
        contact_preference: "fax",
      }),
    /contact_preference/,
  );
});
