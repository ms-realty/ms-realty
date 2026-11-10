// ADR 0012 keeps the strict path for a brand that wants it: under `reviewed_documents` and an
// independent review, one decision still publishes only with reviewed seller documents and only
// by someone other than the author, and an attestation alone never counts as seller evidence.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { publicationPolicy } from "@/config/tenant";
import { listings, sellerInstructions } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { staffFixture } from "../cases/testing";
import { searchListings } from "../search/search";
import { publishListingByAttestation } from "./attested";
import { currentEligibility } from "./commands";
import {
  createListingFixture,
  createPlaces,
  newOperationId,
  type PlaceFixture,
  publicationFixtureStorage,
} from "./testing";

vi.mock("@/config/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/tenant")>();
  return { ...actual, publicationPolicy: actual.strictPublicationPolicy };
});

let t: TestDatabase;
let author: Awaited<ReturnType<typeof staffFixture>>;
let colleague: Awaited<ReturnType<typeof staffFixture>>;
let places: PlaceFixture;

beforeAll(async () => {
  t = await createTestDatabase();
  author = await staffFixture(t.db);
  colleague = await staffFixture(t.db);
  places = await createPlaces(t.db);
});
afterAll(async () => {
  await t?.drop();
});

const publish = async (reference: string, by: typeof author) => {
  const [listing] = await t.db.select().from(listings).where(eq(listings.reference, reference));
  return publishListingByAttestation(
    t.db,
    by.session,
    {
      reference,
      operationId: newOperationId(),
      expectedVersion: listing?.version ?? 0,
      attested: true,
      locale: "en",
    },
    { storage: publicationFixtureStorage },
  );
};
const searchFor = async (reference: string) =>
  (await searchListings(t.db, { locale: "bg", purpose: "sale", q: reference })).items.map(
    (row) => row.reference,
  );

describe("strict publication policy (reviewed documents, independent review)", () => {
  it("runs under the strict policy in this file", () => {
    expect(publicationPolicy).toEqual({
      sellerEvidence: "reviewed_documents",
      independentReview: true,
      photosRequired: true,
      signIn: "recent",
      attestationOutlivesAuthor: false,
    });
  });

  it("refuses the author and lets a colleague publish with reviewed documents", async () => {
    // The fixture's default seller instruction carries reviewed, sealed, scanned documents.
    const f = await createListingFixture(t.db, {
      reviewerId: author.id,
      placeId: places.settlementId,
    });
    expect(await publish(f.reference, author)).toMatchObject({
      status: "blocked",
      reason: "another_person_required",
    });
    expect(await searchFor(f.reference)).toEqual([]);
    expect(await publish(f.reference, colleague)).toMatchObject({
      status: "published",
      locales: ["bg"],
    });
    expect(await searchFor(f.reference)).toEqual([f.reference]);
  });

  it("requires the seller documents and never records an attestation as seller evidence", async () => {
    const f = await createListingFixture(t.db, {
      reviewerId: author.id,
      placeId: places.settlementId,
      sellerInstruction: false,
    });
    expect(await publish(f.reference, colleague)).toMatchObject({
      status: "blocked",
      reason: "seller_documents_required",
    });
    expect(
      await t.db
        .select()
        .from(sellerInstructions)
        .where(eq(sellerInstructions.listingId, f.listingId)),
    ).toEqual([]);
    // Even a recorded attestation instruction is not evidence under this policy.
    const [listing] = await t.db.select().from(listings).where(eq(listings.id, f.listingId));
    if (!listing) throw new Error("listing missing");
    await t.db.insert(sellerInstructions).values({
      reference: `SI-STRICT-${randomUUID().slice(0, 8)}`,
      propertyId: f.propertyId,
      listingId: f.listingId,
      revisionNumber: 1,
      state: "agreed",
      commercialTerms: {
        basis: "staff_attestation",
        attestationOperationId: randomUUID(),
        price: { amountMinor: 9_500_000, currency: "EUR", period: "total", basis: "asking" },
      },
      disclosure: { publicPrecision: "settlement" },
      mediaUsageRights: { granted: true },
      representationScope: "sale",
      commissionTerms: "Not recorded in the system: published on a staff attestation.",
      publicationPermission: true,
      contentDigest: "strict-test",
      evidenceDocumentIds: [],
      agreedAt: new Date(Date.now() - 60_000),
      recordedById: colleague.id,
    });
    const eligibility = await currentEligibility(t.db, listing, "bg", 0, new Date());
    expect(eligibility.input.sellerInstructionValid).toBe(false);
    expect(await publish(f.reference, colleague)).toMatchObject({
      reason: "seller_documents_required",
    });
    expect(await searchFor(f.reference)).toEqual([]);
  });

  it("waits for every photo to be ready", async () => {
    const f = await createListingFixture(t.db, {
      reviewerId: author.id,
      placeId: places.settlementId,
      photoState: "unprocessed",
    });
    expect(await publish(f.reference, colleague)).toMatchObject({ reason: "photos_required" });
    expect(await searchFor(f.reference)).toEqual([]);
  });

  it("asks for a recent sign-in to publish", async () => {
    const f = await createListingFixture(t.db, {
      reviewerId: author.id,
      placeId: places.settlementId,
    });
    const { session } = await createSession(
      t.db,
      { kind: "staff", id: colleague.id },
      new Date(Date.now() - 20 * 60_000),
    );
    await expect(publish(f.reference, { ...colleague, session })).rejects.toMatchObject({
      code: "step_up_required",
    });
    expect(await searchFor(f.reference)).toEqual([]);
  });
});
