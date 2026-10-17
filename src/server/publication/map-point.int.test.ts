import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { geographyPlaces, publicationManifests } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { getPublicListing } from "../listings/detail";
import { createStaff } from "../testing";
import { activateManifest } from "./commands";
import { prepareMapPoint } from "./map-point";
import { parseDisclosure, publicPlace } from "./presentation";
import {
  createListingFixture,
  createPlaces,
  listingVersion,
  newOperationId,
  publicationFixtureStorage,
  publishForTest,
} from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
describe("manifest map disclosure", () => {
  it("freezes the permitted area centre and never enriches a legacy manifest", async () => {
    const staff = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
    const places = await createPlaces(t.db);
    await t.db
      .update(geographyPlaces)
      .set({ latitude: "41.55", longitude: "23.28" })
      .where(eq(geographyPlaces.id, places.settlementId));
    const f = await createListingFixture(t.db, {
      reviewerId: staff.id,
      placeId: places.settlementId,
    });
    const [manifestId] = await publishForTest(t.db, staff.actor, f, ["bg"]);
    const read = () => getPublicListing(t.db, { reference: f.reference, locale: "bg" });
    const first = await read();
    expect(first.status).toBe("listing");
    if (first.status !== "listing") throw new Error("Missing published fixture");
    expect(first.listing.place.mapPoint).toEqual({
      latitude: 41.55,
      longitude: 23.28,
      level: "settlement",
      placeId: places.settlementId,
    });
    expect(JSON.stringify(first)).not.toContain("41.5667");
    await t.db
      .update(geographyPlaces)
      .set({ latitude: "42.0" })
      .where(eq(geographyPlaces.id, places.settlementId));
    const second = await read();
    if (second.status !== "listing") throw new Error("Missing published fixture");
    expect(second.listing.place.mapPoint).toEqual(first.listing.place.mapPoint);
    if (!manifestId) throw new Error("Missing manifest");
    // A changed area centre cannot silently activate a previously prepared disclosure.
    await expect(
      activateManifest(
        t.db,
        {
          actor: staff.actor,
          operationId: newOperationId(),
          expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
          manifestId,
        },
        { storage: publicationFixtureStorage },
      ),
    ).rejects.toMatchObject({ code: "approval_stale" });

    const [manifest] = await t.db
      .select()
      .from(publicationManifests)
      .where(eq(publicationManifests.id, manifestId));
    const { mapPoint: _point, ...legacy } = parseDisclosure(manifest?.disclosure);
    // The database itself prevents rewriting a published location disclosure.
    await expect(
      t.db
        .update(publicationManifests)
        .set({ disclosure: legacy })
        .where(eq(publicationManifests.id, manifestId)),
    ).rejects.toThrow();
    expect(publicPlace([], parseDisclosure(legacy), "bg").mapPoint).toBeNull();
  });
  it("uses only a permitted ancestor in the same country and handles missing coordinates", async () => {
    const places = await createPlaces(t.db);
    await t.db
      .update(geographyPlaces)
      .set({ latitude: "41.55", longitude: "23.28" })
      .where(eq(geographyPlaces.id, places.settlementId));
    expect(await prepareMapPoint(t.db, places.settlementId, "BG", "region")).toBeNull();
    await t.db
      .update(geographyPlaces)
      .set({ latitude: "42.0", longitude: "23.0" })
      .where(eq(geographyPlaces.id, places.districtId));
    expect(await prepareMapPoint(t.db, places.settlementId, "BG", "region")).toMatchObject({
      latitude: 42,
      level: "district",
    });
    expect(await prepareMapPoint(t.db, places.settlementId, "GR", "exact")).toBeNull();
    await t.db
      .update(geographyPlaces)
      .set({ latitude: null })
      .where(eq(geographyPlaces.id, places.settlementId));
    expect(await prepareMapPoint(t.db, places.settlementId, "BG", "exact")).toMatchObject({
      level: "district",
    });
    expect(await prepareMapPoint(t.db, null, "BG", "exact")).toBeNull();
  });
});
