// Synthetic retained sources only. No actual partner, author assent or legal approval.
import { randomUUID } from "node:crypto";
import {
  agencyCaseReviews,
  agencyEvidenceHistory,
  agencyPartnerTerms,
  contentPages,
  contentPageVersions,
  operations,
} from "@/db/schema";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";

export async function syntheticAgencyHistory(
  db: Executor,
  actorId: string,
  kind: "partner_terms" | "case_review",
  recordId: string,
  snapshot: unknown,
) {
  const [operation] = await db
    .insert(operations)
    .values({
      actorKind: "staff",
      actorId,
      operationType: "synthetic.agency-history",
      idempotencyKey: randomUUID(),
      requestHash: hashRequest({ synthetic: randomUUID() }),
      status: "succeeded",
    })
    .returning();
  if (!operation) throw new Error("Missing synthetic history operation");
  const [event] = await db
    .insert(agencyEvidenceHistory)
    .values({
      recordType: kind,
      recordId,
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      actorKind: "staff",
      actorId,
      action: "synthetic_retained_decision",
      operationId: operation.id,
    })
    .returning();
  if (!event) throw new Error("Missing synthetic agency history");
  return event;
}
export async function syntheticAgencySources(
  db: Executor,
  input: {
    actorId: string;
    partyId: string;
    clientId: string;
    caseId: string;
    standing?: boolean;
  },
) {
  const [page] = await db
    .insert(contentPages)
    .values({ kind: "review", slug: `synthetic-review-${randomUUID()}` })
    .returning();
  const [policyPage] = await db
    .insert(contentPages)
    .values({ kind: "help", slug: `synthetic-consent-${randomUUID()}` })
    .returning();
  if (!page || !policyPage) throw new Error("Missing synthetic CMS sources");
  const body = {
    title: "SYNTHETIC_PUBLIC_NAME",
    paragraphs: ["SYNTHETIC_REVIEW_WORDING", "SYNTHETIC_PRIVATE_VERIFICATION_STATEMENT"],
  };
  const [wording] = await db
    .insert(contentPageVersions)
    .values({ contentPageId: page.id, versionNumber: 1, body, contentHash: hashRequest(body) })
    .returning();
  const policyBody = {
    title: "Synthetic consent purpose",
    paragraphs: [
      "Synthetic exact wording and display choice; refusal and withdrawal remain separate.",
    ],
  };
  const [policy] = await db
    .insert(contentPageVersions)
    .values({
      contentPageId: policyPage.id,
      versionNumber: 1,
      body: policyBody,
      contentHash: hashRequest(policyBody),
    })
    .returning();
  if (!wording || !policy) throw new Error("Missing synthetic immutable wording");
  const [terms] = await db
    .insert(agencyPartnerTerms)
    .values({
      caseId: input.standing ? null : input.caseId,
      counterpartyPartyId: input.partyId,
      ownerId: input.actorId,
      relationship: "referral",
      purpose: "Synthetic referral only",
      sourceReference: "SYNTHETIC_TERMS_REFERENCE",
      sourceVersion: "synthetic-1",
      termsText: "SYNTHETIC_PRIVATE_PARTNER_TERMS",
      termsHash: "a".repeat(64),
      unknowns: "Synthetic actual policy still unknown",
    })
    .returning();
  const bindingHash = "b".repeat(64);
  const [review] = await db
    .insert(agencyCaseReviews)
    .values({
      caseId: input.caseId,
      authorPartyId: input.partyId,
      ownerId: input.actorId,
      contentPageVersionId: wording.id,
      contentHash: wording.contentHash,
      displayChoice: "anonymous",
      publicName: "SYNTHETIC_PUBLIC_NAME",
      reviewText: "SYNTHETIC_REVIEW_WORDING",
      verificationStatement: "SYNTHETIC_PRIVATE_VERIFICATION_STATEMENT",
      bindingHash,
      consentState: "granted",
      consentHash: bindingHash,
      consentSource: "client",
      consentPolicyVersionId: policy.id,
      consentPolicyHash: policy.contentHash,
      consentById: input.clientId,
      consentAt: new Date(),
    })
    .returning();
  if (!terms || !review) throw new Error("Missing synthetic agency sources");
  const termsHistory = await syntheticAgencyHistory(
    db,
    input.actorId,
    "partner_terms",
    terms.id,
    terms,
  );
  const reviewHistory = await syntheticAgencyHistory(db, input.actorId, "case_review", review.id, {
    ...review,
    consentState: "refused",
    consentHash: null,
    decisionNote: undefined,
  });
  return { terms, review, termsHistory, reviewHistory, wording, policy };
}
