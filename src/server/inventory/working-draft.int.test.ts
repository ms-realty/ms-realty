import { randomUUID } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  activityEvents,
  auditEvents,
  listingRevisions,
  listings,
  operations,
  outboxEvents,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { canonicalJson } from "@/domain/approval";
import type { Actor } from "@/domain/capabilities";
import { sha256Hex } from "../crypto";
import { createListingFixture } from "../publication/testing";
import { createStaff } from "../testing";
import {
  createListingDraft,
  freezeListingDraft,
  inventoryDetail,
  saveListingDraft,
} from "./commands";
import { draftSchema, emptyDraft } from "./contracts";
import { workingDraftFrom } from "./working-draft";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function seed(actor: Actor) {
  const created = await createListingDraft(t.db, {
    actor,
    operationId: randomUUID(),
    expectedRevision: 0,
    input: {
      propertyType: "apartment",
      purpose: "sale",
      country: "BG",
      region: "Благоевград",
      settlement: "Сандански",
      exactAddress: "Synthetic private address",
      draft: {
        ...emptyDraft,
        title: "Точен текст",
        description: "Съществуващият неизменяем източник.",
        brokerNote: "Private intake must not be copied",
        priceState: "conflicting",
        price: "95000.03|95000.05",
        areaState: "conflicting",
        area: "74.5|75.25",
        areaBasis: "usable",
        bedroomsState: "conflicting",
        bedrooms: "0|2",
        sourceReference: "synthetic-document-1",
        sourceClass: "document_reviewed",
        sourceLanguage: "en",
      },
    },
  });
  await freezeListingDraft(t.db, {
    actor,
    operationId: randomUUID(),
    expectedRevision: created.outcome.version,
    reference: created.outcome.reference,
  });
  // Match imported/fixture-created inventory's empty working draft without changing its source.
  await t.db
    .update(listings)
    .set({ draft: {} })
    .where(eq(listings.reference, created.outcome.reference));
  return created.outcome.reference;
}

async function snapshot(actor: Actor, reference: string) {
  const detail = await inventoryDetail(t.db, actor, reference);
  const effects = await Promise.all(
    [operations, auditEvents, activityEvents, outboxEvents].map((table) =>
      t.db.select({ value: count() }).from(table),
    ),
  );
  return { detail, effects };
}

it("opens a projection in a PostgreSQL read-only transaction without changing source or draft", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const reference = await seed(staff.actor);
  const before = await snapshot(staff.actor, reference);
  expect(before.detail.listing.draft).toEqual({});
  expect(draftSchema.safeParse(before.detail.listing.draft).success).toBe(false);

  const draft = await t.db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    const detail = await inventoryDetail(tx, staff.actor, reference);
    return workingDraftFrom(detail.revision, detail.facts);
  });
  expect(draft).toMatchObject({
    title: "Точен текст",
    description: "Съществуващият неизменяем източник.",
    brokerNote: "",
    priceState: "conflicting",
    price: "95000.03|95000.05",
    areaState: "conflicting",
    area: "74.5|75.25",
    areaBasis: "usable",
    bedroomsState: "conflicting",
    bedrooms: "0|2",
    sourceReference: "synthetic-document-1",
    sourceClass: "document_reviewed",
    sourceLanguage: "en",
  });
  expect(draftSchema.safeParse(draft).success).toBe(true);
  expect(await snapshot(staff.actor, reference)).toEqual(before);
});

it("persists only on version-checked Save and retains immutable revisions, facts and permissions", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const reference = await seed(staff.actor);
  const before = await inventoryDetail(t.db, staff.actor, reference);
  const draft = {
    ...workingDraftFrom(before.revision, before.facts),
    title: "Broker draft change",
  };
  const saved = await saveListingDraft(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: before.listing.version,
    reference,
    draft,
  });
  const after = await inventoryDetail(t.db, staff.actor, reference);
  expect(saved.outcome.version).toBe(before.listing.version + 1);
  expect(after.listing.draft).toEqual(draft);
  expect(after.revision).toEqual(before.revision);
  expect(after.facts).toEqual(before.facts);
  expect(after.property).toEqual(before.property);
  expect(after.publications).toEqual(before.publications);
  expect(after.manifests).toEqual(before.manifests);
  expect(after.listing.approvedRevisionId).toBe(before.listing.approvedRevisionId);
  expect(after.listing.publicationGeneration).toBe(before.listing.publicationGeneration);
  await expect(
    saveListingDraft(t.db, {
      actor: staff.actor,
      operationId: randomUUID(),
      expectedRevision: before.listing.version,
      reference,
      draft: { ...draft, title: "Stale edit" },
    }),
  ).rejects.toMatchObject({ code: "version_conflict" });
  expect((await inventoryDetail(t.db, staff.actor, reference)).listing.draft).toEqual(draft);
});

it("requires real source evidence before a fixture-created projection can be saved", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const fixture = await createListingFixture(t.db, {
    reviewerId: staff.id,
    photos: 0,
    sellerInstruction: false,
  });
  const before = await snapshot(staff.actor, fixture.reference);
  const draft = workingDraftFrom(before.detail.revision, before.detail.facts);
  expect(draft.title).not.toBe("");
  expect(draft.sourceReference).toBe("");
  expect(draft.sourceLanguage).toBe("");
  expect(draftSchema.safeParse(draft).success).toBe(false);
  await expect(
    saveListingDraft(t.db, {
      actor: staff.actor,
      operationId: randomUUID(),
      expectedRevision: before.detail.listing.version,
      reference: fixture.reference,
      draft,
    }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  expect(await snapshot(staff.actor, fixture.reference)).toEqual(before);
});

it("does not reattribute a latest immutable revision's price to different property evidence", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const reference = await seed(staff.actor);
  const original = await inventoryDetail(t.db, staff.actor, reference);
  if (!original.revision) throw new Error("Expected seeded revision");
  const originalTerms = original.revision.terms as { purpose: string; facts: { price: object } };
  const terms = {
    ...originalTerms,
    facts: {
      price: {
        ...originalTerms.facts.price,
        sourceReference: "different-price-document",
      },
    },
  };
  await t.db.insert(listingRevisions).values({
    listingId: original.listing.id,
    revisionNumber: original.revision.revisionNumber + 1,
    factRevisionId: original.revision.factRevisionId,
    terms,
    sourceCopy: original.revision.sourceCopy,
    disclosure: original.revision.disclosure,
    contentDigest: sha256Hex(canonicalJson(terms)),
    createdByKind: staff.actor.kind,
    createdById: staff.actor.id,
  });
  const before = await snapshot(staff.actor, reference);
  const draft = workingDraftFrom(before.detail.revision, before.detail.facts);
  expect(draft).toMatchObject({
    price: "95000.03|95000.05",
    area: "74.5|75.25",
    bedrooms: "0|2",
    sourceReference: "",
    sourceClass: "",
    sourceLanguage: "",
  });
  await expect(
    saveListingDraft(t.db, {
      actor: staff.actor,
      operationId: randomUUID(),
      expectedRevision: before.detail.listing.version,
      reference,
      draft,
    }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  expect(await snapshot(staff.actor, reference)).toEqual(before);
});
