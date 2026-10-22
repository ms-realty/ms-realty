import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  auditEvents,
  currentPublications,
  destinationDeliveries,
  listingSearchDocuments,
  listings,
  mediaAssets,
  outboxEvents,
  sellerInstructions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { publicMediaDownload } from "../files/download";
import { activateManifest, prepareManifest } from "../publication/commands";
import { loadPublishedListings } from "../publication/presentation";
import { currentSellerEvidence } from "../publication/seller-evidence";
import {
  createListingFixture,
  listingVersion,
  publicationFixtureStorage,
  publishForTest,
  publishLocales,
} from "../publication/testing";
import { createStaff } from "../testing";
import { recordSellerInstruction } from "./commands";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});

async function fixture(propertyWide = false) {
  const staff = await createStaff(t.db, {
    roles: ["assigned_broker", "content_editor", "publishing_approver"],
  });
  const f = await createListingFixture(t.db, {
    reviewerId: staff.id,
    translations: { en: { title: "Synthetic sale", description: "Fictional approved test copy." } },
  });
  const [instruction] = await t.db
    .select()
    .from(sellerInstructions)
    .where(eq(sellerInstructions.listingId, f.listingId));
  if (!instruction) throw new Error("Missing instruction");
  if (propertyWide) {
    await t.db
      .update(sellerInstructions)
      .set({ listingId: null, representationScope: "sale_and_letting" })
      .where(eq(sellerInstructions.id, instruction.id));
    instruction.listingId = null;
    instruction.representationScope = "sale_and_letting";
  }
  await publishForTest(t.db, staff.actor, f, ["bg", "en"]);
  const version = await listingVersion(t.db, f.listingId);
  const terms = instruction.commercialTerms as {
    sellerPartyId: string;
    agreement: { documentVersionId: string };
  };
  const command = {
    actor: staff.actor,
    operationId: randomUUID(),
    reference: f.reference,
    expectedRevision: version.version,
    input: {
      partyId: terms.sellerPartyId,
      documentVersionId: terms.agreement.documentVersionId,
      commissionTerms: "Synthetic replacement instruction; no legal effect.",
      representationScope: "sale" as const,
      agreedAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: null,
      publicationPermission: true,
      mediaUsageGranted: true,
    },
  };
  return { f, staff, instruction, version, command };
}

it.each(["publicationPermission", "mediaUsageGranted"] as const)(
  "atomically restricts all locales when new consent removes %s",
  async (permission) => {
    const { f, instruction, version, command } = await fixture();
    const pointers = await t.db
      .select()
      .from(currentPublications)
      .where(eq(currentPublications.listingId, f.listingId));
    const assetId = f.assetIds[0];
    const pointer = pointers[0];
    if (!assetId || !pointer) throw new Error("Missing published fixture");
    const [asset] = await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
    if (!asset?.derivativeSha256) throw new Error("Missing image");
    // A manual destination is an outstanding removal task, never claimed removed by local read-back.
    await t.db.insert(currentPublications).values({
      ...pointer,
      id: randomUUID(),
      destination: "manual_portal",
    });
    const replacement = { ...command, input: { ...command.input, [permission]: false } };
    const first = await recordSellerInstruction(t.db, replacement);
    const replay = await recordSellerInstruction(t.db, replacement);
    expect(replay.replayed).toBe(true);
    expect(replay.outcome).toEqual(first.outcome);
    expect(await listingVersion(t.db, f.listingId)).toEqual({
      version: version.version + 1,
      generation: version.generation + 1,
    });
    const [previous] = await t.db
      .select()
      .from(sellerInstructions)
      .where(eq(sellerInstructions.id, instruction.id));
    const [current] = await t.db
      .select()
      .from(sellerInstructions)
      .where(eq(sellerInstructions.id, first.outcome.instructionId));
    expect(previous).toMatchObject({ state: "superseded", invalidatedAt: expect.any(Date) });
    expect(current).toMatchObject({ state: "agreed", supersedesId: instruction.id });
    const after = await t.db
      .select()
      .from(currentPublications)
      .where(eq(currentPublications.listingId, f.listingId));
    expect(after).toHaveLength(3);
    expect(after.every((pointer) => pointer.state === "restricted" && pointer.restrictedAt)).toBe(
      true,
    );
    expect(
      await t.db
        .select()
        .from(listingSearchDocuments)
        .where(eq(listingSearchDocuments.listingId, f.listingId)),
    ).toEqual([]);
    for (const locale of ["bg", "en"] as const)
      expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, locale)).toEqual([]);
    await expect(
      publicMediaDownload(t.db, publicationFixtureStorage, asset.id, asset.derivativeSha256),
    ).rejects.toMatchObject({ code: "not_found" });
    const deliveries = await t.db
      .select()
      .from(destinationDeliveries)
      .where(
        and(
          eq(destinationDeliveries.listingId, f.listingId),
          eq(destinationDeliveries.kind, "withdraw"),
        ),
      );
    expect(deliveries).toHaveLength(3);
    expect(
      deliveries
        .filter((row) => row.destination === "website")
        .every((row) => row.state === "withdrawn" && row.verifiedAt),
    ).toBe(true);
    expect(deliveries.find((row) => row.destination === "manual_portal")).toMatchObject({
      state: "queued",
      verifiedAt: null,
    });
    const events = await t.db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.subjectId, f.listingId),
          eq(outboxEvents.eventType, "publication.restricted"),
        ),
      );
    expect(events).toHaveLength(1);
    expect(events[0]?.sourceGeneration).toBe(version.generation + 1);
    expect(
      await t.db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.recordId, f.listingId),
            eq(auditEvents.action, "seller.instruction.recorded"),
          ),
        ),
    ).toHaveLength(1);
    await expect(
      activateManifest(
        t.db,
        {
          actor: command.actor,
          operationId: randomUUID(),
          manifestId: pointer.manifestId,
          expectedRevision: version.generation + 1,
        },
        { storage: publicationFixtureStorage },
      ),
    ).rejects.toBeDefined();
  },
);

it("fences a previously prepared manifest when otherwise permissive consent is replaced", async () => {
  const { f, staff, command } = await fixture();
  const prepared = await prepareManifest(
    t.db,
    {
      actor: staff.actor,
      operationId: randomUUID(),
      reference: f.reference,
      locale: "bg",
      expectedRevision: (await listingVersion(t.db, f.listingId)).generation,
    },
    { storage: publicationFixtureStorage },
  );
  const changed = await recordSellerInstruction(t.db, command);
  await expect(
    activateManifest(
      t.db,
      {
        actor: staff.actor,
        operationId: randomUUID(),
        manifestId: prepared.outcome.manifestId,
        expectedRevision: changed.outcome.generation,
      },
      { storage: publicationFixtureStorage },
    ),
  ).rejects.toBeDefined();
});

it("keeps a legacy property-wide agreement effective for a sibling listing only", async () => {
  const { f, instruction, command } = await fixture(true);
  const [sibling] = await t.db
    .insert(listings)
    .values({
      propertyId: f.propertyId,
      reference: `MS-SIBLING-${randomUUID()}`,
      purpose: "long_term_rent",
    })
    .returning();
  if (!sibling) throw new Error("Missing sibling");
  const effective = (id: string) =>
    t.db
      .select({ id: sellerInstructions.id })
      .from(sellerInstructions)
      .where(and(eq(sellerInstructions.id, instruction.id), currentSellerEvidence(undefined, id)));
  expect(await effective(f.listingId)).toHaveLength(1);
  expect(await effective(sibling.id)).toHaveLength(1);
  const changed = await recordSellerInstruction(t.db, {
    ...command,
    input: { ...command.input, mediaUsageGranted: false },
  });
  expect(await effective(f.listingId)).toEqual([]);
  expect(await effective(sibling.id)).toHaveLength(1);
  const [legacy] = await t.db
    .select()
    .from(sellerInstructions)
    .where(eq(sellerInstructions.id, instruction.id));
  const [newer] = await t.db
    .select()
    .from(sellerInstructions)
    .where(eq(sellerInstructions.id, changed.outcome.instructionId));
  expect(legacy?.state).toBe("agreed");
  expect(newer?.supersedesId).toBe(instruction.id);
});

it.each(["expired", "expired_state", "withdrawn", "invalidated"] as const)(
  "does not revive old consent when the newer applicable agreement is %s",
  async (condition) => {
    const { f, staff, instruction, command, version } = await fixture(true);
    await t.db.insert(sellerInstructions).values({
      ...instruction,
      id: randomUUID(),
      reference: `SI-NEW-${randomUUID()}`,
      revisionNumber: 2,
      state:
        condition === "withdrawn"
          ? "withdrawn"
          : condition === "expired_state"
            ? "expired"
            : "agreed",
      expiresAt: condition === "expired" ? new Date(Date.now() - 1000) : null,
      invalidatedAt: condition === "invalidated" ? new Date() : null,
    });
    expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toEqual([]);
    const changed = await recordSellerInstruction(t.db, command);
    expect(changed.outcome.generation).toBe(version.generation + 1);
    await publishLocales(t.db, staff.actor, f, ["bg"]);
    expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toHaveLength(1);
  },
);

it("ignores a property-wide letting instruction for a sale listing", async () => {
  const { f, staff, instruction, version } = await fixture(true);
  await t.db.insert(sellerInstructions).values({
    ...instruction,
    id: randomUUID(),
    reference: `SI-LETTING-${randomUUID()}`,
    revisionNumber: 2,
    representationScope: "letting",
    publicationPermission: false,
  });
  expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toHaveLength(1);
  await expect(
    prepareManifest(
      t.db,
      {
        actor: staff.actor,
        reference: f.reference,
        operationId: randomUUID(),
        locale: "bg",
        expectedRevision: version.generation,
      },
      { storage: publicationFixtureStorage },
    ),
  ).resolves.toMatchObject({ outcome: { manifestId: expect.any(String) } });
});

it("rolls the instruction, generation, public pointers and durable intent back together", async () => {
  const { f, instruction, version, command } = await fixture();
  await t.sql.unsafe(
    `create function reject_seller_consent_audit() returns trigger language plpgsql as $$ begin if new.action = 'seller.instruction.recorded' then raise exception 'synthetic audit failure'; end if; return new; end $$`,
  );
  await t.sql.unsafe(
    `create trigger reject_seller_consent_audit before insert on audit_events for each row execute function reject_seller_consent_audit()`,
  );
  try {
    await expect(
      recordSellerInstruction(t.db, {
        ...command,
        input: { ...command.input, publicationPermission: false },
      }),
    ).rejects.toThrow();
  } finally {
    await t.sql.unsafe(`drop trigger reject_seller_consent_audit on audit_events`);
    await t.sql.unsafe(`drop function reject_seller_consent_audit()`);
  }
  expect(await listingVersion(t.db, f.listingId)).toEqual(version);
  const rows = await t.db
    .select()
    .from(sellerInstructions)
    .where(eq(sellerInstructions.listingId, f.listingId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: instruction.id, state: "agreed", invalidatedAt: null });
  expect(await loadPublishedListings(t.db, { ids: [f.listingId] }, "bg")).toHaveLength(1);
  expect(
    await t.db
      .select()
      .from(listingSearchDocuments)
      .where(eq(listingSearchDocuments.listingId, f.listingId)),
  ).toHaveLength(2);
  expect(
    await t.db
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.subjectId, f.listingId),
          eq(outboxEvents.eventType, "publication.restricted"),
        ),
      ),
  ).toEqual([]);
});
