import { normalizeSearchIntent, searchIntentToQueryFilters } from "./search-intent.mjs";

export const SEARCH_FILTER_FIELDS = [
  "location",
  "municipality",
  "location_id",
  "location_ids",
  "property_family",
  "property_families",
  "property_type",
  "property_subtype",
  "offer_type",
  "status",
  "price_min",
  "price_max",
  "bedrooms_min",
  "bedrooms_max",
  "premises_min",
  "hotel_rooms_min",
  "area_min",
  "area_max",
  "land_area_min",
  "land_area_max",
  "floor_min",
  "floor_max",
  "storeys_min",
  "storeys_max",
  "exact_reference",
];

export function searchFiltersFromObject(input = {}) {
  const filters = {};
  for (const field of SEARCH_FILTER_FIELDS) {
    const value = input[field];
    if (value !== undefined && value !== null && value !== "") filters[field] = value;
  }
  return filters;
}

export function searchFiltersFromParams(params) {
  return searchFiltersFromObject(Object.fromEntries(params));
}

export function searchIntentFromObject(input = {}, options = {}) {
  return normalizeSearchIntent(input, options);
}

export function searchIntentFromParams(params, options = {}) {
  return searchIntentFromObject(Object.fromEntries(params), options);
}

export function searchFiltersForIntent(intent) {
  return searchIntentToQueryFilters(intent);
}

export function searchPageFromParams(params) {
  const page = Number(params.get("page") || 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}
