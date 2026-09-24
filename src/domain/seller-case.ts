// Seller case and property preparation (spec §07.3, F10–F12).
import type { Actor } from "./capabilities";
import { type DispositionEvidence, guardDisposition } from "./case-disposition";
import { type AuthorityState, hasReviewedAuthority } from "./parties";
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const sellerCaseStages = [
  "request_received",
  "scope_authority_confirmed",
  "assessment",
  "instructions_agreed",
  "preparing",
  "marketing",
  "proposal_coordination",
  "completion_handover",
  "paused",
  "closed",
] as const;
export type SellerCaseStage = (typeof sellerCaseStages)[number];

export const sellerCaseMachine = defineMachine<SellerCaseStage>(sellerCaseStages, {
  request_received: ["scope_authority_confirmed", "paused", "closed"],
  scope_authority_confirmed: ["assessment", "paused", "closed"],
  assessment: ["instructions_agreed", "paused", "closed"],
  instructions_agreed: ["preparing", "paused", "closed"],
  preparing: ["marketing", "paused", "closed"],
  // Removing a property from marketing is a recorded instruction, not a silent rewrite.
  marketing: ["proposal_coordination", "preparing", "paused", "closed"],
  proposal_coordination: ["completion_handover", "marketing", "closed"],
  paused: [
    "request_received",
    "scope_authority_confirmed",
    "assessment",
    "instructions_agreed",
    "preparing",
    "marketing",
    "closed",
  ],
  closed: ["request_received"],
  completion_handover: [],
});

export interface SellerCaseEvidence extends DispositionEvidence {
  readonly responsibleBrokerId?: string;
  /** State of the instructing party's authority, from the party relationship. */
  readonly authorityState?: AuthorityState;
  readonly assessmentAppointmentId?: string;
  readonly serviceAgreementId?: string;
  readonly publicationPermissionsRecorded?: boolean;
  readonly preparationTaskIds?: readonly string[];
  /** Owner approval bound to the exact preview version (A31). */
  readonly ownerApprovalId?: string;
  readonly proposalVersionId?: string;
  readonly completionEvidenceIds?: readonly string[];
}

export function guardSellerCaseTransition(
  from: SellerCaseStage,
  to: SellerCaseStage,
  evidence: SellerCaseEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "request_received":
      return from === "closed" ? need(evidence.reason, "reason_required") : allowed;
    case "scope_authority_confirmed":
      // A29: self-declared ownership does not pass the authority gate.
      return firstDenial(
        need(evidence.responsibleBrokerId, "responsible_broker_required"),
        need(
          evidence.authorityState && hasReviewedAuthority(evidence.authorityState),
          "reviewed_authority_required",
        ),
      );
    case "assessment":
      return need(evidence.assessmentAppointmentId, "assessment_arrangement_required");
    case "instructions_agreed":
      return firstDenial(
        need(evidence.serviceAgreementId, "service_agreement_required"),
        need(evidence.publicationPermissionsRecorded, "publication_permissions_required"),
      );
    case "preparing":
      return need(evidence.preparationTaskIds?.length, "preparation_tasks_required");
    case "marketing":
      return need(evidence.ownerApprovalId, "owner_approval_required");
    case "proposal_coordination":
      return need(evidence.proposalVersionId, "proposal_required");
    case "completion_handover":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.completionEvidenceIds?.length, "completion_evidence_required"),
      );
    case "paused":
    case "closed":
      return guardDisposition(evidence);
  }
}

export const sellerCaseTransitions: TransitionSpec<SellerCaseStage, SellerCaseEvidence> = {
  recordType: "case",
  machine: sellerCaseMachine,
  capabilityFor: () => "case.transition",
  guard: guardSellerCaseTransition,
};
