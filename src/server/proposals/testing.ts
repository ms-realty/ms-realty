import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  caseParticipants,
  cases,
  documents,
  documentVersions,
  grants,
  principals,
  proposalRevisions,
} from "@/db/schema";
import { firstPartyIssuers } from "@/domain/records";
import { createSession } from "../auth/sessions";
import { addInterest, respondToInterest } from "../cases/commands";
import { caseFixture, reviewedCandidateFixture } from "../cases/testing";
import {
  approveCaseProcess,
  approveProcessPolicy,
  recordProcessItem,
  recordServiceAgreement,
  startCaseProcessReview,
} from "../compliance/commands";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { createListingFixture, publishForTest } from "../publication/testing";
import { nextReference } from "../references";
import { createProposal, transitionProposal } from "./service";
import { deadlineInput, partySnapshotSchema } from "./terms";

/** Synthetic reviewed file metadata. This is a gate fixture, never provider/scan evidence. */
async function evidence(db: Executor, caseId: string, reviewerId: string, purpose: string) {
  const [doc] = await db
    .insert(documents)
    .values({
      reference: await nextReference(db, "document"),
      caseId,
      purpose,
      classification: "contract",
      currentVersionNumber: 1,
    })
    .returning();
  if (!doc) throw new Error("Missing synthetic document");
  const digest = hashRequest({ synthetic: true, purpose, caseId, id: randomUUID() });
  const [file] = await db
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
  if (!file) throw new Error("Missing synthetic file");
  return file;
}

export async function proposalCounterparty(
  db: Executor,
  f: Awaited<ReturnType<typeof proposalFixture>>,
) {
  const party = partySnapshotSchema
    .array()
    .parse(f.revision.parties)
    .find((p) => p.role === "seller" || p.role === "landlord");
  if (!party) throw new Error("Missing required seller party");
  const [principal] = await db
    .insert(principals)
    .values({
      partyId: party.partyId,
      kind: "client",
      issuer: firstPartyIssuers.client,
      subject: randomUUID(),
      email: `${randomUUID()}@example.test`,
      displayName: "Synthetic seller",
    })
    .returning();
  if (!principal) throw new Error("Missing synthetic seller account");
  await db
    .insert(caseParticipants)
    .values({ caseId: f.record.id, partyId: party.partyId, role: party.role });
  return { ...principal, ...(await createSession(db, { kind: "client", id: principal.id })) };
}

/** Exercise the real review commands; an exact-revision gate is never stubbed open. */
export async function prepareProposalAgreement(
  db: Executor,
  f: Awaited<ReturnType<typeof proposalFixture>>,
) {
  for (const capability of ["claim.approve", "compliance.review", "document.review"] as const)
    await db.insert(grants).values({
      principalId: f.staff.id,
      capability,
      reason: "Synthetic qualified reviewer fixture",
    });
  const future = () => new Date(Date.now() + 30 * 86400000).toISOString();
  const policyFile = await evidence(db, f.record.id, f.staff.id, "process_policy");
  const policy = await approveProcessPolicy(db, f.staff.session, {
    operationId: randomUUID(),
    title: "Synthetic policy, not legal advice",
    country: "BG",
    transaction: "sale",
    participantCategory: "unknown",
    documentVersionId: policyFile.id,
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
  const [record] = await db.select().from(cases).where(eq(cases.id, f.record.id));
  if (!record) throw new Error("Missing fixture case");
  const started = await startCaseProcessReview(db, f.staff.session, {
    id: record.id,
    operationId: randomUUID(),
    expectedVersion: record.version,
    proposalRevisionId: f.revision.id,
    policyId: policy.outcome.id,
    participantCategory: "unknown",
    dueAt: future(),
  });
  const required = partySnapshotSchema.array().parse(f.revision.parties);
  for (const party of required) {
    const [participant] = await db
      .select()
      .from(caseParticipants)
      .where(
        and(eq(caseParticipants.caseId, record.id), eq(caseParticipants.partyId, party.partyId)),
      );
    if (!participant) continue;
    const contract = await evidence(db, record.id, f.staff.id, "service_agreement"),
      start = await evidence(db, record.id, f.staff.id, "express_start"),
      signedAt = new Date(Date.now() - 60000).toISOString();
    await recordServiceAgreement(db, f.staff.session, {
      id: record.id,
      operationId: randomUUID(),
      partyId: party.partyId,
      policyId: policy.outcome.id,
      documentVersionId: contract.id,
      channel: "distance",
      signedAt,
      withdrawalInformedAt: signedAt,
      expressStartRequestedAt: signedAt,
      expressStartEvidenceVersionId: start.id,
      commissionBasis: "Synthetic fixed fee: EUR 100.00",
      commissionPayerPartyId: party.partyId,
      validUntil: future(),
    });
  }
  const check = await evidence(db, record.id, f.staff.id, "case_check");
  let version = 1;
  for (const item of [
    { code: "title_review", partyScope: "" },
    ...required.map((p) => ({ code: "identity", partyScope: p.partyId })),
  ]) {
    await recordProcessItem(db, f.staff.session, {
      id: record.id,
      operationId: randomUUID(),
      expectedVersion: version++,
      reviewId: started.outcome.id,
      ...item,
      result: "accepted",
      reason: "Synthetic reviewed evidence",
      evidenceVersionId: check.id,
      professionalName: "Synthetic reviewer",
      validUntil: new Date(Date.now() + 86400000).toISOString(),
    });
  }
  await approveCaseProcess(db, f.staff.session, {
    id: record.id,
    operationId: randomUUID(),
    expectedVersion: version,
    reviewId: started.outcome.id,
  });
}

export async function proposalFixture(db: Executor) {
  const f = await caseFixture(db);
  const listing = await createListingFixture(db, { reviewerId: f.staff.id });
  await publishForTest(db, f.staff.actor, listing);
  const matchReview = await reviewedCandidateFixture(db, f, listing.reference);
  const interest = await addInterest(db, f.staff.session, {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    reference: listing.reference,
    explanation: "Synthetic reviewed proposal option",
    matchReview,
  });
  await respondToInterest(db, f.client.session, {
    id: interest.outcome.interestId,
    operationId: randomUUID(),
    expectedVersion: 1,
    state: "shortlisted",
    reason: "Synthetic explicit shortlist",
  });
  const terms = {
    amountMinor: 12000000,
    currency: "EUR" as const,
    period: "total" as const,
    paymentBasis: "Subject to independent professional review",
    conditions: ["Professional due diligence remains required"],
    inclusions: ["As individually recorded in the reviewed inventory"],
    deadline: deadlineInput(new Date(Date.now() + 7 * 86400000)),
  };
  const input = {
    id: f.record.id,
    operationId: randomUUID(),
    expectedVersion: 2,
    interestId: interest.outcome.interestId,
    clientPartyId: f.client.partyId,
    ...terms,
  };
  const created = await createProposal(db, f.staff.session, input);
  const [revision] = await db
    .select()
    .from(proposalRevisions)
    .where(eq(proposalRevisions.proposalId, created.outcome.id));
  if (!revision) throw new Error("Missing proposal fixture revision");
  return {
    ...f,
    listing,
    interestId: interest.outcome.interestId,
    proposal: created.outcome,
    revision,
    terms,
    input,
  };
}
export async function publishProposalForTest(
  db: Executor,
  f: Awaited<ReturnType<typeof proposalFixture>>,
) {
  await transitionProposal(db, f.staff.session, {
    id: f.proposal.id,
    revisionId: f.revision.id,
    operationId: randomUUID(),
    expectedVersion: 1,
    action: "review",
    reviewed: true,
    reason: "Synthetic exact-terms review",
  });
  return transitionProposal(db, f.staff.session, {
    id: f.proposal.id,
    revisionId: f.revision.id,
    operationId: randomUUID(),
    expectedVersion: 2,
    action: "submit",
    reviewed: true,
    reason: "Synthetic explicit in-app audience review",
  });
}
