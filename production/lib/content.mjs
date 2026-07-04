import fs from "node:fs";
import { publicIndexableLocales } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { contentHash } from "./translations.mjs";

export const DEFAULT_LISTINGS_PATH = fromRoot("search", "data", "listings.json");
export const DEFAULT_MIGRATION_RECORDS_PATH = fromRoot("production", "data", "migration-records.json");

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
    price_eur: listing.price_eur ?? null,
    image_count: Number(listing.image_count || 0),
    word_count: Number(listing.word_count || 0),
    canonical: listing.canonical || listing.url,
  };
}

export function approvedTranslationRecordsForListing(registry, listing) {
  const source = listingSourceSnapshot(listing);
  const sourceHash = contentHash(source);

  return publicIndexableLocales(registry).map((locale) => {
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
    bedrooms: snapshot.bedrooms,
    price_eur: snapshot.price_eur,
    image_count: snapshot.image_count,
    word_count: snapshot.word_count,
    schema_present: Boolean(listing.schema_present),
  };
}
