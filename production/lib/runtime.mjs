import fs from "node:fs";
import { latestApprovedBrokerContact } from "./broker-contacts.mjs";
import { approvedTranslationRecordsForListing } from "./content.mjs";
import { createCrmInboxItem } from "./admin-workflows.mjs";
import { fromRoot } from "./paths.mjs";
import {
  renderHomePage,
  renderLanguageFallback,
  renderListingPage,
  renderLocationPage,
  renderSearchPage,
  renderSellerPage,
} from "./public-site.mjs";
import { locationPath, listingPath, sellerPath } from "./seo.mjs";
import { latestTranslationTasks } from "./translation-ledger.mjs";

export const DEFAULT_CMS_SEED_PATH = fromRoot("production", "data", "cms-seed.json");

export function loadCmsSeed(path = DEFAULT_CMS_SEED_PATH) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function listingFromCmsRecord(record) {
  return {
    id: record.id,
    url: record.source_url,
    canonical: record.seo.canonical,
    domain: record.source_domain,
    locale: record.source_locale,
    language: record.source_locale,
    translation_status: record.translations.some(
      (translation) => translation.locale === record.source_locale && translation.status === "published",
    )
      ? "published"
      : "approved",
    title: record.seo.title,
    description: record.seo.description,
    h1: record.facts.h1,
    location: record.facts.location,
    property_type: record.facts.property_type,
    offer_type: record.facts.offer_type,
    bedrooms: record.facts.bedrooms,
    price_eur: record.facts.price_eur,
    image_count: record.facts.image_count,
    media: record.media || [],
    media_workflow: record.media_workflow || null,
    tour: record.tour || null,
    word_count: record.facts.word_count,
    schema_present: record.seo.schema_present,
  };
}

function listingRecords(seed) {
  return seed.records.filter((record) => record.collection === "listings");
}

function translationLocale(translation) {
  return translation.locale || translation.target_locale;
}

export function mergeRuntimeTranslations(record, translationTasks = []) {
  const byLocale = new Map(record.translations.map((translation) => [translation.locale, translation]));
  for (const task of latestTranslationTasks(translationTasks)) {
    if (task.object_type !== "listing" || task.object_id !== record.id) continue;
    byLocale.set(translationLocale(task), { ...task, locale: translationLocale(task) });
  }
  return [...byLocale.values()];
}

function translationPathMatches(registry, record, translation, normalized) {
  try {
    return listingPath(registry, translation.locale, record.id) === normalized;
  } catch {
    return false;
  }
}

function locationNames(seed) {
  return [...new Set(listingRecords(seed).map((record) => String(record.facts.location || "").trim()).filter(Boolean))];
}

export function resolveRuntimePath(registry, seed, pathname, translationTasks = []) {
  const normalized = pathname.replace(/\/$/, "");
  for (const record of listingRecords(seed)) {
    const translations = mergeRuntimeTranslations(record, translationTasks);
    const matchedLocale =
      record.routing?.target_path === normalized
        ? record.routing.target_locale
        : translations.find((translation) => translationPathMatches(registry, record, translation, normalized))?.locale;
    if (!matchedLocale) continue;
    return {
      type: "listing",
      record,
      listing: listingFromCmsRecord(record),
      localeCode: matchedLocale,
    };
  }

  const sellerLocale = registry.locales.find((locale) => {
    try {
      return sellerPath(registry, locale.code) === normalized;
    } catch {
      return false;
    }
  });
  if (sellerLocale) return { type: "seller", localeCode: sellerLocale.code };

  for (const locale of registry.locales) {
    const location = locationNames(seed).find((candidate) => locationPath(registry, locale.code, candidate) === normalized);
    if (location) return { type: "location", localeCode: locale.code, location };
  }

  const localeMatch = normalized.match(/^\/([a-z]{2}(?:-[A-Z]{2})?)\/?$/);
  if (localeMatch) {
    const locale = registry.locales.find((candidate) => candidate.code === localeMatch[1]);
    if (locale?.public_enabled && locale.indexable) return { type: "home", localeCode: locale.code };
    return { type: "language_fallback", localeCode: localeMatch[1] };
  }

  return { type: "not_found", status: 404 };
}

export function renderRuntimePath(registry, seed, pathname, translationTasks = [], brokerContacts = []) {
  const resolved = resolveRuntimePath(registry, seed, pathname, translationTasks);
  if (resolved.type === "listing") {
    return renderListingPage({
      registry,
      listing: resolved.listing,
      localeCode: resolved.localeCode,
      translations: mergeRuntimeTranslations(resolved.record, translationTasks),
      brokerContact: latestApprovedBrokerContact(brokerContacts, resolved.record.id),
    });
  }
  if (resolved.type === "language_fallback") {
    return renderLanguageFallback({ registry, requestedLocale: resolved.localeCode });
  }
  if (resolved.type === "home") {
    return renderHomePage({
      registry,
      localeCode: resolved.localeCode,
      listings: listingRecords(seed).map((record) => ({
        ...listingFromCmsRecord(record),
        translations: mergeRuntimeTranslations(record, translationTasks),
      })),
    });
  }
  if (resolved.type === "seller") {
    return renderSellerPage({ registry, localeCode: resolved.localeCode });
  }
  if (resolved.type === "location") {
    return renderLocationPage({
      registry,
      localeCode: resolved.localeCode,
      location: resolved.location,
      listings: listingRecords(seed).map((record) => ({
        ...listingFromCmsRecord(record),
        translations: mergeRuntimeTranslations(record, translationTasks),
      })),
    });
  }
  return { kind: "not_found", status: 404, path: pathname, indexable: false };
}

export function searchRuntimeListings(registry, seed, { localeCode, query = "", filters = {}, translationTasks = [] }) {
  const listings = listingRecords(seed).map((record) => ({
    ...listingFromCmsRecord(record),
    translations: mergeRuntimeTranslations(record, translationTasks),
  }));
  return renderSearchPage({ registry, localeCode, listings, query, filters });
}

export function submitRuntimeLead(registry, seed, input) {
  const record = listingRecords(seed).find((candidate) => candidate.id === input.listingReference);
  if (!record && input.leadType === "buyer") throw new Error("Buyer lead requires a known listingReference");
  return createCrmInboxItem(registry, {
    ...input,
    source: input.source || "website_listing_detail",
  });
}

export function buildRuntimeSmoke(registry, seed) {
  const listing = listingRecords(seed).find((record) => record.id === "MS-CRAWL-0001");
  const ruListing = listingRecords(seed).find((record) => record.source_locale === "ru");
  const runtimeListing = listingFromCmsRecord(listing);

  return {
    fixture_id: "runtime-smoke-20260704",
    listing_he: renderRuntimePath(registry, seed, "/he/properties/MS-CRAWL-0001"),
    listing_ru: renderRuntimePath(registry, seed, ruListing.routing.target_path),
    home_he: renderRuntimePath(registry, seed, "/he/"),
    seller_he: renderRuntimePath(registry, seed, "/he/sell"),
    location_he: renderRuntimePath(registry, seed, "/he/locations/sandanski"),
    fallback_fr: renderRuntimePath(registry, seed, "/fr/"),
    search_he: searchRuntimeListings(registry, seed, { localeCode: "he", query: "Sandanski" }),
    lead_he: submitRuntimeLead(registry, seed, {
      id: "runtime-lead-he-0001",
      source: "website_listing_detail",
      leadType: "buyer",
      language: "he",
      listingReference: runtimeListing.id,
      contact: { name: "Noa Levi" },
      contact_preference: "whatsapp",
      message: "Interested in this property.",
    }),
    viewingLead_he: submitRuntimeLead(registry, seed, {
      id: "runtime-viewing-lead-he-0001",
      source: "website_viewing_request",
      leadType: "buyer",
      language: "he",
      listingReference: runtimeListing.id,
      contact: { name: "Noa Levi" },
      contact_preference: "phone",
      message: "I would like to view this property.",
    }),
  };
}

export function assertRuntimeSmoke(smoke) {
  if (smoke.listing_he.status !== 200 || smoke.listing_he.dir !== "rtl") {
    throw new Error("Runtime Hebrew listing must render as RTL 200");
  }
  if (
    smoke.listing_he.body.actions?.primary?.find((action) => action.id === "callback")?.payload.source !==
    "website_callback_request"
  ) {
    throw new Error("Runtime smoke must expose listing callback action");
  }
  if (
    smoke.listing_he.body.actions?.primary?.find((action) => action.id === "request_viewing")?.payload.source !==
    "website_viewing_request"
  ) {
    throw new Error("Runtime smoke must expose listing viewing request action");
  }
  if (smoke.listing_ru.status !== 200 || !smoke.listing_ru.path.startsWith("/ru/")) {
    throw new Error("Runtime Russian listing route missing");
  }
  if (smoke.home_he.status !== 200 || smoke.home_he.kind !== "home" || smoke.home_he.body.search.path !== "/he/search") {
    throw new Error("Runtime Hebrew home must expose search and buyer paths");
  }
  if (smoke.home_he.body.seller.path !== "/he/sell") throw new Error("Runtime Hebrew home must expose seller path");
  if (smoke.fallback_fr.indexable !== false) throw new Error("Runtime French fallback must not be indexable");
  if (smoke.seller_he.status !== 200 || smoke.seller_he.body.valuation.payload.source !== "website_seller_valuation") {
    throw new Error("Runtime seller page must expose seller valuation lead action");
  }
  if (smoke.location_he.status !== 200 || smoke.location_he.kind !== "location" || smoke.location_he.body.location !== "Sandanski") {
    throw new Error("Runtime location page must render reviewed Sandanski inventory");
  }
  if (!smoke.location_he.cards.length || smoke.location_he.cards.some((card) => card.translation_indexable !== true)) {
    throw new Error("Runtime location page must only expose indexable locale cards");
  }
  if (smoke.search_he.mobile_policy.list_first_mobile !== true) throw new Error("Runtime search must preserve mobile policy");
  if (smoke.lead_he.admin_locale !== "en" || smoke.lead_he.hermes_reply_draft.can_send_without_approval !== false) {
    throw new Error("Runtime lead must route to EN admin queue with broker approval");
  }
  if (smoke.lead_he.contact_preference !== "whatsapp") throw new Error("Runtime lead must preserve contact preference");
  if (
    smoke.viewingLead_he.lead.source !== "website_viewing_request" ||
    smoke.viewingLead_he.contact_preference !== "phone" ||
    smoke.viewingLead_he.hermes_reply_draft.broker_approval_required !== true
  ) {
    throw new Error("Runtime viewing request lead must stay review-gated in CRM");
  }
  if (JSON.stringify(smoke).match(/Sandanski sea|sea destination|Сандански море/i)) {
    throw new Error("Runtime smoke must not introduce Sandanski sea framing");
  }
  return true;
}
