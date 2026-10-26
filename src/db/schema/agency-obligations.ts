// B10 / OPS09 / OPS05 / STA09. Private supplied terms and purpose-specific review consent.
// These records confer no commission settlement, media license or publication authority.
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, instant, mutable } from "./columns";
import { documentVersions } from "./coordination";
import { principals } from "./identity";
import { parties } from "./parties";
import { contentPageVersions } from "./publication";
import { operations } from "./records";
import { cases } from "./work";

export const agencyPartnerTerms = pgTable(
  "agency_partner_terms",
  {
    ...mutable(),
    caseId: uuid("case_id").references(() => cases.id),
    counterpartyPartyId: uuid("counterparty_party_id")
      .notNull()
      .references(() => parties.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => principals.id),
    relationship: text("relationship").notNull(),
    purpose: text("purpose").notNull(),
    sourceReference: text("source_reference").notNull(),
    sourceVersion: text("source_version").notNull(),
    termsText: text("terms_text").notNull(),
    documentVersionId: uuid("document_version_id").references(() => documentVersions.id),
    documentDigest: text("document_digest"),
    acceptedReference: text("accepted_reference"),
    acceptedAt: instant("accepted_at"),
    validUntil: instant("valid_until"),
    unknowns: text("unknowns").notNull().default(""),
    termsHash: text("terms_hash").notNull(),
    state: text("state").notNull().default("draft"),
    approvedHash: text("approved_hash"),
    professionalName: text("professional_name"),
    approvedById: uuid("approved_by_id").references(() => principals.id),
    approvedAt: instant("approved_at"),
    revokedReason: text("revoked_reason"),
  },
  (t) => [
    check("agency_partner_relationship", sql`${t.relationship} in ('partner','referral')`),
    check("agency_partner_state", sql`${t.state} in ('draft','accepted','revoked')`),
    check("agency_partner_hash", sql`${t.termsHash} ~ '^[a-f0-9]{64}$'`),
    check(
      "agency_partner_document",
      sql`(${t.documentVersionId} is null) = (${t.documentDigest} is null)`,
    ),
    check(
      "agency_partner_approval",
      sql`${t.state} <> 'accepted' or (${t.approvedHash} = ${t.termsHash} and ${t.approvedById} is not null and ${t.approvedAt} is not null and ${t.professionalName} is not null and ${t.acceptedReference} is not null and ${t.acceptedAt} is not null and ${t.validUntil} is not null and ${t.unknowns} = '')`,
    ),
    index("agency_partner_party_idx").on(t.counterpartyPartyId),
    index("agency_partner_case_idx").on(t.caseId),
  ],
);

export const agencyCaseReviews = pgTable(
  "agency_case_reviews",
  {
    ...mutable(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    authorPartyId: uuid("author_party_id")
      .notNull()
      .references(() => parties.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => principals.id),
    contentPageVersionId: uuid("content_page_version_id")
      .notNull()
      .references(() => contentPageVersions.id),
    contentHash: text("content_hash").notNull(),
    displayChoice: text("display_choice").notNull(),
    publicName: text("public_name").notNull(),
    reviewText: text("review_text").notNull(),
    verificationStatement: text("verification_statement").notNull(),
    bindingHash: text("binding_hash").notNull(),
    consentState: text("consent_state").notNull().default("unknown"),
    consentHash: text("consent_hash"),
    consentSource: text("consent_source"),
    consentDocumentVersionId: uuid("consent_document_version_id").references(
      () => documentVersions.id,
    ),
    consentDocumentDigest: text("consent_document_digest"),
    consentPolicyVersionId: uuid("consent_policy_version_id").references(
      () => contentPageVersions.id,
    ),
    consentPolicyHash: text("consent_policy_hash"),
    consentById: uuid("consent_by_id").references(() => principals.id),
    consentAt: instant("consent_at"),
    consentReference: text("consent_reference"),
    verifiedHash: text("verified_hash"),
    verifiedById: uuid("verified_by_id").references(() => principals.id),
    verifiedAt: instant("verified_at"),
    verificationNote: text("verification_note"),
  },
  (t) => [
    check("agency_review_choice", sql`${t.displayChoice} in ('anonymous','name')`),
    check(
      "agency_review_consent",
      sql`${t.consentState} in ('unknown','granted','refused','withdrawn')`,
    ),
    check(
      "agency_review_consent_source",
      sql`${t.consentSource} is null or ${t.consentSource} in ('client','document')`,
    ),
    check(
      "agency_review_hash",
      sql`${t.bindingHash} ~ '^[a-f0-9]{64}$' and ${t.contentHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "agency_review_granted",
      sql`${t.consentState} <> 'granted' or (${t.consentHash} = ${t.bindingHash} and ${t.consentById} is not null and ${t.consentAt} is not null and ((${t.consentSource} = 'client' and ${t.consentPolicyVersionId} is not null and ${t.consentPolicyHash} is not null) or (${t.consentSource} = 'document' and ${t.consentDocumentVersionId} is not null and ${t.consentDocumentDigest} is not null and ${t.consentReference} is not null)))`,
    ),
    check(
      "agency_review_verified",
      sql`${t.verifiedHash} is null or (${t.verifiedHash} = ${t.bindingHash} and ${t.verifiedById} is not null and ${t.verifiedAt} is not null and ${t.verificationNote} is not null)`,
    ),
    index("agency_review_case_idx").on(t.caseId),
    index("agency_review_author_idx").on(t.authorPartyId),
    index("agency_review_content_idx").on(t.contentPageVersionId),
  ],
);

/** Exact past promises, wording, source and decisions survive replacement or withdrawal. */
export const agencyEvidenceHistory = pgTable(
  "agency_evidence_history",
  {
    id: id(),
    recordType: text("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    createdAt: createdAt(),
  },
  (t) => [
    check("agency_history_type", sql`${t.recordType} in ('partner_terms','case_review')`),
    index("agency_history_record_idx").on(t.recordType, t.recordId, t.createdAt),
  ],
);
