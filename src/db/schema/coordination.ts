// Appointments, messages, documents and proposals (spec §07.5, §07.6, F07, F15–F17, F22).
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
import { staffAccounts } from "./accounts";
import { approvals } from "./approvals";
import { createdAt, id, instant, mutable, reference } from "./columns";
import {
  actorKindEnum,
  appointmentFormatEnum,
  appointmentStateEnum,
  audienceEnum,
  currencyEnum,
  documentClassificationEnum,
  documentReviewTypeEnum,
  documentStateEnum,
  messageChannelEnum,
  messageDirectionEnum,
  messageKindEnum,
  messageStateEnum,
  professionalValidationEnum,
  propertyAccessEnum,
  proposalStateEnum,
  scanStateEnum,
} from "./enums";
import { persons } from "./parties";
import { listings, properties } from "./properties";
import { cases, inquiries } from "./work";

export const appointments = pgTable(
  "appointments",
  {
    ...mutable(),
    reference: reference(),
    state: appointmentStateEnum("state").notNull().default("requested"),
    format: appointmentFormatEnum("format").notNull(),
    caseId: uuid("case_id").references(() => cases.id),
    listingId: uuid("listing_id").references(() => listings.id),
    /** IANA timezone of the property; never the traveller's device timezone. */
    timezone: text("timezone").notNull(),
    /** Preferred windows the requester gave, before any proposal. */
    requestedWindows: jsonb("requested_windows").notNull().default([]),
    proposedStartsAt: instant("proposed_starts_at"),
    proposedEndsAt: instant("proposed_ends_at"),
    /** The arrangement in force; kept while a reschedule is pending (A21). */
    confirmedStartsAt: instant("confirmed_starts_at"),
    confirmedEndsAt: instant("confirmed_ends_at"),
    hostStaffId: uuid("host_staff_id").references(() => staffAccounts.id),
    propertyAccess: propertyAccessEnum("property_access").notNull().default("unknown"),
    meetingPoint: text("meeting_point"),
    outcomeNote: text("outcome_note"),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    check(
      "appointments_confirmed_slot",
      sql`${t.state} not in ('confirmed', 'reschedule_requested', 'completed', 'no_show') or (${t.confirmedStartsAt} is not null and ${t.confirmedEndsAt} is not null)`,
    ),
    index("appointments_case_idx").on(t.caseId),
    index("appointments_host_idx").on(t.hostStaffId, t.confirmedStartsAt),
  ],
);

/** Immutable history of every arrangement an appointment has had. */
export const appointmentVersions = pgTable(
  "appointment_versions",
  {
    id: id(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id),
    versionNumber: integer("version_number").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    actorKind: actorKindEnum("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("appointment_versions_number_idx").on(t.appointmentId, t.versionNumber)],
);

export const appointmentParticipants = pgTable(
  "appointment_participants",
  {
    ...mutable(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id),
    personId: uuid("person_id").references(() => persons.id),
    staffAccountId: uuid("staff_account_id").references(() => staffAccounts.id),
    role: text("role").notNull(),
    /** Whether this participant has acknowledged the current arrangement. */
    acknowledgedVersion: integer("acknowledged_version"),
    notifiedAt: instant("notified_at"),
  },
  (t) => [
    check(
      "appointment_participants_one",
      sql`num_nonnulls(${t.personId}, ${t.staffAccountId}) = 1`,
    ),
  ],
);

/** One logical message; delivery attempts are separate rows (§07.5). */
export const messages = pgTable(
  "messages",
  {
    ...mutable(),
    kind: messageKindEnum("kind").notNull(),
    direction: messageDirectionEnum("direction").notNull(),
    channel: messageChannelEnum("channel").notNull(),
    state: messageStateEnum("state").notNull().default("draft"),
    caseId: uuid("case_id").references(() => cases.id),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id),
    authorKind: actorKindEnum("author_kind").notNull(),
    authorId: text("author_id").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    recipients: jsonb("recipients").notNull().default([]),
    attachments: jsonb("attachments").notNull().default([]),
    /** Hash of recipients, channel, attachments and body; approval binds to it. */
    contentHash: text("content_hash").notNull(),
    approvalId: uuid("approval_id").references(() => approvals.id),
    approvedContentHash: text("approved_content_hash"),
    draftedByAi: boolean("drafted_by_ai").notNull().default(false),
  },
  (t) => [
    check(
      "messages_internal_never_sent",
      sql`${t.kind} <> 'internal_note' or ${t.state} = 'draft'`,
    ),
    check(
      "messages_sent_only_when_approved",
      sql`${t.direction} = 'inbound' or ${t.state} in ('draft') or (${t.approvalId} is not null and ${t.approvedContentHash} is not null)`,
    ),
    index("messages_case_idx").on(t.caseId, t.createdAt),
  ],
);

export const messageDeliveries = pgTable(
  "message_deliveries",
  {
    ...mutable(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    attempt: integer("attempt").notNull(),
    recipient: text("recipient").notNull(),
    provider: text("provider").notNull(),
    /** Idempotency key sent to the provider; unique so a retry cannot send twice. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    providerMessageId: text("provider_message_id"),
    state: messageStateEnum("state").notNull().default("queued"),
    queuedAt: instant("queued_at").notNull().defaultNow(),
    acceptedAt: instant("accepted_at"),
    deliveredAt: instant("delivered_at"),
    readAt: instant("read_at"),
    failedAt: instant("failed_at"),
    errorCode: text("error_code"),
  },
  (t) => [uniqueIndex("message_deliveries_attempt_idx").on(t.messageId, t.recipient, t.attempt)],
);

export const documents = pgTable(
  "documents",
  {
    ...mutable(),
    reference: reference(),
    caseId: uuid("case_id").references(() => cases.id),
    propertyId: uuid("property_id").references(() => properties.id),
    purpose: text("purpose").notNull(),
    classification: documentClassificationEnum("classification").notNull(),
    audience: audienceEnum("audience").notNull().default("internal"),
    currentVersionNumber: integer("current_version_number").notNull().default(0),
    retentionPolicy: text("retention_policy"),
    expiresAt: instant("expires_at"),
  },
  (t) => [index("documents_case_idx").on(t.caseId)],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    ...mutable(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    versionNumber: integer("version_number").notNull(),
    state: documentStateEnum("state").notNull().default("selected"),
    r2Key: text("r2_key").unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }),
    sha256: text("sha256"),
    uploadedByKind: actorKindEnum("uploaded_by_kind").notNull(),
    uploadedById: text("uploaded_by_id").notNull(),
    scan: scanStateEnum("scan").notNull().default("pending"),
    scannedAt: instant("scanned_at"),
    reviewType: documentReviewTypeEnum("review_type"),
    reviewedByStaffId: uuid("reviewed_by_staff_id").references(() => staffAccounts.id),
    reviewedAt: instant("reviewed_at"),
    reviewNote: text("review_note"),
    professionalValidation: professionalValidationEnum("professional_validation")
      .notNull()
      .default("not_requested"),
    professionalValidator: text("professional_validator"),
    supersededByVersionId: uuid("superseded_by_version_id"),
  },
  (t) => [
    uniqueIndex("document_versions_number_idx").on(t.documentId, t.versionNumber),
    check(
      "document_versions_review_after_clean_scan",
      sql`${t.state} not in ('ready_for_review', 'reviewed') or ${t.scan} = 'clean'`,
    ),
    check(
      "document_versions_reviewed_by_human",
      sql`${t.state} <> 'reviewed' or (${t.reviewType} is not null and ${t.reviewedByStaffId} is not null)`,
    ),
  ],
);

export const proposals = pgTable("proposals", {
  ...mutable(),
  reference: reference(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => listings.id),
  /** The one active decision thread. */
  activeVersionNumber: integer("active_version_number").notNull().default(1),
});

export const proposalVersions = pgTable(
  "proposal_versions",
  {
    ...mutable(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id),
    versionNumber: integer("version_number").notNull(),
    state: proposalStateEnum("state").notNull().default("draft"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    paymentBasis: text("payment_basis").notNull(),
    conditions: jsonb("conditions").notNull().default([]),
    inclusions: jsonb("inclusions").notNull().default([]),
    parties: jsonb("parties").notNull(),
    deadlineAt: instant("deadline_at").notNull(),
    deadlineTimezone: text("deadline_timezone").notNull(),
    /** Hash of the material terms; approval is valid only for this hash. */
    termsHash: text("terms_hash").notNull(),
    approvalId: uuid("approval_id").references(() => approvals.id),
    submittedAt: instant("submitted_at"),
    respondedAt: instant("responded_at"),
    responseNote: text("response_note"),
  },
  (t) => [
    uniqueIndex("proposal_versions_number_idx").on(t.proposalId, t.versionNumber),
    check("proposal_versions_amount", sql`${t.amountMinor} >= 0`),
    check(
      "proposal_versions_submitted_approved",
      sql`${t.state} in ('draft', 'reviewed', 'withdrawn') or ${t.approvalId} is not null`,
    ),
  ],
);
