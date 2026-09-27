// PrivacyRequests (architecture §8.4): owned work with a receipt, a verification step, a
// responsible person, a due condition, scope, legal-hold disposition and recorded completion.
import type { Actor } from "./capabilities";
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const privacyRequestKinds = [
  "access",
  "export",
  "correction",
  "deletion",
  "restriction",
  "objection",
] as const;
export type PrivacyRequestKind = (typeof privacyRequestKinds)[number];

export const privacyRequestStates = [
  "received",
  "verifying",
  "in_progress",
  "on_legal_hold",
  "completed",
  "rejected",
] as const;
export type PrivacyRequestState = (typeof privacyRequestStates)[number];

export const privacyRequestMachine = defineMachine<PrivacyRequestState>(privacyRequestStates, {
  received: ["verifying", "rejected"],
  verifying: ["in_progress", "rejected"],
  in_progress: ["on_legal_hold", "completed", "rejected"],
  on_legal_hold: ["in_progress", "completed"],
  completed: [],
  rejected: [],
});

export interface PrivacyRequestEvidence {
  readonly verifiedAt?: string;
  readonly responsiblePrincipalId?: string;
  readonly legalHoldReason?: string;
  /** What was exported, corrected, deleted or restricted, including derived stores. */
  readonly completionEvidence?: string;
  readonly legalHoldDisposition?: string;
  readonly reason?: string;
}

export function guardPrivacyRequestTransition(
  _from: PrivacyRequestState,
  to: PrivacyRequestState,
  evidence: PrivacyRequestEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "in_progress":
      return firstDenial(
        need(evidence.verifiedAt, "verification_required"),
        need(evidence.responsiblePrincipalId, "responsible_person_required"),
      );
    case "on_legal_hold":
      return need(evidence.legalHoldReason, "legal_hold_reason_required");
    case "completed":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.completionEvidence, "completion_evidence_required"),
        need(evidence.legalHoldDisposition, "legal_hold_disposition_required"),
      );
    case "rejected":
      return need(evidence.reason, "reason_required");
    default:
      return allowed;
  }
}

export const privacyRequestTransitions: TransitionSpec<
  PrivacyRequestState,
  PrivacyRequestEvidence
> = {
  recordType: "privacy_request",
  machine: privacyRequestMachine,
  capabilityFor: () => "privacy.manage",
  guard: guardPrivacyRequestTransition,
};
