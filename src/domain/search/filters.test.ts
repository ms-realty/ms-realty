import { describe, expect, it } from "vitest";
import { filterCases } from "./filter-cases";
import { evaluateListing, matchesSearch } from "./filters";

describe("AT04 filter semantics (shared case table)", () => {
  it.each(filterCases)("$id — $name", ({ listing, criteria, expected, returned }) => {
    expect(evaluateListing(listing, criteria).result).toBe(expected);
    expect(matchesSearch(listing, criteria)).toBe(returned);
  });

  it("names the criteria a needing-confirmation result could not prove", () => {
    const unknownAccess = filterCases.find((c) => c.id === "AT04-must-have-unknown");
    expect(unknownAccess).toBeDefined();
    if (!unknownAccess) return;
    expect(evaluateListing(unknownAccess.listing, unknownAccess.criteria).unconfirmed).toEqual([
      "feature.step_free_access",
    ]);
  });

  it("names known hard violations without promoting unknown facts to matches", () => {
    const listing = filterCases.find((c) => c.id === "AT04-must-have-unknown")?.listing;
    expect(listing).toBeDefined();
    if (!listing) return;
    expect(
      evaluateListing(listing, {
        purpose: "sale",
        propertyTypes: ["house"],
        mustHave: ["parking", "step_free_access"],
      }),
    ).toMatchObject({ result: "no_match", violated: ["propertyType", "feature.parking"] });
  });
});
