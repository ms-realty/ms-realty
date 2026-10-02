// Interest: the one current relationship between a Case and a Listing (architecture §4.1,
// §6.2). It carries shortlist state, fit explanation, feedback revisions and the listing
// revision it was judged against. Losing one Interest never closes the others or the Case.
import type { Actor, Capability } from "./capabilities";
import { allowed, type Decision, defineMachine, denied, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const interestStates = [
  "suggested",
  "shortlisted",
  "viewing_requested",
  "viewed",
  "proposal",
  "declined",
  "unavailable",
] as const;
export type InterestState = (typeof interestStates)[number];

export const interestMachine = defineMachine<InterestState>(interestStates, {
  suggested: ["shortlisted", "declined", "unavailable"],
  shortlisted: ["viewing_requested", "proposal", "declined", "unavailable"],
  viewing_requested: ["viewed", "shortlisted", "declined", "unavailable"],
  viewed: ["viewing_requested", "proposal", "declined", "unavailable"],
  proposal: ["viewed", "declined", "unavailable"],
  // Reconsidering, or the listing coming back, reopens the same relationship.
  declined: ["shortlisted"],
  unavailable: ["suggested", "shortlisted"],
});

export interface InterestEvidence {
  readonly appointmentId?: string;
  /** The viewing actually took place (a completed Appointment). */
  readonly viewingCompleted?: boolean;
  readonly proposalRevisionId?: string;
  /** Why the client or broker declined; recorded as a feedback revision. */
  readonly reason?: string;
  /** For unavailable: the listing's availability or publication change behind it. */
  readonly listingChange?: string;
}

/** What a client may do through their own Interests; everything else is staff work. */
const clientTargets: readonly InterestState[] = ["shortlisted", "declined"];

export function guardInterestTransition(
  _from: InterestState,
  to: InterestState,
  evidence: InterestEvidence,
  actor: Actor,
): Decision {
  if (actor.kind === "client" && !clientTargets.includes(to)) {
    return denied("staff_required");
  }
  switch (to) {
    case "viewing_requested":
      return need(evidence.appointmentId, "appointment_required");
    case "viewed":
      return firstDenial(
        need(evidence.appointmentId, "appointment_required"),
        need(evidence.viewingCompleted, "viewing_not_completed"),
      );
    case "proposal":
      return need(evidence.proposalRevisionId, "proposal_required");
    case "declined":
      return need(evidence.reason, "reason_required");
    case "unavailable":
      return need(evidence.listingChange, "listing_change_required");
    default:
      return allowed;
  }
}

export const interestTransitions: TransitionSpec<InterestState, InterestEvidence> = {
  recordType: "interest",
  machine: interestMachine,
  capabilityFor: (_from, _to, actor): Capability =>
    actor.kind === "client" ? "portal.interest.respond" : "interest.manage",
  guard: guardInterestTransition,
};

export interface InterestView {
  readonly listingId: string;
  readonly state: InterestState;
  /** Listing revision the fit, feedback or proposal was judged against. */
  readonly listingRevisionId: string | null;
}

/**
 * A new listing revision marks earlier comparison and proposal information stale; it never
 * rewrites what was already agreed.
 */
export function isJudgedAgainstStaleRevision(
  interest: InterestView,
  currentRevisionId: string,
): boolean {
  return interest.listingRevisionId !== null && interest.listingRevisionId !== currentRevisionId;
}
