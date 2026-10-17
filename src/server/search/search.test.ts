import { describe, expect, it } from "vitest";

import { AppError } from "../errors";
import { normalizeSearch, queryIdOf } from "./search";

// §10 normalized filter schema: allowlisted fields, bounded sizes, explicit defaults.
function fieldErrors(input: unknown) {
  try {
    normalizeSearch(input);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).fieldErrors;
  }
  throw new Error("expected a validation error");
}

describe("normalizeSearch", () => {
  it("applies the documented defaults: offered availability, relevance, 24 per page, no opt-in", () => {
    expect(normalizeSearch({ locale: "bg", purpose: "sale" })).toEqual({
      locale: "bg",
      criteria: {
        purpose: "sale",
        availability: [
          "available",
          "confirmation_required",
          "negotiating",
          "reserved_with_recorded_basis",
        ],
        includeNeedsConfirmation: false,
      },
      q: null,
      sort: "relevance",
      pageSize: 24,
      cursor: null,
    });
  });

  it("gives one identity to the same query however its facets were ordered", () => {
    const a = normalizeSearch({
      locale: "en",
      purpose: "sale",
      propertyTypes: ["house", "apartment", "house"],
      mustHave: ["lift", "parking"],
    });
    const b = normalizeSearch({
      mustHave: ["parking", "lift"],
      propertyTypes: ["apartment", "house"],
      purpose: "sale",
      locale: "en",
    });
    expect(a.criteria.propertyTypes).toEqual(["apartment", "house"]);
    expect(queryIdOf(a)).toBe(queryIdOf(b));
    expect(queryIdOf({ ...a, sort: "newest" })).not.toBe(queryIdOf(a));
    // The page is not part of the query identity.
    expect(queryIdOf({ ...a, cursor: "next" })).toBe(queryIdOf(a));
  });

  it("allows only allowlisted fields, bases and sizes", () => {
    expect(fieldErrors({ locale: "bg", purpose: "sale", q: "Sandanski\0" })).toHaveProperty("q");
    expect(fieldErrors({ locale: "bg", purpose: "sale", orderBy: "price; drop" })).toEqual({
      query: ["unrecognized_keys"],
    });
    expect(
      fieldErrors({ locale: "bg", purpose: "sale", area: { basis: "usable", min: 50 } }),
    ).toEqual({
      "area.basis": ["invalid_value"],
    });
    expect(fieldErrors({ locale: "bg", purpose: "sale", pageSize: 61 })).toEqual({
      pageSize: ["too_big"],
    });
    expect(fieldErrors({ locale: "bg", purpose: "sale", bedrooms: { min: 3, max: 2 } })).toEqual({
      bedrooms: ["min_above_max"],
    });
    expect(fieldErrors({ locale: "bg", purpose: "short_stay" })).toEqual({
      purpose: ["invalid_value"],
    });
    expect(
      fieldErrors({
        locale: "bg",
        purpose: "sale",
        placeIds: Array.from({ length: 21 }, () => crypto.randomUUID()),
      }),
    ).toEqual({ placeIds: ["too_big"] });
  });
});
