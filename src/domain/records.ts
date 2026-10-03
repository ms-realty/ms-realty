// Enumerations for records without a state machine of their own. Kept here so the database
// schema derives its enums from the domain and the two cannot drift.

/** BriefRevision items (architecture §4.1, §6.2). */
export const briefItemKinds = ["hard_constraint", "preference", "unknown", "timing"] as const;
export const briefItemOrigins = ["client_stated", "broker_interpretation"] as const;

/** Where an inquiry came from. */
export const inquirySources = [
  "website",
  "phone",
  "email",
  "messenger",
  "walk_in",
  "import",
] as const;

/** Approved editorial content shares the listing approval and localization rules. */
export const contentPageKinds = ["area", "guide", "service", "team_member", "help"] as const;

/** Legacy URL decisions recorded in data/legacy/url-decisions.json (architecture §18.1). */
export const legacyDomains = ["makler-realty.com", "makler-realty.ru"] as const;
export const legacyUrlDecisions = ["retain_200", "redirect_301", "approved_410"] as const;

/** Staged imports (architecture §13, AT55). */
export const importRowClassifications = [
  "create",
  "update_proposal",
  "no_change",
  "blocked",
  "needs_review",
] as const;
export const importBatchModes = ["dry_run", "apply"] as const;
export const importBatchStates = [
  "staged",
  "validated",
  "applying",
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
] as const;
export const importRowOutcomes = ["pending", "applied", "skipped", "failed"] as const;

/** Reversible identity changes (architecture §13, AT56). */
export const mergeSubjects = ["party", "property"] as const;

/** Geography (architecture §4.2, §10). */
export const placeLevels = [
  "country",
  "district",
  "municipality",
  "settlement",
  "neighborhood",
] as const;
export const placeAliasKinds = ["official", "local", "transliteration", "legacy_spelling"] as const;

/**
 * Authentication contexts. Staff and client identities are separate principals even for the
 * same person; a client-context session never authenticates the staff interface (§8.1).
 */
export const principalKinds = ["staff", "client"] as const;
export const principalStatuses = ["active", "suspended", "deactivated"] as const;
export const staffMembershipStates = ["active", "suspended", "ended"] as const;
export const signInTokenPurposes = ["sign_in", "invitation"] as const;
/**
 * Invitations (§8.3): staff enrolment and audited staff recovery are redeemed with the emailed
 * token; a client invitation is redeemed only by the signed-in recipient.
 */
export const invitationKinds = ["staff_enrolment", "staff_recovery", "client_access"] as const;

/**
 * The issuer of first-party identities (ADR 0002): principals are still keyed by an immutable
 * issuer + subject so an external identity provider can be mapped the same way later.
 */
export const firstPartyIssuers = {
  staff: "urn:ms-realty:identity:staff",
  client: "urn:ms-realty:identity:client",
} as const;
