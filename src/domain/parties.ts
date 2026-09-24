// Parties, contact methods and relationships (spec §04, §03.1, F11, F30).
// Contact verification, consent and authority to act are separate attributes.

export const contactMethodKinds = ["email", "phone", "whatsapp", "viber", "postal"] as const;
export type ContactMethodKind = (typeof contactMethodKinds)[number];

/** Verification proves control of a channel, not identity, ownership or authority. */
export const contactVerificationStates = ["unverified", "pending", "verified", "failed"] as const;
export type ContactVerificationState = (typeof contactVerificationStates)[number];

export const consentPurposes = ["service_updates", "search_alerts", "marketing"] as const;
export type ConsentPurpose = (typeof consentPurposes)[number];

export const consentStates = ["not_asked", "granted", "withdrawn"] as const;
export type ConsentState = (typeof consentStates)[number];

export const partyRelationshipRoles = [
  "buyer",
  "co_buyer",
  "seller",
  "authorized_representative",
  "landlord",
  "tenant",
  "guest",
  "adviser",
  "collaborator",
  "specialist",
] as const;
export type PartyRelationshipRole = (typeof partyRelationshipRoles)[number];

/** Self-declared authority is never presented as reviewed authority (A29). */
export const authorityStates = [
  "not_claimed",
  "self_declared",
  "under_review",
  "reviewed",
  "rejected",
] as const;
export type AuthorityState = (typeof authorityStates)[number];

export function hasReviewedAuthority(state: AuthorityState): boolean {
  return state === "reviewed";
}

export const accountStatuses = ["active", "suspended", "deactivated"] as const;
export type AccountStatus = (typeof accountStatuses)[number];

/** Who can see a private item (§03.1). */
export const audiences = ["internal", "case_participants", "specialist", "public"] as const;
export type Audience = (typeof audiences)[number];
