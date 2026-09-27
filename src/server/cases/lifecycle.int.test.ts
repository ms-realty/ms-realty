import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  briefRevisions,
  caseParticipants,
  caseStageHistory,
  cases,
  documents,
  documentVersions,
  grants,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { createListingFixture, publishForTest } from "../publication/testing";
import { nextReference } from "../references";
import { createClient } from "../testing";
import { changeTask } from "../work/commands";
import { addInterest, reviseBrief } from "./commands";
import {
  acknowledgeBrief,
  caseWorkSnapshot,
  changeCaseDisposition,
  handoverCase,
  transitionCaseStage,
} from "./lifecycle";
import { caseFixture, staffFixture } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const stage = {
  reason: "Reviewed current case evidence",
  completionEvidenceId: "",
  outcome: "",
  retention: "",
  aftercare: "",
  handover: "",
};
const disposition = {
  reason: "Human reviewed case disposition",
  waitingOn: "",
  reviewAt: "",
  outcome: "",
  retention: "",
  aftercare: "",
  nextAction: "",
  dueAt: "",
};
const command = (id: string, expectedVersion: number) => ({
  id,
  expectedVersion,
  operationId: randomUUID(),
});

describe("accountable Case lifecycle", () => {
  it("acknowledges only an exact current Brief for a primary participant and rechecks revocation before replay", async () => {
    const f = await caseFixture(t.db);
    const [brief] = await t.db
      .select()
      .from(briefRevisions)
      .where(eq(briefRevisions.caseId, f.record.id));
    if (!brief) throw new Error("Missing brief");
    const other = await createClient(t.db),
      issued = await createSession(t.db, { kind: "client", id: other.id });
    await t.db
      .insert(caseParticipants)
      .values({ caseId: f.record.id, partyId: other.partyId, role: "collaborator" });
    await expect(
      acknowledgeBrief(t.db, issued.session, {
        ...command(f.record.id, 1),
        briefId: brief.id,
        reviewed: true,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await reviseBrief(t.db, f.staff.session, {
      ...command(f.record.id, 1),
      requirements: "Changed requirements need a new acknowledgement",
      preferences: "",
    });
    await expect(
      acknowledgeBrief(t.db, f.client.session, {
        ...command(f.record.id, 2),
        briefId: brief.id,
        reviewed: true,
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const current = (
      await t.db.select().from(briefRevisions).where(eq(briefRevisions.caseId, f.record.id))
    ).find((b) => b.revisionNumber === 2);
    if (!current) throw new Error("Missing current brief");
    const input = { ...command(f.record.id, 2), briefId: current.id, reviewed: true };
    await acknowledgeBrief(t.db, f.client.session, input);
    await acknowledgeBrief(t.db, f.client.session, input);
    expect(
      (await t.db.select().from(briefRevisions).where(eq(briefRevisions.id, brief.id)))[0]
        ?.clientAcknowledgedAt,
    ).toBeNull();
    await t.db
      .update(caseParticipants)
      .set({ revokedAt: new Date() })
      .where(eq(caseParticipants.partyId, f.client.partyId));
    await expect(acknowledgeBrief(t.db, f.client.session, input)).rejects.toMatchObject({
      code: "not_found",
    });
  });
  it("derives stage evidence from acknowledged current requirements and real reviewed interests", async () => {
    const f = await caseFixture(t.db);
    await expect(
      transitionCaseStage(t.db, f.staff.session, {
        ...command(f.record.id, 1),
        ...stage,
        stage: "evaluating",
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    const [brief] = await t.db
      .select()
      .from(briefRevisions)
      .where(eq(briefRevisions.caseId, f.record.id));
    if (!brief) throw new Error("Missing brief");
    await acknowledgeBrief(t.db, f.client.session, {
      ...command(f.record.id, 1),
      briefId: brief.id,
      reviewed: true,
    });
    await expect(
      transitionCaseStage(t.db, f.staff.session, {
        ...command(f.record.id, 2),
        ...stage,
        stage: "evaluating",
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    const listing = await createListingFixture(t.db, { reviewerId: f.staff.id });
    await publishForTest(t.db, f.staff.actor, listing);
    await addInterest(t.db, f.staff.session, {
      ...command(f.record.id, 2),
      reference: listing.reference,
      explanation: "Reviewed current source fits the brief",
    });
    await transitionCaseStage(t.db, f.staff.session, {
      ...command(f.record.id, 3),
      ...stage,
      stage: "evaluating",
    });
    await expect(
      transitionCaseStage(t.db, f.staff.session, {
        ...command(f.record.id, 4),
        ...stage,
        stage: "completed",
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    expect((await t.db.select().from(cases).where(eq(cases.id, f.record.id)))[0]?.stage).toBe(
      "evaluating",
    );
  });
  it("keeps the old owner until the named receiver accepts a current work snapshot and preserves each task", async () => {
    const f = await caseFixture(t.db),
      receiver = await staffFixture(t.db),
      stranger = await staffFixture(t.db);
    const before = await caseWorkSnapshot(t.db, f.record.id);
    await handoverCase(t.db, f.staff.session, {
      ...command(f.record.id, 1),
      action: "request",
      receiverId: receiver.id,
      reason: "Planned broker coverage",
      reviewed: true,
      snapshotHash: before.hash,
    });
    expect((await t.db.select().from(cases).where(eq(cases.id, f.record.id)))[0]).toMatchObject({
      ownerId: f.staff.id,
      pendingOwnerId: receiver.id,
    });
    expect((await caseWorkSnapshot(t.db, f.record.id)).commitments[0]?.ownerId).toBe(f.staff.id);
    await expect(
      handoverCase(t.db, stranger.session, {
        ...command(f.record.id, 2),
        action: "accept",
        receiverId: receiver.id,
        reason: "Wrong recipient",
        reviewed: true,
        snapshotHash: before.hash,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const task = before.commitments[0];
    if (!task) throw new Error("Missing task");
    await changeTask(t.db, f.staff.session, {
      ...command(task.id, task.version),
      state: "in_progress",
      note: "Existing broker started the commitment",
    });
    await expect(
      handoverCase(t.db, receiver.session, {
        ...command(f.record.id, 2),
        action: "accept",
        receiverId: receiver.id,
        reason: "Stale handover snapshot",
        reviewed: true,
        snapshotHash: before.hash,
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const snapshot = await caseWorkSnapshot(t.db, f.record.id);
    const accepted = {
      ...command(f.record.id, 2),
      action: "accept" as const,
      receiverId: receiver.id,
      reason: "Reviewed and accepted current commitments",
      reviewed: true,
      snapshotHash: snapshot.hash,
    };
    await handoverCase(t.db, receiver.session, accepted);
    await handoverCase(t.db, receiver.session, accepted);
    expect((await t.db.select().from(cases).where(eq(cases.id, f.record.id)))[0]).toMatchObject({
      ownerId: receiver.id,
      pendingOwnerId: null,
    });
    expect((await t.db.select().from(tasks).where(eq(tasks.id, task.id)))[0]).toMatchObject({
      ownerId: receiver.id,
      title: task.title,
      dueAt: task.dueAt,
      state: "in_progress",
    });
  });
  it("refuses handover when the receiver lacks access to a restricted case document", async () => {
    const f = await caseFixture(t.db),
      receiver = await staffFixture(t.db);
    await t.db.insert(grants).values({
      principalId: f.staff.id,
      capability: "compliance.review",
      reason: "Synthetic sender has reviewed purpose access; receiver does not",
    });
    const [document] = await t.db
      .insert(documents)
      .values({
        reference: await nextReference(t.db, "document"),
        caseId: f.record.id,
        purpose: "case_check",
        classification: "identity",
        currentVersionNumber: 1,
      })
      .returning();
    if (!document) throw new Error("Missing document");
    await t.db.insert(documentVersions).values({
      documentId: document.id,
      versionNumber: 1,
      state: "uploaded",
      stagingKey: "staging/synthetic.pdf",
      fileName: "restricted-fixture.pdf",
      contentType: "application/pdf",
      byteSize: 5,
      uploadedByKind: "staff",
      uploadedById: f.staff.id,
    });
    await expect(
      handoverCase(t.db, f.staff.session, {
        ...command(f.record.id, 1),
        action: "request",
        receiverId: receiver.id,
        reason: "Must not expand private document access",
        reviewed: true,
        snapshotHash: (await caseWorkSnapshot(t.db, f.record.id)).hash,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      (await t.db.select().from(cases).where(eq(cases.id, f.record.id)))[0]?.pendingOwnerId,
    ).toBeNull();
  });
  it("pause preserves commitments; closure requires individual outcomes; reopening preserves immutable closeout history", async () => {
    const f = await caseFixture(t.db);
    await changeCaseDisposition(t.db, f.staff.session, {
      ...command(f.record.id, 1),
      ...disposition,
      state: "paused",
      waitingOn: "Client availability",
      reviewAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const task = (await caseWorkSnapshot(t.db, f.record.id)).commitments[0];
    if (!task) throw new Error("Pause dropped the task");
    const closing = {
      ...disposition,
      state: "closed" as const,
      outcome: "Client chose not to continue; no sale asserted",
      retention: "Retain under the current recorded policy",
      aftercare: "No remaining agency obligations",
    };
    await expect(
      changeCaseDisposition(t.db, f.staff.session, { ...command(f.record.id, 2), ...closing }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await changeTask(t.db, f.staff.session, {
      ...command(task.id, task.version),
      state: "cancelled",
      note: "Client withdrew the intake request",
    });
    await changeCaseDisposition(t.db, f.staff.session, { ...command(f.record.id, 2), ...closing });
    const [closed] = await t.db.select().from(cases).where(eq(cases.id, f.record.id));
    expect(closed?.commitmentDispositions).toEqual({
      [task.id]: "cancelled: Client withdrew the intake request",
    });
    await changeCaseDisposition(t.db, f.staff.session, {
      ...command(f.record.id, 3),
      ...disposition,
      state: "active",
      reason: "Client explicitly asked to resume",
      nextAction: "Review changed requirements",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const histories = await t.db
      .select()
      .from(caseStageHistory)
      .where(eq(caseStageHistory.caseId, f.record.id));
    expect(
      histories.some((h) => (h.evidence as { toDisposition?: string }).toDisposition === "closed"),
    ).toBe(true);
    expect((await t.db.select().from(cases).where(eq(cases.id, f.record.id)))[0]).toMatchObject({
      disposition: "active",
      stage: "needs_agreed",
      nextAction: "Review changed requirements",
    });
  });
  it("does not treat an outcome note as completion evidence", async () => {
    const f = await caseFixture(t.db);
    // Historical coordination state; the command must still check every completion guard.
    await t.db.update(cases).set({ stage: "coordination" }).where(eq(cases.id, f.record.id));
    await expect(
      transitionCaseStage(t.db, f.staff.session, {
        ...command(f.record.id, 1),
        ...stage,
        stage: "completed",
        outcome: "An unsupported claim is not proof",
        handover: "Claimed",
        retention: "Claimed",
        aftercare: "Claimed",
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });
});
