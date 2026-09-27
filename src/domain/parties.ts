// Parties, contact methods and participation (architecture §4.1, §6.3, §8.2). Contact
// verification, consent and authority to act are separate facts; none is a sign-in permission.

export const partyKinds = ["person", "organization"] as const;
export type PartyKind = (typeof partyKinds)[number];

export const contactMethodKinds = ["email", "phone", "whatsapp", "viber", "postal"] as const;
export type ContactMethodKind = (typeof contactMethodKinds)[number];

/** Verification proves control of a channel, not identity, ownership or authority. */
export const contactVerificationStates = ["unverified", "pending", "verified", "failed"] as const;
export type ContactVerificationState = (typeof contactVerificationStates)[number];

/**
 * Explicitly scoped roles a party holds in a Case (CaseParticipant) or towards a Property.
 * Letting uses tenant/landlord labels on the same foundation as buying and selling.
 */
export const participantRoles = [
  "buyer",
  "co_buyer",
  "tenant",
  "seller",
  "landlord",
  "authorized_representative",
  "adviser",
  "collaborator",
  "specialist",
  "guest",
] as const;
export type ParticipantRole = (typeof participantRoles)[number];

/** Self-declared authority is never presented as reviewed authority (AT18). */
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

/** Who can see a private item (§8.2). Participation in a Case does not imply every audience. */
export const audiences = ["internal", "case_participants", "specialist", "public"] as const;
export type Audience = (typeof audiences)[number];
