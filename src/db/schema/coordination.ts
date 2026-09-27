// Appointments with exclusive resource intervals, proposal revisions, messages with delivery
// attempts, and documents (architecture §6.4, §6.5, §9, §13).
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
import { approvals } from "./approvals";
import { createdAt, id, instant, mutable, reference, tstzrange } from "./columns";
import {
  actorKindEnum,
  appointmentFormatEnum,
  appointmentResourceKindEnum,
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
  pricePeriodEnum,
  professionalValidationEnum,
  propertyAccessEnum,
  proposalStateEnum,
  scanStateEnum,
} from "./enums";
import { principals } from "./identity";
import { listingRevisions, listings, properties } from "./inventory";
import { parties } from "./parties";
import { externalActions, operations } from "./records";
import { cases, inquiries, interests } from "./work";

export const appointments = pgTable(
  "appointments",
  {
    ...mutable(),
    reference: reference(),
    state: appointmentStateEnum("state").notNull().default("requested"),
    format: appointmentFormatEnum("format").notNull(),
    caseId: uuid("case_id").references(() => cases.id),
    interestId: uuid("interest_id").references(() => interests.id),
    listingId: uuid("listing_id").references(() => listings.id),
    propertyId: uuid("property_id").references(() => properties.id),
    hostId: uuid("host_id").references(() => principals.id),
    /** IANA timezone controlling the local time; instants are stored in UTC. */
    timezone: text("timezone").notNull(),
    /** Preferred windows the requester gave; a request is never a booking. */
    requestedWindows: jsonb("requested_windows").notNull().default([]),
    proposedStartsAt: instant("proposed_starts_at"),
    proposedEndsAt: instant("proposed_ends_at"),
    /** The arrangement in force; kept while a reschedule is pending (AT32). */
    confirmedStartsAt: instant("confirmed_starts_at"),
    confirmedEndsAt: instant("confirmed_ends_at"),
    /** The confirmed appointment a proposed replacement would supersede once accepted. */
    replacesAppointmentId: uuid("replaces_appointment_id").references(
      (): AnyPgColumn => appointments.id,
    ),
    propertyAccess: propertyAccessEnum("property_access").notNull().default("unknown"),
    /** Private, time-scoped logistics; never shown beyond the participants. */
    accessNotes: text("access_notes"),
    /** The explicit manual step: external busy periods entered or checked before confirming. */
    externalBusyCheckedAt: instant("external_busy_checked_at"),
    externalBusyCheckedById: uuid("external_busy_checked_by_id").references(() => principals.id),
    /** ICS identity: a stable UID and an increasing SEQUENCE per committed change. */
    icsUid: text("ics_uid").notNull().unique(),
    icsSequence: integer("ics_sequence").notNull().default(0),
    outcomeNote: text("outcome_note"),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    check(
      "appointments_confirmed_slot",
      sql`${t.state} not in ('confirmed', 'reschedule_requested', 'completed', 'no_show') or (${t.confirmedStartsAt} is not null and ${t.confirmedEndsAt} is not null and ${t.confirmedEndsAt} > ${t.confirmedStartsAt})`,
    ),
    check(
      "appointments_confirmed_checks",
      sql`${t.state} <> 'confirmed' or (${t.hostId} is not null and ${t.propertyAccess} = 'confirmed' and ${t.externalBusyCheckedAt} is not null)`,
    ),
    index("appointments_case_idx").on(t.caseId),
    index("appointments_host_idx").on(t.hostId, t.confirmedStartsAt),
  ],
);

/**
 * Exclusive resource intervals (broker, property access) occupied by confirmed appointments,
 * travel buffers included. An exclusion constraint (btree_gist) makes concurrent confirmations
 * of overlapping intervals impossible (AT30); cancellation releases the interval.
 */
export const appointmentResources = pgTable(
  "appointment_resources",
  {
    id: id(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id),
    kind: appointmentResourceKindEnum("kind").notNull(),
    /** A broker principal id or a property id. */
    resourceId: uuid("resource_id").notNull(),
    during: tstzrange("during").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    releasedAt: instant("released_at"),
  },
  (t) => [
    check("appointment_resources_released", sql`${t.active} or ${t.releasedAt} is not null`),
    index("appointment_resources_appointment_idx").on(t.appointmentId),
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
    partyId: uuid("party_id").references(() => parties.id),
    principalId: uuid("principal_id").references(() => principals.id),
    role: text("role").notNull(),
    /** Accepting an invitation is not attendance; the provider accepting mail is neither. */
    acknowledgedSequence: integer("acknowledged_sequence"),
    notifiedSequence: integer("notified_sequence"),
  },
  (t) => [
    check("appointment_participants_one", sql`num_nonnulls(${t.partyId}, ${t.principalId}) = 1`),
  ],
);

export const proposals = pgTable("proposals", {
  ...mutable(),
  reference: reference(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id),
  interestId: uuid("interest_id").references(() => interests.id),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => listings.id),
  /** The one active decision thread. */
  activeRevisionNumber: integer("active_revision_number").notNull().default(1),
});

/** One revision of the terms; a change or counteroffer is a new revision (§6.5). */
export const proposalRevisions = pgTable(
  "proposal_revisions",
  {
    ...mutable(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id),
    revisionNumber: integer("revision_number").notNull(),
    state: proposalStateEnum("state").notNull().default("draft"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyEnum("currency").notNull(),
    period: pricePeriodEnum("period").notNull(),
    paymentBasis: text("payment_basis").notNull(),
    conditions: jsonb("conditions").notNull().default([]),
    inclusions: jsonb("inclusions").notNull().default([]),
    parties: jsonb("parties").notNull(),
    deadlineAt: instant("deadline_at").notNull(),
    deadlineTimezone: text("deadline_timezone").notNull(),
    sourceListingRevisionId: uuid("source_listing_revision_id").references(
      () => listingRevisions.id,
    ),
    /** The revision this one counters; the answered revision is never overwritten. */
    respondsToRevisionId: uuid("responds_to_revision_id").references(
      (): AnyPgColumn => proposalRevisions.id,
    ),
    /** Hash of the material terms; approval is valid only for this hash. */
    termsHash: text("terms_hash").notNull(),
    approvalId: uuid("approval_id").references(() => approvals.id),
    submittedAt: instant("submitted_at"),
    respondedAt: instant("responded_at"),
    responseNote: text("response_note"),
  },
  (t) => [
    uniqueIndex("proposal_revisions_number_idx").on(t.proposalId, t.revisionNumber),
    check("proposal_revisions_amount", sql`${t.amountMinor} >= 0`),
    check(
      "proposal_revisions_submitted_approved",
      sql`${t.state} in ('draft', 'reviewed', 'withdrawn') or ${t.approvalId} is not null`,
    ),
  ],
);

/** Append-only decisions by the exact parties of one proposal revision (AT34). */
export const proposalResponses = pgTable(
  "proposal_responses",
  {
    id: id(),
    createdAt: createdAt(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => proposalRevisions.id),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    actorKind: actorKindEnum("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    decision: text("decision").$type<"agree" | "decline" | "counter">().notNull(),
    reason: text("reason").notNull(),
    /** Digest of every exact term, party snapshot and listing source at response time. */
    termsHash: text("terms_hash").notNull(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => operations.id),
    evidenceDocumentVersionId: uuid("evidence_document_version_id").references(
      (): AnyPgColumn => documentVersions.id,
    ),
  },
  (t) => [
    uniqueIndex("proposal_responses_party_revision_idx").on(t.revisionId, t.partyId),
    check("proposal_responses_human", sql`${t.actorKind} in ('staff', 'client')`),
    check("proposal_responses_decision", sql`${t.decision} in ('agree', 'decline', 'counter')`),
    check("proposal_responses_exact_terms", sql`${t.termsHash} ~ '^[a-f0-9]{64}$'`),
    check(
      "proposal_responses_staff_evidence",
      sql`${t.actorKind} <> 'staff' or ${t.evidenceDocumentVersionId} is not null`,
    ),
  ],
);

/** One logical message with an explicit audience; delivery attempts are separate rows. */
export const messages = pgTable(
  "messages",
  {
    ...mutable(),
    kind: messageKindEnum("kind").notNull(),
    direction: messageDirectionEnum("direction").notNull(),
    channel: messageChannelEnum("channel").notNull(),
    audience: audienceEnum("audience").notNull(),
    state: messageStateEnum("state").notNull().default("draft"),
    caseId: uuid("case_id").references(() => cases.id),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id),
    authorKind: actorKindEnum("author_kind").notNull(),
    authorId: text("author_id").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    recipients: jsonb("recipients").notNull().default([]),
    attachments: jsonb("attachments").notNull().default([]),
    /** Digest of audience, recipients, channel, attachments and body. */
    payloadDigest: text("payload_digest").notNull(),
    approvalId: uuid("approval_id").references(() => approvals.id),
    approvedDigest: text("approved_digest"),
    /** Logical send identity, stored before execution and reused by every retry. */
    logicalSendId: text("logical_send_id").unique(),
    draftedByAi: boolean("drafted_by_ai").notNull().default(false),
  },
  (t) => [
    check(
      "messages_internal_never_sent",
      sql`${t.kind} <> 'internal_note' or (${t.state} = 'draft' and ${t.audience} = 'internal')`,
    ),
    check(
      "messages_sent_only_when_approved",
      sql`${t.direction} = 'inbound' or ${t.state} = 'draft' or (${t.approvedDigest} is not null and (${t.approvalId} is not null or ${t.kind} = 'service_message'))`,
    ),
    check(
      "messages_logical_send",
      sql`${t.direction} = 'inbound' or ${t.state} in ('draft', 'approved') or ${t.logicalSendId} is not null`,
    ),
    index("messages_case_idx").on(t.caseId, t.createdAt),
  ],
);

/** One provider attempt of a logical send; retries reuse the provider idempotency key. */
export const messageAttempts = pgTable(
  "message_attempts",
  {
    ...mutable(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    attemptNumber: integer("attempt_number").notNull(),
    recipient: text("recipient").notNull(),
    externalActionId: uuid("external_action_id").references(() => externalActions.id),
    provider: text("provider").notNull(),
    providerIdempotencyKey: text("provider_idempotency_key").notNull(),
    providerReference: text("provider_reference"),
    state: messageStateEnum("state").notNull().default("attempting"),
    attemptedAt: instant("attempted_at").notNull().defaultNow(),
    acceptedAt: instant("accepted_at"),
    deliveredAt: instant("delivered_at"),
    failedAt: instant("failed_at"),
    errorCode: text("error_code"),
  },
  (t) => [uniqueIndex("message_attempts_number_idx").on(t.messageId, t.recipient, t.attemptNumber)],
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
    /** Explicit audience, independent of general Case participation. */
    audience: audienceEnum("audience").notNull().default("internal"),
    currentVersionNumber: integer("current_version_number").notNull().default(0),
    retentionClass: text("retention_class"),
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
    /** Staging object the client uploaded to; never served. */
    stagingKey: text("staging_key").unique(),
    /** Server-only immutable copy; scan and review bind to its digest. */
    sealedKey: text("sealed_key").unique(),
    sha256: text("sha256"),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }),
    uploadedByKind: actorKindEnum("uploaded_by_kind").notNull(),
    uploadedById: text("uploaded_by_id").notNull(),
    scan: scanStateEnum("scan").notNull().default("pending"),
    scannedAt: instant("scanned_at"),
    scannerVersion: text("scanner_version"),
    scannedSha256: text("scanned_sha256"),
    reviewType: documentReviewTypeEnum("review_type"),
    reviewedById: uuid("reviewed_by_id").references(() => principals.id),
    reviewedAt: instant("reviewed_at"),
    reviewNote: text("review_note"),
    professionalValidation: professionalValidationEnum("professional_validation")
      .notNull()
      .default("not_requested"),
    professionalValidator: text("professional_validator"),
    supersededByVersionId: uuid("superseded_by_version_id").references(
      (): AnyPgColumn => documentVersions.id,
    ),
  },
  (t) => [
    uniqueIndex("document_versions_number_idx").on(t.documentId, t.versionNumber),
    check(
      "document_versions_scan_sealed_bytes",
      sql`${t.scan} = 'pending' or (${t.sealedKey} is not null and ${t.sha256} is not null)`,
    ),
    check(
      "document_versions_review_after_clean_scan",
      sql`${t.state} not in ('ready_for_review', 'reviewed') or ${t.scan} = 'clean'`,
    ),
    check(
      "document_versions_reviewed_by_human",
      sql`${t.state} <> 'reviewed' or (${t.reviewType} is not null and ${t.reviewedById} is not null)`,
    ),
  ],
);
