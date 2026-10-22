import type { PublicLocale } from "@/i18n/config";

export type QueryParams = Record<string, string | string[] | undefined>;
export const filterNames = [
  "q",
  "purpose",
  "type",
  "minPrice",
  "maxPrice",
  "minBeds",
  "maxBeds",
  "minRooms",
  "maxRooms",
  "places",
  "features",
  "currency",
  "areaBasis",
  "minArea",
  "maxArea",
  "sort",
  "includeUnconfirmed",
] as const;
export type Filters = Record<(typeof filterNames)[number], string>;
export function readFilters(params: QueryParams): Filters {
  return Object.fromEntries(
    filterNames.map((key) => [
      key,
      Array.isArray(params[key])
        ? ["type", "places", "features"].includes(key)
          ? params[key].join(",")
          : (params[key][0] ?? "")
        : (params[key] ?? ""),
    ]),
  ) as Filters;
}
function number(value: string, scale = 1): number | undefined {
  if (!value) return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return Number.NaN;
  return scale === 100 ? Math.round(Number(value) * scale) : Number(value);
}
/** Raw values remain visible when validation fails; no invalid hard filter is dropped. */
export function searchInput(locale: PublicLocale, filters: Filters, cursor?: string) {
  return {
    locale,
    purpose: filters.purpose || "sale",
    q: filters.q,
    sort: filters.sort || "relevance",
    ...(filters.type ? { propertyTypes: filters.type.split(",") } : {}),
    ...(filters.places ? { placeIds: filters.places.split(",") } : {}),
    ...(filters.features ? { mustHave: filters.features.split(",") } : {}),
    ...(filters.minPrice || filters.maxPrice
      ? {
          price: {
            currency: filters.currency || "EUR",
            min: number(filters.minPrice, 100),
            max: number(filters.maxPrice, 100),
          },
        }
      : {}),
    ...(filters.minBeds || filters.maxBeds
      ? { bedrooms: { min: number(filters.minBeds), max: number(filters.maxBeds) } }
      : {}),
    ...(filters.minRooms || filters.maxRooms
      ? { rooms: { min: number(filters.minRooms), max: number(filters.maxRooms) } }
      : {}),
    ...(filters.minArea || filters.maxArea
      ? {
          area: {
            basis: filters.areaBasis || "living",
            min: number(filters.minArea),
            max: number(filters.maxArea),
          },
        }
      : {}),
    includeUnconfirmed: filters.includeUnconfirmed === "1",
    ...(cursor ? { cursor } : {}),
  };
}
export function filterUrl(locale: PublicLocale, filters: Filters, cursor?: string) {
  const query = new URLSearchParams();
  for (const key of filterNames) if (filters[key]) query.set(key, filters[key]);
  if (cursor) query.set("cursor", cursor);
  return `/${locale}/properties${query.size ? `?${query}` : ""}`;
}

export function ambiguousFilters(params: QueryParams) {
  return (
    [...filterNames, "cursor"].some(
      (key) => !["type", "places", "features"].includes(key) && Array.isArray(params[key]),
    ) || ![undefined, "", "1"].includes(params.includeUnconfirmed as string | undefined)
  );
}
