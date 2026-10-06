import { randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  activityEvents,
  auditEvents,
  listingRevisions,
  listings,
  operations,
  outboxEvents,
  propertyFactRevisions,
  propertyFacts,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { canonicalJson } from "@/domain/approval";
import type { Actor } from "@/domain/capabilities";
import { hashRequest, sha256Hex } from "../crypto";
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

const eur = (amountMinor: number) => ({
  amountMinor,
  currency: "EUR",
  period: "total",
  basis: "asking",
});
const priceFact = (state: string, value: unknown) => ({
  state,
  value,
  sourceReference: "synthetic-price-evidence",
  sourceClass: "document_reviewed",
  sourceLanguage: "en",
});
const uneditablePrices = [
  {
    label: "BGN",
    facts: { price: priceFact("known", { ...eur(9_500_003), currency: "BGN" }) },
  },
  {
    label: "mismatched period",
    facts: { price: priceFact("known", { ...eur(9_500_003), period: "month" }) },
  },
  {
    label: "missing period",
    facts: {
      price: priceFact("known", { amountMinor: 9_500_003, currency: "EUR", basis: "asking" }),
    },
  },
  {
    label: "conflicting currencies",
    facts: {
      price: priceFact("conflicting", [eur(9_500_003), { ...eur(9_500_005), currency: "BGN" }]),
    },
  },
  {
    label: "conflicting periods",
    facts: {
      price: priceFact("conflicting", [eur(9_500_003), { ...eur(9_500_005), period: "month" }]),
    },
  },
  {
    label: "periodless import evidence",
    facts: {
      price: priceFact("unknown", null),
      "price.amount_without_period": priceFact("known", {
        amountMinor: 9_500_003,
        currency: "EUR",
      }),
    },
  },
];

async function seed(actor: Actor, facts: Record<string, unknown>) {
  const created = await createListingDraft(t.db, {
    actor,
    operationId: randomUUID(),
    expectedRevision: 0,
    input: {
      propertyType: "apartment",
      purpose: "sale",
      country: "BG",
      region: "Synthetic region",
      settlement: "Synthetic settlement",
      exactAddress: "",
      draft: {
        ...emptyDraft,
        title: "Synthetic listing",
        description: "Synthetic immutable source copy",
        priceState: "known",
        price: "95000.03",
        sourceReference: "synthetic-price-evidence",
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
  const original = await inventoryDetail(t.db, actor, created.outcome.reference);
  if (!original.revision) throw new Error("Expected seeded revision");
  const terms = { purpose: "sale", facts };
  await t.db.insert(listingRevisions).values({
    listingId: original.listing.id,
    revisionNumber: original.revision.revisionNumber + 1,
    factRevisionId: original.revision.factRevisionId,
    terms,
    sourceCopy: original.revision.sourceCopy,
    disclosure: original.revision.disclosure,
    contentDigest: sha256Hex(canonicalJson(terms)),
    createdByKind: actor.kind,
    createdById: actor.id,
  });
  await t.db
    .update(listings)
    .set({ draft: {}, latestRevisionNumber: original.revision.revisionNumber + 1 })
    .where(eq(listings.id, original.listing.id));
  return created.outcome.reference;
}

async function snapshot(actor: Actor, reference: string) {
  const detail = await inventoryDetail(t.db, actor, reference);
  const effects = await Promise.all(
    [
      operations,
      auditEvents,
      activityEvents,
      outboxEvents,
      listingRevisions,
      propertyFactRevisions,
      propertyFacts,
    ].map((table) => t.db.select({ value: count() }).from(table)),
  );
  return { detail, effects };
}

it.each(uneditablePrices)(
  "O12 rejects silent unknown for $label with no writes, then records an explicit source-bound choice",
  async ({ facts }) => {
    const staff = await createStaff(t.db, { roles: ["content_editor"] });
    const reference = await seed(staff.actor, facts);
    const before = await snapshot(staff.actor, reference);
    const draft = workingDraftFrom(before.detail.revision, before.detail.facts);
    expect(draft).toMatchObject({ priceState: "unknown", price: "" });
    expect(draftSchema.safeParse(draft).success).toBe(true);
    const command = {
      actor: staff.actor,
      operationId: randomUUID(),
      expectedRevision: before.detail.listing.version,
      reference,
      draft,
    };
    await expect(saveListingDraft(t.db, command)).rejects.toMatchObject({
      code: "validation_failed",
      fieldErrors: { priceDecision: expect.any(Array) },
    });
    expect(await snapshot(staff.actor, reference)).toEqual(before);

    const priceDecision = {
      kind: "retain_unknown" as const,
      sourceRevisionId: before.detail.revision?.id ?? "",
    };
    // An extra draft property cannot authorize the command.
    await expect(
      saveListingDraft(t.db, { ...command, draft: { ...draft, priceDecision } }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect(await snapshot(staff.actor, reference)).toEqual(before);

    const explicitCommand = { ...command, priceDecision };
    const saved = await saveListingDraft(t.db, explicitCommand);
    const after = await inventoryDetail(t.db, staff.actor, reference);
    expect(after.listing.draft).toEqual(draft);
    expect(after.listing.version).toBe(before.detail.listing.version + 1);
    expect(after.revision).toEqual(before.detail.revision);
    expect(after.facts).toEqual(before.detail.facts);
    expect(after.property).toEqual(before.detail.property);
    expect(after.publications).toEqual(before.detail.publications);
    expect(after.manifests).toEqual(before.detail.manifests);
    expect(after.listing.approvedRevisionId).toBe(before.detail.listing.approvedRevisionId);
    expect(after.listing.publicationGeneration).toBe(before.detail.listing.publicationGeneration);

    const [receipt] = await t.db
      .select()
      .from(operations)
      .where(eq(operations.id, saved.operationId));
    expect(receipt?.requestHash).toBe(
      hashRequest({ reference, draft, expectedRevision: command.expectedRevision, priceDecision }),
    );
    const [audit] = await t.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.operationId, saved.operationId));
    expect(audit?.payload).toMatchObject({ newVersion: saved.outcome.version, priceDecision });
    const [activity] = await t.db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.operationId, saved.operationId));
    expect(activity?.params).toEqual({ priceDecision });

    const afterSave = await snapshot(staff.actor, reference);
    expect((await saveListingDraft(t.db, explicitCommand)).replayed).toBe(true);
    await expect(saveListingDraft(t.db, command)).rejects.toMatchObject({
      code: "idempotency_key_reused",
    });
    await expect(
      saveListingDraft(t.db, {
        ...explicitCommand,
        priceDecision: { ...priceDecision, sourceRevisionId: randomUUID() },
      }),
    ).rejects.toMatchObject({ code: "idempotency_key_reused" });
    expect(await snapshot(staff.actor, reference)).toEqual(afterSave);
  },
);

it("O12 accepts a broker-corrected known price and rejects an empty claimed correction", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const reference = await seed(staff.actor, uneditablePrices[0]?.facts ?? {});
  const before = await snapshot(staff.actor, reference);
  const projected = workingDraftFrom(before.detail.revision, before.detail.facts);
  const command = {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: before.detail.listing.version,
    reference,
    draft: { ...projected, priceState: "known" as const, price: "" },
  };
  await expect(saveListingDraft(t.db, command)).rejects.toMatchObject({
    code: "validation_failed",
    fieldErrors: { price: expect.any(Array) },
  });
  expect(await snapshot(staff.actor, reference)).toEqual(before);
  const draft = { ...command.draft, price: "75000.25" };
  await saveListingDraft(t.db, { ...command, draft });
  const after = await inventoryDetail(t.db, staff.actor, reference);
  expect(after.listing.draft).toEqual(draft);
  expect(after.revision).toEqual(before.detail.revision);
  expect(after.facts).toEqual(before.detail.facts);
  expect(after.listing.approvedRevisionId).toBeNull();
});

it("O12 requires the current source revision, version and existing edit permission", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const reader = await createStaff(t.db, { roles: ["coordinator"] });
  const reference = await seed(staff.actor, uneditablePrices[0]?.facts ?? {});
  const before = await snapshot(staff.actor, reference);
  const draft = workingDraftFrom(before.detail.revision, before.detail.facts);
  const command = {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: before.detail.listing.version,
    reference,
    draft,
    priceDecision: {
      kind: "retain_unknown" as const,
      sourceRevisionId: before.detail.revision?.id ?? "",
    },
  };
  const [older] = await t.db
    .select()
    .from(listingRevisions)
    .where(eq(listingRevisions.listingId, before.detail.listing.id))
    .orderBy(listingRevisions.revisionNumber)
    .limit(1);
  await expect(
    saveListingDraft(t.db, {
      ...command,
      priceDecision: { ...command.priceDecision, sourceRevisionId: older?.id ?? randomUUID() },
    }),
  ).rejects.toMatchObject({
    code: "validation_failed",
    fieldErrors: { priceDecision: expect.any(Array) },
  });
  await expect(saveListingDraft(t.db, { ...command, actor: reader.actor })).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(
    saveListingDraft(t.db, { ...command, actor: { kind: "ai_service", id: "butler" } }),
  ).rejects.toMatchObject({ code: "forbidden" });
  expect(await snapshot(staff.actor, reference)).toEqual(before);
  await expect(
    saveListingDraft(t.db, { ...command, expectedRevision: command.expectedRevision - 1 }),
  ).rejects.toMatchObject({ code: "version_conflict" });
  expect(await inventoryDetail(t.db, staff.actor, reference)).toEqual(before.detail);
});

it("O12 replays the exact choice after the source advances without carrying it into another Save", async () => {
  const staff = await createStaff(t.db, { roles: ["content_editor"] });
  const reference = await seed(staff.actor, uneditablePrices[0]?.facts ?? {});
  const before = await inventoryDetail(t.db, staff.actor, reference);
  if (!before.revision) throw new Error("Expected source revision");
  const draft = workingDraftFrom(before.revision, before.facts);
  const command = {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: before.listing.version,
    reference,
    draft,
    priceDecision: { kind: "retain_unknown" as const, sourceRevisionId: before.revision.id },
  };
  const saved = await saveListingDraft(t.db, command);
  const next = await saveListingDraft(t.db, {
    actor: staff.actor,
    operationId: randomUUID(),
    expectedRevision: saved.outcome.version,
    reference,
    draft: { ...draft, title: "Later explicit edit" },
  });
  const [nextAudit] = await t.db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.operationId, next.operationId));
  expect(nextAudit?.payload).toEqual({ newVersion: next.outcome.version });
  const terms = { purpose: "sale", facts: uneditablePrices[1]?.facts };
  await t.db.insert(listingRevisions).values({
    listingId: before.listing.id,
    revisionNumber: before.revision.revisionNumber + 1,
    factRevisionId: before.revision.factRevisionId,
    terms,
    sourceCopy: before.revision.sourceCopy,
    disclosure: before.revision.disclosure,
    contentDigest: sha256Hex(canonicalJson(terms)),
    createdByKind: staff.actor.kind,
    createdById: staff.actor.id,
  });
  await t.db
    .update(listings)
    .set({
      draft: {},
      latestRevisionNumber: before.revision.revisionNumber + 1,
      version: next.outcome.version + 1,
    })
    .where(eq(listings.id, before.listing.id));
  const advanced = await snapshot(staff.actor, reference);
  const retry = await saveListingDraft(t.db, command);
  expect(retry).toMatchObject({ replayed: true, outcome: saved.outcome });
  expect(await snapshot(staff.actor, reference)).toEqual(advanced);
  await expect(
    saveListingDraft(t.db, {
      ...command,
      operationId: randomUUID(),
      expectedRevision: advanced.detail.listing.version,
    }),
  ).rejects.toMatchObject({ code: "validation_failed" });
  expect(await snapshot(staff.actor, reference)).toEqual(advanced);
});
