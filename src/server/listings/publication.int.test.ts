import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  activityEvents,
  approvals,
  auditLog,
  facts,
  listingSearchDocuments,
  listings,
  publicationDestinationOutcomes,
  publicationReleases,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Actor } from "@/domain/capabilities";
import { AppError } from "../errors";
import { createStaff, grantService } from "../testing";
import { getPublicListing } from "./detail";
import {
  approveListingVersion,
  confirmListingFacts,
  getListingReadiness,
  publishListing,
  submitListingForReview,
  withdrawListingPublication,
} from "./publication";
import { createListingFixture, createPlaces, defaultConfirm, publishForTest } from "./testing";

// S2 minimal publication path (spec §07.4, §07.7, F24, A31, A56, A66).
let t: TestDatabase;
let publisher: Actor;
let editorOnly: Actor;
beforeAll(async () => {
  t = await createTestDatabase();
  publisher = (await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] })).actor;
  editorOnly = (await createStaff(t.db, { roles: ["content_editor"] })).actor;
});
afterAll(async () => {
  await t?.drop();
});

let keyCounter = 0;
const key = () => `op-${++keyCounter}-${Date.now()}`;

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const version = async (reference: string) =>
  (await getListingReadiness(t.db, publisher, reference)).version;

describe("listing readiness and review (F24, §18.1)", () => {
  it("refuses review while imported required facts are unconfirmed, naming each one", async () => {
    const fixture = await createListingFixture(t.db);
    const ready = await getListingReadiness(t.db, publisher, fixture.reference);
    expect(ready.missingFacts.map((m) => `${m.key}:${m.problem}`).sort()).toEqual([
      "area.built:unreviewed",
      "bedrooms:unreviewed",
      "location:unreviewed",
      "price:unreviewed",
    ]);
    const error = await rejection(
      submitListingForReview(t.db, {
        actor: publisher,
        reference: fixture.reference,
        operationId: key(),
        expectedVersion: ready.version,
      }),
    );
    expect(error.code).toBe("transition_denied");
    expect(error.fieldErrors).toMatchObject({
      "fact.price": ["unreviewed"],
      listing: ["required_facts_missing"],
    });
  });

  it("confirms only decided facts, records who and when, and never changes values", async () => {
    const fixture = await createListingFixture(t.db);
    const undecided = await rejection(
      confirmListingFacts(t.db, {
        actor: publisher,
        reference: fixture.reference,
        operationId: key(),
        expectedVersion: await version(fixture.reference),
        fieldKeys: ["rooms", "price"],
      }),
    );
    expect(undecided.fieldErrors).toEqual({ rooms: ["fact_not_decided"] });

    const before = await t.db.select().from(facts).where(eq(facts.listingId, fixture.listingId));
    const { outcome } = await confirmListingFacts(t.db, {
      actor: publisher,
      reference: fixture.reference,
      operationId: key(),
      expectedVersion: await version(fixture.reference),
      fieldKeys: ["price"],
      note: "Checked against the legacy page",
    });
    expect(outcome.confirmed).toEqual(["price"]);
    const [price] = await t.db
      .select()
      .from(facts)
      .where(and(eq(facts.listingId, fixture.listingId), eq(facts.fieldKey, "price")));
    expect(price).toMatchObject({
      reviewedByStaffId: publisher.id,
      value: before[0]?.value,
      sourceClass: "legacy_import",
    });
    const audit = await t.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.recordId, fixture.listingId), eq(auditLog.action, "listing.facts.confirm")),
      );
    expect(audit).toHaveLength(1);
  });

  it("an unknown required price blocks review as undecided (a missing price is not zero)", async () => {
    const fixture = await createListingFixture(t.db, {
      facts: {
        price: { state: "unknown", subject: "listing" },
        location: { state: "known", value: { country: "BG" } },
        area: { state: "unknown" },
        bedrooms: { state: "unknown" },
      },
    });
    const ready = await getListingReadiness(t.db, publisher, fixture.reference);
    expect(ready.missingFacts).toEqual([
      { key: "price", problem: "undecided", state: "unknown" },
      { key: "location", problem: "unreviewed", state: "known" },
    ]);
  });
});

describe("A66: only a named human with the capability takes a publication step", () => {
  it("rejects the AI service, visitors and system jobs whatever they are granted", async () => {
    await grantService(t.db, "hermes", { role: "ai_service" });
    const fixture = await createListingFixture(t.db);
    const expectedVersion = await version(fixture.reference);
    const actors: Actor[] = [
      { kind: "ai_service", id: "hermes" },
      { kind: "visitor", id: "submission:x" },
      { kind: "system", id: "publication-release" },
    ];
    for (const actor of actors) {
      const base = { actor, reference: fixture.reference, operationId: key(), expectedVersion };
      expect(
        (await rejection(confirmListingFacts(t.db, { ...base, fieldKeys: ["price"] }))).code,
      ).toBe("forbidden");
      expect((await rejection(submitListingForReview(t.db, base))).code).toBe("forbidden");
      expect((await rejection(publishListing(t.db, { ...base, versionNumber: 1 }))).code).toBe(
        "forbidden",
      );
    }
  });

  it("rejects staff without listing.review_facts", async () => {
    const fixture = await createListingFixture(t.db);
    const error = await rejection(
      confirmListingFacts(t.db, {
        actor: editorOnly,
        reference: fixture.reference,
        operationId: key(),
        expectedVersion: await version(fixture.reference),
        fieldKeys: ["price"],
      }),
    );
    expect(error.code).toBe("forbidden");
  });
});

describe("approve and publish (A31, A56)", () => {
  it("binds approval to the content hash, releases with a verified website outcome and writes the projection", async () => {
    const places = await createPlaces(t.db);
    const fixture = await createListingFixture(t.db, { placeId: places.settlementId });
    const { reference } = fixture;
    await confirmListingFacts(t.db, {
      actor: publisher,
      reference,
      operationId: key(),
      expectedVersion: await version(reference),
      fieldKeys: [...defaultConfirm],
    });
    await submitListingForReview(t.db, {
      actor: publisher,
      reference,
      operationId: key(),
      expectedVersion: await version(reference),
    });

    const wrongHash = await rejection(
      approveListingVersion(t.db, {
        actor: publisher,
        reference,
        operationId: key(),
        expectedVersion: await version(reference),
        versionNumber: 1,
        contentHash: "0".repeat(64),
      }),
    );
    expect(wrongHash.code).toBe("version_conflict");

    const approved = await approveListingVersion(t.db, {
      actor: publisher,
      reference,
      operationId: key(),
      expectedVersion: await version(reference),
      versionNumber: 1,
      contentHash: fixture.contentHash,
    });
    expect(approved.outcome).toMatchObject({
      editorialState: "approved",
      contentHash: fixture.contentHash,
    });

    const stale = await rejection(
      publishListing(t.db, {
        actor: publisher,
        reference,
        operationId: key(),
        expectedVersion: 1,
        versionNumber: 1,
      }),
    );
    expect(stale.code).toBe("version_conflict");

    const command = {
      actor: publisher,
      reference,
      operationId: key(),
      expectedVersion: await version(reference),
      versionNumber: 1,
    };
    const published = await publishListing(t.db, command);
    expect(published.outcome).toMatchObject({
      distributionState: "published",
      releaseKind: "publish",
      versionNumber: 1,
      searchDocument: "written",
    });
    expect(published.outcome.releaseReference).toMatch(/^RL-\d{4}-\d{6}$/);

    // A retry of the same command converges on the same outcome and writes nothing new.
    const replay = await publishListing(t.db, command);
    expect(replay).toMatchObject({ replayed: true, outcome: published.outcome });
    const releases = await t.db
      .select()
      .from(publicationReleases)
      .where(eq(publicationReleases.subjectId, fixture.listingId));
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ state: "published", confirmedByStaffId: publisher.id });
    const outcomes = await t.db
      .select()
      .from(publicationDestinationOutcomes)
      .where(eq(publicationDestinationOutcomes.releaseId, releases[0]?.id ?? ""));
    expect(outcomes).toEqual([
      expect.objectContaining({ destination: "website", locale: "bg", state: "verified" }),
    ]);

    const [listing] = await t.db.select().from(listings).where(eq(listings.id, fixture.listingId));
    expect(listing).toMatchObject({ publishedVersionNumber: 1, distributionState: "published" });
    const [document] = await t.db
      .select()
      .from(listingSearchDocuments)
      .where(eq(listingSearchDocuments.listingId, fixture.listingId));
    expect(document).toMatchObject({
      priceState: "known",
      priceAmountMinor: 10_000_000,
      bedrooms: 2,
      builtArea: "80.00",
      placeIds: [places.settlementId, places.municipalityId, places.districtId],
    });

    const decided = await t.db
      .select()
      .from(approvals)
      .where(
        and(eq(approvals.subjectId, fixture.versionId), eq(approvals.decidedById, publisher.id)),
      );
    expect(decided.map((a) => [a.kind, a.subjectHash, a.decidedWithCapability]).sort()).toEqual([
      ["factual", fixture.contentHash, "listing.review_facts"],
      ["publication", fixture.contentHash, "publication.release"],
    ]);
    const timeline = await t.db
      .select({ key: activityEvents.messageKey })
      .from(activityEvents)
      .where(eq(activityEvents.recordId, fixture.listingId))
      .orderBy(asc(activityEvents.occurredAt));
    expect(timeline.map((e) => e.key)).toEqual([
      "activity.listing.facts_confirmed",
      "activity.listing.in_review",
      "activity.listing.approved",
      "activity.listing.publishing",
      "activity.listing.published",
    ]);

    const again = await rejection(
      publishListing(t.db, {
        ...command,
        operationId: key(),
        expectedVersion: await version(reference),
      }),
    );
    expect(again.fieldErrors?.listing).toEqual(["already_published"]);
  });

  it("refuses release without the owner's approval of the same content", async () => {
    const fixture = await createListingFixture(t.db, { ownerApproval: false });
    const error = await rejection(
      publishForTest(t.db, publisher, fixture.reference, defaultConfirm),
    );
    expect(error.fieldErrors?.listing).toEqual(["owner_approval_required"]);
    const [listing] = await t.db.select().from(listings).where(eq(listings.id, fixture.listingId));
    expect(listing).toMatchObject({
      distributionState: "never_published",
      publishedVersionNumber: null,
    });
  });

  it("withdrawal removes the projection and leaves a removed public page with its reference only", async () => {
    const fixture = await createListingFixture(t.db, { exactAddress: "ul. Private 7" });
    await publishForTest(t.db, publisher, fixture.reference, defaultConfirm);
    const { outcome } = await withdrawListingPublication(t.db, {
      actor: publisher,
      reference: fixture.reference,
      operationId: key(),
      expectedVersion: await version(fixture.reference),
      reason: "Owner asked to stop marketing",
    });
    expect(outcome).toMatchObject({ distributionState: "withdrawn", searchDocument: "removed" });
    const documents = await t.db
      .select()
      .from(listingSearchDocuments)
      .where(eq(listingSearchDocuments.listingId, fixture.listingId));
    expect(documents).toHaveLength(0);
    const page = await getPublicListing(t.db, { reference: fixture.reference, locale: "en" });
    expect(page).toMatchObject({
      status: "unavailable",
      listing: { reason: "removed", title: null },
    });
    expect(JSON.stringify(page)).not.toContain("Private 7");
  });
});
