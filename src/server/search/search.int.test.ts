import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { geographyPlaceAliases, listings, localizedRevisions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Actor } from "@/domain/capabilities";
import type { Fact } from "@/domain/facts";
import { filterCases, placeIds } from "@/domain/search/filter-cases";
import type { ListingSearchView, SearchCriteria } from "@/domain/search/filters";
import { withdrawPublication } from "../publication/commands";
import {
  createListingFixture,
  createPlaces,
  eur,
  type FactFixture,
  insertPlace,
  type ListingFixtureOptions,
  newOperationId,
  type PlaceFixture,
  publishForTest,
} from "../publication/testing";
import { createStaff } from "../testing";
import { listSearchPlaces, searchListings } from "./search";

// Public search over the eligible projection (§10; AT04, AT05, AT07).
let t: TestDatabase;
let staff: { id: string; actor: Actor };
const now = new Date();

beforeAll(async () => {
  t = await createTestDatabase();
  staff = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
});
afterAll(async () => {
  await t?.drop();
});

function factFixture(fact: Fact<unknown>): FactFixture {
  return fact.state === "known" ? { state: "known", value: fact.value } : { state: fact.state };
}

/** The fixture for a filter-case listing view: the same facts, published through the commands. */
function fromView(view: ListingSearchView): Omit<ListingFixtureOptions, "reviewerId"> {
  const facts: Record<string, FactFixture> = {
    location: { state: "known", value: { country: "BG" } },
    bedrooms: factFixture(view.bedrooms),
    rooms: factFixture(view.rooms),
  };
  for (const [basis, fact] of Object.entries(view.areas)) {
    if (fact) facts[`area.${basis}`] = factFixture(fact);
  }
  for (const [key, fact] of Object.entries(view.features)) {
    facts[`feature.${key}`] = factFixture(fact);
  }
  return {
    placeId: view.placeIds.at(-1) ?? null,
    propertyType: view.propertyType,
    purpose: view.purpose,
    commercialState: view.commercial,
    price: factFixture(view.price),
    facts,
  };
}

function searchInput(criteria: SearchCriteria, q: string, includeUnconfirmed: boolean) {
  const { includeNeedsConfirmation: _include, ...rest } = criteria;
  return { ...rest, locale: "bg" as const, q, includeUnconfirmed };
}

describe("AT04 filter semantics in SQL (shared case table)", () => {
  const references = new Map<string, string>();
  beforeAll(async () => {
    const bulgaria = await insertPlace(t.db, {
      id: placeIds.bulgaria,
      level: "country",
      parentId: null,
      nameNative: "България",
      nameLatin: "Bulgaria",
    });
    for (const [id, native, latin] of [
      [placeIds.sandanski, "Сандански", "Sandanski"],
      [placeIds.melnik, "Мелник", "Melnik"],
    ] as const) {
      await insertPlace(t.db, {
        id,
        level: "settlement",
        parentId: bulgaria,
        nameNative: native,
        nameLatin: latin,
      });
    }
    for (const c of filterCases) {
      const f = await createListingFixture(t.db, { reviewerId: staff.id, ...fromView(c.listing) });
      await publishForTest(t.db, staff.actor, f);
      references.set(c.id, f.reference);
    }
  });

  it.each(filterCases)("$id — $name", async ({ id, criteria, expected, returned }) => {
    const reference = references.get(id) ?? "";
    const asAsked = await searchListings(
      t.db,
      searchInput(criteria, reference, criteria.includeNeedsConfirmation === true),
      { now },
    );
    expect(asAsked.items.map((i) => i.reference)).toEqual(returned ? [reference] : []);
    // With unconfirmed results included, the SQL classification must equal the domain's.
    const included = await searchListings(t.db, searchInput(criteria, reference, true), { now });
    const item = included.items[0];
    if (expected === "no_match") expect(item).toBeUndefined();
    else expect(item?.match).toBe(expected);
  });

  it("names what a needs-confirmation result could not prove", async () => {
    const c = filterCases.find((x) => x.id === "AT04-must-have-opt-in");
    if (!c) throw new Error("case missing");
    const result = await searchListings(
      t.db,
      searchInput(c.criteria, references.get(c.id) ?? "", true),
      {
        now,
      },
    );
    expect(result.items[0]?.unconfirmed).toEqual(["feature.step_free_access"]);
  });
});

describe("AT05/AT07 eligibility, text and places", () => {
  let place: PlaceFixture;
  const ref: Record<string, string> = {};
  beforeAll(async () => {
    place = await createPlaces(t.db, {
      settlement: ["Лешница", "Leshnitsa"],
      municipality: ["Сандански", "Sandanski"],
    });
    await t.db
      .insert(geographyPlaceAliases)
      .values({ placeId: place.settlementId, kind: "transliteration", name: "Lešnica" });
    const make = async (name: string, options: Partial<ListingFixtureOptions> = {}) => {
      const f = await createListingFixture(t.db, {
        reviewerId: staff.id,
        placeId: place.settlementId,
        ...options,
      });
      ref[name] = f.reference;
      return f;
    };
    const both = await make("A", {
      translations: { en: { title: "Apartment", description: "Inland." } },
    });
    await publishForTest(t.db, staff.actor, both, ["bg", "en"]);
    await publishForTest(t.db, staff.actor, await make("B", { propertyType: "house" }));
    await make("N");
    const gone = await make("W");
    await publishForTest(t.db, staff.actor, gone);
    await withdrawPublication(t.db, {
      actor: staff.actor,
      operationId: newOperationId(),
      expectedRevision: 0,
      reference: gone.reference,
      reason: "Owner withdrew",
    });
  });

  const inPlace = (locale: "bg" | "en", extra: Record<string, unknown> = {}) =>
    searchListings(
      t.db,
      { locale, purpose: "sale", placeIds: [place.settlementId], ...extra },
      { now },
    );

  it("counts, facets and results contain only what is public in the locale", async () => {
    const bg = await inPlace("bg");
    expect(bg.items.map((i) => i.reference).sort()).toEqual([ref.A, ref.B].sort());
    expect(bg.count).toEqual({ value: 2, type: "exact" });
    expect(bg.facets.propertyType).toEqual([
      { value: "apartment", count: 1 },
      { value: "house", count: 1 },
    ]);
    const typed = await inPlace("bg", { propertyTypes: ["house"] });
    expect(typed.items.map((i) => i.reference)).toEqual([ref.B]);
    expect(typed.count).toEqual({ value: 1, type: "exact" });
    // Facet counts ignore the type filter itself, and nothing else.
    expect(typed.facets.propertyType).toEqual(bg.facets.propertyType);
    const multipleTypes = await inPlace("bg", { propertyTypes: ["house", "apartment"] });
    expect(multipleTypes.count).toEqual({ value: 2, type: "exact" });
    const absentType = await inPlace("bg", { propertyTypes: ["plot"] });
    expect(absentType.items).toEqual([]);
    expect(absentType.count).toEqual({ value: 0, type: "exact" });
    expect(absentType.facets.propertyType).toEqual(bg.facets.propertyType);

    const en = await inPlace("en");
    expect(en.items.map((i) => i.reference)).toEqual([ref.A]);
    expect(en.items[0]).toMatchObject({ locale: "en", title: "Apartment" });
  });

  it("a stale translation drops out of results, counts and place suggestions at once", async () => {
    const before = await listSearchPlaces(t.db, { locale: "en", purpose: "sale" }, { now });
    expect(before.find((p) => p.id === place.settlementId)?.count).toBe(1);
    const [a] = await t.db
      .select()
      .from(listings)
      .where(eq(listings.reference, ref.A ?? ""));
    await t.db
      .update(localizedRevisions)
      .set({ state: "stale" })
      .where(eq(localizedRevisions.listingId, a?.id ?? ""));
    const en = await inPlace("en");
    expect(en.items).toEqual([]);
    expect(en.count.value).toBe(0);
    expect(await listSearchPlaces(t.db, { locale: "en" }, { now })).toEqual([]);
    const bgPlaces = await listSearchPlaces(t.db, { locale: "bg" }, { now });
    expect(bgPlaces.find((p) => p.id === place.settlementId)?.count).toBe(2);
  });

  it("AT07: an exact reference wins, in any case", async () => {
    const result = await searchListings(
      t.db,
      { locale: "bg", purpose: "sale", q: (ref.B ?? "").toLowerCase() },
      { now },
    );
    expect(result.items.map((i) => i.reference)).toEqual([ref.B]);
    const unpublished = await searchListings(
      t.db,
      { locale: "bg", purpose: "sale", q: ref.N },
      { now },
    );
    expect(unpublished.items).toEqual([]);
    expect(unpublished.count.value).toBe(0);
  });

  it.each([
    ["Cyrillic name", "Лешница"],
    ["Latin name", "Leshnitsa"],
    ["misspelling", "Leshnitza"],
    ["approved transliteration", "Lesnica"],
  ])("AT07: finds the place's listings by %s", async (_label, q) => {
    const result = await searchListings(t.db, { locale: "bg", purpose: "sale", q }, { now });
    expect(result.items.map((i) => i.reference).sort()).toEqual([ref.A, ref.B].sort());
  });
});

describe("pagination, sorting and availability", () => {
  let place: PlaceFixture;
  const refs: string[] = [];
  beforeAll(async () => {
    place = await createPlaces(t.db, {
      settlement: ["Катунци", "Katuntsi"],
      municipality: ["Сандански", "Sandanski"],
    });
    for (const euros of [300_000, 100_000, null, 200_000, 150_000]) {
      const f = await createListingFixture(t.db, {
        reviewerId: staff.id,
        placeId: place.settlementId,
        price: euros === null ? { state: "withheld" } : { state: "known", value: eur(euros) },
      });
      await publishForTest(t.db, staff.actor, f);
      refs.push(f.reference);
    }
  });

  const query = (extra: Record<string, unknown> = {}) => ({
    locale: "bg",
    purpose: "sale",
    placeIds: [place.settlementId],
    sort: "price_asc",
    pageSize: 2,
    ...extra,
  });

  it("walks every result once in price order with a query-bound cursor; unknown prices last", async () => {
    const seen: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const page = await searchListings(t.db, query(cursor ? { cursor } : {}), { now: new Date() });
      expect(page.stale).toBe(false);
      seen.push(...page.items.map((i) => i.reference));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 5);
    expect(pages).toBe(3);
    expect(seen).toEqual([refs[1], refs[4], refs[3], refs[0], refs[2]]);
  });

  it("refuses a cursor from another query and a page size above 60", async () => {
    const first = await searchListings(t.db, query(), { now: new Date() });
    await expect(
      searchListings(t.db, query({ sort: "price_desc", cursor: first.nextCursor }), {
        now: new Date(),
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { cursor: ["query_changed"] },
    });
    await expect(
      searchListings(t.db, query({ pageSize: 61 }), { now: new Date() }),
    ).rejects.toMatchObject({
      code: "validation_failed",
    });
    const defaults = await searchListings(
      t.db,
      { locale: "bg", purpose: "sale", placeIds: [place.settlementId] },
      { now: new Date() },
    );
    expect(defaults).toMatchObject({ pageSize: 24, sort: "relevance", partial: false });
  });

  it("flags later pages stale when the inventory changed since the first", async () => {
    const first = await searchListings(t.db, query(), { now: new Date() });
    const last = refs[0] ?? "";
    await withdrawPublication(t.db, {
      actor: staff.actor,
      operationId: newOperationId(),
      expectedRevision: 0,
      reference: last,
      reason: "Owner withdrew",
    });
    const second = await searchListings(t.db, query({ cursor: first.nextCursor }), {
      now: new Date(),
    });
    expect(second.stale).toBe(true);
    expect(second.items.map((i) => i.reference)).not.toContain(last);
  });

  it("tracks cursor freshness within the selected types even when the total stays constant", async () => {
    const isolated = await createPlaces(t.db, {
      settlement: ["Хърсово", "Harsovo"],
      municipality: ["Сандански", "Sandanski"],
    });
    const add = async (propertyType: "apartment" | "house", euros: number) => {
      const f = await createListingFixture(t.db, {
        reviewerId: staff.id,
        placeId: isolated.settlementId,
        propertyType,
        price: { state: "known", value: eur(euros) },
      });
      await publishForTest(t.db, staff.actor, f);
      return f;
    };
    const firstApartment = await add("apartment", 100_000);
    const secondApartment = await add("apartment", 200_000);
    await add("house", 50_000);
    const input = query({
      placeIds: [isolated.settlementId],
      propertyTypes: ["apartment"],
      pageSize: 1,
    });
    const first = await searchListings(t.db, input);
    expect(first.items.map((i) => i.reference)).toEqual([firstApartment.reference]);
    expect(first.nextCursor).not.toBeNull();
    await add("house", 75_000);
    const continuation = { ...input, cursor: first.nextCursor };
    const unchanged = await searchListings(t.db, continuation);
    expect(unchanged.items.map((i) => i.reference)).toEqual([secondApartment.reference]);
    expect(unchanged.count).toEqual({ value: 2, type: "exact" });
    expect(unchanged.facets.propertyType).toEqual([
      { value: "apartment", count: 2 },
      { value: "house", count: 2 },
    ]);
    expect(unchanged.stale).toBe(false);

    await withdrawPublication(t.db, {
      actor: staff.actor,
      operationId: newOperationId(),
      expectedRevision: 0,
      reference: firstApartment.reference,
      reason: "Owner withdrew before the replacement offer",
    });
    await add("apartment", 300_000);
    const changed = await searchListings(t.db, continuation);
    expect(changed.count).toEqual(unchanged.count);
    expect(changed.items.map((i) => i.reference)).toEqual([secondApartment.reference]);
    expect(changed.stale).toBe(true);
  });

  it("filters on the availability visitors are shown and keeps history out by default", async () => {
    await t.db
      .update(listings)
      .set({ commercialState: "sold" })
      .where(eq(listings.reference, refs[1] ?? ""));
    await t.db
      .update(listings)
      .set({ availabilityConfirmedAt: new Date(Date.now() - 30 * 86_400_000) })
      .where(eq(listings.reference, refs[4] ?? ""));
    const offered = await searchListings(t.db, query({ pageSize: 10 }), { now: new Date() });
    expect(offered.items.map((i) => i.reference)).not.toContain(refs[1]);
    const available = await searchListings(
      t.db,
      query({ pageSize: 10, availability: ["available"] }),
      { now: new Date() },
    );
    expect(available.items.map((i) => i.reference)).not.toContain(refs[4]);
    const unconfirmed = await searchListings(
      t.db,
      query({ pageSize: 10, availability: ["confirmation_required"] }),
      { now: new Date() },
    );
    expect(unconfirmed.items.map((i) => [i.reference, i.availability.presented])).toEqual([
      [refs[4], "confirmation_required"],
    ]);
    const sold = await searchListings(t.db, query({ pageSize: 10, availability: ["sold"] }), {
      now: new Date(),
    });
    expect(sold.items.map((i) => i.reference)).toEqual([refs[1]]);
  });
});
