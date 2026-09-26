import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Actor } from "@/domain/capabilities";
import { getHomeOverview } from "../listings/home";
import {
  addMedia,
  createListingFixture,
  createPlaces,
  defaultConfirm,
  eur,
  type PlaceFixture,
  publishForTest,
} from "../listings/testing";
import { createStaff } from "../testing";
import { listPlacesForSearch, searchListings } from "./search";

// F02 search semantics over published listings (P02, P03, P22, A03-A07) and P01 home counts.
let t: TestDatabase;
let staff: Actor;
let placeA: PlaceFixture;
let placeB: PlaceFixture;
const refs: Record<string, string> = {};

beforeAll(async () => {
  process.env.MEDIA_PUBLIC_BASE_URL = "https://media.example.test/m/";
  t = await createTestDatabase();
  staff = (await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] })).actor;
  placeA = await createPlaces(t.db, { settlement: "Sandanski", municipality: "Sandanski" });
  placeB = await createPlaces(t.db, { settlement: "Melnik", municipality: "Sandanski-B" });
  const day = (d: string) => new Date(`2026-${d}T09:00:00Z`);
  const publish = async (
    name: string,
    options: Parameters<typeof createListingFixture>[1],
    confirm: readonly string[] = defaultConfirm,
  ) => {
    const fixture = await createListingFixture(t.db, options);
    refs[name] = fixture.reference;
    await publishForTest(t.db, staff, fixture.reference, confirm);
    return fixture;
  };
  const apartment = (euros: number, bedrooms: number | null) => ({
    price: { state: "known" as const, value: eur(euros), subject: "listing" as const },
    bedrooms:
      bedrooms === null
        ? { state: "unknown" as const }
        : { state: "known" as const, value: bedrooms },
    "area.built": {
      state: "known" as const,
      value: { value: 80, unit: "m2", basis: "built" },
      basis: "built",
    },
    location: { state: "known" as const, value: { country: "BG" } },
  });

  const a1 = await publish("A1", {
    placeId: placeA.settlementId,
    facts: apartment(100_000, 2),
    availabilityCheckedAt: day("08-01"),
    createdAt: day("09-01"),
  });
  await addMedia(t.db, a1, { public: false, position: 0 });
  await addMedia(t.db, a1, { public: true, position: 1, altText: "Living room" });
  await publish(
    "A2",
    { placeId: placeA.settlementId, facts: apartment(150_000, null), createdAt: day("09-02") },
    ["price", "area.built", "location"],
  );
  await publish(
    "H1",
    {
      placeId: placeB.settlementId,
      propertyType: "house",
      facts: apartment(250_000, 3),
      availabilityCheckedAt: day("09-01"),
      createdAt: day("09-03"),
    },
    defaultConfirm,
  );
  await publish("W1", {
    placeId: placeA.settlementId,
    facts: apartment(90_000, 2),
    commercialState: "withdrawn",
    createdAt: day("09-04"),
  });
  await publish(
    "R1",
    {
      placeId: placeA.settlementId,
      purpose: "long_term_rent",
      facts: {
        ...apartment(0, 1),
        price: {
          state: "known",
          value: { amountMinor: 50_000, currency: "EUR", period: "month", basis: "asking" },
          subject: "listing",
        },
      },
      createdAt: day("09-05"),
    },
    defaultConfirm,
  );
  await publish("U1", {
    placeId: placeA.settlementId,
    facts: { ...apartment(0, 1), price: { state: "withheld", subject: "listing" } },
    createdAt: day("09-06"),
  });
  const neverPublished = await createListingFixture(t.db, { placeId: placeA.settlementId });
  refs.N1 = neverPublished.reference;
});
afterAll(async () => {
  await t?.drop();
});

const references = (response: { items: readonly { reference: string }[] }) =>
  response.items.map((i) => i.reference);
const en = { locale: "en" as const };

describe("searchListings (F02)", () => {
  it("returns only live, offered listings of the purpose with an exact count by default", async () => {
    const response = await searchListings(t.db, { purpose: "sale" }, en);
    expect(response.countType).toBe("exact");
    expect(response.total).toBe(4);
    expect(references(response)).toEqual([refs.U1, refs.H1, refs.A2, refs.A1]);
    expect(response.criteria.availability).toEqual([
      "availability_unconfirmed",
      "available",
      "reserved",
      "under_negotiation",
    ]);
    expect(references(response)).not.toContain(refs.N1);
  });

  it("ORs within a category and ANDs across categories", async () => {
    const both = await searchListings(
      t.db,
      { purpose: "sale", propertyTypes: ["apartment", "house"] },
      en,
    );
    expect(both.total).toBe(4);
    const houses = await searchListings(t.db, { purpose: "sale", propertyTypes: ["house"] }, en);
    expect(references(houses)).toEqual([refs.H1]);
    const twoBedApartments = await searchListings(
      t.db,
      { purpose: "sale", propertyTypes: ["apartment"], bedrooms: { min: 2 } },
      en,
    );
    expect(references(twoBedApartments)).toEqual([refs.A1]);
  });

  it("A05: unknown never satisfies a constraint; opting in flags which criteria are unconfirmed", async () => {
    const criteria = {
      purpose: "sale" as const,
      propertyTypes: ["apartment" as const],
      bedrooms: { min: 2 },
    };
    const withUnknown = await searchListings(
      t.db,
      { ...criteria, includeNeedsConfirmation: true },
      en,
    );
    expect(withUnknown.items.map((i) => [i.reference, i.match, i.unconfirmed])).toEqual([
      [refs.A2, "needs_confirmation", ["bedrooms"]],
      [refs.A1, "match", []],
    ]);
    // A price on request is not zero: it cannot be shown to fit a budget.
    const budget = await searchListings(
      t.db,
      {
        purpose: "sale",
        price: { max: 12_000_000, currency: "EUR" },
        includeNeedsConfirmation: true,
      },
      en,
    );
    expect(budget.items.map((i) => [i.reference, i.unconfirmed])).toEqual([
      [refs.U1, ["price"]],
      [refs.A1, []],
    ]);
  });

  it("counts each facet over the other active criteria", async () => {
    const response = await searchListings(
      t.db,
      { purpose: "sale", propertyTypes: ["apartment"], bedrooms: { min: 2 } },
      en,
    );
    const types = Object.fromEntries(response.facets.propertyType.map((f) => [f.value, f.count]));
    expect(types).toMatchObject({ apartment: 1, house: 1, plot: 0 });
    expect(response.facets.bedrooms).toEqual([
      { min: 1, count: 2 },
      { min: 2, count: 1 },
      { min: 3, count: 0 },
      { min: 4, count: 0 },
      { min: 5, count: 0 },
    ]);
  });

  it("sorts by price with prices that cannot be compared last, and pages explicitly", async () => {
    const asc = await searchListings(t.db, { purpose: "sale" }, { ...en, sort: "price_asc" });
    expect(references(asc)).toEqual([refs.A1, refs.A2, refs.H1, refs.U1]);
    const desc = await searchListings(t.db, { purpose: "sale" }, { ...en, sort: "price_desc" });
    expect(references(desc)).toEqual([refs.H1, refs.A2, refs.A1, refs.U1]);
    const page2 = await searchListings(
      t.db,
      { purpose: "sale" },
      { ...en, sort: "price_asc", page: 2, pageSize: 2 },
    );
    expect(page2).toMatchObject({ page: 2, pageSize: 2, totalPages: 2, total: 4 });
    expect(references(page2)).toEqual([refs.H1, refs.U1]);
    expect(page2.queryId).not.toBe(asc.queryId);
  });

  it("filters by place including every place inside it and reports freshness across results", async () => {
    const inMunicipality = await searchListings(
      t.db,
      { purpose: "sale", placeIds: [placeA.municipalityId] },
      en,
    );
    expect(references(inMunicipality).sort()).toEqual([refs.A1, refs.A2, refs.U1].sort());
    const all = await searchListings(t.db, { purpose: "sale" }, en);
    expect(all.freshness.latestAvailabilityCheckAt).toBe("2026-09-01T09:00:00.000Z");
    const history = await searchListings(
      t.db,
      { purpose: "sale", availability: ["withdrawn"] },
      en,
    );
    expect(references(history)).toEqual([refs.W1]);
  });

  it("builds cards from the released version with public media only", async () => {
    const response = await searchListings(
      t.db,
      { purpose: "sale", propertyTypes: ["apartment"], bedrooms: { min: 2 } },
      en,
    );
    const [card] = response.items;
    expect(card).toMatchObject({
      reference: refs.A1,
      slug: refs.A1?.toLowerCase(),
      version: 1,
      titleLocale: "bg",
      price: {
        state: "known",
        value: { amountMinor: 10_000_000, currency: "EUR", period: "total", basis: "asking" },
      },
      bedrooms: { state: "known", value: 2 },
      area: { state: "known", value: { value: 80, basis: "built", unit: "m2" } },
      locality: { settlement: "Sandanski", municipality: "Sandanski" },
      availability: "needs_confirmation",
      commercialState: "availability_unconfirmed",
      coverImage: { alt: "Living room", width: 1600, height: 1067, position: 1 },
    });
    expect(card?.coverImage?.url).toMatch(/^https:\/\/media\.example\.test\/m\/public\//);
    expect(JSON.stringify(response)).not.toContain("staging/");
  });
});

describe("listPlacesForSearch and getHomeOverview (P01)", () => {
  it("lists settlements and municipalities with offered listings and their counts", async () => {
    const sale = await listPlacesForSearch(t.db, "bg", { purpose: "sale" });
    const counts = Object.fromEntries(sale.map((p) => [`${p.level}:${p.id}`, p.count]));
    expect(counts).toEqual({
      [`settlement:${placeA.settlementId}`]: 3,
      [`municipality:${placeA.municipalityId}`]: 3,
      [`settlement:${placeB.settlementId}`]: 1,
      [`municipality:${placeB.municipalityId}`]: 1,
    });
    const settlement = sale.find((p) => p.id === placeA.settlementId);
    expect(settlement).toMatchObject({ name: "Sandanski (bg)", parentName: "Sandanski (bg)" });
    const any = await listPlacesForSearch(t.db, "en");
    expect(any.find((p) => p.id === placeA.settlementId)).toMatchObject({
      name: "Sandanski",
      count: 4,
    });
  });

  it("counts live listings and shows the newest offered ones", async () => {
    const home = await getHomeOverview(t.db, { locale: "en", limit: 2 });
    expect(home.totalPublished).toBe(6);
    expect(home.totalOffered).toBe(5);
    expect(home.latest.map((c) => c.reference)).toEqual([refs.U1, refs.R1]);
    expect(home.topPlaces[0]).toMatchObject({ id: expect.any(String), count: 4 });
  });
});
