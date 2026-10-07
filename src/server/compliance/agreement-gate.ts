import "server-only";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  caseParticipants,
  caseProcessItems,
  caseProcessReviews,
  documents,
  documentVersions,
  listings,
  processPolicies,
  properties,
  proposalRevisions,
  proposals,
  serviceAgreements,
} from "@/db/schema";
import { liveParticipation } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";

export const processItemSchema = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,60}$/),
  label: z.string().trim().min(3).max(300),
  category: z.enum(["transaction", "due_diligence"]),
  evidenceRequired: z.boolean(),
  professionalRequired: z.boolean(),
  allowNotApplicable: z.boolean(),
});
export const processItemsSchema = z
  .array(processItemSchema)
  .min(1)
  .max(100)
  .refine((items) => new Set(items.map((i) => i.code)).size === items.length)
  .refine(
    (items) =>
      items.some((i) => i.category === "transaction") &&
      items.some((i) => i.category === "due_diligence"),
  );
export const requiredPartiesSchema = z
  .array(z.object({ partyId: z.uuid(), required: z.literal(true) }))
  .min(1)
  .max(30);
export const gateDenied = () =>
  new AppError("transition_denied", {
    fieldErrors: { agreement: ["current_reviewed_case_evidence_required"] },
  });

/** Current server-sealed, clean-scanned and purpose-reviewed version. Metadata from a client
 * or an older version cannot satisfy a gate. The transaction caller holds these shared locks. */
export async function reviewedEvidence(
  db: Executor,
  versionId: string,
  options: {
    caseId?: string;
    purpose?: string;
    digest?: string;
    now?: Date;
  } = {},
) {
  const now = options.now ?? new Date();
  const [row] = await db
    .select({ document: documents, file: documentVersions })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(eq(documentVersions.id, versionId))
    .for("share");
  if (
    row?.file.state !== "reviewed" ||
    row.file.scan !== "clean" ||
    row.file.reviewType !== "accepted_for_purpose" ||
    !row.file.reviewedById ||
    !row.file.reviewedAt ||
    row.file.reviewedAt > now ||
    row.file.versionNumber !== row.document.currentVersionNumber ||
    !row.file.sealedKey ||
    !row.file.sha256 ||
    !row.file.scannedAt ||
    row.file.scannedAt > now ||
    !row.file.scannerVersion ||
    row.file.scannedSha256 !== row.file.sha256 ||
    row.file.supersededByVersionId ||
    (row.document.expiresAt && row.document.expiresAt <= now) ||
    (options.caseId && row.document.caseId !== options.caseId) ||
    (options.purpose && row.document.purpose !== options.purpose) ||
    (options.digest && row.file.sha256 !== options.digest)
  )
    throw gateDenied();
  return row;
}

export function policyDigest(
  policy: Pick<
    typeof processPolicies.$inferSelect,
    | "title"
    | "country"
    | "transaction"
    | "participantCategory"
    | "documentVersionId"
    | "documentDigest"
    | "items"
    | "withdrawalDays"
    | "timezone"
    | "expressStartRequired"
    | "retentionDays"
    | "professionalName"
  >,
) {
  return hashRequest({
    title: policy.title,
    country: policy.country,
    transaction: policy.transaction,
    participantCategory: policy.participantCategory,
    documentVersionId: policy.documentVersionId,
    documentDigest: policy.documentDigest,
    items: policy.items,
    withdrawalDays: policy.withdrawalDays,
    timezone: policy.timezone,
    expressStartRequired: policy.expressStartRequired,
    retentionDays: policy.retentionDays,
    professionalName: policy.professionalName,
  });
}

export async function activePolicy(db: Executor, id: string, now = new Date()) {
  const [policy] = await db
    .select()
    .from(processPolicies)
    .where(eq(processPolicies.id, id))
    .for("share");
  if (
    !policy ||
    policy.revokedAt ||
    policy.validUntil <= now ||
    policy.createdAt > now ||
    policy.policyHash !== policyDigest(policy) ||
    !processItemsSchema.safeParse(policy.items).success
  )
    throw gateDenied();
  await reviewedEvidence(db, policy.documentVersionId, {
    purpose: "process_policy",
    digest: policy.documentDigest,
    now,
  });
  return policy;
}

export async function proposalContext(db: Executor, caseId: string, revisionId: string) {
  const [row] = await db
    .select({
      revision: proposalRevisions,
      proposal: proposals,
      listing: listings,
      property: properties,
    })
    .from(proposalRevisions)
    .innerJoin(proposals, eq(proposals.id, proposalRevisions.proposalId))
    .innerJoin(listings, eq(listings.id, proposals.listingId))
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .where(and(eq(proposalRevisions.id, revisionId), eq(proposals.caseId, caseId)))
    .for("share");
  if (!row || row.revision.revisionNumber !== row.proposal.activeRevisionNumber) throw gateDenied();
  const parsed = requiredPartiesSchema.safeParse(row.revision.parties);
  if (!parsed.success) throw gateDenied();
  const partyIds = parsed.data.map((p) => p.partyId).sort();
  if (new Set(partyIds).size !== partyIds.length) throw gateDenied();
  return { ...row, partyIds };
}

/** Check the exact reviewed checklist independently of the final approval, for human review.
 * Missing or expired evidence produces one neutral denial without disclosing restricted checks. */
export async function checkReviewEvidence(
  db: Executor,
  review: typeof caseProcessReviews.$inferSelect,
  now = new Date(),
) {
  const policy = await activePolicy(db, review.policyId, now);
  const context = await proposalContext(db, review.caseId, review.proposalRevisionId);
  if (
    review.invalidatedAt ||
    review.policyHash !== policy.policyHash ||
    review.termsHash !== context.revision.termsHash ||
    hashRequest([...review.partyIds].sort()) !== hashRequest(context.partyIds) ||
    context.property.country !== policy.country ||
    (context.listing.purpose === "sale" ? "sale" : "rent") !== policy.transaction
  )
    throw gateDenied();
  const rows = await db
    .select()
    .from(caseProcessItems)
    .where(eq(caseProcessItems.reviewId, review.id))
    .for("share");
  for (const item of policy.items) {
    for (const partyScope of item.category === "due_diligence" ? context.partyIds : [""]) {
      const row = rows.find((r) => r.code === item.code && r.partyScope === partyScope);
      if (
        !row?.reviewedById ||
        !row.reviewedAt ||
        row.reviewedAt > now ||
        !row.validUntil ||
        row.validUntil <= now ||
        !row.reason?.trim() ||
        (row.result !== "accepted" &&
          !(row.result === "not_applicable" && item.allowNotApplicable)) ||
        (item.professionalRequired && !row.professionalName?.trim())
      )
        throw gateDenied();
      if (item.evidenceRequired && (!row.evidenceVersionId || !row.evidenceDigest))
        throw gateDenied();
      if (row.evidenceVersionId)
        await reviewedEvidence(db, row.evidenceVersionId, {
          caseId: review.caseId,
          purpose: "case_check",
          digest: row.evidenceDigest ?? "invalid",
          now,
        });
    }
  }
  // Service agreements cover agency clients in this Case. Due-diligence checks above cover
  // every required proposal party, including a counterparty who is not an agency client.
  const agencyParties = await db
    .select()
    .from(caseParticipants)
    .where(
      and(
        eq(caseParticipants.caseId, review.caseId),
        liveParticipation(now),
        inArray(caseParticipants.partyId, context.partyIds),
        inArray(caseParticipants.role, ["buyer", "co_buyer", "tenant", "seller", "landlord"]),
      ),
    )
    .for("share");
  if (!agencyParties.length) throw gateDenied();
  for (const partyId of new Set(agencyParties.map((p) => p.partyId))) {
    const agreements = await db
      .select()
      .from(serviceAgreements)
      .where(
        and(
          eq(serviceAgreements.caseId, review.caseId),
          eq(serviceAgreements.partyId, partyId),
          eq(serviceAgreements.policyId, policy.id),
          isNull(serviceAgreements.revokedAt),
          gt(serviceAgreements.validUntil, now),
        ),
      )
      .for("share");
    let valid = false;
    for (const agreement of agreements) {
      try {
        if (
          agreement.signedAt > now ||
          (policy.withdrawalDays > 0 &&
            agreement.channel !== "on_premises" &&
            (!agreement.withdrawalInformedAt || !agreement.withdrawalDeadlineAt))
        )
          continue;
        await reviewedEvidence(db, agreement.documentVersionId, {
          caseId: review.caseId,
          purpose: "service_agreement",
          digest: agreement.documentDigest,
          now,
        });
        if (
          policy.expressStartRequired &&
          (!agreement.expressStartRequestedAt || agreement.expressStartRequestedAt > now)
        )
          continue;
        if (
          agreement.withdrawalDeadlineAt &&
          agreement.withdrawalDeadlineAt > now &&
          !agreement.expressStartRequestedAt
        )
          continue;
        if (agreement.expressStartRequestedAt) {
          if (!agreement.expressStartEvidenceVersionId || !agreement.expressStartEvidenceDigest)
            continue;
          await reviewedEvidence(db, agreement.expressStartEvidenceVersionId, {
            caseId: review.caseId,
            purpose: "express_start",
            digest: agreement.expressStartEvidenceDigest,
            now,
          });
        }
        valid = true;
        break;
      } catch (error) {
        if (!(error instanceof AppError && error.code === "transition_denied")) throw error;
      }
    }
    if (!valid) throw gateDenied();
  }
  return { policy, context };
}

/** No policy, signed agreement or professional review is invented. Call inside the exact
 * proposal decision transaction. This records readiness for a next step, never sale completion. */
export async function assertCaseAgreementReady(
  db: Executor,
  caseId: string,
  options: { proposalRevisionId?: string; now?: Date } = {},
) {
  if (!options.proposalRevisionId) throw gateDenied();
  const now = options.now ?? new Date();
  const [review] = await db
    .select()
    .from(caseProcessReviews)
    .where(
      and(
        eq(caseProcessReviews.caseId, caseId),
        eq(caseProcessReviews.proposalRevisionId, options.proposalRevisionId),
        isNull(caseProcessReviews.invalidatedAt),
      ),
    )
    .for("share");
  if (!review?.approvedAt || !review.approvedById || review.approvedAt > now) throw gateDenied();
  await checkReviewEvidence(db, review, now);
}
