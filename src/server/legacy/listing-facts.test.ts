import { expect, it } from "vitest";
import { projectListingFacts } from "./listing-facts";
import type { LegacyPage } from "./pages";

const frozen: NonNullable<LegacyPage["listing"]> = {
  reference: "962",
  sourceLocale: "bg",
  sourceTitle: "Frozen source",
  lifecycleAtFreeze: { state: "archived" },
  sold: true,
  price: { amount: 100000, currency: "EUR", period: null, on_request: false },
  areas: { extraction: { value: 120 } },
  rooms: { count: 4, recorded: true },
  bedrooms: { recorded: 3 },
  location: { recorded: [] },
  sourceStatedFacts: {},
  statusParityVerified: false,
};
it("an existing frozen listing cannot leak stale price, sold status, rooms or proposals into a newer live body", () => {
  const fields = [
    { label: "Price:", value: "450 €" },
    { label: "Rooms (include living room):", value: "3" },
  ];
  const current = projectListingFacts(frozen, {
    reference: "962",
    locale: "en",
    title: "Current source",
    fields,
  });
  expect(current).toMatchObject({
    reference: "962",
    sourceLocale: "en",
    sold: null,
    price: { amount: null, currency: null },
    rooms: { count: null, recorded: false },
    bedrooms: { recorded: null },
    areas: { recorded: [] },
    liveSourceFields: fields,
    statusParityVerified: false,
  });
  expect(current?.sourceStatedFacts).toEqual(fields);
  expect(current?.lifecycleAtFreeze).toEqual({});
});
it("missing current reference or locale cannot fall back to a historical listing projection", () => {
  expect(
    projectListingFacts(frozen, {
      reference: null,
      locale: "en",
      title: "Current source",
      fields: [],
    }),
  ).toBeNull();
  expect(
    projectListingFacts(frozen, {
      reference: "962",
      locale: null,
      title: "Current source",
      fields: [],
    }),
  ).toBeNull();
  expect(projectListingFacts(frozen, null)).toBe(frozen);
});
