// Human-reviewed operating policies and case evidence. No default law, approved template or
// automatic legal conclusion is seeded. Restricted records never enter the AI source set.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, instant, mutable } from "./columns";
import { documentVersions, proposalRevisions } from "./coordination";
import { principals } from "./identity";
import { parties } from "./parties";
import { operations } from "./records";
import { cases } from "./work";

export interface ProcessItem {
  code: string;
  label: string;
  category: "transaction" | "due_diligence";
  evidenceRequired: boolean;
  professionalRequired: boolean;
  allowNotApplicable: boolean;
}

export const processPolicies = pgTable(
  "process_policies",
  {
    id: id(),
    title: text("title").notNull(),
    country: text("country").notNull(),
    transaction: text("transaction").notNull(),
    participantCategory: text("participant_category").notNull(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id),
    documentDigest: text("document_digest").notNull(),
    items: jsonb("items").$type<ProcessItem[]>().notNull(),
    withdrawalDays: integer("withdrawal_days").notNull(),
    timezone: text("timezone").notNull(),
    expressStartRequired: boolean("express_start_required").notNull(),
    retentionDays: integer("retention_days").notNull(),
    professionalName: text("professional_name").notNull(),
    approvedById: uuid("approved_by_id")
      .notNull()
      .references(() => principals.id),
    policyHash: text("policy_hash").notNull(),
    validUntil: instant("valid_until").notNull(),
    revokedAt: instant("revoked_at"),
    revocationReason: text("revocation_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "process_policy_scope",
      sql`${t.country} in ('BG','GR') and ${t.transaction} in ('sale','rent') and ${t.participantCategory} in ('eu','non_eu','mixed','unknown')`,
    ),
    check(
      "process_policy_periods",
      sql`${t.withdrawalDays} between 0 and 365 and ${t.retentionDays} between 1 and 36500`,
    ),
    check(
      "process_policy_revocation",
      sql`${t.revokedAt} is null or ${t.revocationReason} is not null`,
    ),
  ],
);

export const caseProcessReviews = pgTable(
  "case_process_reviews",
  {
    ...mutable(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    proposalRevisionId: uuid("proposal_revision_id")
      .notNull()
      .references(() => proposalRevisions.id),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => processPolicies.id),
    policyHash: text("policy_hash").notNull(),
    termsHash: text("terms_hash").notNull(),
    partyIds: jsonb("party_ids").$type<string[]>().notNull(),
    responsibleId: uuid("responsible_id")
      .notNull()
      .references(() => principals.id),
    dueAt: instant("due_at").notNull(),
    approvedById: uuid("approved_by_id").references(() => principals.id),
    approvedAt: instant("approved_at"),
    invalidatedAt: instant("invalidated_at"),
    invalidationReason: text("invalidation_reason"),
  },
  (t) => [
    uniqueIndex("case_process_revision_idx")
      .on(t.proposalRevisionId)
      .where(sql`${t.invalidatedAt} is null`),
    index("case_process_case_idx").on(t.caseId),
  ],
);

/** One current answer for a required item (and each party for due diligence). Revisions live
 * in immutable audit evidence; changing any answer invalidates the overall review. */
export const caseProcessItems = pgTable(
  "case_process_items",
  {
    ...mutable(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => caseProcessReviews.id),
    code: text("code").notNull(),
    // Empty scope is the transaction itself; a UUID string identifies an exact party.
    partyScope: text("party_scope").notNull().default(""),
    result: text("result").notNull().default("pending"),
    reason: text("reason"),
    evidenceVersionId: uuid("evidence_version_id").references(() => documentVersions.id),
    evidenceDigest: text("evidence_digest"),
    professionalName: text("professional_name"),
    reviewedById: uuid("reviewed_by_id").references(() => principals.id),
    reviewedAt: instant("reviewed_at"),
    validUntil: instant("valid_until"),
    retainUntil: instant("retain_until").notNull(),
  },
  (t) => [
    uniqueIndex("case_process_item_scope_idx").on(t.reviewId, t.code, t.partyScope),
    check(
      "case_process_item_result",
      sql`${t.result} in ('pending','accepted','not_applicable','blocked')`,
    ),
    check(
      "case_process_item_human",
      sql`${t.result} = 'pending' or (${t.reviewedById} is not null and ${t.reviewedAt} is not null and ${t.reason} is not null)`,
    ),
  ],
);

/** Restricted immutable history. General audit contains pointers, never these answers. */
export const processItemDecisions = pgTable(
  "process_item_decisions",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => caseProcessItems.id),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    decidedById: uuid("decided_by_id")
      .notNull()
      .references(() => principals.id),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("process_item_decision_version_idx").on(t.itemId, t.version)],
);

export const serviceAgreements = pgTable(
  "service_agreements",
  {
    id: id(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => processPolicies.id),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id),
    documentDigest: text("document_digest").notNull(),
    channel: text("channel").notNull(),
    signedAt: instant("signed_at").notNull(),
    withdrawalInformedAt: instant("withdrawal_informed_at"),
    withdrawalDeadlineAt: instant("withdrawal_deadline_at"),
    expressStartRequestedAt: instant("express_start_requested_at"),
    expressStartEvidenceVersionId: uuid("express_start_evidence_version_id").references(
      () => documentVersions.id,
    ),
    expressStartEvidenceDigest: text("express_start_evidence_digest"),
    commissionBasis: text("commission_basis").notNull(),
    commissionPayerPartyId: uuid("commission_payer_party_id")
      .notNull()
      .references(() => parties.id),
    reviewedById: uuid("reviewed_by_id")
      .notNull()
      .references(() => principals.id),
    validUntil: instant("valid_until").notNull(),
    revokedAt: instant("revoked_at"),
    revocationReason: text("revocation_reason"),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("service_agreement_case_party_idx").on(t.caseId, t.partyId),
    check(
      "service_agreement_channel",
      sql`${t.channel} in ('on_premises','distance','off_premises')`,
    ),
    check(
      "service_agreement_start_evidence",
      sql`${t.expressStartRequestedAt} is null or (${t.expressStartEvidenceVersionId} is not null and ${t.expressStartEvidenceDigest} is not null)`,
    ),
  ],
);

/** Separate authorization boundary. General case activity/audit never contains these notes. */
export const suspicionReports = pgTable("suspicion_reports", {
  id: id(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id),
  policyId: uuid("policy_id")
    .notNull()
    .references(() => processPolicies.id),
  note: text("note").notNull(),
  externalReference: text("external_reference"),
  reportedAt: instant("reported_at"),
  recordedById: uuid("recorded_by_id")
    .notNull()
    .references(() => principals.id),
  retainUntil: instant("retain_until").notNull(),
  operationId: uuid("operation_id")
    .notNull()
    .references(() => operations.id),
  createdAt: createdAt(),
});

/** Accounting coordination only: no invoice issuance, tax decision or money movement. */
export const commissionRecords = pgTable(
  "commission_records",
  {
    id: id(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => serviceAgreements.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("EUR"),
    invoiceReference: text("invoice_reference").notNull(),
    recordedById: uuid("recorded_by_id")
      .notNull()
      .references(() => principals.id),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    createdAt: createdAt(),
  },
  (t) => [check("commission_amount", sql`${t.amountMinor} >= 0 and ${t.currency} = 'EUR'`)],
);
