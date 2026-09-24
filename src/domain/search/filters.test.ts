import { describe, expect, it } from "vitest";
import { filterCases } from "./filter-cases";
import { evaluateListing, matchesSearch } from "./filters";

describe("F02 filter semantics (shared case table)", () => {
  it.each(filterCases)("$id — $name", ({ listing, criteria, expected, returned }) => {
    expect(evaluateListing(listing, criteria).result).toBe(expected);
    expect(matchesSearch(listing, criteria)).toBe(returned);
  });

  it("names the criteria a needing-confirmation result could not prove", () => {
    const unknownAccess = filterCases.find((c) => c.id === "A05-must-have-unknown");
    expect(unknownAccess).toBeDefined();
    if (!unknownAccess) return;
    expect(evaluateListing(unknownAccess.listing, unknownAccess.criteria).unconfirmed).toEqual([
      "feature.step_free_access",
    ]);
  });
});
