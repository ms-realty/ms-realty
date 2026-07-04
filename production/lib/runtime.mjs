import fs from "node:fs";
import { approvedTranslationRecordsForListing } from "./content.mjs";
import { createCrmInboxItem } from "./admin-workflows.mjs";
import { fromRoot } from "./paths.mjs";
import { renderLanguageFallback, renderListingPage, renderSearchPage } from "./public-site.mjs";
import { listingPath } from "./seo.mjs";
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

  const localeMatch = normalized.match(/^\/([a-z]{2}(?:-[A-Z]{2})?)\/?$/);
  if (localeMatch) {
    return { type: "language_fallback", localeCode: localeMatch[1] };
  }

  return { type: "not_found", status: 404 };
}

export function renderRuntimePath(registry, seed, pathname, translationTasks = []) {
  const resolved = resolveRuntimePath(registry, seed, pathname, translationTasks);
  if (resolved.type === "listing") {
    return renderListingPage({
      registry,
      listing: resolved.listing,
      localeCode: resolved.localeCode,
      translations: mergeRuntimeTranslations(resolved.record, translationTasks),
    });
  }
  if (resolved.type === "language_fallback") {
    return renderLanguageFallback({ registry, requestedLocale: resolved.localeCode });
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
    fallback_fr: renderRuntimePath(registry, seed, "/fr/"),
    search_he: searchRuntimeListings(registry, seed, { localeCode: "he", query: "Sandanski" }),
    lead_he: submitRuntimeLead(registry, seed, {
      id: "runtime-lead-he-0001",
      source: "website_listing_detail",
      leadType: "buyer",
      language: "he",
      listingReference: runtimeListing.id,
      contact: { name: "Noa Levi" },
      message: "Interested in this property.",
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
  if (smoke.listing_ru.status !== 200 || !smoke.listing_ru.path.startsWith("/ru/")) {
    throw new Error("Runtime Russian listing route missing");
  }
  if (smoke.fallback_fr.indexable !== false) throw new Error("Runtime French fallback must not be indexable");
  if (smoke.search_he.mobile_policy.list_first_mobile !== true) throw new Error("Runtime search must preserve mobile policy");
  if (smoke.lead_he.admin_locale !== "en" || smoke.lead_he.hermes_reply_draft.can_send_without_approval !== false) {
    throw new Error("Runtime lead must route to EN admin queue with broker approval");
  }
  if (JSON.stringify(smoke).match(/Sandanski sea|sea destination|Сандански море/i)) {
    throw new Error("Runtime smoke must not introduce Sandanski sea framing");
  }
  return true;
}
