// Adjacent services: service agreements, management service requests, owner statements,
// short-stay quotes and reservations (spec F26–F28). Flagged off until operated.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { staffAccounts } from "./accounts";
import { approvals } from "./approvals";
import { createdAt, id, instant, mutable, reference } from "./columns";
import { documents } from "./coordination";
import {
  currencyEnum,
  paymentStateEnum,
  reservationStateEnum,
  serviceAgreementStateEnum,
  serviceRequestStateEnum,
  serviceRequestUrgencyEnum,
  statementLineStateEnum,
} from "./enums";
import { organizations } from "./parties";
import { listings, properties } from "./properties";
import { cases } from "./work";

/** Agreed scope and authority; a request under it never implies spending authority. */
export const serviceAgreements = pgTable("service_agreements", {
  ...mutable(),
  reference: reference(),
  caseId: uuid("case_id").references(() => cases.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id),
  state: serviceAgreementStateEnum("state").notNull().default("draft"),
  /** Contracted services, e.g. marketing, management, key holding. */
  scope: jsonb("scope").notNull(),
  /** Who may instruct, spending limits and entry authority. */
  authority: jsonb("authority").notNull().default({}),
  /** Identity/address disclosure, media use and contact handling (F11). */
  publicationPermissions: jsonb("publication_permissions").notNull().default({}),
  documentId: uuid("document_id").references(() => documents.id),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
});

export const serviceRequests = pgTable(
  "service_requests",
  {
    ...mutable(),
    reference: reference(),
    serviceAgreementId: uuid("service_agreement_id")
      .notNull()
      .references(() => serviceAgreements.id),
    state: serviceRequestStateEnum("state").notNull().default("received"),
    urgency: serviceRequestUrgencyEnum("urgency").notNull(),
    description: text("description").notNull(),
    locationDetail: text("location_detail"),
    responsibleStaffId: uuid("responsible_staff_id").references(() => staffAccounts.id),
    waitingOn: text("waiting_on"),
    followUpAt: instant("follow_up_at"),
    estimatedCostMinor: bigint("estimated_cost_minor", { mode: "number" }),
    currency: currencyEnum("currency"),
    spendingApprovalId: uuid("spending_approval_id").references(() => approvals.id),
    providerOrganizationId: uuid("provider_organization_id").references(() => organizations.id),
    scheduledAt: instant("scheduled_at"),
    completedAt: instant("completed_at"),
    confirmedBy: text("confirmed_by"),
  },
  (t) => [
    check(
      "service_requests_waiting_dependency",
      sql`${t.state} not in ('awaiting_access', 'awaiting_approval', 'awaiting_parts') or (${t.waitingOn} is not null and ${t.followUpAt} is not null)`,
    ),
    check(
      "service_requests_spending_approved",
      sql`${t.state} not in ('scheduled', 'work_performed', 'awaiting_verification', 'resolved') or coalesce(${t.estimatedCostMinor}, 0) = 0 or ${t.spendingApprovalId} is not null`,
    ),
    index("service_requests_agreement_idx").on(t.serviceAgreementId, t.state),
  ],
);

export const statements = pgTable("statements", {
  ...mutable(),
  serviceAgreementId: uuid("service_agreement_id")
    .notNull()
    .references(() => serviceAgreements.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  currency: currencyEnum("currency").notNull(),
  issuedAt: instant("issued_at"),
});

/** Expected, invoiced, paid and reconciled amounts stay distinct lines (A64). */
export const statementLines = pgTable(
  "statement_lines",
  {
    ...mutable(),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => statements.id),
    description: text("description").notNull(),
    state: statementLineStateEnum("state").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    isAdjustment: boolean("is_adjustment").notNull().default(false),
    serviceRequestId: uuid("service_request_id").references(() => serviceRequests.id),
    evidenceDocumentId: uuid("evidence_document_id").references(() => documents.id),
  },
  (t) => [index("statement_lines_statement_idx").on(t.statementId)],
);

/** A versioned, expiring price for stay dates. */
export const reservationQuotes = pgTable(
  "reservation_quotes",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    versionNumber: integer("version_number").notNull(),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    guests: integer("guests").notNull(),
    currency: currencyEnum("currency").notNull(),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull(),
    items: jsonb("items").notNull(),
    cancellationTerms: text("cancellation_terms").notNull(),
    availabilityCheckedAt: instant("availability_checked_at").notNull(),
    expiresAt: instant("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reservation_quotes_version_idx").on(
      t.listingId,
      t.checkIn,
      t.checkOut,
      t.versionNumber,
    ),
  ],
);

/**
 * Overlapping capacity-holding reservations for one listing are rejected by an exclusion
 * constraint added in the constraints migration (A62).
 */
export const reservations = pgTable(
  "reservations",
  {
    ...mutable(),
    reference: reference(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    caseId: uuid("case_id").references(() => cases.id),
    state: reservationStateEnum("state").notNull().default("requested"),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    guests: integer("guests").notNull(),
    quoteId: uuid("quote_id").references(() => reservationQuotes.id),
    acceptedTermsVersion: text("accepted_terms_version"),
    payment: paymentStateEnum("payment").notNull().default("not_required"),
    paymentProviderReference: text("payment_provider_reference"),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    check("reservations_dates", sql`${t.checkOut} > ${t.checkIn}`),
    check(
      "reservations_confirmed_paid",
      sql`${t.state} <> 'confirmed' or ${t.payment} in ('not_required', 'confirmed_by_provider')`,
    ),
    index("reservations_listing_idx").on(t.listingId, t.checkIn),
  ],
);
