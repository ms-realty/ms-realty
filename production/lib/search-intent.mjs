import { CANONICAL_PROPERTY_FAMILIES, isFactApplicable, taxonomyForLegacyPropertyType } from "./listing-facts.mjs";

export const SEARCH_INTENT_SCHEMA_VERSION = 1;
export const SEARCH_SORTS = Object.freeze(["recommended", "price_asc", "price_desc", "newest"]);
export const SEARCH_STATUSES = Object.freeze(["available", "reserved", "sold", "rented", "archived"]);
export const SEARCH_OFFER_TYPES = Object.freeze(["sale", "rent"]);

const NUMERIC_FIELDS = Object.freeze([
  "price_min",
  "price_max",
  "bedrooms_min",
  "bedrooms_max",
  "premises_min",
  "hotel_rooms_min",
  "primary_area_min",
  "primary_area_max",
  "land_area_min",
  "land_area_max",
  "floor_min",
  "floor_max",
  "storeys_min",
  "storeys_max",
  "page",
  "page_size",
]);

const ARRAY_FIELDS = Object.freeze(["property_families", "property_subtypes", "parking_kinds", "construction_statuses", "location_ids"]);

function values(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalNumber(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} must be a non-negative number`);
  return number;
}

function requiredEnum(value, options, field) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (!options.includes(normalized)) throw new Error(`${field} is not supported`);
  return normalized;
}

function mapBounds(input) {
  if (!input) return null;
  const raw = typeof input === "string" ? input.split(",") : input;
  if (!Array.isArray(raw) || raw.length !== 4) throw new Error("map_bounds must contain west,south,east,north");
  const [west, south, east, north] = raw.map((value) => Number(value));
  if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north) {
    throw new Error("map_bounds must be valid west,south,east,north coordinates");
  }
  return { west, south, east, north };
}

function assertRange(intent, min, max) {
  if (intent[min] !== null && intent[max] !== null && intent[min] > intent[max]) {
    throw new Error(`${min} cannot exceed ${max}`);
  }
}

export function assertSearchIntentCompatibility(intent) {
  if (intent.listing_status && !intent.mandatory_filters.listing_statuses.includes(intent.listing_status)) {
    throw new Error("listing_status conflicts with mandatory public availability filters");
  }
  const families = intent.property_families;
  if (!families.length) return intent;
  const requires = (field, present) => {
    if (present && families.some((family) => !isFactApplicable(family, field))) {
      throw new Error(`${field} is not applicable to the selected property family`);
    }
  };
  requires("bedrooms_count", intent.bedrooms_min !== null || intent.bedrooms_max !== null);
  requires("premises_count", intent.premises_min !== null);
  requires("hotel_room_count", intent.hotel_rooms_min !== null);
  requires("land_area_sqm", intent.land_area_min !== null || intent.land_area_max !== null);
  requires("floor_number", intent.floor_min !== null || intent.floor_max !== null);
  requires("storeys_count", intent.storeys_min !== null || intent.storeys_max !== null);
  return intent;
}

export function normalizeSearchIntent(input = {}, { defaultLocale = "bg" } = {}) {
  const propertyFamilies = values(input.property_families || input.property_family || input.property_type).map((value) => {
    const normalized = String(value).trim().toLowerCase();
    const legacyFamily = taxonomyForLegacyPropertyType(normalized).family;
    if (!CANONICAL_PROPERTY_FAMILIES.includes(normalized) && !legacyFamily) {
      throw new Error("property_families contains an unsupported family");
    }
    return legacyFamily || normalized;
  });
  const intent = {
    schema_version: SEARCH_INTENT_SCHEMA_VERSION,
    locale: String(input.locale || defaultLocale).trim() || defaultLocale,
    text_query: String(input.text_query ?? input.q ?? input.query ?? "").trim(),
    exact_reference: String(input.exact_reference || input.listing_reference || "").trim() || null,
    property_families: [...new Set(propertyFamilies)],
    property_subtypes: [...new Set(values(input.property_subtypes || input.property_subtype))],
    offer_type: requiredEnum(input.offer_type, SEARCH_OFFER_TYPES, "offer_type"),
    listing_status: requiredEnum(input.listing_status || input.status, SEARCH_STATUSES, "listing_status"),
    price_currency: String(input.price_currency || input.currency || "EUR").trim().toUpperCase() || "EUR",
    price_period: String(input.price_period || "").trim() || null,
    parking_kinds: [...new Set(values(input.parking_kinds || input.parking_kind))],
    construction_statuses: [...new Set(values(input.construction_statuses || input.construction_status))],
    has_approved_tour:
      input.has_approved_tour === true || input.has_approved_tour === "true" || input.has_approved_tour === "1" ? true : null,
    location_ids: [...new Set(values(input.location_ids || input.location_id || input.location))],
    country_code: String(input.country_code || "").trim().toUpperCase() || null,
    geography_id: String(input.geography_id || "").trim() || null,
    region_id: String(input.region_id || "").trim() || null,
    municipality: String(input.municipality || "").trim() || null,
    district: String(input.district || "").trim() || null,
    map_bounds: mapBounds(input.map_bounds),
    radius: optionalNumber(input.radius, "radius"),
    sort: requiredEnum(input.sort || "recommended", SEARCH_SORTS, "sort") || "recommended",
    page: Math.max(1, Math.trunc(optionalNumber(input.page, "page") || 1)),
    page_size: Math.min(100, Math.max(1, Math.trunc(optionalNumber(input.page_size || input.per_page, "page_size") || 12))),
    mandatory_filters: Object.freeze({
      publication_state: "published",
      listing_statuses: ["available", "reserved"],
      translation_human_approved: true,
      locale_indexable: true,
    }),
  };
  for (const field of NUMERIC_FIELDS) {
    if (field === "page" || field === "page_size") continue;
    intent[field] = optionalNumber(input[field] ?? input[field.replace("primary_area", "area")], field);
  }
  for (const field of ARRAY_FIELDS) intent[field] = intent[field] || [];
  for (const [min, max] of [
    ["price_min", "price_max"],
    ["bedrooms_min", "bedrooms_max"],
    ["primary_area_min", "primary_area_max"],
    ["land_area_min", "land_area_max"],
    ["floor_min", "floor_max"],
    ["storeys_min", "storeys_max"],
  ]) {
    assertRange(intent, min, max);
  }
  return assertSearchIntentCompatibility(intent);
}

export function searchIntentToQueryFilters(intent) {
  const normalized = normalizeSearchIntent(intent, { defaultLocale: intent.locale || "bg" });
  return {
    location: normalized.location_ids[0] || "",
    country_code: normalized.country_code || "",
    geography_id: normalized.geography_id || "",
    region_id: normalized.region_id || "",
    municipality: normalized.municipality || "",
    district: normalized.district || "",
    property_family: normalized.property_families[0] || "",
    property_type: normalized.property_families[0] || "",
    offer_type: normalized.offer_type || "",
    status: normalized.listing_status || "",
    price_min: normalized.price_min ?? "",
    price_max: normalized.price_max ?? "",
    bedrooms_min: normalized.bedrooms_min ?? "",
    bedrooms_max: normalized.bedrooms_max ?? "",
    premises_min: normalized.premises_min ?? "",
    hotel_rooms_min: normalized.hotel_rooms_min ?? "",
    area_min: normalized.primary_area_min ?? "",
    area_max: normalized.primary_area_max ?? "",
    land_area_min: normalized.land_area_min ?? "",
    land_area_max: normalized.land_area_max ?? "",
    floor_min: normalized.floor_min ?? "",
    floor_max: normalized.floor_max ?? "",
    storeys_min: normalized.storeys_min ?? "",
    storeys_max: normalized.storeys_max ?? "",
    exact_reference: normalized.exact_reference || "",
  };
}
