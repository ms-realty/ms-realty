import fs from "node:fs";
import { approvedContentDocumentsForPath, readApprovedCmsContent } from "./approved-content.mjs";
import { latestApprovedBrokerContact } from "./broker-contacts.mjs";
import { approvedTranslationRecordsForListing, publicPropertyProjection } from "./content.mjs";
import { createCrmInboxItem } from "./admin-workflows.mjs";
import { normalizePublicLeadInput } from "./leads.mjs";
import { applyListingEdits } from "./listing-edits.mjs";
import { legacyArchiveEntryForPath } from "./legacy-archive.mjs";
import { fromRoot } from "./paths.mjs";
import {
  renderHomePage,
  renderGuidePage,
  renderLegacyArchivePage,
  renderListingPreservationPage,
  renderLanguageFallback,
  renderListingPage,
  renderLocationPage,
  renderNotFoundPage,
  renderSearchPage,
  renderSearchUnavailablePage,
  renderOriginUnavailablePage,
  renderContactPage,
  renderSellerPage,
  renderStartPage,
  renderComparePage,
  renderAboutPage,
  renderAlertsPage,
  isActiveListing,
} from "./public-site.mjs";

export { renderSearchUnavailablePage, renderOriginUnavailablePage };
import {
  aboutPath,
  alertsPath,
  comparePath,
  contactPath,
  locationPath,
  listingPath,
  publicLocationNames,
  sellerPath,
  startPath,
} from "./seo.mjs";
import { publicFactValue } from "./listing-facts.mjs";
import { latestTranslationTasks } from "./translation-ledger.mjs";
import { latestTourForListing } from "./tours.mjs";

export const DEFAULT_CMS_SEED_PATH = fromRoot("production", "data", "cms-seed.json");

export function loadCmsSeed(path = DEFAULT_CMS_SEED_PATH) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function listingFromCmsRecord(record, approvedTour = null, property = null) {
  const canonicalProperty = Boolean(property);
  const publicProperty = publicPropertyProjection(property);
  const propertyFacts = property?.facts || {};
  const propertyVerification = property?.fact_verification || [];
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
    title: record.facts.title || record.seo.title,
    description: record.facts.description || record.seo.description,
    h1: record.facts.h1,
    location: record.facts.location,
    location_native: record.facts.location_native || "",
    location_legacy: record.facts.location_legacy || record.facts.location || "",
    municipality: record.facts.municipality || "",
    municipality_code: record.facts.municipality_code || "",
    district: record.facts.district || "",
    district_code: record.facts.district_code || "",
    region: record.facts.region || "",
    region_id: record.facts.region_id || "",
    country_code: record.facts.country_code || "",
    geography_id: record.facts.geography_id || "",
    geography_path: Array.isArray(record.facts.geography_path) ? record.facts.geography_path : [],
    settlement_ekatte: record.facts.settlement_ekatte || "",
    location_review_status: record.facts.location_review_status || "legacy_area_only",
    property_type: property?.property_family || record.facts.property_type,
    property_family: property?.property_family || null,
    property_subtype: property?.property_subtype || null,
    offer_type: record.facts.offer_type,
    listing_status: record.facts.listing_status || "available",
    bedrooms: canonicalProperty ? publicProperty?.bedrooms ?? null : record.facts.bedrooms,
    bedrooms_count: canonicalProperty ? publicProperty?.bedrooms ?? null : null,
    bedrooms_not_applicable: canonicalProperty ? publicProperty?.bedrooms_not_applicable === true : record.facts.bedrooms_not_applicable === true,
    area_sqm: canonicalProperty ? publicProperty?.area_sqm ?? null : record.facts.area_sqm ?? record.facts.area ?? null,
    primary_area_sqm: canonicalProperty ? publicProperty?.area_sqm ?? null : null,
    living_area_sqm: canonicalProperty ? publicFactValue(propertyFacts, propertyVerification, "living_area_sqm") : null,
    built_area_sqm: canonicalProperty ? publicFactValue(propertyFacts, propertyVerification, "built_area_sqm") : null,
    usable_area_sqm: canonicalProperty ? publicFactValue(propertyFacts, propertyVerification, "usable_area_sqm") : null,
    gross_floor_area_sqm: canonicalProperty ? publicFactValue(propertyFacts, propertyVerification, "gross_floor_area_sqm") : null,
    floor: canonicalProperty ? publicProperty?.floor ?? null : record.facts.floor ?? null,
    floor_number: canonicalProperty ? publicProperty?.floor ?? null : null,
    total_floors: canonicalProperty ? publicProperty?.total_floors ?? null : record.facts.total_floors ?? null,
    storeys_count: canonicalProperty ? publicFactValue(propertyFacts, propertyVerification, "storeys_count") : null,
    land_area_sqm: canonicalProperty ? publicProperty?.land_area_sqm ?? null : record.facts.land_area_sqm ?? null,
    premises_count: canonicalProperty ? publicFactValue(propertyFacts, propertyVerification, "premises_count") : null,
    hotel_room_count: canonicalProperty ? publicFactValue(propertyFacts, propertyVerification, "hotel_room_count") : null,
    parking_kind: canonicalProperty ? publicFactValue(propertyFacts, propertyVerification, "parking_kind") : null,
    construction_status: canonicalProperty ? publicFactValue(propertyFacts, propertyVerification, "construction_status") : null,
    condition: canonicalProperty ? publicProperty?.condition || "" : record.facts.condition || "",
    public_location_precision: canonicalProperty ? publicProperty?.location_precision ?? null : null,
    location_precision: canonicalProperty ? publicProperty?.location_precision ?? null : record.facts.location_precision || "approximate",
    public_coordinates: canonicalProperty ? publicProperty?.public_coordinates || null : null,
    source_stated_facts: canonicalProperty ? publicProperty?.source_stated_facts || [] : [],
    price_eur: record.facts.price_on_request === true ? null : record.facts.price_eur,
    price_on_request: record.facts.price_on_request === true,
    image_count: record.facts.image_count,
    thumbnail_url: record.facts.thumbnail_url || "",
    thumbnail_alt: record.facts.thumbnail_alt || "",
    media: record.media || [],
    media_workflow: record.media_workflow || null,
    tour: approvedTour || record.tour || null,
    word_count: record.facts.word_count,
    schema_present: record.seo.schema_present,
    workflow: record.workflow || {},
    seo: {
      title: record.seo.title || "",
      description: record.seo.description || "",
      canonical_override: record.seo.canonical_override || "",
      og_title: record.seo.og_title || "",
      og_description: record.seo.og_description || "",
      robots: record.seo.robots || "",
      human_approved: record.seo.human_approved === true,
      reviewer: record.seo.reviewer || null,
      reviewed_at: record.seo.reviewed_at || null,
    },
  };
}

function listingRecords(seed) {
  return seed.records.filter((record) => record.collection === "listings");
}

function propertyForRecord(seed, record) {
  if (record?.property && typeof record.property === "object") return record.property;
  const propertyId = String(record?.property || "").trim();
  if (!propertyId) return null;
  return (seed.properties || []).find((property) => property.id === propertyId) || null;
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
  return publicLocationNames(listingRecords(seed).map((record) => listingFromCmsRecord(record)));
}

function optionalFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function listingFromPostgresSearchDocument(record, listing) {
  const document = record.public_search_document;
  if (!document) return listing;
  const latitude = optionalFiniteNumber(document.public_latitude);
  const longitude = optionalFiniteNumber(document.public_longitude);
  const publicCoordinates =
    latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
      ? { latitude, longitude }
      : null;
  const priceAmount = optionalFiniteNumber(document.price_amount);
  const area = optionalFiniteNumber(document.primary_area_sqm);
  const bedrooms = optionalFiniteNumber(document.bedrooms_count);
  const location = document.location_label || document.municipality || document.district || "";
  return {
    ...listing,
    id: document.source_listing_id,
    locale: document.locale,
    language: document.locale,
    locale_path: document.locale_path,
    translation_status: "published",
    title: document.title,
    h1: document.title,
    description: document.description || document.title,
    location,
    location_native: location,
    location_legacy: location,
    municipality: document.municipality || "",
    district: document.district || "",
    region_id: document.region_id || "",
    country_code: document.country_code || "",
    geography_id: document.geography_id || "",
    geography_path: Array.isArray(document.geography_path) ? document.geography_path : [],
    location_review_status: document.geography_id ? "confirmed_settlement" : "verified_area",
    property_type: document.property_family || document.property_subtype || "property",
    property_family: document.property_family || null,
    property_subtype: document.property_subtype || null,
    offer_type: document.offer_type || "sale",
    listing_status: document.listing_status || "available",
    bedrooms,
    bedrooms_count: bedrooms,
    bedrooms_not_applicable: false,
    area_sqm: area,
    primary_area_sqm: area,
    condition: document.condition || "",
    price_eur:
      document.price_currency === "EUR" && document.price_on_request !== true ? priceAmount : null,
    price_on_request: document.price_on_request === true,
    location_precision: document.public_location_precision || null,
    public_location_precision: document.public_location_precision || null,
    public_coordinates: publicCoordinates,
  };
}

function runtimeListings(seed, translationTasks = []) {
  return listingRecords(seed).map((record) => {
    const listing = listingFromCmsRecord(record, null, propertyForRecord(seed, record));
    return {
      ...listingFromPostgresSearchDocument(record, listing),
      translations: mergeRuntimeTranslations(record, translationTasks),
    };
  });
}

export function resolveRuntimePath(registry, seed, pathname, translationTasks = [], tourApprovals = []) {
  const normalized = pathname.replace(/\/$/, "");
  const legacyArchive = legacyArchiveEntryForPath(normalized);
  if (legacyArchive) return { type: "legacy_archive", entry: legacyArchive, path: normalized };

  for (const record of listingRecords(seed)) {
    const translations = mergeRuntimeTranslations(record, translationTasks);
    const fallbackLocale = registry.locales.find((locale) => {
      if (!locale.public_enabled || !locale.indexable) return false;
      try {
        return listingPath(registry, locale.code, record.id) === normalized;
      } catch {
        return false;
      }
    })?.code;
    const matchedLocale =
      record.routing?.target_path === normalized
        ? record.routing.target_locale
        : translations.find((translation) => translationPathMatches(registry, record, translation, normalized))?.locale || fallbackLocale;
    if (!matchedLocale) continue;
    return {
      type: "listing",
      record,
      listing: listingFromCmsRecord(record, latestTourForListing(tourApprovals, record.id), propertyForRecord(seed, record)),
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

  const startLocale = registry.locales.find((locale) => {
    try {
      return startPath(registry, locale.code) === normalized;
    } catch {
      return false;
    }
  });
  if (startLocale) return { type: "start", localeCode: startLocale.code };

  // Package P4 routes: compare, about and alerts.
  for (const [type, resolvePath] of [
    ["compare", comparePath],
    ["about", aboutPath],
    ["alerts", alertsPath],
  ]) {
    const match = registry.locales.find((locale) => {
      try {
        return resolvePath(registry, locale.code) === normalized;
      } catch {
        return false;
      }
    });
    if (match) return { type, localeCode: match.code };
  }

  const contactLocale = registry.locales.find((locale) => {
    try {
      return contactPath(registry, locale.code) === normalized;
    } catch {
      return false;
    }
  });
  if (contactLocale) return { type: "contact", localeCode: contactLocale.code };

  const guideDocuments = approvedContentDocumentsForPath(readApprovedCmsContent(), normalized);
  if (guideDocuments.length) {
    return {
      type: "guide",
      localeCode: guideDocuments[0].locale,
      path: normalized,
      documents: guideDocuments,
    };
  }

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

export function renderRuntimePath(
  registry,
  seed,
  pathname,
  translationTasks = [],
  brokerContacts = [],
  tourApprovals = [],
  preservationCatalog = [],
  // `searchParams` (URLSearchParams or a plain object) lets query-driven pages
  // such as the buyer onboarding finish step render without JavaScript.
  { searchParams = null } = {},
) {
  const resolved = resolveRuntimePath(registry, seed, pathname, translationTasks, tourApprovals);
  const listings = () => runtimeListings(seed, translationTasks);
  if (resolved.type === "listing") {
    const view = resolved.listing;
    return renderListingPage({
      registry,
      listing: resolved.listing,
      localeCode: resolved.localeCode,
      translations: mergeRuntimeTranslations(resolved.record, translationTasks),
      brokerContact: latestApprovedBrokerContact(brokerContacts, resolved.record.id),
      relatedListings: listings().filter((candidate) => {
        const sameLocation = candidate.location && candidate.location === view.location;
        return sameLocation && candidate.id !== view.id && isActiveListing(candidate);
      }),
    });
  }
  if (resolved.type === "language_fallback") {
    return renderLanguageFallback({ registry, requestedLocale: resolved.localeCode });
  }
  if (resolved.type === "home") {
    return renderHomePage({
      registry,
      localeCode: resolved.localeCode,
      listings: listings(),
    });
  }
  if (resolved.type === "seller") {
    return renderSellerPage({ registry, localeCode: resolved.localeCode });
  }
  if (resolved.type === "start") {
    return renderStartPage({ registry, localeCode: resolved.localeCode, listings: listings(), searchParams });
  }
  if (resolved.type === "compare") {
    return renderComparePage({ registry, localeCode: resolved.localeCode, listings: listings(), searchParams });
  }
  if (resolved.type === "about") {
    return renderAboutPage({ registry, localeCode: resolved.localeCode });
  }
  if (resolved.type === "alerts") {
    return renderAlertsPage({ registry, localeCode: resolved.localeCode });
  }
  if (resolved.type === "contact") {
    return renderContactPage({ registry, localeCode: resolved.localeCode });
  }
  if (resolved.type === "guide") {
    return renderGuidePage({
      registry,
      localeCode: resolved.localeCode,
      path: resolved.path,
      documents: resolved.documents,
    });
  }
  if (resolved.type === "legacy_archive") {
    return renderLegacyArchivePage({ registry, entry: resolved.entry, path: resolved.path });
  }
  if (resolved.type === "location") {
    return renderLocationPage({
      registry,
      localeCode: resolved.localeCode,
      location: resolved.location,
      listings: listings(),
    });
  }
  if (resolved.type === "not_found") {
    const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    const preserved = preservationCatalog.find((entry) => entry.target_path === normalized);
    if (preserved) return renderListingPreservationPage({ registry, entry: preserved, path: normalized });
  }
  return renderNotFoundPage({ registry, path: pathname });
}

export function searchRuntimeListings(
  registry,
  seed,
  {
    localeCode,
    query = "",
    filters = {},
    sort = "recommended",
    page = 1,
    pageSize = 12,
    savedView = false,
    view = "list",
    translationTasks = [],
    databasePage = false,
    totalMatches = null,
  },
) {
  return renderSearchPage({
    registry,
    localeCode,
    listings: runtimeListings(seed, translationTasks),
    query,
    filters,
    sort,
    page,
    pageSize,
    savedView,
    view,
    databasePage,
    totalMatches,
  });
}

export function submitRuntimeLead(registry, seed, input) {
  const source = input.source || "website_listing_detail";
  const record = listingRecords(seed).find((candidate) => candidate.id === input.listingReference);
  const listingLeadType = record?.facts?.offer_type === "rent" ? "renter" : record ? "buyer" : input.leadType;
  const property = record
    ? {
        ...(input.property || {}),
        location: record.facts.location,
        type: record.facts.property_type,
        bedrooms: record.facts.bedrooms ?? input.property?.bedrooms,
      }
    : input.property;
  const leadInput = normalizePublicLeadInput({ ...input, property, source, leadType: listingLeadType });
  if (!record && ["website_listing_detail", "website_search_result", "website_callback_request", "website_viewing_request"].includes(source)) {
    throw new Error("Listing lead requires a known listingReference");
  }
  return createCrmInboxItem(registry, {
    ...leadInput,
    listingContext: record
      ? { location: record.facts.location, property_type: record.facts.property_type, offer_type: record.facts.offer_type }
      : leadInput.listingContext,
  });
}

export function buildRuntimeSmoke(registry, seed) {
  const listing = listingRecords(seed).find((record) => record.id === "MS-CRAWL-0001");
  const ruListing = listingRecords(seed).find((record) => record.source_locale === "ru");
  const runtimeListing = listingFromCmsRecord(listing, null, propertyForRecord(seed, listing));
  const soldSeed = applyListingEdits(seed, [{ listing_id: listing.id, patch: { listing_status: "sold" } }]);

  return {
    fixture_id: "runtime-smoke-20260704",
    listing_he: renderRuntimePath(registry, seed, "/he/properties/MS-CRAWL-0001"),
    listing_en_fallback: renderRuntimePath(registry, seed, "/en/properties/MS-CRAWL-0001"),
    listing_ru: renderRuntimePath(registry, seed, ruListing.routing.target_path),
    home_he: renderRuntimePath(registry, seed, "/he/"),
    seller_he: renderRuntimePath(registry, seed, "/he/sell"),
    contact_he: renderRuntimePath(registry, seed, "/he/contact"),
    guide_en: renderRuntimePath(registry, seed, "/en/guides/foreign-buyers"),
    location_he: renderRuntimePath(registry, seed, "/he/locations/sandanski"),
    sold_listing_he: renderRuntimePath(registry, soldSeed, "/he/properties/MS-CRAWL-0001"),
    sold_search_he: searchRuntimeListings(registry, soldSeed, { localeCode: "he", query: "Sandanski" }),
    sold_location_he: renderRuntimePath(registry, soldSeed, "/he/locations/sandanski"),
    fallback_fr: renderRuntimePath(registry, seed, "/fr/"),
    search_he: searchRuntimeListings(registry, seed, { localeCode: "he", query: "Sandanski" }),
    lead_he: submitRuntimeLead(registry, seed, {
      id: "runtime-lead-he-0001",
      source: "website_listing_detail",
      leadType: "buyer",
      language: "he",
      listingReference: runtimeListing.id,
      contact: { name: "Noa Levi", whatsapp: "+359880000001" },
      contact_preference: "whatsapp",
      message: "Interested in this property.",
    }),
    viewingLead_he: submitRuntimeLead(registry, seed, {
      id: "runtime-viewing-lead-he-0001",
      source: "website_viewing_request",
      leadType: "buyer",
      language: "he",
      listingReference: runtimeListing.id,
      contact: { name: "Noa Levi", phone: "+359880000001" },
      contact_preference: "phone",
      request_details: { viewing_date: "2026-07-20", viewing_time: "14:00" },
      message: "I would like to view this property.",
    }),
    contactLead_he: submitRuntimeLead(registry, seed, {
      id: "runtime-contact-lead-he-0001",
      source: "website_contact_callback",
      leadType: "general",
      language: "he",
      contact: { name: "Noa Levi", phone: "+359880000001" },
      contact_preference: "phone",
      request_details: { callback_time: "Weekdays after 14:00" },
      message: "Please call me about buying in Sandanski.",
    }),
  };
}

export function assertRuntimeSmoke(smoke) {
  const contactLeadUiDisabled = smoke.contact_he?.chrome?.lead_writes_disabled === true;
  const contactLeadUiValid = contactLeadUiDisabled
    ? smoke.contact_he?.body?.callback === null && Boolean(smoke.contact_he?.body?.form_unavailable)
    : smoke.contact_he?.body?.callback?.payload?.source === "website_contact_callback" &&
      smoke.contact_he?.body?.callback?.payload?.leadType === "general";
  // The seller valuation page follows the same durable-store readiness rule as
  // the contact page: either a submittable intake, or an explicit unavailable
  // notice — never a form the edge will reject.
  const sellerLeadUiDisabled = smoke.seller_he?.chrome?.lead_writes_disabled === true;
  const sellerLeadUiValid = sellerLeadUiDisabled
    ? smoke.seller_he?.body?.valuation === null &&
      smoke.seller_he?.body?.callback === null &&
      Boolean(smoke.seller_he?.body?.form_unavailable) &&
      Boolean(smoke.seller_he?.body?.contact_channels?.phone?.href)
    : smoke.seller_he?.body?.valuation?.payload?.source === "website_seller_valuation";
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
  if (
    smoke.listing_en_fallback.status !== 200 ||
    smoke.listing_en_fallback.kind !== "listing" ||
    smoke.listing_en_fallback.fallback.active !== true ||
    smoke.listing_en_fallback.indexable !== false ||
    smoke.listing_en_fallback.metadata.robots !== "noindex,follow" ||
    smoke.listing_en_fallback.body.content_locale !== "bg"
  ) {
    throw new Error("Runtime search fallback must open a source-language noindex listing page");
  }
  if (smoke.listing_ru.status !== 200 || !smoke.listing_ru.path.startsWith("/ru/")) {
    throw new Error("Runtime Russian listing route missing");
  }
  if (smoke.home_he.status !== 200 || smoke.home_he.kind !== "home" || smoke.home_he.body.search.path !== "/he/search") {
    throw new Error("Runtime Hebrew home must expose search and buyer paths");
  }
  if (smoke.home_he.body.seller.path !== "/he/sell") throw new Error("Runtime Hebrew home must expose seller path");
  if (smoke.fallback_fr.indexable !== false) throw new Error("Runtime French fallback must not be indexable");
  if (smoke.seller_he.status !== 200 || !sellerLeadUiValid) {
    throw new Error("Runtime seller page must match durable lead-store readiness");
  }
  if (
    smoke.contact_he.status !== 200 ||
    smoke.contact_he.kind !== "contact" ||
    !contactLeadUiValid
  ) {
    throw new Error("Runtime contact page must match durable lead-store readiness");
  }
  if (
    smoke.guide_en.status !== 200 ||
    smoke.guide_en.kind !== "guide" ||
    smoke.guide_en.body.sections.length < 2 ||
    !smoke.guide_en.body.sections[0].facts.join(" ").includes("Non-EU buyers cannot own Bulgarian land directly")
  ) {
    throw new Error("Runtime guide page must render approved CMS facts cited by Hermes");
  }
  if (smoke.location_he.status !== 200 || smoke.location_he.kind !== "location" || smoke.location_he.body.location !== "Sandanski") {
    throw new Error("Runtime location page must render reviewed Sandanski inventory");
  }
  if (!smoke.location_he.cards.length || smoke.location_he.cards.some((card) => card.translation_indexable !== true)) {
    throw new Error("Runtime location page must only expose indexable locale cards");
  }
  if (
    smoke.sold_listing_he.status !== 200 ||
    smoke.sold_listing_he.body.lifecycle.active_in_search !== false ||
    smoke.sold_listing_he.body.facts.listing_status !== "sold" ||
    !smoke.sold_listing_he.body.related_listings.length
  ) {
    throw new Error("Runtime sold listing must stay live with related active listings");
  }
  if (
    smoke.sold_search_he.cards.some((card) => card.id === "MS-CRAWL-0001") ||
    smoke.sold_location_he.cards.some((card) => card.id === "MS-CRAWL-0001")
  ) {
    throw new Error("Runtime sold listing must be removed from active search and location inventory");
  }
  if (smoke.search_he.mobile_policy.list_first_mobile !== true) throw new Error("Runtime search must preserve mobile policy");
  if (smoke.lead_he.admin_locale !== "en" || smoke.lead_he.hermes_reply_draft.can_send_without_approval !== false) {
    throw new Error("Runtime lead must route to EN admin queue with broker approval");
  }
  if (smoke.lead_he.contact_preference !== "whatsapp") throw new Error("Runtime lead must preserve contact preference");
  if (
    smoke.lead_he.broker_assignment?.broker_id !== "broker_international" ||
    smoke.lead_he.broker_assignment?.criteria?.location !== "Sandanski"
  ) {
    throw new Error("Runtime lead must assign broker using language and listing facts");
  }
  if (
    smoke.viewingLead_he.lead.source !== "website_viewing_request" ||
    smoke.viewingLead_he.lead.request_details?.viewing_date !== "2026-07-20" ||
    smoke.viewingLead_he.contact_preference !== "phone" ||
    smoke.viewingLead_he.broker_assignment?.broker_id !== "broker_international" ||
    smoke.viewingLead_he.hermes_reply_draft.broker_approval_required !== true
  ) {
    throw new Error("Runtime viewing request lead must stay review-gated in CRM");
  }
  if (
    smoke.contactLead_he.lead.source !== "website_contact_callback" ||
    smoke.contactLead_he.lead.intent !== "callback" ||
    smoke.contactLead_he.lead.leadType !== "general" ||
    smoke.contactLead_he.contact_preference !== "phone" ||
    smoke.contactLead_he.broker_assignment?.broker_id !== "broker_international" ||
    smoke.contactLead_he.hermes_reply_draft.broker_approval_required !== true
  ) {
    throw new Error("Runtime contact callback lead must stay review-gated in CRM");
  }
  if (JSON.stringify(smoke).match(/Sandanski sea|sea destination|Сандански море/i)) {
    throw new Error("Runtime smoke must not introduce Sandanski sea framing");
  }
  return true;
}
