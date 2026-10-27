import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  currentPublications,
  interests,
  listingSearchDocuments,
  outboxEvents,
  passkeys,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { caseFixture, staffFixture } from "../cases/testing";
import { createListingFixture, publishForTest } from "../publication/testing";
import { createStaff } from "../testing";
import { changeTask } from "../work/commands";
import {
  correctionPurpose,
  openMaterialCorrection,
  readCorrectionWorkspace,
  reconcileMaterialCorrection,
} from "./corrections";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
async function fixture() {
  const staff = await staffFixture(t.db);
  const listing = await createListingFixture(t.db, { reviewerId: staff.id });
  await publishForTest(t.db, staff.actor, listing, ["bg"]);
  return { staff, listing };
}
it("F31 restricts atomically once, retains source, and requires explicit complete current reconciliation", async () => {
  const { staff, listing } = await fixture();
  const before = await readCorrectionWorkspace(t.db, staff.session, listing.reference);
  const input = {
    operationId: randomUUID(),
    expectedVersion: before.listing.version,
    impactHash: before.digest,
    sourceReference: "synthetic-correction-evidence",
    disputedFact: "Source price needs human correction",
    urgency: "urgent" as const,
    reviewed: true as const,
  };
  const first = await openMaterialCorrection(t.db, staff.session, listing.reference, input);
  expect(
    (await openMaterialCorrection(t.db, staff.session, listing.reference, input)).outcome,
  ).toEqual(first.outcome);
  const after = await readCorrectionWorkspace(t.db, staff.session, listing.reference);
  expect(after.listing.publicationGeneration).toBe(before.listing.publicationGeneration + 1);
  expect(after.listing.approvedRevisionId).toBe(before.listing.approvedRevisionId);
  expect(after.task).toMatchObject({
    purpose: correctionPurpose,
    evidenceRequired: true,
    ownerId: staff.id,
    state: "open",
  });
  expect(
    await t.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.listingId, listing.listingId), eq(tasks.purpose, correctionPurpose))),
  ).toHaveLength(1);
  expect(
    (
      await t.db
        .select()
        .from(currentPublications)
        .where(eq(currentPublications.listingId, listing.listingId))
    ).every((row) => row.state === "restricted"),
  ).toBe(true);
  expect(
    await t.db
      .select()
      .from(listingSearchDocuments)
      .where(eq(listingSearchDocuments.listingId, listing.listingId)),
  ).toEqual([]);
  const task = after.task;
  if (!task) throw new Error("Missing correction task");
  await expect(
    changeTask(t.db, staff.session, {
      id: task.id,
      operationId: randomUUID(),
      expectedVersion: task.version,
      state: "cancelled",
      note: "Cannot bypass reconciliation",
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
  await expect(
    reconcileMaterialCorrection(t.db, staff.session, listing.reference, {
      operationId: randomUUID(),
      expectedVersion: task.version,
      impactHash: before.digest,
      reviewed: true,
      items: after.items.map((item) => ({
        key: item.key,
        state: "verified",
        evidence: "Synthetic manual readback",
      })),
    }),
  ).rejects.toMatchObject({ code: "version_conflict" });
  const messagesBefore = await t.db.select().from(outboxEvents);
  await reconcileMaterialCorrection(t.db, staff.session, listing.reference, {
    operationId: randomUUID(),
    expectedVersion: task.version,
    impactHash: after.digest,
    reviewed: true,
    followUpAt: new Date(Date.now() + 3600000).toISOString(),
    items: after.items.map((item) => ({
      key: item.key,
      state: "unresolved",
      evidence: "Human follow-up remains with this named owner",
    })),
  });
  const waiting = await readCorrectionWorkspace(t.db, staff.session, listing.reference);
  expect(waiting.task).toMatchObject({ state: "waiting", ownerId: staff.id });
  expect(waiting.reconciliation?.items).toHaveLength(after.items.length);
  await reconcileMaterialCorrection(t.db, staff.session, listing.reference, {
    operationId: randomUUID(),
    expectedVersion: waiting.task?.version ?? 0,
    impactHash: waiting.digest,
    reviewed: true,
    items: waiting.items.map((item) => ({
      key: item.key,
      state: "verified",
      evidence: "Synthetic manual verification of restricted exposure",
    })),
  });
  expect((await readCorrectionWorkspace(t.db, staff.session, listing.reference)).task?.state).toBe(
    "done",
  );
  expect(await t.db.select().from(outboxEvents)).toEqual(messagesBefore);
});

it("F31 refuses a partial impact view before revealing or mutating a hidden related Case", async () => {
  const { staff, listing } = await fixture();
  const f = await caseFixture(t.db, staff);
  const view = await readCorrectionWorkspace(t.db, staff.session, listing.reference);
  await t.db.insert(interests).values({
    caseId: f.record.id,
    listingId: listing.listingId,
    listingRevisionId: view.listing.approvedRevisionId as string,
    state: "suggested",
    fitExplanation: "Synthetic hidden relationship",
  });
  const scoped = await createStaff(t.db, {
    grants: [
      { capability: "listing.read", recordType: "listing", recordId: listing.listingId },
      { capability: "publication.release", recordType: "listing", recordId: listing.listingId },
      { capability: "task.manage" },
    ],
  });
  await t.db.insert(passkeys).values(
    [0, 1].map(() => ({
      principalId: scoped.id,
      credentialId: randomUUID(),
      publicKey: Buffer.from([1]),
      deviceType: "singleDevice",
      backedUp: false,
    })),
  );
  const issued = await createSession(t.db, { kind: "staff", id: scoped.id });
  await expect(
    readCorrectionWorkspace(t.db, issued.session, listing.reference),
  ).rejects.toMatchObject({ code: "not_found" });
  expect(
    (
      await t.db
        .select()
        .from(currentPublications)
        .where(eq(currentPublications.listingId, listing.listingId))
    ).every((row) => row.state === "active"),
  ).toBe(true);
});
