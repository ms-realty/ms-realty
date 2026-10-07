import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  documents,
  documentVersions,
  grants,
  inquiries,
  listingRevisions,
  listings,
  parties,
  propertyFacts,
  sellerInstructions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createStaff } from "../testing";
import {
  confirmListingAvailability,
  createListingDraft,
  freezeListingDraft,
  inventoryDetail,
  recordSellerInstruction,
  reviewSellerAuthority,
  saveListingDraft,
} from "./commands";
import { type CreateListing, emptyDraft } from "./contracts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const input = (): CreateListing => ({
  propertyType: "apartment",
  purpose: "sale",
  country: "BG",
  region: "Благоевград",
  settlement: "Сандански",
  exactAddress: "Synthetic private address",
  draft: {
    ...emptyDraft,
    title: "Тестов имот",
    description: "Измислени данни за проверка.",
    sourceReference: "synthetic-evidence-1",
    priceState: "known",
    price: "95000.03",
    areaState: "known",
    area: "74.5",
    bedroomsState: "unknown",
  },
});

it("creates one recoverable draft on retry and never grants approval/publication", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const command = {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: 0,
    input: input(),
  };
  const first = await createListingDraft(t.db, command);
  const retry = await createListingDraft(t.db, command);
  expect(retry.replayed).toBe(true);
  expect(retry.outcome).toEqual(first.outcome);
  const detail = await inventoryDetail(t.db, staff.actor, first.outcome.reference);
  expect(detail.listing.editorialState).toBe("draft");
  expect(detail.listing.commercialState).toBe("confirmation_required");
  expect(detail.listing.approvedRevisionId).toBeNull();
  expect(detail.property.approvedFactRevisionId).toBeNull();
  expect(detail.publications).toEqual([]);
});

it("rejects stale edits and freezes exact source values in immutable review candidates", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const created = await createListingDraft(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: 0,
    input: input(),
  });
  const reference = created.outcome.reference;
  const version = created.outcome.version;
  const saved = await saveListingDraft(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    reference,
    expectedRevision: version,
    draft: { ...input().draft, title: "Нова версия" },
  });
  await expect(
    saveListingDraft(t.db, {
      actor: staff.actor,
      operationId: randomUUID(),
      reference,
      expectedRevision: version,
      draft: input().draft,
    }),
  ).rejects.toMatchObject({ code: "version_conflict" });
  const frozen = await freezeListingDraft(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    reference,
    expectedRevision: saved.outcome.version,
  });
  const [revision] = await t.db
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.id, frozen.outcome.revisionId));
  expect(revision?.terms).toMatchObject({
    facts: { price: { value: { amountMinor: 9500003, currency: "EUR", period: "total" } } },
  });
  const facts = await t.db
    .select()
    .from(propertyFacts)
    .where(eq(propertyFacts.factRevisionId, frozen.outcome.factRevisionId));
  expect(facts.find((f) => f.fieldKey === "bedrooms")).toMatchObject({
    state: "unknown",
    value: null,
    reviewedAt: null,
  });
  expect(facts.find((f) => f.fieldKey === "area.living")?.value).toEqual({
    value: 74.5,
    unit: "m2",
    basis: "living",
  });
  expect(facts.every((f) => f.sourceReference === "synthetic-evidence-1")).toBe(true);
  if (!revision) throw new Error("Expected frozen revision");
  const title = (revision.sourceCopy as { text: { title: string } }).text.title;
  expect(title).toBe("Нова версия");
  await expect(
    t.db
      .update(listingRevisions)
      .set({ sourceCopy: {} })
      .where(eq(listingRevisions.id, frozen.outcome.revisionId)),
  ).rejects.toThrow();
  const detail = await inventoryDetail(t.db, staff.actor, reference);
  expect(detail.listing.approvedRevisionId).toBeNull();
});

it("records an evidenced availability confirmation but cannot reopen a sold listing", async () => {
  const staff = await createStaff(t.db, { roles: ["assigned_broker"] });
  const draft = await createListingDraft(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: 0,
    input: input(),
  });
  const command = {
    actor: staff.actor,
    operationId: randomUUID(),
    reference: draft.outcome.reference,
    expectedRevision: draft.outcome.version,
    evidence: "Synthetic seller call recorded for test",
  };
  const first = await confirmListingAvailability(t.db, command);
  expect((await confirmListingAvailability(t.db, command)).replayed).toBe(true);
  const detail = await inventoryDetail(t.db, staff.actor, command.reference);
  expect(detail.listing).toMatchObject({
    commercialState: "available",
    availabilityConfirmedById: staff.id,
  });
  expect(detail.listing.reviewDueAt?.getTime()).toBe(
    (detail.listing.availabilityConfirmedAt?.getTime() ?? 0) + 14 * 86_400_000,
  );
  await t.db
    .update(listings)
    .set({ commercialState: "sold" })
    .where(eq(listings.id, detail.listing.id));
  await expect(
    confirmListingAvailability(t.db, {
      ...command,
      operationId: randomUUID(),
      expectedRevision: first.outcome.version,
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
});

it("binds seller instructions to reviewed authority, sealed current agreement and frozen exact terms", async () => {
  const staff = await createStaff(t.db, { roles: ["assigned_broker", "publishing_approver"] });
  const draft = await createListingDraft(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: 0,
    input: { ...input(), draft: { ...input().draft, sourceLanguage: "el" } },
  });
  const frozen = await freezeListingDraft(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: draft.outcome.version,
    reference: draft.outcome.reference,
  });
  const detail = await inventoryDetail(t.db, staff.actor, draft.outcome.reference);
  expect(detail.facts.every((f) => f.sourceLanguage === "el")).toBe(true);
  const [party] = await t.db
    .insert(parties)
    .values({ kind: "person", displayName: "Synthetic seller" })
    .returning();
  if (!party) throw new Error("fixture party missing");
  await t.db.insert(inquiries).values({
    reference: `RQ-test-${randomUUID()}`,
    purpose: "seller_consultation",
    source: "website",
    submissionKey: randomUUID(),
    payloadDigest: "synthetic",
    partyId: party.id,
    coverageQueue: "test",
    listingId: detail.listing.id,
  });
  async function document(purpose: string) {
    const [record] = await t.db
      .insert(documents)
      .values({
        reference: `DC-test-${randomUUID()}`,
        propertyId: detail.property.id,
        purpose,
        classification: "contract",
        audience: "internal",
        currentVersionNumber: 1,
      })
      .returning();
    if (!record) throw new Error("fixture document missing");
    const [v] = await t.db
      .insert(documentVersions)
      .values({
        documentId: record.id,
        versionNumber: 1,
        state: "reviewed",
        fileName: "synthetic.pdf",
        contentType: "application/pdf",
        sealedKey: `test/${randomUUID()}`,
        sha256: "test-digest",
        scan: "clean",
        scannedAt: new Date(),
        scannerVersion: "test-scanner",
        scannedSha256: "test-digest",
        reviewType: "accepted_for_purpose",
        reviewedById: staff.id,
        reviewedAt: new Date(),
        uploadedByKind: "staff",
        uploadedById: staff.id,
      })
      .returning();
    if (!v) throw new Error("fixture document version missing");
    return { record, version: v };
  }
  const authority = await document("seller_authority"),
    agreement = await document("seller_instruction");
  const instruction = {
    actor: staff.actor,
    operationId: randomUUID(),
    reference: detail.listing.reference,
    expectedRevision: frozen.outcome.version,
    input: {
      partyId: party.id,
      documentVersionId: agreement.version.id,
      commissionTerms: "Synthetic terms only",
      representationScope: "sale",
      agreedAt: new Date(Date.now() - 10_000).toISOString(),
      expiresAt: null,
      publicationPermission: true,
      mediaUsageGranted: true,
    },
  };
  await expect(recordSellerInstruction(t.db, instruction)).rejects.toMatchObject({
    code: "transition_denied",
  });
  const reviewed = await reviewSellerAuthority(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: frozen.outcome.version,
    reference: detail.listing.reference,
    partyId: party.id,
    documentVersionId: authority.version.id,
    role: "seller",
    note: "Synthetic authority review",
  });
  const recorded = await recordSellerInstruction(t.db, {
    ...instruction,
    operationId: randomUUID(),
    expectedRevision: reviewed.outcome.version,
  });
  const [stored] = await t.db
    .select()
    .from(sellerInstructions)
    .where(eq(sellerInstructions.id, recorded.outcome.instructionId));
  expect(stored?.commercialTerms).toMatchObject({
    price: { amountMinor: 9500003, currency: "EUR", period: "total" },
    sellerPartyId: party.id,
    authorityRelationshipId: reviewed.outcome.relationshipId,
    agreement: { documentVersionId: agreement.version.id, digest: "test-digest" },
  });
  expect(stored?.publicationPermission).toBe(true);
  expect((await inventoryDetail(t.db, staff.actor, detail.listing.reference)).publications).toEqual(
    [],
  );
  await t.db
    .update(documents)
    .set({ currentVersionNumber: 2 })
    .where(eq(documents.id, agreement.record.id));
  await expect(
    recordSellerInstruction(t.db, {
      ...instruction,
      operationId: randomUUID(),
      expectedRevision: recorded.outcome.version,
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
});

it("does not replay a successful mutation after the actor's capability is revoked", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const command = {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: 0,
    input: input(),
  };
  await createListingDraft(t.db, command);
  await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, staff.id));
  await expect(createListingDraft(t.db, command)).rejects.toMatchObject({ code: "forbidden" });
});

it("denies AI, clients and read-only staff inventory writes", async () => {
  const manager = await createStaff(t.db, { roles: ["manager"] });
  for (const actor of [
    manager.actor,
    { kind: "ai_service" as const, id: "hermes" },
    { kind: "visitor" as const, id: "anonymous" },
  ]) {
    await expect(
      createListingDraft(t.db, {
        actor,
        operationId: randomUUID(),
        expectedRevision: 0,
        input: input(),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  }
});

it("allocates distinct public references for simultaneous drafts", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const created = await Promise.all(
    [1, 2].map(() =>
      createListingDraft(t.db, {
        actor: staff.actor,
        operationId: randomUUID(),
        expectedRevision: 0,
        input: input(),
      }),
    ),
  );
  expect(new Set(created.map((r) => r.outcome.reference)).size).toBe(2);
  const rows = await t.db.select().from(listings);
  expect(new Set(rows.map((r) => r.reference)).size).toBe(rows.length);
});
