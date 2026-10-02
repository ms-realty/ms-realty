import { describe, expect, it } from "vitest";
import { parsePublicMapPoint } from "./public-map";

const point = { latitude: 41.5, longitude: 23.2, level: "settlement", placeId: "place" };
describe("public map precision", () => {
  it("does not disclose a settlement under region-only permission", () => {
    expect(parsePublicMapPoint(point, "region")).toBeNull();
    expect(parsePublicMapPoint({ ...point, level: "district" }, "region")).not.toBeNull();
  });
  it("accepts area centres but never an exact point or arbitrary extra fields", () => {
    expect(parsePublicMapPoint({ ...point, address: "private" }, "exact")).toEqual(point);
    expect(parsePublicMapPoint({ ...point, level: "exact" }, "exact")).toBeNull();
  });
  it("fails closed for missing, invalid or out-of-map coordinates", () => {
    for (const value of [
      null,
      {},
      { ...point, latitude: null },
      { ...point, latitude: NaN },
      { ...point, latitude: 90 },
      { ...point, longitude: 181 },
      { ...point, latitude: "41.5" },
    ]) {
      expect(parsePublicMapPoint(value, "settlement")).toBeNull();
    }
  });
});
