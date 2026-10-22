import { describe, expect, it } from "vitest";
import { normalizeSearch } from "@/server/search/search";
import { discoveryCopy } from "./copy";
import { priceText } from "./presentation";
import { ambiguousFilters, filterUrl, readFilters, searchInput } from "./query";

describe("P02 committed search and exact public facts", () => {
  it("keeps explicit currency, rental purpose, area basis and fractional values through URL refresh", () => {
    const filters = readFilters({
      purpose: "long_term_rent",
      minPrice: "250.35",
      minArea: "42.75",
      areaBasis: "built",
      q: "MS-12345",
      includeUnconfirmed: "1",
    });
    const query = normalizeSearch(searchInput("en", filters));
    expect(query.criteria).toMatchObject({
      purpose: "long_term_rent",
      price: { currency: "EUR", min: 25035 },
      area: { basis: "built", min: 42.75 },
      includeNeedsConfirmation: true,
    });
    const url = new URL(filterUrl("en", filters), "https://example.test");
    expect(readFilters(Object.fromEntries(url.searchParams))).toEqual(filters);
  });
  it.each([
    { minPrice: "-1" },
    { minPrice: "NaN" },
    { minPrice: "500", maxPrice: "400" },
    { minBeds: "1.25" },
    { type: "fabricated-type" },
  ])("does not silently relax invalid hard filters %j", (params) => {
    const filters = readFilters(params);
    expect(() => normalizeSearch(searchInput("bg", filters))).toThrow();
    for (const [key, value] of Object.entries(params))
      expect(filters[key as keyof typeof filters]).toBe(value);
  });
  it("rejects ambiguous repeated parameters and unknown confirmation states", () => {
    expect(ambiguousFilters({ purpose: ["sale", "long_term_rent"] })).toBe(true);
    expect(ambiguousFilters({ includeUnconfirmed: "yes" })).toBe(true);
    expect(ambiguousFilters({ includeUnconfirmed: "1" })).toBe(false);
  });
  it("does not turn unknown or withheld prices into zero or price-on-request", () => {
    const copy = discoveryCopy("en");
    expect(priceText({ state: "unknown" }, "en", copy)).toBe(copy.unknown);
    expect(priceText({ state: "withheld" }, "en", copy)).toBe(copy.withheld);
    expect(
      priceText(
        {
          state: "known",
          provenance: { sourceClass: "agency_observed" },
          value: { amountMinor: 125035, currency: "EUR", period: "month", basis: "asking" },
        },
        "en",
        copy,
      ),
    ).toContain("1,250.35");
  });
});
