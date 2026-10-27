import type { PublicLocale } from "@/i18n/config";
import { type Filters, filterUrl } from "./query";

export type AppliedCriterion = { id: string; label: string; value: string; href: string };
/** P03/P22: removing one named rule is an explicit first-page GET; other hard rules survive. */
export function appliedCriteria(
  locale: PublicLocale,
  values: Filters,
  names: {
    query: string;
    propertyType: string;
    places: string;
    price: string;
    bedrooms: string;
    rooms: string;
    area: string;
    features: string;
    sort: string;
    unconfirmed: string;
    label: (value: string) => string;
    place: (value: string) => string;
    feature: (value: string) => string;
    range: (min: string, max: string) => string;
  },
): AppliedCriterion[] {
  const rules: AppliedCriterion[] = [];
  const add = (id: string, label: string, value: string, changes: Partial<Filters>) =>
    rules.push({ id, label, value, href: filterUrl(locale, { ...values, ...changes }) });
  if (values.q) add("q", names.query, values.q, { q: "" });
  for (const [key, label, render] of [
    ["type", names.propertyType, names.label],
    ["places", names.places, names.place],
    ["features", names.features, names.feature],
  ] as const) {
    const items = values[key].split(",").filter(Boolean);
    for (const value of items)
      add(`${key}:${value}`, label, render(value), {
        [key]: items.filter((item) => item !== value).join(","),
      });
  }
  if (values.minPrice || values.maxPrice)
    add(
      "price",
      names.price,
      `${names.range(values.minPrice, values.maxPrice)} ${values.currency || "EUR"}`,
      { minPrice: "", maxPrice: "" },
    );
  if (values.minBeds || values.maxBeds)
    add("beds", names.bedrooms, names.range(values.minBeds, values.maxBeds), {
      minBeds: "",
      maxBeds: "",
    });
  if (values.minRooms || values.maxRooms)
    add("rooms", names.rooms, names.range(values.minRooms, values.maxRooms), {
      minRooms: "",
      maxRooms: "",
    });
  if (values.minArea || values.maxArea)
    add("area", names.area, `${names.range(values.minArea, values.maxArea)} m²`, {
      minArea: "",
      maxArea: "",
    });
  if (values.sort && values.sort !== "relevance")
    add("sort", names.sort, names.label(values.sort), { sort: "relevance" });
  if (values.includeUnconfirmed === "1")
    add("unconfirmed", names.unconfirmed, "", { includeUnconfirmed: "" });
  return rules;
}
