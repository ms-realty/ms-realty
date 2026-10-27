// Locale, service policy and rate limiting (architecture §3.2, §6.1, §7.1).
import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, real, text, uuid } from "drizzle-orm/pg-core";
import { approvals } from "./approvals";
import { createdAt, id, instant, mutable } from "./columns";
import { publicLocaleEnum } from "./enums";
import { principals } from "./identity";

/** A locale is routable when enabled and indexable only with a recorded human approval. */
export const localeSettings = pgTable(
  "locale_settings",
  {
    locale: publicLocaleEnum("locale").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    indexable: boolean("indexable").notNull().default(false),
    indexableApprovalId: uuid("indexable_approval_id").references(() => approvals.id),
    reviewerId: uuid("reviewer_id").references(() => principals.id),
    version: integer("version").notNull().default(1),
    updatedAt: instant("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "locale_settings_indexable_approved",
      sql`not ${t.indexable} or (${t.enabled} and ${t.indexableApprovalId} is not null)`,
    ),
  ],
);

/**
 * Versioned service policy. A new row takes effect from its instant; promises already made
 * keep the version they were made under, so a change never rewrites them.
 */
export const servicePolicies = pgTable("service_policies", {
  ...mutable(),
  effectiveFrom: instant("effective_from").notNull(),
  timezone: text("timezone").notNull(),
  /** Weekly opening hours and holidays. */
  serviceHours: jsonb("service_hours").notNull(),
  /** Approved coverage statement: areas, property types and services offered. */
  coverage: jsonb("coverage").notNull(),
  /** Acknowledgment/response promise rules (next business period by default). */
  responsePolicy: jsonb("response_policy").notNull(),
  /** Availability-review interval in days per listing purpose (§7.1 defaults 14 and 7). */
  availabilityReviewDays: jsonb("availability_review_days")
    .notNull()
    .default({ sale: 14, long_term_rent: 7 }),
  approvedById: uuid("approved_by_id").references(() => principals.id),
});

/** O24 singleton working draft. Approval copies the exact hash into an immutable edition. */
export const operatingPolicyDrafts = pgTable(
  "operating_policy_drafts",
  {
    ...mutable(),
    document: jsonb("document").notNull().default({}),
    contentHash: text("content_hash"),
    updatedById: uuid("updated_by_id").references(() => principals.id),
  },
  (t) => [
    check(
      "operating_policy_drafts_singleton",
      sql`${t.id} = '00000000-0000-4000-8000-000000000024'`,
    ),
  ],
);

export const operatingPolicyVersions = pgTable(
  "operating_policy_versions",
  {
    id: id(),
    policyVersion: integer("policy_version").notNull().unique(),
    draftRevision: integer("draft_revision").notNull(),
    document: jsonb("document").notNull(),
    contentHash: text("content_hash").notNull(),
    approvedById: uuid("approved_by_id")
      .notNull()
      .references(() => principals.id),
    approvedAt: createdAt(),
    approvalNote: text("approval_note").notNull(),
    operationId: text("operation_id").notNull().unique(),
    /** Projection for the pre-existing appointment safety guard; legacy rows are not upgraded. */
    servicePolicyId: uuid("service_policy_id")
      .notNull()
      .references(() => servicePolicies.id),
  },
  (t) => [
    check("operating_policy_version_positive", sql`${t.policyVersion} > 0`),
    check("operating_policy_draft_revision_positive", sql`${t.draftRevision} > 0`),
    check("operating_policy_content_hash", sql`${t.contentHash} ~ '^[a-f0-9]{64}$'`),
  ],
);

/** Token buckets for public endpoints (inquiry, sign-in); keys hold no personal data. */
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  /** e.g. "sign_in:<sha256 of ip>". */
  key: text("key").primaryKey(),
  tokens: real("tokens").notNull(),
  refilledAt: instant("refilled_at").notNull().defaultNow(),
  expiresAt: instant("expires_at").notNull(),
});
