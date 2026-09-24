// Inquiry pipeline (spec §07.1, F18). "New" is not a stage: received work must be owned.
import type { Capability } from "./capabilities";
import { allowed, type Decision, defineMachine, denied, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const inquiryStates = [
  "received",
  "assigned",
  "awaiting_client",
  "ready_for_case",
  "case_linked",
  "resolved_without_case",
  "suspected_duplicate",
  "discarded",
] as const;
export type InquiryState = (typeof inquiryStates)[number];

export const inquiryPurposes = [
  "question",
  "callback",
  "viewing_help",
  "selling_letting",
  "other_service",
] as const;
export type InquiryPurpose = (typeof inquiryPurposes)[number];

export const inquiryMachine = defineMachine<InquiryState>(inquiryStates, {
  received: ["assigned", "suspected_duplicate"],
  assigned: [
    "awaiting_client",
    "ready_for_case",
    "case_linked",
    "resolved_without_case",
    "suspected_duplicate",
  ],
  awaiting_client: ["assigned", "ready_for_case", "resolved_without_case"],
  ready_for_case: ["case_linked", "awaiting_client", "resolved_without_case"],
  suspected_duplicate: ["assigned", "case_linked", "discarded"],
  case_linked: [],
  resolved_without_case: [],
  discarded: [],
});

export interface InquiryEvidence {
  /** Staff owner, or a named coverage queue with a responsible duty role. */
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
  _from: InquiryState,
  to: InquiryState,
  evidence: InquiryEvidence,
): Decision {
  switch (to) {
    case "assigned":
      return need(evidence.ownerId || evidence.coverageQueue, "owner_required");
    case "awaiting_client":
      return firstDenial(
        need(evidence.questionMessageId, "question_message_required"),
        need(evidence.followUpAt, "follow_up_required"),
      );
    case "case_linked":
      return need(evidence.caseId, "case_required");
    case "resolved_without_case":
      // A44: resolving must not drop a promise already made.
      return firstDenial(
        need(evidence.reason, "reason_required"),
        (evidence.openCommitments ?? 0) > 0 ? denied("open_commitments") : undefined,
      );
    case "suspected_duplicate":
      return need(evidence.duplicateOfInquiryId || evidence.reason, "duplicate_evidence_required");
    case "discarded":
      return need(evidence.reason, "reason_required");
    default:
      return allowed;
  }
}

const capabilityByTarget: Partial<Record<InquiryState, Capability>> = {
  assigned: "inquiry.assign",
  suspected_duplicate: "inquiry.assign",
  discarded: "inquiry.assign",
};

export const inquiryTransitions: TransitionSpec<InquiryState, InquiryEvidence> = {
  recordType: "inquiry",
  machine: inquiryMachine,
  capabilityFor: (_from, to) => capabilityByTarget[to] ?? "inquiry.respond",
  guard: (from, to, evidence) => guardInquiryTransition(from, to, evidence),
};
