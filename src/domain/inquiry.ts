// Inquiry receipt, assignment and recovery (architecture §6.1). Received work is owned by the
// coverage queue until a named broker accepts it. Spam, duplicate and unreachable-contact
// findings are explicit review states, never silent deletion.
import type { Actor, Capability } from "./capabilities";
import { allowed, type Decision, defineMachine, denied, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const inquiryStates = [
  "received",
  "assigned",
  "awaiting_client",
  "linked_to_case",
  "resolved_without_case",
  "suspected_spam",
  "duplicate_candidate",
  "contact_unreachable",
] as const;
export type InquiryState = (typeof inquiryStates)[number];

export const inquiryPurposes = [
  "question",
  "callback",
  "viewing_request",
  "seller_consultation",
  "landlord_consultation",
  "service_consultation",
] as const;
export type InquiryPurpose = (typeof inquiryPurposes)[number];

export const inquiryMachine = defineMachine<InquiryState>(inquiryStates, {
  received: ["assigned", "suspected_spam", "duplicate_candidate"],
  assigned: [
    "awaiting_client",
    "linked_to_case",
    "resolved_without_case",
    "suspected_spam",
    "duplicate_candidate",
    "contact_unreachable",
  ],
  awaiting_client: ["assigned", "linked_to_case", "resolved_without_case", "contact_unreachable"],
  // Review states return to a human decision; none of them deletes the request.
  suspected_spam: ["assigned", "resolved_without_case"],
  duplicate_candidate: ["assigned", "linked_to_case", "resolved_without_case"],
  contact_unreachable: ["assigned", "resolved_without_case"],
  linked_to_case: [],
  resolved_without_case: [],
});

export interface InquiryEvidence {
  /** Named broker who accepted the work, or the coverage queue that still owns it. */
  readonly ownerId?: string;
  readonly coverageQueue?: string;
  /** The message that asked the client a specific question. */
  readonly questionMessageId?: string;
  /** ISO 8601 follow-up instant agreed for awaiting the client. */
  readonly followUpAt?: string;
  readonly caseId?: string;
  readonly duplicateOfInquiryId?: string;
  readonly reason?: string;
  /** Tasks or promises still open for this inquiry. */
  readonly openCommitments?: number;
}

export function guardInquiryTransition(
  from: InquiryState,
  to: InquiryState,
  evidence: InquiryEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "assigned":
      return need(evidence.ownerId || evidence.coverageQueue, "owner_required");
    case "awaiting_client":
      return firstDenial(
        need(evidence.questionMessageId, "question_message_required"),
        need(evidence.followUpAt, "follow_up_required"),
      );
    case "linked_to_case":
      return firstDenial(
        need(evidence.caseId, "case_required"),
        // Folding a duplicate into an existing case is a human decision.
        from === "duplicate_candidate" ? need(actor.kind === "staff", "human_required") : allowed,
      );
    case "resolved_without_case":
      return firstDenial(
        need(evidence.reason, "reason_required"),
        (evidence.openCommitments ?? 0) > 0 ? denied("open_commitments") : allowed,
        from === "duplicate_candidate"
          ? firstDenial(
              need(actor.kind === "staff", "human_required"),
              need(evidence.duplicateOfInquiryId, "duplicate_of_required"),
            )
          : allowed,
        from === "suspected_spam" ? need(actor.kind === "staff", "human_required") : allowed,
      );
    case "duplicate_candidate":
      return need(evidence.duplicateOfInquiryId, "duplicate_of_required");
    case "suspected_spam":
    case "contact_unreachable":
      return need(evidence.reason, "reason_required");
    default:
      return allowed;
  }
}

const capabilityByTarget: Partial<Record<InquiryState, Capability>> = {
  assigned: "inquiry.assign",
  suspected_spam: "inquiry.assign",
  duplicate_candidate: "inquiry.assign",
};

export const inquiryTransitions: TransitionSpec<InquiryState, InquiryEvidence> = {
  recordType: "inquiry",
  machine: inquiryMachine,
  capabilityFor: (_from, to) => capabilityByTarget[to] ?? "inquiry.respond",
  guard: guardInquiryTransition,
};
