import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approvals,
  currentPublications,
  destinationDeliveries,
  documents,
  documentVersions,
  grants,
  listingSearchDocuments,
  listings,
  localizedRevisions,
  mediaAssets,
  outboxEvents,
  propertyFactRevisions,
  propertyRelationships,
  publicationManifests,
  sellerInstructions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Actor } from "@/domain/capabilities";
import { AppError } from "../errors";
import { createStaff, grantService } from "../testing";
import {
  activateManifest as activate,
  approveFactRevision,
  approveListingRevision,
  prepareManifest as prepareCommand,
  restrictPublication,
  submitListingRevision,
  withdrawPublication,
} from "./commands";
import { eligiblePublications, loadPublishedListings } from "./presentation";
import {
  createListingFixture,
  createPlaces,
  listingVersion,
  newOperationId,
  type PlaceFixture,
  publicationFixtureStorage,
  publishForTest,
  publishLocales,
} from "./testing";

const prepareManifest = (
  db: Parameters<typeof prepareCommand>[0],
  command: Parameters<typeof prepareCommand>[1],
) => prepareCommand(db, command, { storage: publicationFixtureStorage });
const activateManifest = (
  db: Parameters<typeof activate>[0],
  command: Parameters<typeof activate>[1],
) => activate(db, command, { storage: publicationFixtureStorage });

// Publication path (architecture §7.2–§7.4): manifest, pointer and generation.
let t: TestDatabase;
let publisher: { id: string; actor: Actor };
let editor: { id: string; actor: Actor };
let places: PlaceFixture;
const hermes: Actor = { kind: "ai_service", id: "hermes" };

beforeAll(async () => {
  t = await createTestDatabase();
  publisher = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  editor = await createStaff(t.db, { roles: ["content_editor"] });
  await grantService(t.db, "hermes", { role: "ai_service" });
  places = await createPlaces(t.db);
});
afterAll(async () => {
  await t?.drop();
});

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const fixture = (options: Partial<Parameters<typeof createListingFixture>[1]> = {}) =>
  createListingFixture(t.db, {
    reviewerId: publisher.id,
    placeId: places.settlementId,
    ...options,
  });

async function reviewAndApprove(f: Awaited<ReturnType<typeof fixture>>) {
  await approveFactRevision(t.db, {
    actor: publisher.actor,
    operationId: newOperationId(),
    expectedRevision: 1,
    factRevisionId: f.factRevisionId,
    scope: "All facts",
  });
  await approveListingRevision(t.db, {
    actor: publisher.actor,
    operationId: newOperationId(),
    expectedRevision: (await listingVersion(t.db, f.listingId)).version,
    reference: f.reference,
    revisionId: f.revisionId,
  });
}

const prepare = async (reference: string, listingId: string, locale: "bg" | "en" = "bg") =>
  prepareManifest(t.db, {
    actor: publisher.actor,
    operationId: newOperationId(),
    expectedRevision: (await listingVersion(t.db, listingId)).generation,
    reference,
    locale,
  });

describe("publication commands (§7.2–§7.3)", () => {
  it("binds gallery wording to publication and rejects metadata changed after preparation", async () => {
    const f = await fixture();
    const assetId = f.assetIds[0];
    if (!assetId) throw new Error("Missing gallery fixture");
    await t.db
      .update(mediaAssets)
      .set({
        caption: "Approved original caption",
        altText: "Approved original description",
        modification: "retouched",
        modificationDisclosure: "Original approved disclosure",
      })
      .where(eq(mediaAssets.id, assetId));
    await publishForTest(t.db, publisher.actor, f, ["bg"]);
    const first = (await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg"))[0];
    expect(first?.media[0]).toMatchObject({
      caption: "Approved original caption",
      alt: "Approved original description",
      modificationDisclosure: "Original approved disclosure",
    });
    await t.db
      .update(mediaAssets)
      .set({
        caption: "Changed unpublised caption",
        altText: "Changed unpublished description",
        modificationDisclosure: "Changed unpublished disclosure",
      })
      .where(eq(mediaAssets.id, assetId));
    const current = (await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg"))[0];
    expect(current?.manifestId).toBe(first?.manifestId);
    expect(current?.media[0]).toEqual(first?.media[0]);
    const prepared = await prepare(f.reference, f.listingId);
    await t.db
      .update(mediaAssets)
      .set({ altText: "Changed again before publication" })
      .where(eq(mediaAssets.id, assetId));
    await expect(
      activateManifest(t.db, {
        actor: publisher.actor,
        operationId: newOperationId(),
        expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
        manifestId: prepared.outcome.manifestId,
      }),
    ).rejects.toMatchObject({ code: "approval_stale" });
    const latest = await prepare(f.reference, f.listingId);
    await activateManifest(t.db, {
      actor: publisher.actor,
      operationId: newOperationId(),
      expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
      manifestId: latest.outcome.manifestId,
    });
    expect(
      (await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg"))[0]?.media[0],
    ).toMatchObject({
      caption: "Changed unpublised caption",
      alt: "Changed again before publication",
    });
  });
  it("rechecks seller authority and current agreement evidence on every public read", async () => {
    for (const reason of [
      "authority_revoked",
      "document_replaced",
      "permission_withdrawn",
    ] as const) {
      const f = await fixture();
      await publishForTest(t.db, publisher.actor, f, ["bg"]);
      expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toHaveLength(1);
      const [instruction] = await t.db
        .select()
        .from(sellerInstructions)
        .where(eq(sellerInstructions.listingId, f.listingId));
      if (!instruction) throw new Error("missing fixture instruction");
      const terms = instruction.commercialTerms as {
        authorityRelationshipId: string;
        agreement: { documentVersionId: string };
      };
      if (reason === "authority_revoked")
        await t.db
          .update(propertyRelationships)
          .set({ revokedAt: new Date() })
          .where(eq(propertyRelationships.id, terms.authorityRelationshipId));
      if (reason === "document_replaced") {
        const [version] = await t.db
          .select()
          .from(documentVersions)
          .where(eq(documentVersions.id, terms.agreement.documentVersionId));
        if (!version) throw new Error("missing fixture agreement");
        await t.db
          .update(documents)
          .set({ currentVersionNumber: version.versionNumber + 1 })
          .where(eq(documents.id, version.documentId));
      }
      if (reason === "permission_withdrawn")
        await t.db
          .update(sellerInstructions)
          .set({ publicationPermission: false, invalidatedAt: new Date() })
          .where(eq(sellerInstructions.id, instruction.id));
      expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toHaveLength(0);
      const eligible = eligiblePublications(t.db, "bg");
      expect(
        await t.db.select().from(eligible).where(eq(eligible.listingId, f.listingId)),
      ).toHaveLength(0);
      expect(await rejection(prepare(f.reference, f.listingId))).toMatchObject({
        code: "publication_ineligible",
      });
    }
  });

  it("refuses activation when reviewed derivative bytes disappear after preparation", async () => {
    const f = await fixture();
    await reviewAndApprove(f);
    const prepared = await prepare(f.reference, f.listingId);
    const [asset] = await t.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, f.assetIds[0] ?? ""));
    if (!asset?.derivativeKey) throw new Error("missing derivative fixture");
    await unlink(join(publicationFixtureStorage.root, asset.derivativeKey));
    expect(
      await rejection(
        activateManifest(t.db, {
          actor: publisher.actor,
          operationId: newOperationId(),
          expectedRevision: 0,
          manifestId: prepared.outcome.manifestId,
        }),
      ),
    ).toMatchObject({ code: "publication_ineligible" });
    expect(
      await t.db
        .select()
        .from(currentPublications)
        .where(eq(currentPublications.listingId, f.listingId)),
    ).toHaveLength(0);
  });
  it("publishes an approved revision through an immutable manifest and one pointer switch", async () => {
    const f = await fixture();
    await reviewAndApprove(f);
    const prepared = await prepare(f.reference, f.listingId);
    const activation = await activateManifest(t.db, {
      actor: publisher.actor,
      operationId: "activate-once",
      expectedRevision: 0,
      manifestId: prepared.outcome.manifestId,
    });
    expect(activation.outcome).toMatchObject({
      locale: "bg",
      generation: 0,
      pointerState: "active",
    });

    const [pointer] = await t.db
      .select()
      .from(currentPublications)
      .where(eq(currentPublications.listingId, f.listingId));
    expect(pointer).toMatchObject({ state: "active", manifestId: prepared.outcome.manifestId });
    const [manifest] = await t.db
      .select()
      .from(publicationManifests)
      .where(eq(publicationManifests.id, prepared.outcome.manifestId));
    expect(manifest).toMatchObject({
      listingRevisionId: f.revisionId,
      factRevisionId: f.factRevisionId,
      localizedRevisionId: null,
      contentDigest: prepared.outcome.contentDigest,
    });
    // Immutable after creation.
    await expect(
      t.db
        .update(publicationManifests)
        .set({ policyRevision: "edited" })
        .where(eq(publicationManifests.id, prepared.outcome.manifestId)),
    ).rejects.toThrow();

    const docs = await t.db
      .select()
      .from(listingSearchDocuments)
      .where(eq(listingSearchDocuments.listingId, f.listingId));
    expect(docs).toMatchObject([{ locale: "bg", manifestId: prepared.outcome.manifestId }]);
    const deliveries = await t.db
      .select()
      .from(destinationDeliveries)
      .where(eq(destinationDeliveries.listingId, f.listingId));
    expect(deliveries).toMatchObject([
      { kind: "publish", destination: "website", state: "verified", generation: 0 },
    ]);
    const events = await t.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.subjectId, f.listingId));
    expect(events).toMatchObject([
      { eventType: "publication.activated", sourceGeneration: 0, state: "pending" },
    ]);
  });

  it("AT22: records same-person fact, editorial and publishing decisions separately and honestly", async () => {
    const f = await fixture();
    await publishForTest(t.db, publisher.actor, f);
    const decided = await t.db
      .select()
      .from(approvals)
      .where(eq(approvals.decidedById, publisher.id));
    const kinds = decided
      .filter(
        (a) =>
          [f.factRevisionId, f.revisionId].includes(a.subjectId) ||
          a.subjectType === "publication_manifest",
      )
      .map((a) => [a.kind, a.decidedWithCapability]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        ["factual", "listing.review_facts"],
        ["editorial", "listing.review_facts"],
        ["publication", "publication.release"],
      ]),
    );
    expect(decided.every((a) => a.decidedByKind === "staff")).toBe(true);
  });

  it("replays an activation retried with the same operation id instead of switching twice", async () => {
    const f = await fixture();
    await reviewAndApprove(f);
    const prepared = await prepare(f.reference, f.listingId);
    const command = {
      actor: publisher.actor,
      operationId: newOperationId(),
      expectedRevision: 0,
      manifestId: prepared.outcome.manifestId,
    };
    const first = await activateManifest(t.db, command);
    const second = await activateManifest(t.db, command);
    expect(second).toMatchObject({ replayed: true, outcome: first.outcome });
    const decisions = await t.db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.kind, "publication"),
          eq(approvals.subjectId, prepared.outcome.manifestId),
        ),
      );
    expect(decisions).toHaveLength(1);
  });

  it.each([
    ["no fact review", "fact_review_required", { review: false }],
    ["no seller instruction", "seller_instruction_required", { sellerInstruction: false }],
    ["no eligible media", "media_not_eligible", { photos: 0 }],
    ["an unreviewed regulated claim", "professional_review_required", { regulatedClaims: ["tax"] }],
  ] as const)("refuses a manifest with %s", async (_label, code, options) => {
    const { review, ...fixtureOptions } = { review: true, ...options };
    const f = await fixture(fixtureOptions);
    if (review) {
      await reviewAndApprove(f);
    } else {
      await approveListingRevision(t.db, {
        actor: publisher.actor,
        operationId: newOperationId(),
        expectedRevision: 1,
        reference: f.reference,
        revisionId: f.revisionId,
      });
    }
    const error = await rejection(prepare(f.reference, f.listingId));
    expect(error.code).toBe("publication_ineligible");
    expect(error.fieldErrors).toEqual({ publication: [code] });
  });

  it("AT05: refuses a translated manifest until the locale is approved for the exact source", async () => {
    const f = await fixture();
    await reviewAndApprove(f);
    const error = await rejection(prepare(f.reference, f.listingId, "en"));
    expect(error.fieldErrors).toEqual({ publication: ["locale_not_approved_for_source"] });
  });

  it.each(["price", "disclosure", "media rights"])(
    "rejects seller consent that does not cover the published %s",
    async (changed) => {
      const f = await fixture();
      await reviewAndApprove(f);
      await t.db
        .update(sellerInstructions)
        .set(
          changed === "price"
            ? { commercialTerms: { price: { amountMinor: 1, currency: "EUR", period: "total" } } }
            : changed === "disclosure"
              ? { disclosure: { publicPrecision: "exact" } }
              : { mediaUsageRights: { granted: false } },
        )
        .where(eq(sellerInstructions.listingId, f.listingId));
      expect(await rejection(prepare(f.reference, f.listingId))).toMatchObject({
        code: "publication_ineligible",
        fieldErrors: { publication: ["seller_instruction_required"] },
      });
    },
  );

  it("binds an editorial approval retry to the same review note", async () => {
    const f = await fixture();
    const command = {
      actor: publisher.actor,
      operationId: newOperationId(),
      expectedRevision: 1,
      reference: f.reference,
      revisionId: f.revisionId,
      note: "Reviewed recorded source",
    };
    await approveListingRevision(t.db, command);
    expect(
      await rejection(approveListingRevision(t.db, { ...command, note: "Different scope" })),
    ).toMatchObject({ code: "idempotency_key_reused" });
  });

  it("does not replay publication authority after its grant was revoked", async () => {
    const operator = await createStaff(t.db, { roles: ["publishing_approver"] });
    const f = await fixture();
    await reviewAndApprove(f);
    const command = {
      actor: operator.actor,
      operationId: newOperationId(),
      expectedRevision: 0,
      reference: f.reference,
      locale: "bg" as const,
    };
    await prepareManifest(t.db, command);
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, operator.id));
    expect(await rejection(prepareManifest(t.db, command))).toMatchObject({ code: "forbidden" });
  });

  it("requires restriction of property-wide exposure before approving changed facts", async () => {
    const f = await fixture();
    await publishForTest(t.db, publisher.actor, f);
    const [original] = await t.db
      .select()
      .from(propertyFactRevisions)
      .where(eq(propertyFactRevisions.id, f.factRevisionId));
    if (!original) throw new Error("fixture facts missing");
    const [candidate] = await t.db
      .insert(propertyFactRevisions)
      .values({
        propertyId: f.propertyId,
        revisionNumber: 2,
        contentDigest: "candidate-digest",
        createdByKind: "staff",
        createdById: publisher.id,
        materialChange: "material",
      })
      .returning();
    if (!candidate) throw new Error("candidate missing");
    const command = {
      actor: publisher.actor,
      operationId: newOperationId(),
      expectedRevision: 2,
      factRevisionId: candidate.id,
      scope: "Corrected factual source",
    };
    expect(await rejection(approveFactRevision(t.db, command))).toMatchObject({
      code: "publication_ineligible",
      fieldErrors: { publication: ["restrict_affected_publications_first"] },
    });
    await restrictPublication(t.db, {
      actor: publisher.actor,
      operationId: newOperationId(),
      expectedRevision: 0,
      reference: f.reference,
      reason: "Material source correction",
    });
    expect(
      (await approveFactRevision(t.db, { ...command, operationId: newOperationId() })).outcome
        .factRevisionId,
    ).toBe(candidate.id);
  });

  it("refuses an unapproved revision and a media asset that lost its clearance", async () => {
    const f = await fixture();
    const unapproved = await rejection(prepare(f.reference, f.listingId));
    expect(unapproved.fieldErrors).toEqual({ publication: ["fact_review_required"] });

    await reviewAndApprove(f);
    const prepared = await prepare(f.reference, f.listingId);
    await t.db
      .update(mediaAssets)
      .set({ rights: "restricted" })
      .where(eq(mediaAssets.id, f.assetIds[0] ?? ""));
    const error = await rejection(
      activateManifest(t.db, {
        actor: publisher.actor,
        operationId: newOperationId(),
        expectedRevision: 0,
        manifestId: prepared.outcome.manifestId,
      }),
    );
    expect(error).toMatchObject({
      code: "publication_ineligible",
      fieldErrors: { publication: ["media_not_eligible"] },
    });
  });

  it("does not activate a manifest after its processed image bytes changed", async () => {
    const f = await fixture();
    await reviewAndApprove(f);
    const prepared = await prepare(f.reference, f.listingId);
    await t.db
      .update(mediaAssets)
      .set({ derivativeSha256: "changed-derivative" })
      .where(eq(mediaAssets.id, f.assetIds[0] ?? ""));
    const error = await rejection(
      activateManifest(t.db, {
        actor: publisher.actor,
        operationId: newOperationId(),
        expectedRevision: 0,
        manifestId: prepared.outcome.manifestId,
      }),
    );
    expect(error.code).toBe("approval_stale");
    expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toEqual([]);
  });

  it("AT26/AT52: Hermes and staff without publishing authority cannot take a publication step", async () => {
    const f = await fixture();
    await reviewAndApprove(f);
    const asHermes = await rejection(
      prepareManifest(t.db, {
        actor: hermes,
        operationId: newOperationId(),
        expectedRevision: 0,
        reference: f.reference,
        locale: "bg",
      }),
    );
    expect(asHermes.code).toBe("forbidden");
    const asEditor = await rejection(
      prepareManifest(t.db, {
        actor: editor.actor,
        operationId: newOperationId(),
        expectedRevision: 0,
        reference: f.reference,
        locale: "bg",
      }),
    );
    expect(asEditor.code).toBe("forbidden");
    const approveAsEditor = await rejection(
      approveFactRevision(t.db, {
        actor: editor.actor,
        operationId: newOperationId(),
        expectedRevision: 2,
        factRevisionId: f.factRevisionId,
        scope: "all",
      }),
    );
    expect(approveAsEditor.code).toBe("forbidden");
  });

  it("AT19: a stale expected revision is a conflict with the current state, not a lost update", async () => {
    const f = await fixture();
    const error = await rejection(
      approveListingRevision(t.db, {
        actor: publisher.actor,
        operationId: newOperationId(),
        expectedRevision: 7,
        reference: f.reference,
        revisionId: f.revisionId,
      }),
    );
    expect(error.code).toBe("version_conflict");
    expect(error.current).toMatchObject({ version: 1, editorialState: "in_review" });
  });

  it("submits a revision for review only when its required facts are decided", async () => {
    const complete = await fixture({ editorialState: "draft" });
    const submitted = await submitListingRevision(t.db, {
      actor: editor.actor,
      operationId: newOperationId(),
      expectedRevision: 1,
      reference: complete.reference,
      revisionId: complete.revisionId,
    });
    expect(submitted.outcome.listingVersion).toBe(2);

    const unpriced = await fixture({ editorialState: "draft", price: { state: "unknown" } });
    const error = await rejection(
      submitListingRevision(t.db, {
        actor: editor.actor,
        operationId: newOperationId(),
        expectedRevision: 1,
        reference: unpriced.reference,
        revisionId: unpriced.revisionId,
      }),
    );
    expect(error).toMatchObject({
      code: "transition_denied",
      fieldErrors: { "fact.price": ["undecided"] },
    });
  });
});

describe("restriction, withdrawal and generation fencing (§7.3, §7.4)", () => {
  it("withdraws every locale at once, bumps the generation and verifies by read-back", async () => {
    const f = await fixture({
      translations: { en: { title: "Apartment", description: "Inland." } },
    });
    await publishForTest(t.db, publisher.actor, f, ["bg", "en"]);
    const withdrawn = await withdrawPublication(t.db, {
      actor: publisher.actor,
      operationId: newOperationId(),
      expectedRevision: 0,
      reference: f.reference,
      reason: "Owner withdrew the instruction",
    });
    expect(withdrawn.outcome.generation).toBe(1);
    expect(withdrawn.outcome.affected.map((a) => a.locale).sort()).toEqual(["bg", "en"]);
    expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toEqual([]);
    expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "en")).toEqual([]);
    const docs = await t.db
      .select()
      .from(listingSearchDocuments)
      .where(eq(listingSearchDocuments.listingId, f.listingId));
    expect(docs).toEqual([]);
    const withdrawals = await t.db
      .select()
      .from(destinationDeliveries)
      .where(
        and(
          eq(destinationDeliveries.listingId, f.listingId),
          eq(destinationDeliveries.kind, "withdraw"),
        ),
      );
    expect(withdrawals.map((d) => [d.state, d.generation])).toEqual([
      ["withdrawn", 1],
      ["withdrawn", 1],
    ]);
  });

  it("AT25: a manifest prepared before a withdrawal can never be activated afterwards", async () => {
    const f = await fixture();
    await publishForTest(t.db, publisher.actor, f);
    const stale = await prepare(f.reference, f.listingId);
    await withdrawPublication(t.db, {
      actor: publisher.actor,
      operationId: newOperationId(),
      expectedRevision: 0,
      reference: f.reference,
      reason: "Price dispute",
    });
    const oldGeneration = await rejection(
      activateManifest(t.db, {
        actor: publisher.actor,
        operationId: newOperationId(),
        expectedRevision: 0,
        manifestId: stale.outcome.manifestId,
      }),
    );
    expect(oldGeneration).toMatchObject({ code: "version_conflict", current: { generation: 1 } });
    const superseded = await rejection(
      activateManifest(t.db, {
        actor: publisher.actor,
        operationId: newOperationId(),
        expectedRevision: 1,
        manifestId: stale.outcome.manifestId,
      }),
    );
    expect(superseded).toMatchObject({
      code: "approval_stale",
      fieldErrors: { publication: ["generation_superseded"] },
    });
    expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toEqual([]);

    // A deliberate new manifest under the current generation is the way back.
    await publishLocales(t.db, publisher.actor, f, ["bg"]);
    const [shown] = await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg");
    expect(shown?.manifestId).not.toBe(stale.outcome.manifestId);
  });

  it("AT24: restriction removes the inaccurate presentation before any correction", async () => {
    const f = await fixture();
    await publishForTest(t.db, publisher.actor, f);
    const restricted = await restrictPublication(t.db, {
      actor: publisher.actor,
      operationId: newOperationId(),
      expectedRevision: 0,
      reference: f.reference,
      reason: "Area reported wrong by the owner",
    });
    expect(restricted.outcome).toMatchObject({
      generation: 1,
      affected: [{ locale: "bg", state: "restricted" }],
    });
    const [pointer] = await t.db
      .select()
      .from(currentPublications)
      .where(eq(currentPublications.listingId, f.listingId));
    expect(pointer).toMatchObject({
      state: "restricted",
      reason: "Area reported wrong by the owner",
    });
    expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toEqual([]);
    const [listing] = await t.db.select().from(listings).where(eq(listings.id, f.listingId));
    expect(listing?.publicationGeneration).toBe(1);
  });

  it("AT23/AT05: a translation that goes stale after activation disappears from the public read", async () => {
    const f = await fixture({
      translations: { en: { title: "Apartment", description: "Inland." } },
    });
    await publishForTest(t.db, publisher.actor, f, ["bg", "en"]);
    expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "en")).toHaveLength(1);
    await t.db
      .update(localizedRevisions)
      .set({ state: "stale" })
      .where(eq(localizedRevisions.listingId, f.listingId));
    expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "en")).toEqual([]);
    expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toHaveLength(1);
  });

  it("a withdrawal is itself a recorded human command", async () => {
    const f = await fixture();
    await publishForTest(t.db, publisher.actor, f);
    const error = await rejection(
      withdrawPublication(t.db, {
        actor: hermes,
        operationId: newOperationId(),
        expectedRevision: 0,
        reference: f.reference,
        reason: "Prompt said so",
      }),
    );
    expect(error.code).toBe("forbidden");
    expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toHaveLength(1);
  });
});
