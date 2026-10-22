import { describe, expect, it } from "vitest";
import { acceptableChips, interpretIntent, toSearchCriteria } from "@/server/ai/intent";
import { normalizeSearch } from "@/server/search/search";
import { criteriaFilters } from "./intent-query";
import { filterUrl, readFilters, searchInput } from "./query";

describe("F02 reviewed intent into deterministic filters", () => {
  it("retains every accepted facet, currency and count meaning in the canonical URL", () => {
    const criteria = {
      purpose: "long_term_rent" as const,
      propertyTypes: ["house", "apartment"] as const,
      placeIds: ["00000000-0000-4000-8000-000000000001"],
      price: { currency: "USD" as const, min: 65025, max: 90000 },
      rooms: { min: 3, max: 4 },
      bedrooms: { max: 2 },
      area: { basis: "built" as const, min: 75 },
      mustHave: ["garden", "parking"],
      includeNeedsConfirmation: false,
    };
    const url = new URL(filterUrl("en", criteriaFilters(criteria)), "https://example.test");
    const result = normalizeSearch(
      searchInput("en", readFilters(Object.fromEntries(url.searchParams))),
    );
    expect(result.criteria).toMatchObject({ ...criteria, propertyTypes: ["apartment", "house"] });
    expect(url.searchParams.has("q")).toBe(false);
  });
  it("does not apply unchecked wishes or reinterpret short-stay amounts as monthly budgets", () => {
    const result = interpretIntent("holiday rental for 60 euro per night with a pool", {
      locale: "en",
      places: [],
    });
    const chips = acceptableChips(result);
    expect(chips.some((c) => c.kind === "price" || c.kind === "purpose")).toBe(false);
    expect(
      criteriaFilters(toSearchCriteria(result, [], { purpose: "long_term_rent" })).features,
    ).toBe("");
  });
});
