import { expect, it } from "vitest";
import { normalizeSearch } from "@/server/search/search";
import { readFilters, searchInput } from "./query";
import { alertSearch, savedAlertCriteria } from "./search-alert-state";

it("carries all committed criteria across public, client and edit URLs without a page cursor", () => {
  const query = {
    purpose: "long_term_rent",
    q: "  Sandanski  ",
    type: "house,apartment",
    places: "32000000-0000-4000-8000-000000000002,32000000-0000-4000-8000-000000000001",
    features: "lift,parking",
    minPrice: "950.03",
    maxPrice: "1500.07",
    currency: "EUR",
    minBeds: "2",
    maxBeds: "3",
    minRooms: "3",
    maxRooms: "5",
    areaBasis: "built",
    minArea: "74.51",
    maxArea: "90.07",
    includeUnconfirmed: "1",
    sort: "price_asc",
    cursor: "page-two",
  };
  const search = alertSearch("he", query);
  expect(search.normalized).toEqual(normalizeSearch(searchInput("he", readFilters(query))));
  for (const href of [search.publicHref, search.clientHref, search.searchHref]) {
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(alertSearch("he", Object.fromEntries(url.searchParams)).normalized).toEqual(
      search.normalized,
    );
    expect(url.searchParams.has("email")).toBe(false);
  }
  expect(search.input).toMatchObject({
    locale: "he",
    q: "Sandanski",
    includeUnconfirmed: true,
    area: { basis: "built", min: 74.51, max: 90.07 },
    price: { currency: "EUR", min: 95003, max: 150007 },
  });
});

it.each([
  { minPrice: "bad" },
  { minBeds: "5", maxBeds: "2" },
  { purpose: ["sale", "long_term_rent"] },
  { includeUnconfirmed: "true" },
])("refuses invalid or ambiguous criteria instead of an empty search: %j", (query) => {
  expect(() => alertSearch("en", query)).toThrow();
});

it("reads complete current stored criteria without taking locale or filters from a status URL", () => {
  const stored = alertSearch("bg", {
    purpose: "long_term_rent",
    q: "Stored search",
    minPrice: "950.03",
    minArea: "74.51",
    areaBasis: "built",
    includeUnconfirmed: "1",
    sort: "price_asc",
  }).normalized;
  expect(savedAlertCriteria({ ...stored, consentLocale: "bg" })).toEqual(stored);
  expect(savedAlertCriteria({ ...stored, criteria: null })).toBeNull();
  expect(
    savedAlertCriteria({ ...stored, criteria: { ...stored.criteria, purpose: "invalid" } }),
  ).toBeNull();
});
