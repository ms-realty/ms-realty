import type { SearchCriteria } from "@/domain/search/filters";
import { readFilters } from "./query";

/** Every accepted supported criterion is serialized; no hidden prose query is added. */
export function criteriaFilters(criteria: SearchCriteria) {
  const bound = (value: number | undefined, unit = 1) =>
    value === undefined ? "" : String(value / unit);
  return readFilters({
    purpose: criteria.purpose,
    type: criteria.propertyTypes?.join(","),
    places: criteria.placeIds?.join(","),
    features: criteria.mustHave?.join(","),
    currency: criteria.price?.currency,
    minPrice: bound(criteria.price?.min, 100),
    maxPrice: bound(criteria.price?.max, 100),
    minBeds: bound(criteria.bedrooms?.min),
    maxBeds: bound(criteria.bedrooms?.max),
    minRooms: bound(criteria.rooms?.min),
    maxRooms: bound(criteria.rooms?.max),
    areaBasis: criteria.area?.basis,
    minArea: bound(criteria.area?.min),
    maxArea: bound(criteria.area?.max),
    includeUnconfirmed: criteria.includeNeedsConfirmation ? "1" : "",
  });
}
