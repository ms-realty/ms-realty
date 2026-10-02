// Synthetic fixtures only. These approvals have no legal or launch significance.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { caseParticipants, documents, documentVersions, grants } from "@/db/schema";
import { caseFixture } from "../cases/testing";
import { approveProcessPolicy } from "../compliance/commands";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { nextReference } from "../references";
import { createDocumentRequest } from "./requests";

export async function documentRequestFixture(db: Executor) {
  const f = await caseFixture(db);
  for (const capability of [
    "access.grant",
    "document.review",
    "claim.approve",
    "compliance.review",
  ] as const)
    await db
      .insert(grants)
      .values({ principalId: f.staff.id, capability, reason: "Synthetic reviewer fixture" });
  const [document] = await db
    .insert(documents)
    .values({
      reference: await nextReference(db, "document"),
      caseId: f.record.id,
      purpose: "process_policy",
      classification: "contract",
      currentVersionNumber: 1,
    })
    .returning();
  if (!document) throw new Error("Missing fixture document");
  const digest = hashRequest({ synthetic: true, id: document.id });
  const [file] = await db
    .insert(documentVersions)
    .values({
      documentId: document.id,
      versionNumber: 1,
      state: "reviewed",
      sealedKey: `synthetic/${randomUUID()}`,
      sha256: digest,
      scannedSha256: digest,
      fileName: "synthetic-policy.pdf",
      contentType: "application/pdf",
      byteSize: 10,
      uploadedByKind: "staff",
      uploadedById: f.staff.id,
      scan: "clean",
      scannedAt: new Date(),
      scannerVersion: "synthetic-policy-only",
      reviewType: "accepted_for_purpose",
      reviewedById: f.staff.id,
      reviewedAt: new Date(),
    })
    .returning();
  if (!file) throw new Error("Missing fixture policy");
  const policy = await approveProcessPolicy(db, f.staff.session, {
    operationId: randomUUID(),
    title: "Synthetic document process - never live evidence",
    country: "BG",
    transaction: "sale",
    participantCategory: "unknown",
    documentVersionId: file.id,
    items: [
      {
        code: "purpose",
        label: "Synthetic purpose review",
        category: "transaction",
        evidenceRequired: false,
        professionalRequired: false,
        allowNotApplicable: true,
      },
      {
        code: "identity",
        label: "Synthetic identity review",
        category: "due_diligence",
        evidenceRequired: false,
        professionalRequired: false,
        allowNotApplicable: true,
      },
    ],
    withdrawalDays: 14,
    timezone: "Europe/Sofia",
    expressStartRequired: true,
    retentionDays: 365,
    professionalName: "Synthetic reviewer",
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  const [participant] = await db
    .select()
    .from(caseParticipants)
    .where(eq(caseParticipants.caseId, f.record.id));
  if (!participant) throw new Error("Missing fixture participant");
  const input = {
    operationId: randomUUID(),
    expectedVersion: 1,
    caseId: f.record.id,
    recipientParticipantId: participant.id,
    policyId: policy.outcome.id,
    title: "Synthetic property information",
    purpose: "Review the supplied property information",
    instructions: "Upload one readable document",
    alternatives: "Ask the broker to record the information in person",
    classification: "property" as const,
    allowedContentTypes: ["application/pdf" as const],
    maxBytes: 1024 * 1024,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  const request = await createDocumentRequest(db, f.staff.session, input);
  return { ...f, policyId: policy.outcome.id, participant, input, request: request.outcome };
}
