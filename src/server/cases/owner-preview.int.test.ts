import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approvals,
  caseParticipants,
  cases,
  currentPublications,
  listings,
  mediaAssets,
  propertyRelationships,
  sellerInstructions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { publicationFixtureStorage } from "../publication/testing";
import { createClient } from "../testing";
import { transitionCaseStage } from "./lifecycle";
import {
  acknowledgeOwnerPreview as acknowledgeOwnerPreviewCommand,
  bindSellerCase,
  currentOwnerAcknowledgment,
  getOwnerPreview,
  ownerPreviewMedia,
} from "./owner-preview";
import { ownerFixture } from "./owner-preview-testing";

const acknowledgeOwnerPreview = (
  db: Parameters<typeof acknowledgeOwnerPreviewCommand>[0],
  session: Parameters<typeof acknowledgeOwnerPreviewCommand>[1],
  input: Parameters<typeof acknowledgeOwnerPreviewCommand>[2],
) => acknowledgeOwnerPreviewCommand(db, session, input, publicationFixtureStorage);

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const base = (id: string, expectedVersion: number) => ({
  id,
  expectedVersion,
  operationId: randomUUID(),
});
const stage = {
  reason: "Recorded seller workflow evidence",
  completionEvidenceId: "",
  outcome: "",
  retention: "",
  aftercare: "",
  handover: "",
};
async function bound() {
  const f = await ownerFixture(t.db);
  await bindSellerCase(t.db, f.staff.session, {
    ...base(f.record.id, 1),
    instructionId: f.instruction.id,
    reviewed: true,
    reason: "Explicit same-party property and exact instruction binding",
  });
  return f;
}
describe("exact owner listing preview", () => {
  it("refuses acknowledgement when reviewed image bytes no longer match their evidence", async () => {
    const f = await bound();
    const view = await getOwnerPreview(t.db, f.client.session, f.record.id, f.listing.reference);
    await expect(
      acknowledgeOwnerPreviewCommand(
        t.db,
        f.client.session,
        {
          ...base(f.record.id, 2),
          reference: f.listing.reference,
          previewHash: view.hash,
          reviewed: true,
        },
        {
          read: async () => Buffer.from("corrupt reviewed bytes"),
          writeStaging: async () => {
            throw new Error("Unexpected write");
          },
          writeImmutable: async () => {
            throw new Error("Unexpected write");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "publication_ineligible" });
    expect(await currentOwnerAcknowledgment(t.db, f.record.id)).toBeNull();
    expect((await t.db.select().from(cases).where(eq(cases.id, f.record.id)))[0]?.version).toBe(2);
  });
  it("binds reviewed instructions explicitly and a real client acknowledgment enables marketing without publication", async () => {
    const f = await bound();
    const view = await getOwnerPreview(t.db, f.client.session, f.record.id, f.listing.reference);
    expect(view.acknowledged).toBe(false);
    expect(JSON.stringify(view)).not.toMatch(/sealed\/|derivatives\/|Fixture street/);
    expect(view.terms.find((f) => f.key === "price")?.value).toMatchObject({
      amountMinor: 9500000,
      currency: "EUR",
    });
    const input = {
      ...base(f.record.id, 2),
      reference: f.listing.reference,
      previewHash: view.hash,
      reviewed: true,
    };
    await acknowledgeOwnerPreview(t.db, f.client.session, input);
    await acknowledgeOwnerPreview(t.db, f.client.session, input);
    expect(
      (await getOwnerPreview(t.db, f.client.session, f.record.id, f.listing.reference))
        .acknowledged,
    ).toBe(true);
    let version = 3;
    for (const next of [
      "scope_authority_review",
      "assessment",
      "instructions_agreed",
      "preparing",
      "marketing",
    ])
      await transitionCaseStage(t.db, f.staff.session, {
        ...base(f.record.id, version++),
        ...stage,
        stage: next,
      });
    expect((await t.db.select().from(cases).where(eq(cases.id, f.record.id)))[0]?.stage).toBe(
      "marketing",
    );
    expect(
      await t.db
        .select()
        .from(currentPublications)
        .where(eq(currentPublications.listingId, f.listing.listingId)),
    ).toEqual([]);
    const rows = await t.db
      .select()
      .from(approvals)
      .where(eq(approvals.kind, "owner_acknowledgment"));
    expect(rows.filter((a) => a.subjectId === f.listing.revisionId)).toHaveLength(1);
  });
  it("changed media wording or a newer source invalidates the old acknowledgment and blocks stale confirmation", async () => {
    const f = await bound(),
      view = await getOwnerPreview(t.db, f.client.session, f.record.id, f.listing.reference);
    await acknowledgeOwnerPreview(t.db, f.client.session, {
      ...base(f.record.id, 2),
      reference: f.listing.reference,
      previewHash: view.hash,
      reviewed: true,
    });
    await t.db
      .update(mediaAssets)
      .set({ caption: "Materially changed display caption" })
      .where(eq(mediaAssets.id, f.listing.assetIds[0] as string));
    expect(await currentOwnerAcknowledgment(t.db, f.record.id)).toBeNull();
    await expect(
      acknowledgeOwnerPreview(t.db, f.client.session, {
        ...base(f.record.id, 3),
        reference: f.listing.reference,
        previewHash: view.hash,
        reviewed: true,
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      ownerPreviewMedia(
        t.db,
        publicationFixtureStorage,
        f.client.session,
        f.record.id,
        f.listing.reference,
        f.listing.assetIds[0] as string,
        view.hash,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(listings)
      .set({ latestRevisionNumber: 2 })
      .where(eq(listings.id, f.listing.listingId));
    await expect(
      getOwnerPreview(t.db, f.client.session, f.record.id, f.listing.reference),
    ).rejects.toMatchObject({ code: "approval_stale" });
  });
  it("denies another participant, never exposes originals, and rechecks revoked authority before replay or media reads", async () => {
    const f = await bound(),
      view = await getOwnerPreview(t.db, f.client.session, f.record.id, f.listing.reference),
      other = await createClient(t.db),
      otherSession = await createSession(t.db, { kind: "client", id: other.id });
    await t.db
      .insert(caseParticipants)
      .values({ caseId: f.record.id, partyId: other.partyId, role: "collaborator" });
    await expect(
      getOwnerPreview(t.db, otherSession.session, f.record.id, f.listing.reference),
    ).rejects.toMatchObject({ code: "not_found" });
    const media = await ownerPreviewMedia(
      t.db,
      publicationFixtureStorage,
      f.client.session,
      f.record.id,
      f.listing.reference,
      f.listing.assetIds[0] as string,
      view.hash,
    );
    expect(media.contentType).toBe("image/webp");
    expect(media.bytes.length).toBeGreaterThan(0);
    const input = {
      ...base(f.record.id, 2),
      reference: f.listing.reference,
      previewHash: view.hash,
      reviewed: true,
    };
    await acknowledgeOwnerPreview(t.db, f.client.session, input);
    await t.db
      .update(propertyRelationships)
      .set({ revokedAt: new Date() })
      .where(eq(propertyRelationships.propertyId, f.listing.propertyId));
    await expect(acknowledgeOwnerPreview(t.db, f.client.session, input)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      ownerPreviewMedia(
        t.db,
        publicationFixtureStorage,
        f.client.session,
        f.record.id,
        f.listing.reference,
        f.listing.assetIds[0] as string,
        view.hash,
      ),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("does not silently reassign an existing instruction binding", async () => {
    const f = await bound();
    const [other] = await t.db
      .insert(cases)
      .values({
        reference: `CS-OTHER-${randomUUID()}`,
        kind: "seller",
        stage: "request_received",
        title: "Another seller case",
        ownerId: f.staff.id,
        nextAction: "Review instructions",
      })
      .returning();
    if (!other) throw new Error("Missing case");
    await t.db
      .insert(caseParticipants)
      .values({ caseId: other.id, partyId: f.client.partyId as string, role: "seller" });
    await expect(
      bindSellerCase(t.db, f.staff.session, {
        ...base(other.id, 1),
        instructionId: f.instruction.id,
        reviewed: true,
        reason: "Must not steal an instruction",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(
      (
        await t.db
          .select()
          .from(sellerInstructions)
          .where(eq(sellerInstructions.id, f.instruction.id))
      )[0]?.caseId,
    ).toBe(f.record.id);
  });
  it("serializes two same-party case bindings and never steals the winning instruction", async () => {
    const f = await ownerFixture(t.db);
    const [other] = await t.db
      .insert(cases)
      .values({
        reference: `CS-RACE-${randomUUID()}`,
        kind: "seller",
        stage: "request_received",
        title: "Other concurrent seller case",
        ownerId: f.staff.id,
        nextAction: "Review instruction binding",
      })
      .returning();
    if (!other) throw new Error("Missing case");
    await t.db
      .insert(caseParticipants)
      .values({ caseId: other.id, partyId: f.client.partyId as string, role: "seller" });
    const results = await Promise.allSettled(
      [f.record.id, other.id].map((id) =>
        bindSellerCase(t.db, f.staff.session, {
          ...base(id, 1),
          instructionId: f.instruction.id,
          reviewed: true,
          reason: "Reviewed competing case binding",
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const denied = results.find((r) => r.status === "rejected");
    expect(denied?.status === "rejected" ? denied.reason : null).toMatchObject({
      code: "not_found",
    });
    const winner = results[0]?.status === "fulfilled" ? f.record.id : other.id;
    expect(
      (
        await t.db
          .select()
          .from(sellerInstructions)
          .where(eq(sellerInstructions.id, f.instruction.id))
      )[0]?.caseId,
    ).toBe(winner);
  });
});
