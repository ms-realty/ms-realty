import { describe, expect, it } from "vitest";
import { classifyFactChanges } from "./fact-revision";

const base = {
  bedrooms: { state: "known", value: 2 },
  "area.living": { state: "known", value: { value: 68, unit: "m2", basis: "living" } },
  "feature.lift": { state: "unknown" },
} as const;

describe("fact revision material-change classification (architecture §7.4)", () => {
  it("the first revision is initial", () => {
    expect(classifyFactChanges(null, base).classification).toBe("initial");
  });

  it("AT24: changing or retracting a known value is material", () => {
    expect(classifyFactChanges(base, { ...base, bedrooms: { state: "known", value: 3 } })).toEqual({
      classification: "material",
      changedKeys: ["bedrooms"],
      materialKeys: ["bedrooms"],
    });
    expect(
      classifyFactChanges(base, { ...base, bedrooms: { state: "withheld" } }).classification,
    ).toBe("material");
  });

  it("AT24: filling in an unknown value adds information and is not material", () => {
    expect(
      classifyFactChanges(base, { ...base, "feature.lift": { state: "known", value: true } }),
    ).toEqual({ classification: "non_material", changedKeys: ["feature.lift"], materialKeys: [] });
  });

  it("a recorded conflict is a credible dispute and therefore material", () => {
    expect(
      classifyFactChanges(base, {
        ...base,
        "feature.lift": { state: "conflicting", value: [true, false] },
      }).classification,
    ).toBe("material");
    expect(classifyFactChanges(base, base).classification).toBe("none");
  });
});
