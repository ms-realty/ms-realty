import fs from "node:fs";
import {
  factVerificationFor,
  primaryAreaFieldFor,
  publicFactIsSourceStated,
  publicFactValue,
  publicPrimaryAreaSqm,
} from "./listing-facts.mjs";
import { getLocale } from "./locales.mjs";
import { fromRoot } from "./paths.mjs";
import { contentHash } from "./translations.mjs";

export const DEFAULT_LISTINGS_PATH = fromRoot("search", "data", "listings.json");
export const DEFAULT_MIGRATION_RECORDS_PATH = fromRoot("production", "data", "migration-records.json");

function translationText(value) {
  return String(value || "").trim();
}

export function listingTranslationCopy(translation) {
  const copy = {
    title: translationText(translation?.title),
    description: translationText(translation?.description),
    seo_title: translationText(translation?.seo_title),
    meta_description: translationText(translation?.meta_description),
  };
  if (Object.values(copy).some((value) => !value)) return null;
  if (translation?.translated_hash && translation.translated_hash !== contentHash(copy)) return null;
  return copy;
}

export function publicationAuthorizedListingTranslationCopy(translation) {
  const authorizedAt = translationText(translation?.publication_authorized_at);
  if (
    !translationText(translation?.publication_authorized_by) ||
    !authorizedAt ||
    Number.isNaN(Date.parse(authorizedAt))
  ) {
    return null;
  }
  return listingTranslationCopy(translation);
}

export function publishedListingTranslationCopy(translation) {
  const approvedAt = translationText(translation?.approved_at);
  const authorizedAt = translationText(translation?.publication_authorized_at);
  const publishedAt = translationText(translation?.published_at);
  if (
    translation?.status !== "published" ||
    (translation?.translation_state && translation.translation_state !== "published") ||
    translation?.public_indexable !== true ||
    translation?.human_approved !== true ||
    !translationText(translation?.reviewer) ||
    !translationText(translation?.content_origin) ||
    !translationText(translation?.publication_authorized_by) ||
    [approvedAt, authorizedAt, publishedAt].some((value) => !value || Number.isNaN(Date.parse(value)))
  ) {
    return null;
  }
  return publicationAuthorizedListingTranslationCopy(translation);
}

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

// The listing page groups several property facts under one row: an area lands
// under `area_sqm` whichever of the four area fields carried it, and a storey
// count reads as `floor` beside a floor number and as `storeys` without one.
// The projection resolves that here so the renderer only has to ask which rows
// carry a figure nobody has checked yet.
function sourceStatedFactRows(facts, verification) {
  const stated = (field) => publicFactIsSourceStated(facts, verification, field);
  const rows = new Set();
  if (stated("bedrooms_count")) rows.add("bedrooms");
  const areaField = primaryAreaFieldFor(facts);
  if (areaField && stated(areaField)) rows.add("area_sqm");
  if (stated("land_area_sqm")) rows.add("land_area_sqm");
  if (stated("condition")) rows.add("condition");
  const floorPublished = publicFactValue(facts, verification, "floor_number") !== null;
  if (stated("floor_number") || (floorPublished && stated("total_floors"))) rows.add("floor");
  if (!floorPublished && stated("total_floors")) rows.add("storeys");
  return [...rows].sort();
}

export function publicPropertyProjection(property) {
  if (!property?.facts || !Array.isArray(property.fact_verification)) return null;
  const facts = {
    ...property.facts,
    property_family: property.property_family || property.facts.property_family,
    property_subtype: property.property_subtype || property.facts.property_subtype,
  };
  const verification = property.fact_verification;
  const latitude = publicFactValue(facts, verification, "public_latitude");
  const longitude = publicFactValue(facts, verification, "public_longitude");
  const publicCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  const bedroomsVerification = factVerificationFor("bedrooms_count", verification);
  const primaryArea = publicPrimaryAreaSqm(facts, verification);
  return {
    property_family: property.property_family || null,
    property_subtype: property.property_subtype || null,
    bedrooms: publicFactValue(facts, verification, "bedrooms_count"),
    bedrooms_count: publicFactValue(facts, verification, "bedrooms_count"),
    bedrooms_not_applicable: bedroomsVerification.state === "not_applicable",
    area_sqm: primaryArea,
    primary_area_sqm: primaryArea,
    living_area_sqm: publicFactValue(facts, verification, "living_area_sqm"),
    built_area_sqm: publicFactValue(facts, verification, "built_area_sqm"),
    usable_area_sqm: publicFactValue(facts, verification, "usable_area_sqm"),
    gross_floor_area_sqm: publicFactValue(facts, verification, "gross_floor_area_sqm"),
    premises_count: publicFactValue(facts, verification, "premises_count"),
    hotel_room_count: publicFactValue(facts, verification, "hotel_room_count"),
    floor: publicFactValue(facts, verification, "floor_number"),
    floor_number: publicFactValue(facts, verification, "floor_number"),
    total_floors: publicFactValue(facts, verification, "total_floors"),
    storeys_count: publicFactValue(facts, verification, "storeys_count"),
    land_area_sqm: publicFactValue(facts, verification, "land_area_sqm"),
    condition: publicFactValue(facts, verification, "condition") || "",
    parking_kind: publicFactValue(facts, verification, "parking_kind"),
    construction_status: publicFactValue(facts, verification, "construction_status"),
    location_precision: publicFactValue(facts, verification, "public_location_precision"),
    public_coordinates: publicCoordinates,
    source_stated_facts: sourceStatedFactRows(facts, verification),
  };
}

export function listingSourceSnapshot(listing) {
  return {
    id: listing.id,
    title: listing.title || listing.h1,
    h1: listing.h1 || listing.title,
    description: listing.description || "",
    location: listing.location || "",
    location_native: listing.location_native || "",
    location_legacy: listing.location_legacy || listing.location || "",
    municipality: listing.municipality || "",
    municipality_code: listing.municipality_code || "",
    district: listing.district || "",
    district_code: listing.district_code || "",
    region: listing.region || "",
    region_id: listing.region_id || "",
    country_code: listing.country_code || "",
    geography_id: listing.geography_id || "",
    geography_path: Array.isArray(listing.geography_path) ? listing.geography_path : [],
    settlement_ekatte: listing.settlement_ekatte || "",
    location_review_status: listing.location_review_status || "legacy_area_only",
    property_type: listing.property_type || "property",
    offer_type: listing.offer_type || "sale",
    bedrooms: listing.bedrooms ?? null,
    bedrooms_not_applicable: listing.bedrooms_not_applicable === true,
    area_sqm: listing.area_sqm ?? listing.area ?? null,
    floor: listing.floor ?? null,
    total_floors: listing.total_floors ?? null,
    land_area_sqm: listing.land_area_sqm ?? null,
    condition: listing.condition || "",
    location_precision: listing.location_precision === undefined ? "approximate" : listing.location_precision,
    price_eur: listing.price_eur ?? null,
    price_on_request: listing.price_on_request === true,
    image_count: Number(listing.image_count || 0),
    thumbnail_url: listing.thumbnail_url || "",
    thumbnail_alt: listing.thumbnail_alt || "",
    word_count: Number(listing.word_count || 0),
    canonical: listing.canonical || listing.url,
    source_stated_facts: Array.isArray(listing.source_stated_facts) ? listing.source_stated_facts : [],
  };
}

export function approvedTranslationRecordsForListing(registry, listing) {
  const source = listingSourceSnapshot(listing);
  const sourceHash = contentHash(source);
  if (!listing.locale || listing.translation_status !== "published") return [];
  const locale = getLocale(registry, listing.locale);
  const approvedAt = "2026-07-04T00:00:00Z";
  const copy = {
    title: source.h1 || source.title,
    description: source.description || source.h1 || source.title,
    seo_title: source.title || source.h1,
    meta_description: source.description || source.h1 || source.title,
  };
  return [
    {
      locale: locale.code,
      source_locale: listing.locale || registry.source_locale,
      status: "published",
      translation_state: "published",
      source_hash: sourceHash,
      translated_hash: contentHash(copy),
      ...copy,
      translator: null,
      content_origin: "legacy_source_import",
      reviewer: locale.reviewer_role,
      human_approved: true,
      approved_at: approvedAt,
      publication_authorized_by: locale.reviewer_role,
      publication_authorized_at: approvedAt,
      published_at: approvedAt,
      public_indexable: true,
      citations: [listing.url].filter(Boolean),
    },
  ];
}

export function listingToPublicViewModel(listing) {
  const snapshot = listingSourceSnapshot(listing);
  return {
    id: listing.id,
    lot_number: listing.lot_number ?? null,
    lot_suffix: listing.lot_suffix ?? null,
    migration_id: listing.migration_id ?? null,
    legacy_lot_id: listing.legacy_lot_id ?? null,
    merged_into: listing.merged_into ?? null,
    source_url: listing.url,
    source_domain: listing.domain,
    source_locale: listing.locale,
    title: snapshot.title,
    h1: snapshot.h1,
    description: snapshot.description,
    location: snapshot.location,
    location_native: snapshot.location_native,
    location_legacy: snapshot.location_legacy,
    municipality: snapshot.municipality,
    municipality_code: snapshot.municipality_code,
    district: snapshot.district,
    district_code: snapshot.district_code,
    region: snapshot.region,
    region_id: snapshot.region_id,
    country_code: snapshot.country_code,
    geography_id: snapshot.geography_id,
    geography_path: snapshot.geography_path,
    settlement_ekatte: snapshot.settlement_ekatte,
    location_review_status: snapshot.location_review_status,
    property_type: snapshot.property_type,
    property_family: listing.property_family || null,
    property_subtype: listing.property_subtype || null,
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
    public_coordinates: listing.public_coordinates || null,
    price_eur: snapshot.price_eur,
    price_on_request: snapshot.price_on_request,
    // The price the crawl lifted off the legacy page is a figure the source
    // stated, exactly like a bedroom count, and stays one until a broker dates
    // the workflow field. The page labels it the same way.
    price_verified: Boolean(listing.workflow?.price_verified_at),
    source_stated_facts: snapshot.source_stated_facts,
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
