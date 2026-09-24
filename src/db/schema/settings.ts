// Operational settings and rate limiting (spec F25, §23.3, AD9, A58).
import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, real, text, uuid } from "drizzle-orm/pg-core";
import { staffAccounts } from "./accounts";
import { approvals } from "./approvals";
import { instant, mutable } from "./columns";
import { publicLocaleEnum } from "./enums";

/** A locale is routable when enabled and indexable only with a recorded human approval. */
export const localeSettings = pgTable(
  "locale_settings",
  {
    locale: publicLocaleEnum("locale").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    indexable: boolean("indexable").notNull().default(false),
    indexableApprovalId: uuid("indexable_approval_id").references(() => approvals.id),
    reviewerStaffId: uuid("reviewer_staff_id").references(() => staffAccounts.id),
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
 * keep the version they were made under, so a change never rewrites them (A58).
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
  approvedByStaffId: uuid("approved_by_staff_id").references(() => staffAccounts.id),
});

/** Token buckets for public endpoints (inquiry, sign-in); keys hold no personal data. */
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  /** e.g. "sign_in:<sha256 of ip>". */
  key: text("key").primaryKey(),
  tokens: real("tokens").notNull(),
  refilledAt: instant("refilled_at").notNull().defaultNow(),
  expiresAt: instant("expires_at").notNull(),
});
