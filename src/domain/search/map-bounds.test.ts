import { expect, it } from "vitest";
import { absent, known } from "../facts";
import { evaluateListing, type ListingSearchView } from "./filters";
import { parseMapBounds, pointWithinMapBounds, serializeMapBounds } from "./map-bounds";

it("UI16 accepts only finite ordered public-area bounds and serializes a stable bounded query", () => {
  const bounds = parseMapBounds("22,40,24,42");
  expect(bounds).toEqual({ west: 22, south: 40, east: 24, north: 42 });
  if (!bounds) throw new Error("Missing bounds");
  expect(serializeMapBounds(bounds)).toBe("22,40,24,42");
  const precise = { ...bounds, west: 22.000000001, south: 1e-7 };
  expect(parseMapBounds(serializeMapBounds(precise))).toEqual(precise);
  for (const invalid of [
    "",
    "Infinity,40,24,42",
    "22,40,22,42",
    "24,40,22,42",
    "-181,40,24,42",
    "22,-86,24,42",
    "22,40,24,42,44",
    "22,40,24,42\n",
    "22,40,24,40",
  ])
    expect(parseMapBounds(invalid)).toBeNull();
  expect(pointWithinMapBounds({ latitude: 41, longitude: 23 }, bounds)).toBe(true);
  expect(pointWithinMapBounds(null, bounds)).toBe(false);
});
it("AT04 spatial filters require an approved public centre even when unknown facts are included", () => {
  const view: ListingSearchView = {
    listingId: "id",
    reference: "MS-10001",
    purpose: "sale",
    propertyType: "plot",
    placeIds: [],
    commercial: "available",
    price: known(
      { amountMinor: 100, currency: "EUR", period: "total", basis: "asking" },
      { sourceClass: "agency_observed" },
    ),
    bedrooms: absent("not_applicable"),
    rooms: absent("not_applicable"),
    areas: {},
    features: {},
  };
  const criteria = {
    purpose: "sale",
    mapBounds: { west: 22, south: 40, east: 24, north: 42 },
    includeNeedsConfirmation: true,
  } as const;
  expect(evaluateListing(view, criteria)).toMatchObject({
    result: "no_match",
    violated: ["mapBounds"],
  });
  expect(
    evaluateListing({ ...view, publicMapPoint: { latitude: 41, longitude: 23 } }, criteria),
  ).toMatchObject({ result: "match" });
  expect(
    evaluateListing({ ...view, publicMapPoint: { latitude: 43, longitude: 23 } }, criteria),
  ).toMatchObject({ result: "no_match" });
});
