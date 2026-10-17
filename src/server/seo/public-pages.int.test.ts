import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { currentPublications, listings, sellerInstructions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createListingFixture, createPlaces, publishForTest } from "@/server/publication/testing";
import { createStaff } from "@/server/testing";
import { readPublicCataloguePages, readPublicListingRoutePages } from "./public-pages";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
}, 60000);
afterAll(async () => {
  await t?.drop();
});
it("sitemap/hreflang read only active locale publications, retain sold listings, and immediately remove withdrawn consent", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  const places = await createPlaces(t.db);
  const published = await createListingFixture(t.db, {
    reviewerId: staff.id,
    placeId: places.settlementId,
    translations: {
      en: { title: "Synthetic approved translation", description: "Fictional property." },
    },
  });
  const draft = await createListingFixture(t.db, {
    reviewerId: staff.id,
    placeId: places.settlementId,
  });
  await publishForTest(t.db, staff.actor, published, ["bg", "en"]);
  const pages = await readPublicCataloguePages(t.db);
  expect(pages.map((page) => [page.reference, page.locale])).toEqual([
    [published.reference, "bg"],
    [published.reference, "en"],
  ]);
  expect(pages.some((page) => page.reference === draft.reference)).toBe(false);
  expect(pages.every((page) => page.publishedAt instanceof Date)).toBe(true);
  expect(await readPublicCataloguePages(t.db, "MS-99999")).toEqual([]);
  await t.db
    .update(listings)
    .set({ commercialState: "sold" })
    .where(eq(listings.id, published.listingId));
  expect(
    (await readPublicCataloguePages(t.db, published.reference)).map((page) => page.locale),
  ).toEqual(["bg", "en"]);
  await t.db
    .update(sellerInstructions)
    .set({ state: "withdrawn" })
    .where(eq(sellerInstructions.listingId, published.listingId));
  expect(await readPublicCataloguePages(t.db, published.reference)).toEqual([]);
  const retained = (await readPublicListingRoutePages(t.db)).filter(
    (page) => page.reference === published.reference,
  );
  expect(retained.map((page) => [page.locale, page.surface, page.availableIn])).toEqual([
    ["bg", "unavailable", []],
    ["en", "unavailable", []],
  ]);
});

it("the served listing catalogue includes only stable public 200 identities, separate from approved fact languages", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  const places = await createPlaces(t.db);
  const live = await createListingFixture(t.db, {
    reviewerId: staff.id,
    placeId: places.settlementId,
    translations: { en: { title: "Synthetic public title", description: "Synthetic copy." } },
  });
  const draft = await createListingFixture(t.db, {
    reviewerId: staff.id,
    placeId: places.settlementId,
  });
  const portal = await createListingFixture(t.db, {
    reviewerId: staff.id,
    placeId: places.settlementId,
  });
  await publishForTest(t.db, staff.actor, live, ["bg", "en"]);
  await publishForTest(t.db, staff.actor, portal, ["bg"]);
  await t.db
    .update(currentPublications)
    .set({ destination: "manual_portal" })
    .where(eq(currentPublications.listingId, portal.listingId));

  const routes = await readPublicListingRoutePages(t.db);
  expect(routes.some((page) => [draft.reference, portal.reference].includes(page.reference))).toBe(
    false,
  );
  const liveRoutes = routes.filter((page) => page.reference === live.reference);
  expect(liveRoutes.map((page) => [page.locale, page.surface, page.availableIn])).toEqual([
    ["bg", "listing", ["bg", "en"]],
    ["en", "listing", ["bg", "en"]],
    ["ru", "translation_fallback", []],
    ["de", "translation_fallback", []],
    ["nl", "translation_fallback", []],
    ["el", "translation_fallback", []],
    ["he", "translation_fallback", []],
  ]);
  expect(
    liveRoutes.every(
      (page) => page.path === `/properties/${live.reference}/${live.reference.toLowerCase()}`,
    ),
  ).toBe(true);
  expect(
    liveRoutes
      .filter((page) => page.surface !== "listing")
      .every((page) => page.publishedAt === undefined),
  ).toBe(true);
  const serialized = JSON.stringify(liveRoutes);
  for (const privateValue of [
    "Synthetic public title",
    "Synthetic copy.",
    "Fixture street",
    staff.id,
    live.listingId,
  ])
    expect(serialized).not.toContain(privateValue);

  await t.db
    .update(currentPublications)
    .set({
      state: "restricted",
      reason: "Synthetic translation restriction",
      restrictedAt: new Date(),
    })
    .where(
      and(eq(currentPublications.listingId, live.listingId), eq(currentPublications.locale, "en")),
    );
  const restricted = (await readPublicListingRoutePages(t.db)).filter(
    (page) => page.reference === live.reference,
  );
  expect(restricted.find((page) => page.locale === "en")).toMatchObject({
    surface: "unavailable",
    availableIn: [],
  });
  expect(restricted.find((page) => page.locale === "bg")).toMatchObject({
    surface: "listing",
    availableIn: ["bg"],
  });

  await t.db
    .update(listings)
    .set({ publicationGeneration: 1 })
    .where(eq(listings.id, live.listingId));
  const superseded = (await readPublicListingRoutePages(t.db)).filter(
    (page) => page.reference === live.reference,
  );
  expect(superseded.map((page) => [page.locale, page.surface, page.availableIn])).toEqual([
    ["bg", "unavailable", []],
    ["en", "unavailable", []],
  ]);

  await t.db
    .update(currentPublications)
    .set({ state: "withdrawn", reason: "Synthetic withdrawal", withdrawnAt: new Date() })
    .where(eq(currentPublications.listingId, live.listingId));
  const withdrawn = (await readPublicListingRoutePages(t.db)).filter(
    (page) => page.reference === live.reference,
  );
  expect(withdrawn.map((page) => [page.locale, page.surface, page.availableIn])).toEqual([
    ["bg", "unavailable", []],
    ["en", "unavailable", []],
  ]);
  expect(await readPublicCataloguePages(t.db, live.reference)).toEqual([]);
});
