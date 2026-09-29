// Principals, staff memberships, grants, sessions, passkeys and sign-in tokens (architecture
// §4.1, §8.1, §8.2; ADR 0002). A principal is an authenticated identity keyed by an immutable
// issuer + subject, in exactly one context (staff or client); email is a sign-in address, never
// a role. Secrets are stored only as hashes; sessions are opaque and server-side.
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
  capabilityEnum,
  invitationKindEnum,
  principalKindEnum,
  principalStatusEnum,
  publicLocaleEnum,
  roleEnum,
  signInTokenPurposeEnum,
  staffLocaleEnum,
  staffMembershipStateEnum,
} from "./enums";
import { parties } from "./parties";

export const principals = pgTable(
  "principals",
  {
    ...mutable(),
    kind: principalKindEnum("kind").notNull(),
    /** Immutable identity: first-party issuer URN (or a provider issuer) and subject. */
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    /** Sign-in address for the email link; not an identity and not a permission. */
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    preferredLocale: publicLocaleEnum("preferred_locale").notNull().default("bg"),
    status: principalStatusEnum("status").notNull().default("active"),
  },
  (t) => [
    uniqueIndex("principals_identity_idx").on(t.issuer, t.subject),
    uniqueIndex("principals_email_idx").on(t.kind, sql`lower(${t.email})`),
  ],
);

/** Active staff role for a staff principal; its absence closes the staff interface. */
export const staffMemberships = pgTable(
  "staff_memberships",
  {
    ...mutable(),
    principalId: uuid("principal_id")
      .notNull()
      .unique()
      .references(() => principals.id),
    state: staffMembershipStateEnum("state").notNull().default("active"),
    staffLocale: staffLocaleEnum("staff_locale").notNull().default("bg"),
    startedAt: instant("started_at").notNull().defaultNow(),
    endedAt: instant("ended_at"),
    /** Planned unavailability does not revoke sign-in. Coverage ends only on explicit return. */
    absenceFrom: instant("absence_from"),
    absenceReviewAt: instant("absence_review_at"),
  },
  (t) => [
    check(
      "staff_absence_review",
      sql`(${t.absenceFrom} is null and ${t.absenceReviewAt} is null) or (${t.absenceFrom} is not null and ${t.absenceReviewAt} is not null and ${t.absenceReviewAt} > ${t.absenceFrom})`,
    ),
  ],
);

/**
 * Role presets and record-scoped capability grants. A grant names exactly one grantee and
 * either a role preset or a single capability; record and locale scope narrow it.
 */
export const grants = pgTable(
  "grants",
  {
    ...mutable(),
    principalId: uuid("principal_id").references(() => principals.id),
    /** Non-human principal such as the Hermes draft service. */
    serviceName: text("service_name"),
    role: roleEnum("role"),
    capability: capabilityEnum("capability"),
    recordType: text("record_type"),
    recordId: uuid("record_id"),
    locales: publicLocaleEnum("locales").array(),
    grantedById: uuid("granted_by_id").references(() => principals.id),
    reason: text("reason").notNull(),
    expiresAt: instant("expires_at"),
    revokedAt: instant("revoked_at"),
    revokedById: uuid("revoked_by_id").references(() => principals.id),
  },
  (t) => [
    check("grants_one_grantee", sql`num_nonnulls(${t.principalId}, ${t.serviceName}) = 1`),
    check("grants_role_or_capability", sql`num_nonnulls(${t.role}, ${t.capability}) = 1`),
    // AT52: a service principal (Hermes) can only ever hold drafting capabilities.
    check(
      "grants_service_drafts_only",
      // Written NULL-safe: a check that evaluates to NULL would pass.
      sql`${t.serviceName} is null or coalesce(${t.role} = 'ai_service', false) or coalesce(${t.capability} in (${sqlList(draftOnlyCapabilities)}), false)`,
    ),
    check("grants_record_scope", sql`(${t.recordId} is null) or (${t.recordType} is not null)`),
    index("grants_principal_idx").on(t.principalId),
    index("grants_record_idx").on(t.recordType, t.recordId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    /** SHA-256 of the opaque session token; the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    /** The authentication context; a client session never opens the staff interface. */
    principalKind: principalKindEnum("principal_kind").notNull(),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id),
    createdAt: createdAt(),
    expiresAt: instant("expires_at").notNull(),
    lastSeenAt: instant("last_seen_at").notNull().defaultNow(),
    /** Last step-up verification, for sensitive actions. */
    reverifiedAt: instant("reverified_at"),
    revokedAt: instant("revoked_at"),
  },
  (t) => [index("sessions_principal_idx").on(t.principalId)],
);

/** WebAuthn credentials (staff, and optionally clients). */
export const passkeys = pgTable(
  "passkeys",
  {
    id: id(),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id),
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
  (t) => [index("passkeys_principal_idx").on(t.principalId)],
);

/** Single-use WebAuthn challenges; a verified ceremony consumes its challenge. */
export const webauthnChallenges = pgTable(
  "webauthn_challenges",
  {
    id: id(),
    /** Base64url challenge as sent to the authenticator. */
    challenge: text("challenge").notNull().unique(),
    purpose: text("purpose").notNull(),
    /** Set for registration; authentication challenges are not bound to a principal up front. */
    principalId: uuid("principal_id").references(() => principals.id),
    createdAt: createdAt(),
    expiresAt: instant("expires_at").notNull(),
    consumedAt: instant("consumed_at"),
  },
  (t) => [
    check("webauthn_challenges_purpose", sql`${t.purpose} in ('registration', 'authentication')`),
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
    principalKind: principalKindEnum("principal_kind").notNull(),
    /** Bind a link to an immutable account, not an address that may later be reassigned. */
    principalId: uuid("principal_id").references(() => principals.id),
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
 * Invitations (§8.3): recipient-bound, 72 hours, redeemed only by an explicit POST; a reissue
 * revokes the one it replaces. Staff enrolment and recovery carry an emailed single-use token
 * (hash only); a client invitation carries none, because only its signed-in recipient can
 * open or accept it. At most one outcome is ever recorded.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    kind: invitationKindEnum("kind").notNull(),
    /** The recipient. Staff kinds need a staff principal, client_access a client one. */
    principalId: uuid("principal_id")
      .notNull()
      .references(() => principals.id),
    /** Address the invitation was sent to. */
    email: text("email").notNull(),
    tokenHash: text("token_hash").unique(),
    /** staff_enrolment: { roles }; client_access: { caseId, role, capabilities }. */
    scope: jsonb("scope").notNull().default({}),
    /** Null only for the break-glass bootstrap, which is audited as a system action. */
    invitedById: uuid("invited_by_id").references(() => principals.id),
    locale: publicLocaleEnum("locale").notNull().default("bg"),
    createdAt: createdAt(),
    expiresAt: instant("expires_at").notNull(),
    acceptedAt: instant("accepted_at"),
    declinedAt: instant("declined_at"),
    /** Reissued, withdrawn, or superseded by recovery. */
    revokedAt: instant("revoked_at"),
  },
  (t) => [
    check(
      "invitations_one_outcome",
      sql`num_nonnulls(${t.acceptedAt}, ${t.declinedAt}, ${t.revokedAt}) <= 1`,
    ),
    check(
      "invitations_staff_token",
      sql`${t.kind} = 'client_access' or ${t.tokenHash} is not null`,
    ),
    index("invitations_principal_idx").on(t.principalId),
  ],
);
