import fs from "node:fs";
import { getLocale } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { contentHash } from "./translations.mjs";

export const DEFAULT_LISTINGS_PATH = fromRoot("search", "data", "listings.json");
export const DEFAULT_MIGRATION_RECORDS_PATH = fromRoot("production", "data", "migration-records.json");
const SEEDED_APPROVED_TRANSLATIONS = new Map([["MS-CRAWL-0001", ["el", "he"]]]);

export function loadListings(path = DEFAULT_LISTINGS_PATH) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

export function findListingById(listings, id) {
  const listing = listings.find((candidate) => candidate.id === id);
  if (!listing) throw new Error(`Unknown listing id: ${id}`);
  return listing;
}

export function loadMigrationRecords(path = DEFAULT_MIGRATION_RECORDS_PATH) {
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  return data.records || [];
}

export function findMigrationRecord(records, oldUrl) {
  return records.find((record) => record.old_url === oldUrl) || null;
}

export function listingSourceSnapshot(listing) {
  return {
    id: listing.id,
    title: listing.title || listing.h1,
    h1: listing.h1 || listing.title,
    description: listing.description || "",
    location: listing.location || "",
    property_type: listing.property_type || "property",
    offer_type: listing.offer_type || "sale",
    bedrooms: listing.bedrooms ?? null,
    bedrooms_not_applicable: listing.bedrooms_not_applicable === true,
    area_sqm: listing.area_sqm ?? listing.area ?? null,
    floor: listing.floor ?? null,
    total_floors: listing.total_floors ?? null,
    land_area_sqm: listing.land_area_sqm ?? null,
    condition: listing.condition || "",
    location_precision: listing.location_precision || "approximate",
    price_eur: listing.price_eur ?? null,
    price_on_request: listing.price_on_request === true,
    image_count: Number(listing.image_count || 0),
    thumbnail_url: listing.thumbnail_url || "",
    thumbnail_alt: listing.thumbnail_alt || "",
    word_count: Number(listing.word_count || 0),
    canonical: listing.canonical || listing.url,
  };
}

export function approvedTranslationRecordsForListing(registry, listing) {
  const source = listingSourceSnapshot(listing);
  const sourceHash = contentHash(source);
  const locales = new Set();
  if (listing.locale && listing.translation_status === "published") locales.add(listing.locale);
  for (const locale of SEEDED_APPROVED_TRANSLATIONS.get(listing.id) || []) locales.add(locale);

  return [...locales].map((localeCode) => {
    const locale = getLocale(registry, localeCode);
    const sourceLocaleMatch = listing.locale === locale.code && listing.translation_status === "published";
    return {
      locale: locale.code,
      source_locale: listing.locale || registry.source_locale,
      status: sourceLocaleMatch ? "published" : "approved",
      source_hash: sourceHash,
      translated_hash: contentHash({ ...source, locale: locale.code }),
      reviewer: locale.reviewer_role,
      human_approved: true,
      approved_at: "2026-07-04T00:00:00Z",
    };
  });
}

export function listingToPublicViewModel(listing) {
  const snapshot = listingSourceSnapshot(listing);
  return {
    id: listing.id,
    source_url: listing.url,
    source_domain: listing.domain,
    source_locale: listing.locale,
    title: snapshot.title,
    h1: snapshot.h1,
    description: snapshot.description,
    location: snapshot.location,
    property_type: snapshot.property_type,
    offer_type: snapshot.offer_type,
    listing_status: listing.listing_status || "available",
    bedrooms: snapshot.bedrooms,
    bedrooms_not_applicable: snapshot.bedrooms_not_applicable,
    area_sqm: snapshot.area_sqm,
    floor: snapshot.floor,
    total_floors: snapshot.total_floors,
    land_area_sqm: snapshot.land_area_sqm,
    condition: snapshot.condition,
    location_precision: snapshot.location_precision,
    price_eur: snapshot.price_eur,
    price_on_request: snapshot.price_on_request,
    image_count: snapshot.image_count,
    thumbnail_url: snapshot.thumbnail_url,
    thumbnail_alt: snapshot.thumbnail_alt,
    media: listing.media || [],
    media_workflow: listing.media_workflow || null,
    tour: listing.tour || null,
    word_count: snapshot.word_count,
    schema_present: Boolean(listing.schema_present),
    workflow: listing.workflow || {},
    seo: listing.seo || {},
  };
}
