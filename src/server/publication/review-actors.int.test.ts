import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approvals,
  grants,
  principals,
  properties,
  publicationManifests,
  staffMemberships,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import type { Actor } from "@/domain/capabilities";
import { createClient, createStaff } from "../testing";
import {
  activateManifest,
  approveFactRevision,
  approveListingRevision,
  prepareManifest,
} from "./commands";
import { publicationReviewActors } from "./review-actors";
import {
  createListingFixture,
  listingVersion,
  newOperationId,
  publicationFixtureStorage,
} from "./testing";

let t: TestDatabase;
let publisher: Awaited<ReturnType<typeof createStaff>>;
let factualReviewer: Awaited<ReturnType<typeof createStaff>>;
let editorialReviewer: Awaited<ReturnType<typeof createStaff>>;

beforeAll(async () => {
  t = await createTestDatabase();
  publisher = await createStaff(t.db, { roles: ["content_editor", "publishing_approver"] });
  factualReviewer = await createStaff(t.db, {
    roles: ["content_editor"],
    grants: [{ capability: "listing.review_facts" }],
  });
  editorialReviewer = await createStaff(t.db, {
    roles: ["content_editor"],
    grants: [{ capability: "listing.review_facts" }],
  });
  await t.db
    .update(principals)
    .set({ displayName: "Synthetic factual reviewer" })
    .where(eq(principals.id, factualReviewer.id));
  await t.db
    .update(principals)
    .set({ displayName: "Synthetic editorial reviewer" })
    .where(eq(principals.id, editorialReviewer.id));
});
afterAll(async () => {
  await t?.drop();
});

async function prepare(f: { reference: string; listingId: string }, locale: "bg" | "en" = "bg") {
  const result = await prepareManifest(
    t.db,
    {
      actor: publisher.actor,
      operationId: newOperationId(),
      expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
      reference: f.reference,
      locale,
    },
    { storage: publicationFixtureStorage },
  );
  return result.outcome.manifestId;
}

async function fixture(reviewer = factualReviewer) {
  const f = await createListingFixture(t.db, {
    // The author and per-field reviewer are deliberately different from the approval deciders.
    reviewerId: publisher.id,
    translations: { en: { title: "Synthetic translation", description: "Synthetic description" } },
  });
  const factsAt = new Date(Date.now() - 2_000);
  const editorialAt = new Date(Date.now() - 1_000);
  const factual = await approveFactRevision(t.db, {
    actor: reviewer.actor,
    operationId: newOperationId(),
    expectedRevision: 1,
    factRevisionId: f.factRevisionId,
    scope: "Synthetic recorded factual scope",
    now: factsAt,
  });
  const editorial = await approveListingRevision(t.db, {
    actor: editorialReviewer.actor,
    operationId: newOperationId(),
    expectedRevision: (await listingVersion(t.db, f.listingId)).version,
    reference: f.reference,
    revisionId: f.revisionId,
    now: editorialAt,
  });
  return {
    ...f,
    manifestId: await prepare(f),
    factualId: factual.outcome.approvalId,
    editorialId: editorial.outcome.approvalId,
    factsAt,
    editorialAt,
  };
}

const read = (f: { reference: string; manifestId: string }, actor: Actor = publisher.actor) =>
  publicationReviewActors(t.db, actor, { reference: f.reference, manifestId: f.manifestId });

// Synthetic corruption/history fixtures are new rows: immutable manifests are never updated.
async function withDecisions(manifestId: string, decisions: unknown): Promise<string> {
  const [original] = await t.db
    .select()
    .from(publicationManifests)
    .where(eq(publicationManifests.id, manifestId));
  if (!original) throw new Error("Missing manifest fixture");
  const id = randomUUID();
  await t.db.insert(publicationManifests).values({
    ...original,
    id,
    decisions: decisions === null ? sql`'null'::jsonb` : decisions,
  });
  return id;
}

async function alteredApproval(
  approvalId: string,
  changes: Partial<typeof approvals.$inferInsert>,
): Promise<string> {
  const [original] = await t.db.select().from(approvals).where(eq(approvals.id, approvalId));
  if (!original) throw new Error("Missing approval fixture");
  const id = randomUUID();
  await t.db.insert(approvals).values({ ...original, ...changes, id });
  return id;
}

describe("O16PUB recorded publication reviewers (§7.2)", () => {
  it("reads the chosen manifest's exact decisions after a newer review and manifest exist", async () => {
    const f = await fixture();
    const [property] = await t.db
      .select({ version: properties.version })
      .from(properties)
      .where(eq(properties.id, f.propertyId));
    if (!property) throw new Error("Missing property fixture");
    const newer = await approveFactRevision(t.db, {
      actor: publisher.actor,
      operationId: newOperationId(),
      expectedRevision: property.version,
      factRevisionId: f.factRevisionId,
      scope: "Synthetic newer factual scope",
    });
    const newerManifestId = await prepare(f);
    const result = await publicationReviewActors(t.db, publisher.actor, {
      reference: ` ${f.reference.toLowerCase()} `,
      manifestId: f.manifestId,
    });
    expect(result).toMatchObject({
      reference: f.reference,
      listingId: f.listingId,
      manifestId: f.manifestId,
      locale: "bg",
      factual: {
        binding: "matched",
        approvalId: f.factualId,
        state: "approved",
        subject: { type: "property_fact_revision", id: f.factRevisionId, version: 1 },
        scope: { reviewScope: "Synthetic recorded factual scope" },
        decidedAt: f.factsAt,
        decider: {
          kind: "staff",
          id: factualReviewer.id,
          displayName: "Synthetic factual reviewer",
          identityState: "resolved",
          principalStatus: "active",
          staffMembershipState: "active",
        },
      },
      editorial: {
        binding: "matched",
        approvalId: f.editorialId,
        state: "approved",
        subject: { type: "listing_revision", id: f.revisionId, version: 1 },
        decidedAt: f.editorialAt,
        decider: { id: editorialReviewer.id, displayName: "Synthetic editorial reviewer" },
      },
    });
    expect(await read({ ...f, manifestId: newerManifestId })).toMatchObject({
      factual: { approvalId: newer.outcome.approvalId, decider: { id: publisher.id } },
    });
  });

  it("keeps an invalidated decision and offboarded decider truthful while activation rejects it", async () => {
    const reviewer = await createStaff(t.db, {
      roles: ["content_editor"],
      grants: [{ capability: "listing.review_facts" }],
    });
    const f = await fixture(reviewer);
    const invalidatedAt = new Date();
    await t.db
      .update(approvals)
      .set({ state: "invalidated", invalidatedAt, invalidationReason: "Synthetic invalidation" })
      .where(eq(approvals.id, f.factualId));
    await t.db
      .update(principals)
      .set({ status: "deactivated", displayName: "Synthetic former reviewer" })
      .where(eq(principals.id, reviewer.id));
    await t.db
      .update(staffMemberships)
      .set({ state: "ended", endedAt: new Date() })
      .where(eq(staffMemberships.principalId, reviewer.id));
    expect(await read(f)).toMatchObject({
      factual: {
        binding: "matched",
        approvalId: f.factualId,
        state: "invalidated",
        invalidatedAt,
        invalidationReason: "Synthetic invalidation",
        decidedAt: f.factsAt,
        decider: {
          id: reviewer.id,
          displayName: "Synthetic former reviewer",
          principalStatus: "deactivated",
          staffMembershipState: "ended",
        },
      },
    });
    await expect(
      activateManifest(
        t.db,
        {
          actor: publisher.actor,
          operationId: newOperationId(),
          expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
          manifestId: f.manifestId,
        },
        { storage: publicationFixtureStorage },
      ),
    ).rejects.toMatchObject({
      code: "publication_ineligible",
      fieldErrors: { publication: ["fact_review_required"] },
    });
  });

  it("retains missing/malformed decider IDs and hides a directory identity of the wrong kind", async () => {
    const f = await fixture();
    for (const id of [randomUUID(), "synthetic-missing-staff"]) {
      await t.db.update(approvals).set({ decidedById: id }).where(eq(approvals.id, f.factualId));
      expect(await read(f)).toMatchObject({
        factual: {
          binding: "matched",
          decidedAt: f.factsAt,
          decider: {
            kind: "staff",
            id,
            displayName: null,
            identityState: "missing",
            principalStatus: null,
            staffMembershipState: null,
          },
        },
      });
    }
    await t.db
      .update(approvals)
      .set({ decidedByKind: "client", decidedById: publisher.id })
      .where(eq(approvals.id, f.factualId));
    expect(await read(f)).toMatchObject({
      factual: {
        decider: {
          kind: "client",
          id: publisher.id,
          displayName: null,
          identityState: "kind_mismatch",
          principalStatus: null,
          staffMembershipState: null,
        },
      },
    });
  });

  it("handles absent, malformed and deleted approval references without substituting a reviewer", async () => {
    const f = await fixture();
    for (const decisions of [null, [], {}, { factual: 12 }, { factual: "not-a-uuid" }]) {
      const manifestId = await withDecisions(f.manifestId, decisions);
      const result = await read({ ...f, manifestId });
      expect(result.factual).toEqual({
        binding: "missing",
        approvalId:
          decisions && "factual" in decisions && typeof decisions.factual === "string"
            ? decisions.factual
            : null,
      });
      expect(result.editorial).toEqual({ binding: "missing", approvalId: null });
    }
    await t.db.delete(approvals).where(eq(approvals.id, f.factualId));
    expect((await read(f)).factual).toEqual({ binding: "missing", approvalId: f.factualId });
  });

  it("rejects every subject mismatch and leaks no unrelated decision or directory details", async () => {
    const f = await fixture();
    const foreign = await fixture();
    const foreignManifestId = await withDecisions(f.manifestId, {
      factual: foreign.factualId,
      editorial: foreign.editorialId,
    });
    const foreignResult = await read({ ...f, manifestId: foreignManifestId });
    expect(foreignResult.factual).toEqual({ binding: "mismatched", approvalId: foreign.factualId });
    expect(foreignResult.editorial).toEqual({
      binding: "mismatched",
      approvalId: foreign.editorialId,
    });
    for (const changes of [
      { kind: "editorial" as const },
      { subjectType: "listing_revision" },
      { subjectId: randomUUID() },
      { subjectVersion: 2 },
      { subjectHash: "synthetic-wrong-digest" },
    ]) {
      const approvalId = await alteredApproval(f.factualId, changes);
      const manifestId = await withDecisions(f.manifestId, { factual: approvalId });
      expect((await read({ ...f, manifestId })).factual).toEqual({
        binding: "mismatched",
        approvalId,
      });
    }
  });

  it("denies cross-listing, record/locale scope, revoked and nonstaff reads without revealing existence", async () => {
    const f = await fixture();
    const foreign = await fixture();
    const reader = await createStaff(t.db, {
      grants: [
        {
          capability: "listing.read",
          recordType: "listing",
          recordId: f.listingId,
          locales: ["bg"],
        },
      ],
    });
    expect((await read(f, reader.actor)).manifestId).toBe(f.manifestId);
    await expect(read(foreign, reader.actor)).rejects.toMatchObject({ code: "not_found" });
    await expect(
      read({ reference: foreign.reference, manifestId: f.manifestId }),
    ).rejects.toMatchObject({ code: "not_found" });
    const enManifestId = await prepare(f, "en");
    await expect(read({ ...f, manifestId: enManifestId }, reader.actor)).rejects.toMatchObject({
      code: "not_found",
    });
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.principalId, reader.id));
    await expect(read(f, reader.actor)).rejects.toMatchObject({ code: "not_found" });
    const noGrant = await createStaff(t.db);
    const suspended = await createStaff(t.db, {
      roles: ["publishing_approver"],
      membership: "suspended",
    });
    const client = await createClient(t.db);
    for (const actor of [
      noGrant.actor,
      suspended.actor,
      client.actor,
      { kind: "visitor", id: "synthetic-visitor" } as const,
      { kind: "ai_service", id: "synthetic-service" } as const,
      { kind: "system", id: "publication-delivery" } as const,
    ]) {
      await expect(read(f, actor)).rejects.toMatchObject({ code: "not_found" });
    }
    for (const manifestId of [randomUUID(), "invalid-manifest-id"]) {
      await expect(read({ ...f, manifestId })).rejects.toMatchObject({ code: "not_found" });
    }
  });
});
