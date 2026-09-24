// Shortlists and saved searches (spec F04, F05, A11–A15).
import { sql } from "drizzle-orm";
import {
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
import { clientAccounts } from "./accounts";
import { instant, mutable } from "./columns";
import {
  alertFrequencyEnum,
  alertSubscriptionStateEnum,
  shortlistOpinionEnum,
  shortlistRoleEnum,
} from "./enums";
import { contactMethods } from "./parties";
import { listings } from "./properties";
import { cases } from "./work";

export const shortlists = pgTable("shortlists", {
  ...mutable(),
  ownerClientId: uuid("owner_client_id")
    .notNull()
    .references(() => clientAccounts.id),
  caseId: uuid("case_id").references(() => cases.id),
  name: text("name").notNull(),
});

export const shortlistItems = pgTable(
  "shortlist_items",
  {
    ...mutable(),
    shortlistId: uuid("shortlist_id")
      .notNull()
      .references(() => shortlists.id),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    position: integer("position").notNull().default(0),
    /** Removal is recoverable: the row stays with a removal instant. */
    removedAt: instant("removed_at"),
  },
  (t) => [uniqueIndex("shortlist_items_listing_idx").on(t.shortlistId, t.listingId)],
);

export const shortlistParticipants = pgTable(
  "shortlist_participants",
  {
    ...mutable(),
    shortlistId: uuid("shortlist_id")
      .notNull()
      .references(() => shortlists.id),
    clientAccountId: uuid("client_account_id")
      .notNull()
      .references(() => clientAccounts.id),
    role: shortlistRoleEnum("role").notNull(),
    /** Whether private notes are shared with this participant; previewed before inviting. */
    sharesPrivateNotes: boolean("shares_private_notes").notNull().default(false),
    invitedAt: instant("invited_at").notNull().defaultNow(),
    acceptedAt: instant("accepted_at"),
    revokedAt: instant("revoked_at"),
  },
  (t) => [uniqueIndex("shortlist_participants_idx").on(t.shortlistId, t.clientAccountId)],
);

/** Each participant's own opinion; no manufactured household consensus. */
export const shortlistOpinions = pgTable(
  "shortlist_opinions",
  {
    ...mutable(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => shortlistItems.id),
    clientAccountId: uuid("client_account_id")
      .notNull()
      .references(() => clientAccounts.id),
    opinion: shortlistOpinionEnum("opinion").notNull(),
    reason: text("reason"),
    privateNote: text("private_note"),
  },
  (t) => [uniqueIndex("shortlist_opinions_idx").on(t.itemId, t.clientAccountId)],
);

/** Public links expose approved public facts only; never notes or identities (A13). */
export const shortlistShareLinks = pgTable("shortlist_share_links", {
  ...mutable(),
  shortlistId: uuid("shortlist_id")
    .notNull()
    .references(() => shortlists.id),
  tokenHash: text("token_hash").notNull().unique(),
  createdByClientId: uuid("created_by_client_id")
    .notNull()
    .references(() => clientAccounts.id),
  expiresAt: instant("expires_at"),
  revokedAt: instant("revoked_at"),
});

export const savedSearches = pgTable("saved_searches", {
  ...mutable(),
  clientAccountId: uuid("client_account_id")
    .notNull()
    .references(() => clientAccounts.id),
  name: text("name").notNull(),
  /** Exact acknowledged SearchCriteria; the summary is what the person confirmed. */
  criteria: jsonb("criteria").notNull(),
  criteriaSummary: text("criteria_summary").notNull(),
  frequency: alertFrequencyEnum("frequency").notNull().default("daily"),
});

/** Inactive until the channel is verified (A14); revocation is re-checked at send time (A15). */
export const alertSubscriptions = pgTable(
  "alert_subscriptions",
  {
    ...mutable(),
    savedSearchId: uuid("saved_search_id")
      .notNull()
      .references(() => savedSearches.id),
    contactMethodId: uuid("contact_method_id")
      .notNull()
      .references(() => contactMethods.id),
    state: alertSubscriptionStateEnum("state").notNull().default("pending_verification"),
    verifiedAt: instant("verified_at"),
    timezone: text("timezone").notNull(),
    quietHours: jsonb("quiet_hours"),
    unsubscribeTokenHash: text("unsubscribe_token_hash").notNull().unique(),
    lastSentAt: instant("last_sent_at"),
  },
  (t) => [
    check(
      "alert_subscriptions_active_verified",
      sql`${t.state} <> 'active' or ${t.verifiedAt} is not null`,
    ),
    index("alert_subscriptions_search_idx").on(t.savedSearchId),
  ],
);
