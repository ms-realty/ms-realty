import { describe, expect, it } from "vitest";

import {
  decisionFactKeys,
  type FactRecord,
  missingRequiredFacts,
  requiredFactKeys,
} from "./listing-readiness";

// §18.1 required facts and F03 "What to confirm".
const fact = (
  fieldKey: string,
  state: FactRecord["state"],
  reviewedAt: string | null = null,
  sourceClass: FactRecord["sourceClass"] = "legacy_import",
): FactRecord => ({ fieldKey, state, sourceClass, reviewedAt });

const reviewed = "2026-09-26T10:00:00Z";

describe("missingRequiredFacts", () => {
  it("requires price, location, area and, for homes, bedrooms", () => {
    expect(requiredFactKeys("apartment")).toEqual(["price", "location", "area", "bedrooms"]);
    expect(requiredFactKeys("plot")).toEqual(["price", "location", "area"]);
    expect(missingRequiredFacts("apartment", [])).toEqual([
      { key: "price", problem: "absent" },
      { key: "location", problem: "absent" },
      { key: "area", problem: "absent" },
      { key: "bedrooms", problem: "absent" },
    ]);
  });

  it("asks a person to confirm decided imported values, not unknowns", () => {
    const facts = [
      fact("price", "withheld"),
      fact("location", "known", reviewed),
      fact("area", "unknown"),
      fact("bedrooms", "unknown"),
      fact("area.built", "known", null, "agency_observed"),
    ];
    expect(missingRequiredFacts("apartment", facts)).toEqual([
      { key: "price", problem: "unreviewed", state: "withheld" },
    ]);
  });

  it("never lets an unknown price or location through: a missing price is not zero", () => {
    const facts = [
      fact("price", "unknown"),
      fact("location", "not_provided"),
      fact("area.land", "known", reviewed),
    ];
    expect(missingRequiredFacts("plot", facts)).toEqual([
      { key: "price", problem: "undecided", state: "unknown" },
      { key: "location", problem: "undecided", state: "not_provided" },
    ]);
  });

  it("is satisfied once every decided imported value is confirmed", () => {
    const facts = [
      fact("price", "known", reviewed),
      fact("location", "known", reviewed),
      fact("area.built", "known", reviewed),
      fact("bedrooms", "not_applicable", reviewed),
    ];
    expect(missingRequiredFacts("house", facts)).toEqual([]);
  });
});

describe("decisionFactKeys", () => {
  it("names the facts worth confirming for each kind of property", () => {
    expect(decisionFactKeys("apartment")).toContain("feature.floor_number");
    expect(decisionFactKeys("apartment")).toContain("bedrooms");
    expect(decisionFactKeys("plot")).toContain("feature.zoning_status");
    expect(decisionFactKeys("plot")).not.toContain("bedrooms");
  });
});
