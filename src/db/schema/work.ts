// Inquiries, cases, participants, brief revisions, interests, tasks and seller instructions
// (architecture §4.1, §6.1–§6.3, §6.6).
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { demandStages, serviceIntakeStages, supplyStages } from "../../domain/case";
import { createdAt, id, instant, mutable, reference, sqlList } from "./columns";
import {
  actorKindEnum,
  authorityStateEnum,
  caseDispositionEnum,
  caseKindEnum,
  exclusivityEnum,
  inquiryPurposeEnum,
  inquirySourceEnum,
  inquiryStateEnum,
  interestStateEnum,
  participantRoleEnum,
  publicLocaleEnum,
  representationScopeEnum,
  sellerInstructionStateEnum,
  serviceIntakeTopicEnum,
  taskStateEnum,
  taskTypeEnum,
} from "./enums";
import { principals } from "./identity";
import { listingRevisions, listings, properties } from "./inventory";
import { contactMethods, parties } from "./parties";

export const cases = pgTable(
  "cases",
  {
    ...mutable(),
    reference: reference(),
    kind: caseKindEnum("kind").notNull(),
    /** Stage names come from the pipeline of the case kind (checked below). */
    stage: text("stage").notNull(),
    disposition: caseDispositionEnum("disposition").notNull().default("active"),
    /** Service intake only: what the consultation is about. */
    serviceTopic: serviceIntakeTopicEnum("service_topic"),
    title: text("title").notNull(),
    propertyId: uuid("property_id").references(() => properties.id),
    /** The one accountable broker. */
    ownerId: uuid("owner_id").references(() => principals.id),
    /** A handover stays with the current owner until the receiver accepts. */
    pendingOwnerId: uuid("pending_owner_id").references(() => principals.id),
    nextAction: text("next_action"),
    nextActionDueAt: instant("next_action_due_at"),
    /** An explicit waiting dependency and its review date, instead of a next action. */
    waitingOn: text("waiting_on"),
    reviewAt: instant("review_at"),
    dispositionReason: text("disposition_reason"),
    closureOutcome: text("closure_outcome"),
    /** Closure: the disposition recorded for every commitment open at closing. */
    commitmentDispositions: jsonb("commitment_dispositions"),
    /** Curated, client-visible summary; never a raw internal note. */
    clientSummary: text("client_summary"),
  },
  (t) => [
    check(
      "cases_stage_matches_kind",
      sql`(${t.kind} in ('buyer', 'tenant') and ${t.stage} in (${sqlList(demandStages)}))
        or (${t.kind} in ('seller', 'landlord') and ${t.stage} in (${sqlList(supplyStages)}))
        or (${t.kind} = 'service_intake' and ${t.stage} in (${sqlList(serviceIntakeStages)}))`,
    ),
    check(
      "cases_service_topic",
      sql`(${t.kind} = 'service_intake') = (${t.serviceTopic} is not null)`,
    ),
    check(
      "cases_active_owned",
      sql`${t.disposition} <> 'active' or (${t.ownerId} is not null and (${t.nextAction} is not null or (${t.waitingOn} is not null and ${t.reviewAt} is not null)))`,
    ),
    check(
      "cases_paused_dependency",
      sql`${t.disposition} <> 'paused' or (${t.dispositionReason} is not null and ${t.waitingOn} is not null and ${t.reviewAt} is not null)`,
    ),
    check(
      "cases_closed_outcome",
      sql`${t.disposition} <> 'closed' or (${t.closureOutcome} is not null and ${t.commitmentDispositions} is not null)`,
    ),
    index("cases_owner_idx").on(t.ownerId, t.disposition),
  ],
);

/** Append-only; reopening adds a row and never rewrites the closeout. */
export const caseStageHistory = pgTable(
  "case_stage_history",
  {
    id: id(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),
    reason: text("reason"),
    evidence: jsonb("evidence").notNull().default({}),
    actorKind: actorKindEnum("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    operationId: text("operation_id").notNull(),
    occurredAt: instant("occurred_at").notNull().defaultNow(),
  },
  (t) => [index("case_stage_history_case_idx").on(t.caseId, t.occurredAt)],
);

/**
 * A party's explicitly scoped role in a Case. Authority to act is recorded here and is never
 * implied by contact verification; invited collaborators get exactly their scope.
 */
export const caseParticipants = pgTable(
  "case_participants",
  {
    ...mutable(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    role: participantRoleEnum("role").notNull(),
    authority: authorityStateEnum("authority").notNull().default("not_claimed"),
    authorityReviewedById: uuid("authority_reviewed_by_id").references(() => principals.id),
    authorityReviewedAt: instant("authority_reviewed_at"),
    /** Resources and portal actions granted by invitation. */
    scope: jsonb("scope").notNull().default({}),
    // Stamped by the application: authz compares it with the application clock.
    validFrom: instant("valid_from")
      .notNull()
      .defaultNow()
      .$defaultFn(() => new Date()),
    expiresAt: instant("expires_at"),
    revokedAt: instant("revoked_at"),
    revokedById: uuid("revoked_by_id").references(() => principals.id),
  },
  (t) => [
    check(
      "case_participants_reviewed_authority",
      sql`${t.authority} <> 'reviewed' or (${t.authorityReviewedById} is not null and ${t.authorityReviewedAt} is not null)`,
    ),
    index("case_participants_case_idx").on(t.caseId),
    index("case_participants_party_idx").on(t.partyId),
  ],
);

export const inquiries = pgTable(
  "inquiries",
  {
    ...mutable(),
    reference: reference(),
    state: inquiryStateEnum("state").notNull().default("received"),
    purpose: inquiryPurposeEnum("purpose").notNull(),
    source: inquirySourceEnum("source").notNull(),
    /** High-entropy logical submission key: a retried submission reconciles to one inquiry. */
    submissionKey: text("submission_key").notNull().unique(),
    /** Digest of the submitted payload; the same key with another payload is refused. */
    payloadDigest: text("payload_digest").notNull(),
    /** Hash of the anonymous receipt-session capability held in the host-only cookie. */
    receiptSessionHash: text("receipt_session_hash"),
    listingId: uuid("listing_id").references(() => listings.id),
    listingRevisionId: uuid("listing_revision_id").references(() => listingRevisions.id),
    /** Property or criteria snapshot the visitor submitted from, as shown on the receipt. */
    context: jsonb("context").notNull().default({}),
    preferredName: text("preferred_name"),
    contactMethodId: uuid("contact_method_id").references(() => contactMethods.id),
    partyId: uuid("party_id").references(() => parties.id),
    preferredLocale: publicLocaleEnum("preferred_locale"),
    preferredChannel: text("preferred_channel"),
    callbackWindow: text("callback_window"),
    message: text("message"),
    /** Separate and unchecked by default. */
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    ownerId: uuid("owner_id").references(() => principals.id),
    /** The coverage queue owns new work until a named broker accepts it. */
    coverageQueue: text("coverage_queue"),
    acknowledgedAt: instant("acknowledged_at"),
    firstResponseAt: instant("first_response_at"),
    followUpAt: instant("follow_up_at"),
    caseId: uuid("case_id").references(() => cases.id),
    duplicateOfInquiryId: uuid("duplicate_of_inquiry_id").references(
      (): AnyPgColumn => inquiries.id,
    ),
    dispositionReason: text("disposition_reason"),
  },
  (t) => [
    check("inquiries_owned", sql`num_nonnulls(${t.ownerId}, ${t.coverageQueue}) >= 1`),
    check("inquiries_linked_case", sql`${t.state} <> 'linked_to_case' or ${t.caseId} is not null`),
    check(
      "inquiries_duplicate_of",
      sql`${t.state} <> 'duplicate_candidate' or ${t.duplicateOfInquiryId} is not null`,
    ),
    index("inquiries_state_idx").on(t.state, t.createdAt),
    index("inquiries_owner_idx").on(t.ownerId, t.state),
  ],
);

/**
 * Case requirements at one revision: hard constraints, preferences, unknowns and timing, each
 * marked client-stated or broker interpretation. A client change is a new revision that the
 * broker acknowledges; it never silently alters an active proposal.
 */
export const briefRevisions = pgTable(
  "brief_revisions",
  {
    id: id(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    revisionNumber: integer("revision_number").notNull(),
    /** [{ kind, origin, text, criterion? }] with kind in briefItemKinds. */
    items: jsonb("items").notNull(),
    /** Structured criteria in the shape of SearchCriteria (src/domain/search/filters.ts). */
    criteria: jsonb("criteria").notNull().default({}),
    authorKind: actorKindEnum("author_kind").notNull(),
    authorId: text("author_id").notNull(),
    createdAt: createdAt(),
    clientAcknowledgedAt: instant("client_acknowledged_at"),
    clientAcknowledgedById: uuid("client_acknowledged_by_id").references(() => principals.id),
    brokerAcknowledgedAt: instant("broker_acknowledged_at"),
    brokerAcknowledgedById: uuid("broker_acknowledged_by_id").references(() => principals.id),
  },
  (t) => [uniqueIndex("brief_revisions_number_idx").on(t.caseId, t.revisionNumber)],
);

/** The unique current relationship between a Case and a Listing (§6.2). */
export const interests = pgTable(
  "interests",
  {
    ...mutable(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    state: interestStateEnum("state").notNull().default("suggested"),
    /** Known match reasons and unresolved criteria; no opaque score. */
    fitExplanation: jsonb("fit_explanation").notNull().default([]),
    questions: jsonb("questions").notNull().default([]),
    /** The listing revision the fit and feedback were judged against. */
    listingRevisionId: uuid("listing_revision_id").references(() => listingRevisions.id),
    reason: text("reason"),
  },
  (t) => [
    uniqueIndex("interests_case_listing_idx").on(t.caseId, t.listingId),
    check(
      "interests_declined_reason",
      sql`${t.state} not in ('declined', 'unavailable') or ${t.reason} is not null`,
    ),
  ],
);

/** Revisioned feedback on an Interest; earlier feedback is never rewritten. */
export const interestFeedback = pgTable(
  "interest_feedback",
  {
    id: id(),
    interestId: uuid("interest_id")
      .notNull()
      .references(() => interests.id),
    revisionNumber: integer("revision_number").notNull(),
    feedback: text("feedback").notNull(),
    reasons: jsonb("reasons").notNull().default([]),
    listingRevisionId: uuid("listing_revision_id").references(() => listingRevisions.id),
    authorKind: actorKindEnum("author_kind").notNull(),
    authorId: text("author_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("interest_feedback_number_idx").on(t.interestId, t.revisionNumber)],
);

export const tasks = pgTable(
  "tasks",
  {
    ...mutable(),
    title: text("title").notNull(),
    purpose: text("purpose"),
    type: taskTypeEnum("type").notNull().default("general"),
    state: taskStateEnum("state").notNull().default("open"),
    ownerId: uuid("owner_id").references(() => principals.id),
    /** A handover stays with the previous owner until the receiver accepts. */
    pendingOwnerId: uuid("pending_owner_id").references(() => principals.id),
    dueAt: instant("due_at"),
    dueTimezone: text("due_timezone"),
    dependsOnTaskId: uuid("depends_on_task_id").references((): AnyPgColumn => tasks.id),
    waitingOn: text("waiting_on"),
    followUpAt: instant("follow_up_at"),
    /** A promise made to a client, distinct from internal work. */
    promisedToClient: boolean("promised_to_client").notNull().default(false),
    evidenceRequired: boolean("evidence_required").notNull().default(false),
    outcomeNote: text("outcome_note"),
    evidenceIds: jsonb("evidence_ids"),
    completedAt: instant("completed_at"),
    completedById: uuid("completed_by_id").references(() => principals.id),
    cancelReason: text("cancel_reason"),
    caseId: uuid("case_id").references(() => cases.id),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id),
    propertyId: uuid("property_id").references(() => properties.id),
    listingId: uuid("listing_id").references(() => listings.id),
  },
  (t) => [
    check(
      "tasks_waiting_names_dependency",
      sql`${t.state} <> 'waiting' or (${t.waitingOn} is not null and ${t.followUpAt} is not null)`,
    ),
    check(
      "tasks_done_records_outcome",
      sql`${t.state} <> 'done' or (${t.outcomeNote} is not null and ${t.completedAt} is not null)`,
    ),
    check(
      "tasks_done_evidence",
      sql`${t.state} <> 'done' or not ${t.evidenceRequired} or ${t.evidenceIds} is not null`,
    ),
    check(
      "tasks_promise_has_client_context",
      sql`not ${t.promisedToClient} or num_nonnulls(${t.caseId}, ${t.inquiryId}) >= 1`,
    ),
    index("tasks_owner_idx").on(t.ownerId, t.state, t.dueAt),
    index("tasks_case_idx").on(t.caseId),
  ],
);

/**
 * The seller's or landlord's instruction at a defined revision (§6.3): commercial terms,
 * disclosure, media usage rights, representation scope, exclusivity, commission terms and
 * publication permission, as recorded evidence of the brokerage agreement.
 */
export const sellerInstructions = pgTable(
  "seller_instructions",
  {
    ...mutable(),
    reference: reference(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    listingId: uuid("listing_id").references(() => listings.id),
    caseId: uuid("case_id").references(() => cases.id),
    revisionNumber: integer("revision_number").notNull(),
    supersedesId: uuid("supersedes_id").references((): AnyPgColumn => sellerInstructions.id),
    state: sellerInstructionStateEnum("state").notNull().default("draft"),
    commercialTerms: jsonb("commercial_terms").notNull(),
    disclosure: jsonb("disclosure").notNull(),
    mediaUsageRights: jsonb("media_usage_rights").notNull(),
    representationScope: representationScopeEnum("representation_scope").notNull(),
    exclusivity: exclusivityEnum("exclusivity").notNull().default("not_recorded"),
    commissionTerms: text("commission_terms"),
    publicationPermission: boolean("publication_permission").notNull().default(false),
    /** Digest of the instruction content; acknowledgments and approvals bind to it. */
    contentDigest: text("content_digest").notNull(),
    evidenceDocumentIds: jsonb("evidence_document_ids").notNull().default([]),
    agreedAt: instant("agreed_at"),
    recordedById: uuid("recorded_by_id").references(() => principals.id),
    expiresAt: instant("expires_at"),
    invalidatedAt: instant("invalidated_at"),
    invalidationReason: text("invalidation_reason"),
  },
  (t) => [
    uniqueIndex("seller_instructions_revision_idx").on(t.propertyId, t.revisionNumber),
    check(
      "seller_instructions_agreed_evidence",
      sql`${t.state} <> 'agreed' or (${t.agreedAt} is not null and ${t.recordedById} is not null and ${t.commissionTerms} is not null and jsonb_array_length(${t.evidenceDocumentIds}) > 0)`,
    ),
  ],
);

/** Yearly counters behind human references (src/domain/ids.ts). Listings use year 0. */
export const referenceSequences = pgTable(
  "reference_sequences",
  {
    kind: text("kind").notNull(),
    year: integer("year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.year] })],
);
