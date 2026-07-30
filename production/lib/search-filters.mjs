export const SEARCH_FILTER_FIELDS = [
  "location",
  "country_code",
  "geography_id",
  "region_id",
  "municipality",
  "district",
  "property_type",
  "offer_type",
  "status",
  "price_min",
  "price_max",
  "bedrooms_min",
  "area_min",
  "area_max",
];

export function searchFiltersFromObject(input = {}) {
  const filters = {};
  for (const field of SEARCH_FILTER_FIELDS) {
    const value = input[field];
    if (value) filters[field] = value;
  }
  return filters;
}

export function searchFiltersFromParams(params) {
  return searchFiltersFromObject(Object.fromEntries(params));
}

export function searchPageFromParams(params) {
  const page = Number(params.get("page") || 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}
