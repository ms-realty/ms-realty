// Proposals (spec §07.6, F16, A39, A40). Changing amount, conditions, parties or deadline
// invalidates prior approval; a counterproposal is a new version.
import { canonicalJson } from "./approval";
import type { Actor } from "./capabilities";
import type { CurrencyCode } from "./ids";
import { allowed, type Decision, defineMachine, denied, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const proposalStates = [
  "draft",
  "reviewed",
  "submitted",
  "awaiting_response",
  "countered",
  "declined",
  "withdrawn",
  "expired",
  "agreed_for_next_step",
] as const;
export type ProposalState = (typeof proposalStates)[number];

export const proposalMachine = defineMachine<ProposalState>(proposalStates, {
  draft: ["reviewed", "withdrawn"],
  reviewed: ["draft", "submitted", "withdrawn"],
  submitted: ["awaiting_response", "withdrawn"],
  awaiting_response: ["countered", "declined", "withdrawn", "expired", "agreed_for_next_step"],
  // Terminal for this version; a counterproposal continues as a new version.
  countered: [],
  declined: [],
  withdrawn: [],
  expired: [],
  // Never "property purchased": legal completion is a separate, jurisdiction-approved step.
  agreed_for_next_step: [],
});

export interface ProposalTerms {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly paymentBasis: string;
  readonly conditions: readonly string[];
  readonly inclusions: readonly string[];
  readonly partyIds: readonly string[];
  /** ISO 8601 instant and the controlling timezone. */
  readonly deadlineAt: string;
  readonly deadlineTimezone: string;
}

/** Fields whose change invalidates any approval of the terms. */
export const materialProposalFields = [
  "amountMinor",
  "currency",
  "conditions",
  "partyIds",
  "deadlineAt",
  "deadlineTimezone",
] as const satisfies readonly (keyof ProposalTerms)[];

export function materialChanges(previous: ProposalTerms, next: ProposalTerms): string[] {
  return materialProposalFields.filter(
    (field) => canonicalJson(previous[field]) !== canonicalJson(next[field]),
  );
}

/** Canonical content the approval hash is computed from. */
export function proposalApprovalContent(terms: ProposalTerms): string {
  return canonicalJson(Object.fromEntries(materialProposalFields.map((f) => [f, terms[f]])));
}

export interface ProposalEvidence {
  /** Canonical content of the version now (proposalApprovalContent). */
  readonly currentContent?: string;
  /** Canonical content the approval was bound to. */
  readonly approvedContent?: string;
  /** True when a newer version of this proposal exists. */
  readonly superseded?: boolean;
  readonly deadlineAt?: string;
  /** ISO 8601 instant of the action. */
  readonly now?: string;
  readonly responseRecordId?: string;
  readonly reason?: string;
}

/** A client submits their own approved proposal or responds to one (F16); the rest is staff work. */
const clientProposalTargets: readonly ProposalState[] = [
  "submitted",
  "countered",
  "declined",
  "agreed_for_next_step",
];

export function guardProposalTransition(
  from: ProposalState,
  to: ProposalState,
  evidence: ProposalEvidence,
  actor: Actor,
): Decision {
  if (actor.kind === "client" && !clientProposalTargets.includes(to)) {
    return denied("staff_required");
  }
  const stale = firstDenial(
    need(!evidence.superseded, "proposal_superseded"),
    // An expired proposal can only be recorded as expired.
    to !== "expired" && to !== "withdrawn" && evidence.deadlineAt && evidence.now
      ? need(Date.parse(evidence.now) < Date.parse(evidence.deadlineAt), "proposal_expired")
      : undefined,
  );
  if (stale.outcome === "denied") return stale;
  switch (to) {
    case "reviewed":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.currentContent, "content_required"),
      );
    case "submitted":
      return firstDenial(
        need(actor.kind === "staff" || actor.kind === "client", "human_required"),
        need(
          evidence.approvedContent && evidence.approvedContent === evidence.currentContent,
          "approval_invalidated_by_change",
        ),
      );
    case "countered":
    case "declined":
    case "agreed_for_next_step":
      return need(evidence.responseRecordId, "response_record_required");
    case "expired":
      return need(
        evidence.deadlineAt &&
          evidence.now &&
          Date.parse(evidence.now) >= Date.parse(evidence.deadlineAt),
        "deadline_not_passed",
      );
    case "withdrawn":
      return need(evidence.reason, "reason_required");
    default:
      return from === "reviewed" ? need(evidence.reason, "reason_required") : allowed;
  }
}

export const proposalTransitions: TransitionSpec<ProposalState, ProposalEvidence> = {
  recordType: "proposal",
  machine: proposalMachine,
  capabilityFor: (_from, _to, actor) =>
    actor.kind === "client" ? "portal.proposal.respond" : "proposal.manage",
  guard: guardProposalTransition,
};
