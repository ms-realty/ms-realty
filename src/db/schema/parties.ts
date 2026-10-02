// Parties, contact methods, subscriptions and consent events (architecture §4.1, §8.4). A
// party is a person or organization; a verified contact method is not a sign-in permission,
// and each contact purpose has its own subscription and consent history.
import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, instant, mutable } from "./columns";
import {
  actorKindEnum,
  alertFrequencyEnum,
  consentEventKindEnum,
  contactMethodKindEnum,
  contactVerificationEnum,
  partyKindEnum,
  publicLocaleEnum,
  subscriptionPurposeEnum,
  subscriptionStateEnum,
} from "./enums";

export const parties = pgTable("parties", {
  ...mutable(),
  kind: partyKindEnum("kind").notNull(),
  displayName: text("display_name").notNull(),
  givenName: text("given_name"),
  familyName: text("family_name"),
  /** Organizations: registered name, number and country. */
  legalName: text("legal_name"),
  registrationNumber: text("registration_number"),
  country: text("country"),
  preferredLocale: publicLocaleEnum("preferred_locale"),
  /** Preferred channel and contact times, as the party stated them. */
  contactPreferences: jsonb("contact_preferences").notNull().default({}),
  /** Names used for duplicate matching; aliases survive an approved merge. */
  matchingAliases: text("matching_aliases").array().notNull().default(sql`'{}'::text[]`),
  /** Set when a merge folded this party into another (see merge_records). */
  mergedIntoPartyId: uuid("merged_into_party_id").references((): AnyPgColumn => parties.id),
});

export const contactMethods = pgTable(
  "contact_methods",
  {
    ...mutable(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    kind: contactMethodKindEnum("kind").notNull(),
    value: text("value").notNull(),
    /** Lower-cased email or E.164 phone, used for duplicate detection. */
    normalizedValue: text("normalized_value").notNull(),
    verification: contactVerificationEnum("verification").notNull().default("unverified"),
    verifiedAt: instant("verified_at"),
    lastFailureAt: instant("last_failure_at"),
  },
  (t) => [
    check(
      "contact_methods_verified_at",
      sql`${t.verification} <> 'verified' or ${t.verifiedAt} is not null`,
    ),
    index("contact_methods_normalized_idx").on(t.kind, t.normalizedValue),
    index("contact_methods_party_idx").on(t.partyId),
  ],
);

/**
 * Purpose-specific contact eligibility. Inactive until the channel is verified; rechecked when
 * a job executes, so an unsubscribe stops work that was already queued (AT44).
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    ...mutable(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    contactMethodId: uuid("contact_method_id")
      .notNull()
      .references(() => contactMethods.id),
    purpose: subscriptionPurposeEnum("purpose").notNull(),
    state: subscriptionStateEnum("state").notNull().default("pending_verification"),
    verifiedAt: instant("verified_at"),
    /** Search alerts: the exact acknowledged criteria snapshot and its summary. */
    criteria: jsonb("criteria"),
    criteriaSummary: text("criteria_summary"),
    frequency: alertFrequencyEnum("frequency"),
    timezone: text("timezone").notNull(),
    /** Policy and template revisions the consent was given under. */
    policyVersion: text("policy_version").notNull(),
    templateVersion: text("template_version"),
    unsubscribeTokenHash: text("unsubscribe_token_hash").notNull().unique(),
    lastSentAt: instant("last_sent_at"),
  },
  (t) => [
    check(
      "subscriptions_active_verified",
      sql`${t.state} <> 'active' or ${t.verifiedAt} is not null`,
    ),
    check(
      "subscriptions_alert_criteria",
      sql`(${t.purpose} = 'search_alerts') = (${t.criteria} is not null and ${t.frequency} is not null)`,
    ),
    index("subscriptions_party_idx").on(t.partyId, t.purpose),
  ],
);

/** Append-only history of consent: opt-in, verification, changes and withdrawal. */
export const consentEvents = pgTable(
  "consent_events",
  {
    id: id(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    kind: consentEventKindEnum("kind").notNull(),
    policyVersion: text("policy_version").notNull(),
    templateVersion: text("template_version"),
    /** Where it was captured, e.g. an inquiry form revision or an unsubscribe link. */
    source: text("source").notNull(),
    actorKind: actorKindEnum("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    recordedAt: instant("recorded_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("consent_events_subscription_idx").on(t.subscriptionId, t.recordedAt)],
);
