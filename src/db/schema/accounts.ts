// Accounts, sessions, passkeys, email sign-in and capability grants (AD5, AD7, F13).
// Secrets are stored only as hashes; sessions are opaque and server-side.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { draftOnlyCapabilities } from "../../domain/capabilities";
import { bytea, createdAt, id, instant, mutable, sqlList } from "./columns";
import {
  accountKindEnum,
  accountStatusEnum,
  capabilityEnum,
  publicLocaleEnum,
  roleEnum,
  signInTokenPurposeEnum,
  staffLocaleEnum,
} from "./enums";
import { persons } from "./parties";

export const staffAccounts = pgTable(
  "staff_accounts",
  {
    ...mutable(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    staffLocale: staffLocaleEnum("staff_locale").notNull().default("bg"),
    status: accountStatusEnum("status").notNull().default("active"),
  },
  (t) => [uniqueIndex("staff_accounts_email_idx").on(sql`lower(${t.email})`)],
);

export const clientAccounts = pgTable(
  "client_accounts",
  {
    ...mutable(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    email: text("email").notNull(),
    preferredLocale: publicLocaleEnum("preferred_locale").notNull().default("bg"),
    status: accountStatusEnum("status").notNull().default("active"),
  },
  (t) => [uniqueIndex("client_accounts_email_idx").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    /** SHA-256 of the opaque session token; the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    accountKind: accountKindEnum("account_kind").notNull(),
    staffAccountId: uuid("staff_account_id").references(() => staffAccounts.id),
    clientAccountId: uuid("client_account_id").references(() => clientAccounts.id),
    createdAt: createdAt(),
    expiresAt: instant("expires_at").notNull(),
    lastSeenAt: instant("last_seen_at").notNull().defaultNow(),
    /** Last step-up verification, for high-risk actions. */
    reverifiedAt: instant("reverified_at"),
    revokedAt: instant("revoked_at"),
  },
  (t) => [
    check(
      "sessions_one_account",
      sql`(${t.accountKind} = 'staff' and ${t.staffAccountId} is not null and ${t.clientAccountId} is null)
        or (${t.accountKind} = 'client' and ${t.clientAccountId} is not null and ${t.staffAccountId} is null)`,
    ),
    index("sessions_staff_idx").on(t.staffAccountId),
    index("sessions_client_idx").on(t.clientAccountId),
  ],
);

/** WebAuthn credentials for staff (and optionally clients). */
export const passkeys = pgTable(
  "passkeys",
  {
    id: id(),
    staffAccountId: uuid("staff_account_id").references(() => staffAccounts.id),
    clientAccountId: uuid("client_account_id").references(() => clientAccounts.id),
    /** Base64url credential id. */
    credentialId: text("credential_id").notNull().unique(),
    publicKey: bytea("public_key").notNull(),
    signCount: bigint("sign_count", { mode: "number" }).notNull().default(0),
    transports: text("transports").array().notNull().default(sql`'{}'::text[]`),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    label: text("label"),
    createdAt: createdAt(),
    lastUsedAt: instant("last_used_at"),
    revokedAt: instant("revoked_at"),
  },
  (t) => [
    check("passkeys_one_account", sql`num_nonnulls(${t.staffAccountId}, ${t.clientAccountId}) = 1`),
  ],
);

/**
 * One-time email sign-in and invitation tokens. Opening the link only shows a confirm step
 * (scanner-safe); the token is consumed when the person confirms.
 */
export const emailSignInTokens = pgTable(
  "email_sign_in_tokens",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    purpose: signInTokenPurposeEnum("purpose").notNull(),
    accountKind: accountKindEnum("account_kind").notNull(),
    email: text("email").notNull(),
    /** Relative path to return to after verification. */
    returnTo: text("return_to"),
    /** Invitation scope, e.g. { caseId, capabilities }. */
    invitation: jsonb("invitation"),
    createdAt: createdAt(),
    expiresAt: instant("expires_at").notNull(),
    consumedAt: instant("consumed_at"),
    revokedAt: instant("revoked_at"),
  },
  (t) => [index("email_sign_in_tokens_email_idx").on(sql`lower(${t.email})`)],
);

/**
 * Role presets and record-scoped capability grants. A grant names exactly one grantee and
 * either a role preset or a single capability; record and locale scope narrow it.
 */
export const capabilityGrants = pgTable(
  "capability_grants",
  {
    ...mutable(),
    staffAccountId: uuid("staff_account_id").references(() => staffAccounts.id),
    clientAccountId: uuid("client_account_id").references(() => clientAccounts.id),
    /** Non-human principal such as the Hermes draft service. */
    serviceName: text("service_name"),
    role: roleEnum("role"),
    capability: capabilityEnum("capability"),
    recordType: text("record_type"),
    recordId: uuid("record_id"),
    locales: publicLocaleEnum("locales").array(),
    grantedByStaffId: uuid("granted_by_staff_id").references(() => staffAccounts.id),
    reason: text("reason").notNull(),
    expiresAt: instant("expires_at"),
    revokedAt: instant("revoked_at"),
    revokedByStaffId: uuid("revoked_by_staff_id").references(() => staffAccounts.id),
  },
  (t) => [
    check(
      "capability_grants_one_grantee",
      sql`num_nonnulls(${t.staffAccountId}, ${t.clientAccountId}, ${t.serviceName}) = 1`,
    ),
    check(
      "capability_grants_role_or_capability",
      sql`num_nonnulls(${t.role}, ${t.capability}) = 1`,
    ),
    // A66: a service principal (Hermes) can only ever hold drafting capabilities.
    check(
      "capability_grants_service_drafts_only",
      // Written NULL-safe: a check that evaluates to NULL would pass.
      sql`${t.serviceName} is null or coalesce(${t.role} = 'ai_service', false) or coalesce(${t.capability} in (${sqlList(draftOnlyCapabilities)}), false)`,
    ),
    check(
      "capability_grants_record_scope",
      sql`(${t.recordId} is null) or (${t.recordType} is not null)`,
    ),
    index("capability_grants_staff_idx").on(t.staffAccountId),
    index("capability_grants_client_idx").on(t.clientAccountId),
    index("capability_grants_record_idx").on(t.recordType, t.recordId),
  ],
);
