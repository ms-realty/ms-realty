import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { approvals, translations } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Actor } from "@/domain/capabilities";
import { refreshSearchDocument } from "../search/projection";
import { createStaff } from "../testing";
import { getPublicListing } from "./detail";
import {
  addMedia,
  createListingFixture,
  createPlaces,
  defaultConfirm,
  type ListingFixture,
  type PlaceFixture,
  publishForTest,
  setCommercialState,
} from "./testing";

// P05/P06 listing detail and P21 unavailable listing (spec F03, F09, §18.1, §19.2, §20.3).
let t: TestDatabase;
let staff: Actor;
let place: PlaceFixture;
let main: ListingFixture;
let sold: ListingFixture;
const alternatives: string[] = [];

beforeAll(async () => {
  process.env.MEDIA_PUBLIC_BASE_URL = "https://media.example.test";
  t = await createTestDatabase();
  staff = (await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] })).actor;
  place = await createPlaces(t.db);
  main = await createListingFixture(t.db, {
    placeId: place.settlementId,
    exactAddress: "ul. Hidden 12, ap. 4",
    availabilityCheckedAt: new Date("2026-08-13T14:41:21Z"),
  });
  await addMedia(t.db, main, { public: true, position: 0, altText: "Facade" });
  await addMedia(t.db, main, { public: false, position: 1 });
  await publishForTest(t.db, staff, main.reference, defaultConfirm);

  sold = await createListingFixture(t.db, { placeId: place.settlementId });
  await publishForTest(t.db, staff, sold.reference, defaultConfirm);
  await setCommercialState(t.db, sold.listingId, "sold");
  await refreshSearchDocument(t.db, sold.listingId);
  for (let i = 0; i < 4; i += 1) {
    const other = await createListingFixture(t.db, { placeId: place.settlementId });
    await publishForTest(t.db, staff, other.reference, defaultConfirm);
    alternatives.push(other.reference);
  }
});
afterAll(async () => {
  await t?.drop();
});

describe("getPublicListing", () => {
  it("P05: presents the released version with fact states, provenance and what to confirm", async () => {
    const result = await getPublicListing(t.db, {
      reference: main.reference.toLowerCase(),
      locale: "en",
    });
    if (result.status !== "available") throw new Error(`unexpected ${result.status}`);
    const { listing } = result;
    expect(listing).toMatchObject({
      reference: main.reference,
      slug: main.reference.toLowerCase(),
      version: 1,
      purpose: "sale",
      propertyType: "apartment",
      titleLocale: "bg",
      price: {
        state: "known",
        value: { amountMinor: 10_000_000, period: "total", basis: "asking" },
      },
      commercial: {
        state: "availability_unconfirmed",
        availability: "needs_confirmation",
        primaryAction: "ask_question",
        availabilityCheckedAt: "2026-08-13T14:41:21.000Z",
      },
      description: {
        source: { locale: "bg", text: "Описание на имота." },
        translation: null,
        translationApproved: false,
      },
      place: {
        country: "BG",
        settlement: { id: place.settlementId, name: "Sandanski" },
        municipality: { id: place.municipalityId },
        neighborhood: null,
        precision: "settlement",
      },
      responsibleTeam: { label: "MS Realty" },
      servedInLocale: false,
    });
    const facts = Object.fromEntries(listing.facts.map((f) => [f.key, f]));
    expect(Object.keys(facts)).toEqual([
      "price",
      "area.built",
      "bedrooms",
      "rooms",
      "feature.condition",
    ]);
    expect(facts.price).toMatchObject({ verification: "imported", reviewed: true, group: "price" });
    expect(facts.rooms).toMatchObject({ fact: { state: "unknown" }, reviewed: false });
    expect(listing.toConfirm.map((c) => c.key)).toEqual([
      "rooms",
      "feature.condition",
      "feature.floor_number",
      "feature.total_floors",
      "feature.parking_kind",
      "feature.construction_status",
    ]);
    expect(listing.media).toEqual([
      expect.objectContaining({
        alt: "Facade",
        url: expect.stringMatching(/^https:\/\/media\.example\.test\/public\//),
      }),
    ]);
  });

  it("§20.3: never exposes the exact address, internal notes, staff ids or staging media", async () => {
    const result = await getPublicListing(t.db, { reference: main.reference, locale: "bg" });
    const json = JSON.stringify(result);
    for (const secret of [
      "Hidden 12",
      "internal note",
      staff.id,
      "staging/",
      "legacy:test",
      "Test neighborhood",
    ]) {
      expect(json).not.toContain(secret);
    }
    // The source locale is served and indexable; an unapproved locale is neither.
    expect(result).toMatchObject({
      status: "available",
      listing: { servedInLocale: true, indexable: true },
    });
    const english = await getPublicListing(t.db, { reference: main.reference, locale: "en" });
    expect(english).toMatchObject({ listing: { servedInLocale: false, indexable: false } });
  });

  it("serves an approved translation of the released version in its locale", async () => {
    const [approval] = await t.db
      .insert(approvals)
      .values({
        kind: "language",
        state: "approved",
        subjectType: "translation",
        subjectId: main.versionId,
        subjectVersion: 1,
        subjectHash: "h",
        requestedByKind: "staff",
        requestedById: staff.id,
        decidedByKind: "staff",
        decidedById: staff.id,
        decidedAt: new Date(),
      })
      .returning({ id: approvals.id });
    await t.db.insert(translations).values({
      subjectType: "listing",
      subjectId: main.listingId,
      locale: "de",
      sourceVersion: 1,
      state: "approved",
      title: "Wohnung",
      body: { description: "Beschreibung." },
      reviewedByStaffId: staff.id,
      reviewedAt: new Date(),
      approvalId: approval?.id,
    });
    const result = await getPublicListing(t.db, { reference: main.reference, locale: "de" });
    expect(result).toMatchObject({
      status: "available",
      listing: {
        title: "Wohnung",
        titleLocale: "de",
        description: {
          translation: { locale: "de", text: "Beschreibung." },
          translationApproved: true,
        },
        servedInLocale: true,
      },
    });
  });

  it("P21: a sold listing says so and offers up to three offered alternatives in the same place", async () => {
    const result = await getPublicListing(t.db, { reference: sold.reference, locale: "en" });
    if (result.status !== "unavailable") throw new Error(`unexpected ${result.status}`);
    expect(result.listing).toMatchObject({
      reason: "sold",
      purpose: "sale",
      alternativesCriteria: { purpose: "sale", place: { id: place.settlementId } },
    });
    expect(result.listing.alternatives).toHaveLength(3);
    const offered = [...alternatives, main.reference];
    for (const card of result.listing.alternatives) expect(offered).toContain(card.reference);
  });

  it("is not_found for a listing never published and for anything that is not a listing reference", async () => {
    const draft = await createListingFixture(t.db, { placeId: place.settlementId });
    expect(await getPublicListing(t.db, { reference: draft.reference, locale: "en" })).toEqual({
      status: "not_found",
    });
    expect(await getPublicListing(t.db, { reference: "RQ-2026-000001", locale: "en" })).toEqual({
      status: "not_found",
    });
    expect(await getPublicListing(t.db, { reference: "../etc", locale: "en" })).toEqual({
      status: "not_found",
    });
  });
});
