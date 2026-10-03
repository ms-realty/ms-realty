// A Listing's independent lifecycle dimensions (architecture §7.1): commercial availability,
// editorial review and freshness. Locale, publication and destination delivery live in
// localized-revision.ts and publication.ts. Publication never establishes availability.
import type { Actor } from "./capabilities";
import type { ListingPurpose } from "./facts";
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

// Commercial availability.

export const commercialStates = [
  "available",
  "confirmation_required",
  "negotiating",
  "reserved_with_recorded_basis",
  "sold",
  "let",
  "withdrawn",
] as const;
export type CommercialState = (typeof commercialStates)[number];

export const commercialMachine = defineMachine<CommercialState>(commercialStates, {
  available: [
    "confirmation_required",
    "negotiating",
    "reserved_with_recorded_basis",
    "sold",
    "let",
    "withdrawn",
  ],
  confirmation_required: [
    "available",
    "negotiating",
    "reserved_with_recorded_basis",
    "sold",
    "let",
    "withdrawn",
  ],
  negotiating: [
    "available",
    "confirmation_required",
    "reserved_with_recorded_basis",
    "sold",
    "let",
    "withdrawn",
  ],
  reserved_with_recorded_basis: [
    "available",
    "confirmation_required",
    "negotiating",
    "sold",
    "let",
    "withdrawn",
  ],
  // A re-offered property must be reconfirmed before it reads as available again.
  let: ["confirmation_required"],
  withdrawn: ["confirmation_required"],
  sold: [],
});

export interface CommercialEvidence {
  readonly purpose: ListingPurpose;
  readonly reason?: string;
  /** The recorded basis of a reservation, e.g. a signed preliminary agreement. */
  readonly reservationBasis?: string;
  readonly evidenceIds?: readonly string[];
}

export function guardCommercialTransition(
  _from: CommercialState,
  to: CommercialState,
  evidence: CommercialEvidence,
  actor: Actor,
): Decision {
  const base = need(evidence.reason, "reason_required");
  switch (to) {
    case "available":
      // A timer or an import cannot prove continued availability.
      return firstDenial(base, need(actor.kind === "staff", "human_required"));
    case "reserved_with_recorded_basis":
      return firstDenial(base, need(evidence.reservationBasis, "reservation_basis_required"));
    case "sold":
      return firstDenial(
        base,
        need(evidence.purpose === "sale", "purpose_mismatch"),
        need(evidence.evidenceIds?.length, "evidence_required"),
      );
    case "let":
      return firstDenial(
        base,
        need(evidence.purpose === "long_term_rent", "purpose_mismatch"),
        need(evidence.evidenceIds?.length, "evidence_required"),
      );
    default:
      return base;
  }
}

export const commercialTransitions: TransitionSpec<CommercialState, CommercialEvidence> = {
  recordType: "listing",
  machine: commercialMachine,
  capabilityFor: () => "listing.edit",
  guard: guardCommercialTransition,
};

// Editorial. Draft edits never alter an already approved revision: approval binds one
// immutable ListingRevision, and a new draft starts a new candidate.

export const editorialStates = [
  "draft",
  "needs_facts",
  "in_review",
  "approved_revision",
  "changes_requested",
] as const;
export type EditorialState = (typeof editorialStates)[number];

export const editorialMachine = defineMachine<EditorialState>(editorialStates, {
  draft: ["needs_facts", "in_review"],
  needs_facts: ["draft", "in_review"],
  in_review: ["approved_revision", "changes_requested", "needs_facts"],
  changes_requested: ["draft", "in_review"],
  approved_revision: ["draft"],
});

export interface EditorialEvidence {
  /** The immutable ListingRevision submitted for review. */
  readonly revisionId?: string;
  readonly missingRequiredFacts?: number;
  /** A valid editorial approval bound to that revision's digest. */
  readonly approvalValid?: boolean;
  readonly reason?: string;
}

export function guardEditorialTransition(
  _from: EditorialState,
  to: EditorialState,
  evidence: EditorialEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "in_review":
      return firstDenial(
        need(evidence.revisionId, "revision_required"),
        need((evidence.missingRequiredFacts ?? 0) === 0, "required_facts_missing"),
      );
    case "approved_revision":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.revisionId, "revision_required"),
        need(evidence.approvalValid, "approval_required"),
      );
    case "changes_requested":
      return need(evidence.reason, "reason_required");
    default:
      return allowed;
  }
}

export const editorialTransitions: TransitionSpec<EditorialState, EditorialEvidence> = {
  recordType: "listing",
  machine: editorialMachine,
  capabilityFor: (_from, to) =>
    to === "approved_revision" || to === "changes_requested"
      ? "listing.review_facts"
      : "listing.edit",
  guard: guardEditorialTransition,
};

// Freshness. A timer creates review work; it cannot verify availability.

export const freshnessStates = [
  "current_under_policy",
  "review_due",
  "conflicting",
  "unknown",
] as const;
export type FreshnessState = (typeof freshnessStates)[number];

/**
 * Default availability-review intervals (architecture §7.1): conservative operational
 * defaults, not market facts. The agency may shorten them in its service policy.
 */
export const availabilityReviewIntervalDays: Readonly<Record<ListingPurpose, number>> = {
  sale: 14,
  long_term_rent: 7,
};

const dayMs = 86_400_000;

export interface FreshnessInput {
  readonly purpose: ListingPurpose;
  /** ISO 8601 instant of the last human availability confirmation; absent when never. */
  readonly lastConfirmedAt?: string;
  /** A known conflicting price, rights issue or withdrawal claim is recorded. */
  readonly conflicting?: boolean;
  readonly now: string;
  readonly intervalDays?: number;
}

/** Freshness under policy, and when the next review falls due. */
export function assessFreshness(input: FreshnessInput): {
  state: FreshnessState;
  reviewDueAt: string | null;
} {
  if (!input.lastConfirmedAt) {
    return { state: input.conflicting ? "conflicting" : "unknown", reviewDueAt: null };
  }
  const days = input.intervalDays ?? availabilityReviewIntervalDays[input.purpose];
  const due = Date.parse(input.lastConfirmedAt) + days * dayMs;
  const reviewDueAt = new Date(due).toISOString();
  if (input.conflicting) return { state: "conflicting", reviewDueAt };
  return {
    state: Date.parse(input.now) >= due ? "review_due" : "current_under_policy",
    reviewDueAt,
  };
}

/**
 * The availability a visitor sees: an expired or unknown confirmation reads as confirmation
 * required, never as a fresh "available".
 */
export function presentedAvailability(
  commercial: CommercialState,
  freshness: FreshnessState,
): CommercialState {
  if (commercial === "available" && freshness !== "current_under_policy") {
    return "confirmation_required";
  }
  return commercial;
}
