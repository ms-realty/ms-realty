// Inquiries, cases with stage history, party relationships, requirement briefs, matches and
// tasks (spec §04, §07.1–§07.3, §07.6, F18–F21).
import { sql } from "drizzle-orm";
import {
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
import { buyerCaseStages } from "../../domain/buyer-case";
import { rentalCaseStages } from "../../domain/rental-case";
import { sellerCaseStages } from "../../domain/seller-case";
import { clientAccounts, staffAccounts } from "./accounts";
import { createdAt, id, instant, mutable, reference, sqlList } from "./columns";
import {
  actorKindEnum,
  authorityStateEnum,
  caseKindEnum,
  commitmentKindEnum,
  inquiryPurposeEnum,
  inquirySourceEnum,
  inquiryStateEnum,
  matchGroupEnum,
  matchStateEnum,
  partyRoleEnum,
  publicLocaleEnum,
  requirementItemKindEnum,
  requirementOriginEnum,
  taskStateEnum,
  taskTypeEnum,
} from "./enums";
import { contactMethods, organizations, persons } from "./parties";
import { listings, listingVersions, properties } from "./properties";

export const cases = pgTable(
  "cases",
  {
    ...mutable(),
    reference: reference(),
    kind: caseKindEnum("kind").notNull(),
    /** Stage names come from the domain pipeline for the case kind (checked below). */
    stage: text("stage").notNull(),
    title: text("title").notNull(),
    propertyId: uuid("property_id").references(() => properties.id),
    ownerStaffId: uuid("owner_staff_id").references(() => staffAccounts.id),
    /** Paused/closed disposition: reason, remaining obligations and optional resume point. */
    dispositionReason: text("disposition_reason"),
    outstandingObligations: jsonb("outstanding_obligations"),
    resumeStage: text("resume_stage"),
    nextActionSummary: text("next_action_summary"),
    nextActionDueAt: instant("next_action_due_at"),
  },
  (t) => [
    check(
      "cases_stage_matches_kind",
      sql`(${t.kind} = 'buyer' and ${t.stage} in (${sqlList(buyerCaseStages)}))
        or (${t.kind} = 'seller' and ${t.stage} in (${sqlList(sellerCaseStages)}))
        or (${t.kind} = 'rental' and ${t.stage} in (${sqlList(rentalCaseStages)}))`,
    ),
    check(
      "cases_disposition_reason",
      sql`${t.stage} not in ('paused', 'closed') or (${t.dispositionReason} is not null and ${t.outstandingObligations} is not null)`,
    ),
    index("cases_owner_idx").on(t.ownerStaffId, t.stage),
  ],
);

/** Append-only; reopening a case adds a row and never rewrites the closeout. */
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
 * A party's scoped, revocable role in a case or property. Authority to act is recorded
 * here and is never implied by contact verification.
 */
export const partyRelationships = pgTable(
  "party_relationships",
  {
    ...mutable(),
    personId: uuid("person_id").references(() => persons.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    role: partyRoleEnum("role").notNull(),
    caseId: uuid("case_id").references(() => cases.id),
    propertyId: uuid("property_id").references(() => properties.id),
    authority: authorityStateEnum("authority").notNull().default("not_claimed"),
    authorityReviewedByStaffId: uuid("authority_reviewed_by_staff_id").references(
      () => staffAccounts.id,
    ),
    authorityReviewedAt: instant("authority_reviewed_at"),
    /** Resources and actions granted by invitation (collaborators get exactly these). */
    scope: jsonb("scope").notNull().default({}),
    validFrom: instant("valid_from").notNull().defaultNow(),
    expiresAt: instant("expires_at"),
    revokedAt: instant("revoked_at"),
    revokedByStaffId: uuid("revoked_by_staff_id").references(() => staffAccounts.id),
  },
  (t) => [
    check(
      "party_relationships_one_party",
      sql`num_nonnulls(${t.personId}, ${t.organizationId}) = 1`,
    ),
    check("party_relationships_target", sql`num_nonnulls(${t.caseId}, ${t.propertyId}) >= 1`),
    check(
      "party_relationships_reviewed_authority",
      sql`${t.authority} <> 'reviewed' or (${t.authorityReviewedByStaffId} is not null and ${t.authorityReviewedAt} is not null)`,
    ),
    index("party_relationships_case_idx").on(t.caseId),
    index("party_relationships_person_idx").on(t.personId),
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
    /** Client-generated submission id: a retried submission reconciles to the same inquiry (A18). */
    submissionId: text("submission_id").notNull().unique(),
    listingId: uuid("listing_id").references(() => listings.id),
    /** Context the visitor submitted from (page, fact, comparison), as shown on the receipt. */
    context: jsonb("context").notNull().default({}),
    preferredName: text("preferred_name"),
    contactMethodId: uuid("contact_method_id").references(() => contactMethods.id),
    personId: uuid("person_id").references(() => persons.id),
    preferredLocale: publicLocaleEnum("preferred_locale"),
    callbackWindow: text("callback_window"),
    message: text("message"),
    /** Separate and unchecked by default (A16). */
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    ownerStaffId: uuid("owner_staff_id").references(() => staffAccounts.id),
    coverageQueue: text("coverage_queue"),
    acknowledgedAt: instant("acknowledged_at"),
    firstResponseAt: instant("first_response_at"),
    followUpAt: instant("follow_up_at"),
    caseId: uuid("case_id").references(() => cases.id),
    duplicateOfInquiryId: uuid("duplicate_of_inquiry_id"),
    dispositionReason: text("disposition_reason"),
  },
  (t) => [
    check(
      "inquiries_owned_after_received",
      sql`${t.state} in ('received', 'suspected_duplicate', 'discarded') or ${t.ownerStaffId} is not null or ${t.coverageQueue} is not null`,
    ),
    check("inquiries_case_linked", sql`${t.state} <> 'case_linked' or ${t.caseId} is not null`),
    index("inquiries_state_idx").on(t.state, t.createdAt),
    index("inquiries_owner_idx").on(t.ownerStaffId, t.state),
  ],
);

export const requirementBriefs = pgTable("requirement_briefs", {
  ...mutable(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id),
  /** Structured criteria in the shape of SearchCriteria (src/domain/search/filters.ts). */
  criteria: jsonb("criteria").notNull().default({}),
  acknowledgedByStaffId: uuid("acknowledged_by_staff_id").references(() => staffAccounts.id),
  acknowledgedAt: instant("acknowledged_at"),
  /** Set when the client changed a material item; the broker acknowledges before it drives work. */
  pendingClientChangeAt: instant("pending_client_change_at"),
});

export const requirementBriefItems = pgTable(
  "requirement_brief_items",
  {
    ...mutable(),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => requirementBriefs.id),
    kind: requirementItemKindEnum("kind").notNull(),
    origin: requirementOriginEnum("origin").notNull(),
    text: text("text").notNull(),
    criterion: jsonb("criterion"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("requirement_brief_items_brief_idx").on(t.briefId, t.position)],
);

export const matches = pgTable(
  "matches",
  {
    ...mutable(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    listingVersionId: uuid("listing_version_id").references(() => listingVersions.id),
    /** A listing that breaks a hard constraint is an alternative, never an exact match. */
    group: matchGroupEnum("group").notNull(),
    state: matchStateEnum("state").notNull().default("proposed"),
    /** Constraint satisfaction, preferences and unknowns, each with its reason. */
    fitReasons: jsonb("fit_reasons").notNull().default([]),
    brokerRationale: text("broker_rationale"),
    feedback: jsonb("feedback"),
  },
  (t) => [uniqueIndex("matches_case_listing_idx").on(t.caseId, t.listingId)],
);

export const tasks = pgTable(
  "tasks",
  {
    ...mutable(),
    title: text("title").notNull(),
    purpose: text("purpose"),
    type: taskTypeEnum("type").notNull().default("general"),
    commitment: commitmentKindEnum("commitment").notNull().default("internal"),
    state: taskStateEnum("state").notNull().default("open"),
    ownerStaffId: uuid("owner_staff_id").references(() => staffAccounts.id),
    /** Handoffs stay with the previous owner until the receiver accepts (§05.3). */
    pendingOwnerStaffId: uuid("pending_owner_staff_id").references(() => staffAccounts.id),
    dueAt: instant("due_at"),
    dueTimezone: text("due_timezone"),
    waitingOn: text("waiting_on"),
    followUpAt: instant("follow_up_at"),
    evidenceRequired: boolean("evidence_required").notNull().default(false),
    outcomeNote: text("outcome_note"),
    evidenceIds: jsonb("evidence_ids"),
    completedAt: instant("completed_at"),
    completedByStaffId: uuid("completed_by_staff_id").references(() => staffAccounts.id),
    cancelReason: text("cancel_reason"),
    caseId: uuid("case_id").references(() => cases.id),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id),
    listingId: uuid("listing_id").references(() => listings.id),
    /** Client who was promised this, for client_promise commitments. */
    promisedToClientId: uuid("promised_to_client_id").references(() => clientAccounts.id),
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
    index("tasks_owner_idx").on(t.ownerStaffId, t.state, t.dueAt),
    index("tasks_case_idx").on(t.caseId),
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
