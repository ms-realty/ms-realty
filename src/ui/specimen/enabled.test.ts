import { describe, expect, it } from "vitest";
import { isDesignSpecimenEnabled } from "./enabled";

describe("design specimen gate", () => {
  it("is off unless ENABLE_DESIGN_SPECIMEN is exactly 1", () => {
    expect(isDesignSpecimenEnabled({})).toBe(false);
    expect(isDesignSpecimenEnabled({ ENABLE_DESIGN_SPECIMEN: "true" })).toBe(false);
    expect(isDesignSpecimenEnabled({ ENABLE_DESIGN_SPECIMEN: "0" })).toBe(false);
    expect(isDesignSpecimenEnabled({ ENABLE_DESIGN_SPECIMEN: "1" })).toBe(true);
  });
});
