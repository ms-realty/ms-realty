import { expect, it } from "vitest";
import { appliedCriteria } from "./applied-criteria";
import { readFilters } from "./query";

const names = {
  query: "Query",
  propertyType: "Type",
  places: "Place",
  price: "Price",
  bedrooms: "Bedrooms",
  rooms: "Rooms",
  area: "Built area",
  features: "Features",
  sort: "Sort",
  unconfirmed: "Unconfirmed",
  label: (x: string) => x,
  place: (x: string) => x,
  feature: (x: string) => x,
  range: (min: string, max: string) => `${min}–${max}`,
};
it("P22 removes one named OR selection without relaxing another hard criterion or carrying a cursor", () => {
  const values = readFilters({
    q: "MS-00001",
    purpose: "long_term_rent",
    type: "house,unsupported",
    minBeds: "3",
    minPrice: "10.20",
    maxPrice: "invalid",
    currency: "USD",
    areaBasis: "built",
    minArea: "55",
    sort: "price_desc",
  });
  const rules = appliedCriteria("he", values, names);
  const target = new URL(
    rules.find((rule) => rule.id === "type:unsupported")?.href ?? "",
    "https://example.test",
  );
  expect(target.pathname).toBe("/he/properties");
  expect(Object.fromEntries(target.searchParams)).toMatchObject({
    type: "house",
    purpose: "long_term_rent",
    q: "MS-00001",
    minBeds: "3",
    maxPrice: "invalid",
    currency: "USD",
    sort: "price_desc",
  });
  expect(target.searchParams.has("cursor")).toBe(false);
  const price = new URL(rules.find((rule) => rule.id === "price")?.href ?? "", target);
  expect(price.searchParams.has("minPrice")).toBe(false);
  expect(price.searchParams.has("maxPrice")).toBe(false);
  expect(price.searchParams.get("currency")).toBe("USD");
});
