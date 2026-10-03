import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingRevisions, listings, mediaAssets } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Actor } from "@/domain/capabilities";
import { withdrawPublication } from "../publication/commands";
import {
  createListingFixture,
  createPlaces,
  eur,
  type ListingFixture,
  newOperationId,
  type PlaceFixture,
  publishForTest,
} from "../publication/testing";
import { createStaff } from "../testing";
import { getPublicListing } from "./detail";

// P05/P06 public listing detail from the active manifest only (§7.3, §10; AT04, AT05, AT28).
let t: TestDatabase;
let staff: { id: string; actor: Actor };
let places: PlaceFixture;
let live: ListingFixture;
const now = new Date();

beforeAll(async () => {
  t = await createTestDatabase();
  staff = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  places = await createPlaces(t.db);
  live = await createListingFixture(t.db, {
    reviewerId: staff.id,
    placeId: places.settlementId,
    photos: 2,
    price: { state: "known", value: eur(95_000) },
    translations: { en: { title: "Bright apartment", description: "In inland Sandanski." } },
  });
  await publishForTest(t.db, staff.actor, live, ["bg", "en"]);
});
afterAll(async () => {
  await t?.drop();
});

describe("getPublicListing", () => {
  it("shows the manifest's facts, copy, media and live availability, and nothing private", async () => {
    const result = await getPublicListing(t.db, { reference: live.reference, locale: "en", now });
    expect(result.status).toBe("listing");
    if (result.status !== "listing") return;
    const { listing } = result;
    expect(listing).toMatchObject({
      reference: live.reference,
      locale: "en",
      title: "Bright apartment",
      description: "In inland Sandanski.",
      price: {
        state: "known",
        value: { amountMinor: 9_500_000, currency: "EUR", period: "total" },
      },
      place: { country: "BG", precision: "settlement", neighborhood: null },
      availability: {
        presented: "available",
        freshness: "current_under_policy",
        primaryAction: "request_viewing",
      },
      responsibleTeam: { label: "MS Realty" },
    });
    expect(listing.place.settlement?.name).toBe("Sandanski");
    expect(listing.media.map((m) => m.position)).toEqual([0, 1]);
    // AT04: an unknown decision fact stays unknown and becomes a question, never a false.
    expect(listing.toConfirm).toContainEqual({
      key: "feature.condition",
      group: "condition",
      state: "unknown",
    });
    expect(listing.toConfirm.map((i) => i.key)).not.toContain("bedrooms");
    expect(listing.facts.find((f) => f.key === "feature.lift")?.fact).toMatchObject({
      state: "known",
      value: true,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Fixture street");
    expect(serialized).not.toContain("41.5667");
    expect(serialized).not.toContain(staff.id);
  });

  it("AT05: serves no other locale's copy: a locale without an active manifest is not found", async () => {
    expect(await getPublicListing(t.db, { reference: live.reference, locale: "de", now })).toEqual({
      status: "not_found",
    });
    expect(await getPublicListing(t.db, { reference: "MS-99999", locale: "bg", now })).toEqual({
      status: "not_found",
    });
  });

  it("AT05: a newer unapproved revision never leaks into the public page", async () => {
    const [current] = await t.db
      .select()
      .from(listingRevisions)
      .where(eq(listingRevisions.id, live.revisionId));
    if (!current) throw new Error("revision missing");
    await t.db.insert(listingRevisions).values({
      listingId: live.listingId,
      revisionNumber: 2,
      factRevisionId: current.factRevisionId,
      terms: { purpose: "sale", facts: { price: { state: "known", value: eur(1) } } },
      sourceCopy: { locale: "bg", text: { title: "Draft title", description: "Draft" } },
      disclosure: current.disclosure,
      contentDigest: "draft-digest",
      createdByKind: "staff",
      createdById: staff.id,
    });
    const result = await getPublicListing(t.db, { reference: live.reference, locale: "bg", now });
    expect(result.status === "listing" && result.listing.price).toMatchObject({
      value: { amountMinor: 9_500_000 },
    });
    expect(JSON.stringify(result)).not.toContain("Draft title");
  });

  it("presents an expired availability confirmation as confirmation required", async () => {
    const later = new Date(now.getTime() + 20 * 86_400_000);
    const result = await getPublicListing(t.db, {
      reference: live.reference,
      locale: "bg",
      now: later,
    });
    expect(result.status === "listing" && result.listing.availability).toMatchObject({
      presented: "confirmation_required",
      freshness: "review_due",
      primaryAction: "ask_question",
    });
  });

  it("AT28: an asset that loses clearance disappears from the page at once", async () => {
    await t.db
      .update(mediaAssets)
      .set({ review: "rejected" })
      .where(eq(mediaAssets.id, live.assetIds[1] ?? ""));
    const result = await getPublicListing(t.db, { reference: live.reference, locale: "bg", now });
    expect(result.status === "listing" && result.listing.media.map((m) => m.assetId)).toEqual([
      live.assetIds[0],
    ]);
  });

  it("shows a sold listing as sold, with offered alternatives instead of an offer", async () => {
    const other = await createListingFixture(t.db, {
      reviewerId: staff.id,
      placeId: places.settlementId,
    });
    await publishForTest(t.db, staff.actor, other);
    const sold = await createListingFixture(t.db, {
      reviewerId: staff.id,
      placeId: places.settlementId,
    });
    await publishForTest(t.db, staff.actor, sold);
    await t.db
      .update(listings)
      .set({ commercialState: "sold" })
      .where(eq(listings.id, sold.listingId));
    const result = await getPublicListing(t.db, { reference: sold.reference, locale: "bg", now });
    expect(result.status).toBe("listing");
    if (result.status !== "listing") return;
    expect(result.listing.availability).toMatchObject({
      presented: "sold",
      primaryAction: "view_similar",
    });
    const alternatives = result.alternatives.map((a) => a.reference);
    expect(alternatives).toContain(other.reference);
    expect(alternatives).not.toContain(sold.reference);
  });

  it("keeps a truthful unavailable surface after withdrawal with only reference and purpose", async () => {
    const gone = await createListingFixture(t.db, {
      reviewerId: staff.id,
      placeId: places.settlementId,
    });
    await publishForTest(t.db, staff.actor, gone);
    await withdrawPublication(t.db, {
      actor: staff.actor,
      operationId: newOperationId(),
      expectedRevision: 0,
      reference: gone.reference,
      reason: "Owner withdrew",
    });
    const result = await getPublicListing(t.db, { reference: gone.reference, locale: "bg", now });
    expect(result).toMatchObject({
      status: "unavailable",
      reference: gone.reference,
      purpose: "sale",
    });
    expect(JSON.stringify(result)).not.toContain(`Апартамент ${gone.reference}`);
    // Never published in English: not found there, not "unavailable".
    expect(await getPublicListing(t.db, { reference: gone.reference, locale: "en", now })).toEqual({
      status: "not_found",
    });
  });
});
