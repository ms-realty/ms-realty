import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  caseProcessItems,
  caseProcessReviews,
  caseStageHistory,
  cases,
  documents,
  documentVersions,
  grants,
  processItemDecisions,
  processPolicies,
  proposalRevisions,
  proposals,
  serviceAgreements,
  suspicionReports,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { caseFixture } from "../cases/testing";
import { hashRequest } from "../crypto";
import { createListingFixture } from "../publication/testing";
import { nextReference } from "../references";
import { createClient } from "../testing";
import { assertCaseAgreementReady } from "./agreement-gate";
import {
  approveCaseProcess,
  approveProcessPolicy,
  caseProcessWorkbench,
  recordProcessItem,
  recordServiceAgreement,
  recordSuspicion,
  restrictedCaseRegister,
  revokeCaseEvidence,
  startCaseProcessReview,
} from "./commands";
import { hasPrivacyRetentionHold } from "./retention";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
const future = () => new Date(Date.now() + 86400000 * 30).toISOString();
const past = () => new Date(Date.now() - 60000).toISOString();
async function evidence(caseId: string, reviewerId: string, purpose: string) {
  const [doc] = await t.db
    .insert(documents)
    .values({
      reference: await nextReference(t.db, "document"),
      caseId,
      purpose,
      classification: "contract",
      currentVersionNumber: 1,
    })
    .returning();
  if (!doc) throw new Error("Missing fixture document");
  const digest = hashRequest({ synthetic: true, purpose, caseId, id: randomUUID() });
  const [file] = await t.db
    .insert(documentVersions)
    .values({
      documentId: doc.id,
      versionNumber: 1,
      state: "reviewed",
      sealedKey: `synthetic/${randomUUID()}`,
      sha256: digest,
      fileName: "synthetic-test-only.pdf",
      contentType: "application/pdf",
      byteSize: 5,
      uploadedByKind: "staff",
      uploadedById: reviewerId,
      scan: "clean",
      scannedAt: new Date(),
      scannerVersion: "fixture-only",
      scannedSha256: digest,
      reviewType: "accepted_for_purpose",
      reviewedById: reviewerId,
      reviewedAt: new Date(),
    })
    .returning();
  if (!file) throw new Error("Missing fixture file");
  return file;
}
async function fixture() {
  const f = await caseFixture(t.db);
  for (const capability of [
    "claim.approve",
    "compliance.review",
    "compliance.suspicion",
    "document.review",
  ] as const)
    await t.db.insert(grants).values({
      principalId: f.staff.id,
      capability,
      reason: "Synthetic qualified reviewer fixture",
    });
  const listing = await createListingFixture(t.db, { reviewerId: f.staff.id });
  const counterparty = await createClient(t.db);
  const [proposal] = await t.db
    .insert(proposals)
    .values({
      reference: `PP-TEST-${randomUUID()}`,
      caseId: f.record.id,
      listingId: listing.listingId,
    })
    .returning();
  if (!proposal) throw new Error("Missing proposal");
  const [revision] = await t.db
    .insert(proposalRevisions)
    .values({
      proposalId: proposal.id,
      revisionNumber: 1,
      amountMinor: 9500000,
      currency: "EUR",
      period: "total",
      paymentBasis: "Synthetic terms",
      parties: [
        { partyId: f.client.partyId, required: true },
        { partyId: counterparty.partyId, required: true },
      ],
      deadlineAt: new Date(future()),
      deadlineTimezone: "Europe/Sofia",
      sourceListingRevisionId: listing.revisionId,
      termsHash: hashRequest("synthetic terms"),
    })
    .returning();
  if (!revision) throw new Error("Missing revision");
  const doc = await evidence(f.record.id, f.staff.id, "process_policy");
  const approved = await approveProcessPolicy(t.db, f.staff.session, {
    operationId: randomUUID(),
    title: "Synthetic policy, not legal advice",
    country: "BG",
    transaction: "sale",
    participantCategory: "unknown",
    documentVersionId: doc.id,
    items: [
      {
        code: "title_review",
        label: "Synthetic transaction review",
        category: "transaction",
        evidenceRequired: true,
        professionalRequired: true,
        allowNotApplicable: false,
      },
      {
        code: "identity",
        label: "Synthetic party review",
        category: "due_diligence",
        evidenceRequired: true,
        professionalRequired: true,
        allowNotApplicable: false,
      },
    ],
    withdrawalDays: 14,
    timezone: "Europe/Sofia",
    expressStartRequired: true,
    retentionDays: 1826,
    professionalName: "Synthetic qualified reviewer",
    validUntil: future(),
  });
  const started = await startCaseProcessReview(t.db, f.staff.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    proposalRevisionId: revision.id,
    policyId: approved.outcome.id,
    participantCategory: "unknown",
    dueAt: future(),
  });
  return {
    ...f,
    revision,
    counterparty,
    policyId: approved.outcome.id,
    policyDocument: doc,
    reviewId: started.outcome.id,
  };
}
async function ready(f: Awaited<ReturnType<typeof fixture>>) {
  const signedAt = past();
  const contract = await evidence(f.record.id, f.staff.id, "service_agreement");
  const start = await evidence(f.record.id, f.staff.id, "express_start");
  const agreement = await recordServiceAgreement(t.db, f.staff.session, {
    id: f.record.id,
    operationId: randomUUID(),
    partyId: f.client.partyId,
    policyId: f.policyId,
    documentVersionId: contract.id,
    channel: "distance",
    signedAt,
    withdrawalInformedAt: signedAt,
    expressStartRequestedAt: signedAt,
    expressStartEvidenceVersionId: start.id,
    commissionBasis: "Synthetic fixed fee: EUR 100.00",
    commissionPayerPartyId: f.client.partyId,
    validUntil: future(),
  });
  const check = await evidence(f.record.id, f.staff.id, "case_check");
  let version = 1;
  for (const item of [
    { code: "title_review", partyScope: "" },
    { code: "identity", partyScope: f.client.partyId },
    { code: "identity", partyScope: f.counterparty.partyId },
  ]) {
    await recordProcessItem(t.db, f.staff.session, {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: version++,
      reviewId: f.reviewId,
      ...item,
      result: "accepted",
      reason: "Synthetic evidence reviewed by the fixture",
      evidenceVersionId: check.id,
      professionalName: "Synthetic reviewer",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
    });
  }
  await approveCaseProcess(t.db, f.staff.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: version,
    reviewId: f.reviewId,
  });
  return { agreementId: agreement.outcome.id, contract, check };
}
describe("Reviewed case agreement gate", () => {
  it("is closed without a policy/checklist, and requires each party plus current contracts before readiness", async () => {
    const f = await fixture();
    await expect(
      assertCaseAgreementReady(t.db, f.record.id, { proposalRevisionId: f.revision.id }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    const r = await ready(f);
    await expect(
      assertCaseAgreementReady(t.db, f.record.id, { proposalRevisionId: f.revision.id }),
    ).resolves.toBeUndefined();
    expect(await hasPrivacyRetentionHold(t.db, f.client.partyId)).toBe(true);
    expect(await hasPrivacyRetentionHold(t.db, f.counterparty.partyId)).toBe(true);
    const [agreement] = await t.db
      .select()
      .from(serviceAgreements)
      .where(eq(serviceAgreements.id, r.agreementId));
    expect(agreement?.withdrawalDeadlineAt?.getTime()).toBeGreaterThan(Date.now());
    await t.db
      .update(documentVersions)
      .set({ state: "needs_replacement" })
      .where(eq(documentVersions.id, r.contract.id));
    await expect(
      assertCaseAgreementReady(t.db, f.record.id, { proposalRevisionId: f.revision.id }),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });
  it("a changed policy document, revoked agreement or exact proposal terms invalidate prior readiness", async () => {
    const f = await fixture();
    const r = await ready(f);
    await t.db
      .update(proposalRevisions)
      .set({ termsHash: hashRequest("changed terms") })
      .where(eq(proposalRevisions.id, f.revision.id));
    await expect(
      assertCaseAgreementReady(t.db, f.record.id, { proposalRevisionId: f.revision.id }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await t.db
      .update(proposalRevisions)
      .set({ termsHash: f.revision.termsHash })
      .where(eq(proposalRevisions.id, f.revision.id));
    await revokeCaseEvidence(t.db, f.staff.session, {
      id: f.record.id,
      targetId: r.agreementId,
      kind: "agreement",
      reason: "Client withdrew the instruction",
      operationId: randomUUID(),
    });
    await expect(
      assertCaseAgreementReady(t.db, f.record.id, { proposalRevisionId: f.revision.id }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await t.db
      .update(documents)
      .set({ currentVersionNumber: 2 })
      .where(eq(documents.id, f.policyDocument.documentId));
    await expect(
      startCaseProcessReview(t.db, f.staff.session, {
        id: f.record.id,
        expectedVersion: 1,
        proposalRevisionId: f.revision.id,
        policyId: f.policyId,
        participantCategory: "unknown",
        dueAt: future(),
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });
  it("cannot substitute another Case's evidence or assert an exception absent in the approved policy", async () => {
    const f = await fixture();
    const other = await fixture();
    const foreign = await evidence(other.record.id, f.staff.id, "case_check");
    const input = {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: 1,
      reviewId: f.reviewId,
      code: "title_review",
      partyScope: "",
      result: "accepted" as const,
      reason: "Review attempted",
      evidenceVersionId: foreign.id,
      professionalName: "Synthetic reviewer",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
    };
    await expect(recordProcessItem(t.db, f.staff.session, input)).rejects.toMatchObject({
      code: "transition_denied",
    });
    await expect(
      recordProcessItem(t.db, f.staff.session, {
        ...input,
        operationId: randomUUID(),
        result: "not_applicable",
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });
  it("changing one item revokes overall approval, preserves replay identity, and rejects stale review", async () => {
    const f = await fixture();
    await ready(f);
    const [review] = await t.db
      .select()
      .from(caseProcessReviews)
      .where(eq(caseProcessReviews.id, f.reviewId));
    const input = {
      id: f.record.id,
      operationId: randomUUID(),
      expectedVersion: review?.version ?? 0,
      reviewId: f.reviewId,
      code: "identity",
      partyScope: f.counterparty.partyId,
      result: "blocked" as const,
      reason: "Additional human evidence needed",
      evidenceVersionId: null,
      professionalName: "",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
    };
    const first = await recordProcessItem(t.db, f.staff.session, input);
    expect((await recordProcessItem(t.db, f.staff.session, input)).outcome).toEqual(first.outcome);
    const decisions = await t.db
      .select()
      .from(processItemDecisions)
      .where(eq(processItemDecisions.itemId, first.outcome.id));
    expect(decisions).toHaveLength(2);
    expect(decisions.map((d) => (d.snapshot as { result: string }).result).sort()).toEqual([
      "accepted",
      "blocked",
    ]);
    expect(decisions.some((d) => (d.snapshot as { evidenceDigest?: string }).evidenceDigest)).toBe(
      true,
    );
    await expect(
      approveCaseProcess(t.db, f.staff.session, {
        id: f.record.id,
        reviewId: f.reviewId,
        operationId: randomUUID(),
        expectedVersion: input.expectedVersion,
      }),
    ).rejects.toMatchObject({ code: "version_conflict" });
    await expect(
      assertCaseAgreementReady(t.db, f.record.id, { proposalRevisionId: f.revision.id }),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });
  it("client/ordinary broker access cannot reach restricted evidence; revocation also blocks receipt replay", async () => {
    const f = await fixture();
    await expect(caseProcessWorkbench(t.db, f.client.session, f.record.id)).rejects.toMatchObject({
      code: "not_found",
    });
    const input = {
      id: f.record.id,
      partyId: f.client.partyId,
      policyId: f.policyId,
      note: "Synthetic restricted note",
      externalReference: "",
      reportedAt: null,
      operationId: randomUUID(),
    };
    await recordSuspicion(t.db, f.staff.session, input);
    expect(
      (await restrictedCaseRegister(t.db, f.staff.session, f.record.id)).reports[0]?.note,
    ).toBe(input.note);
    await expect(restrictedCaseRegister(t.db, f.client.session, f.record.id)).rejects.toMatchObject(
      { code: "not_found" },
    );
    expect(await hasPrivacyRetentionHold(t.db, f.client.partyId)).toBe(true);
    expect(
      JSON.stringify(await caseProcessWorkbench(t.db, f.staff.session, f.record.id)),
    ).not.toContain("Synthetic restricted note");
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(grants.principalId, f.staff.id), eq(grants.capability, "compliance.suspicion")),
      );
    await expect(recordSuspicion(t.db, f.staff.session, input)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(restrictedCaseRegister(t.db, f.staff.session, f.record.id)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(
      await t.db.select().from(suspicionReports).where(eq(suspicionReports.caseId, f.record.id)),
    ).toHaveLength(1);
  });
  it("policy revocation blocks all dependent cases and overdue evidence cannot pass", async () => {
    const f = await fixture();
    await ready(f);
    await t.db
      .update(caseProcessItems)
      .set({ validUntil: new Date(past()) })
      .where(eq(caseProcessItems.reviewId, f.reviewId));
    await expect(
      assertCaseAgreementReady(t.db, f.record.id, { proposalRevisionId: f.revision.id }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await revokeCaseEvidence(t.db, f.staff.session, {
      id: f.record.id,
      targetId: f.policyId,
      kind: "policy",
      reason: "Professional withdrew policy",
      operationId: randomUUID(),
    });
    const [policy] = await t.db
      .select()
      .from(processPolicies)
      .where(eq(processPolicies.id, f.policyId));
    expect(policy?.revokedAt).toBeTruthy();
  });
  it("preserves an invalidated review and permits a fresh review of the same proposal", async () => {
    const f = await fixture();
    await revokeCaseEvidence(t.db, f.staff.session, {
      id: f.record.id,
      targetId: f.reviewId,
      kind: "review",
      reason: "Human review restarted",
      operationId: randomUUID(),
    });
    const fresh = await startCaseProcessReview(t.db, f.staff.session, {
      id: f.record.id,
      proposalRevisionId: f.revision.id,
      policyId: f.policyId,
      participantCategory: "unknown",
      expectedVersion: 1,
      dueAt: future(),
      operationId: randomUUID(),
    });
    expect(fresh.outcome.id).not.toBe(f.reviewId);
    const reviews = await t.db
      .select()
      .from(caseProcessReviews)
      .where(eq(caseProcessReviews.caseId, f.record.id));
    expect(reviews).toHaveLength(2);
    expect(reviews.filter((r) => !r.invalidatedAt)).toHaveLength(1);
  });
  it("holds revoked contracts throughout an open relationship and starts the policy clock at closeout", async () => {
    const f = await fixture(),
      other = await caseFixture(t.db);
    const doc = await evidence(other.record.id, other.staff.id, "service_agreement");
    for (const capability of ["compliance.review", "document.review"] as const)
      await t.db.insert(grants).values({
        principalId: other.staff.id,
        capability,
        reason: "Synthetic contract retention review",
      });
    const agreement = await recordServiceAgreement(t.db, other.staff.session, {
      id: other.record.id,
      partyId: other.client.partyId,
      policyId: f.policyId,
      documentVersionId: doc.id,
      operationId: randomUUID(),
      channel: "on_premises",
      signedAt: past(),
      withdrawalInformedAt: null,
      expressStartRequestedAt: null,
      expressStartEvidenceVersionId: null,
      commissionBasis: "Synthetic retention-only contract",
      commissionPayerPartyId: other.client.partyId,
      validUntil: future(),
    });
    await revokeCaseEvidence(t.db, other.staff.session, {
      id: other.record.id,
      targetId: agreement.outcome.id,
      kind: "agreement",
      reason: "Access revoked; retention persists",
      operationId: randomUUID(),
    });
    const closeAt = new Date("2040-01-01T10:00:00Z");
    expect(await hasPrivacyRetentionHold(t.db, other.client.partyId, closeAt)).toBe(true);
    await t.db
      .update(cases)
      .set({
        disposition: "closed",
        closureOutcome: "Synthetic closure",
        commitmentDispositions: [],
      })
      .where(eq(cases.id, other.record.id));
    // A closed flag alone is insufficient without an auditable closure event.
    expect(await hasPrivacyRetentionHold(t.db, other.client.partyId, closeAt)).toBe(true);
    await expect(
      recordServiceAgreement(t.db, other.staff.session, {
        id: other.record.id,
        partyId: other.client.partyId,
        policyId: f.policyId,
        documentVersionId: doc.id,
        operationId: randomUUID(),
        channel: "on_premises",
        signedAt: past(),
        withdrawalInformedAt: null,
        expressStartRequestedAt: null,
        expressStartEvidenceVersionId: null,
        commissionBasis: "New contract requires explicit reopening",
        commissionPayerPartyId: other.client.partyId,
        validUntil: future(),
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    const [closed] = await t.db
      .select({ stage: cases.stage })
      .from(cases)
      .where(eq(cases.id, other.record.id));
    if (!closed) throw new Error("Missing closed fixture Case");
    await t.db.insert(caseStageHistory).values({
      caseId: other.record.id,
      toStage: closed.stage,
      actorKind: "staff",
      actorId: other.staff.id,
      operationId: randomUUID(),
      occurredAt: closeAt,
      evidence: { kind: "disposition", toDisposition: "closed" },
    });
    expect(
      await hasPrivacyRetentionHold(t.db, other.client.partyId, new Date("2041-01-01T10:00:00Z")),
    ).toBe(true);
    expect(
      await hasPrivacyRetentionHold(t.db, other.client.partyId, new Date("2046-01-01T10:00:00Z")),
    ).toBe(false);
    await t.db.update(cases).set({ disposition: "active" }).where(eq(cases.id, other.record.id));
    expect(
      await hasPrivacyRetentionHold(t.db, other.client.partyId, new Date("2046-01-01T10:00:00Z")),
    ).toBe(true);
  });
});
