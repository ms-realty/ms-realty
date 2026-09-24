// Buyer case pipeline (spec §07.2, F20).
import type { Actor } from "./capabilities";
import { type DispositionEvidence, guardDisposition } from "./case-disposition";
import { type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const buyerCaseStages = [
  "needs_agreed",
  "evaluating",
  "viewing",
  "proposal_preparation",
  "proposal_active",
  "coordination",
  "completed",
  "failed",
  "on_hold",
  "paused",
  "closed",
] as const;
export type BuyerCaseStage = (typeof buyerCaseStages)[number];

export const buyerCaseMachine = defineMachine<BuyerCaseStage>(buyerCaseStages, {
  needs_agreed: ["evaluating", "paused", "closed"],
  evaluating: ["viewing", "needs_agreed", "paused", "closed"],
  viewing: ["evaluating", "proposal_preparation", "paused", "closed"],
  proposal_preparation: ["proposal_active", "evaluating", "closed"],
  proposal_active: ["coordination", "proposal_preparation", "evaluating", "closed"],
  coordination: ["completed", "failed", "on_hold"],
  on_hold: ["coordination", "failed", "closed"],
  // One property's failed proposal need not close the buyer's case.
  failed: ["evaluating", "closed"],
  paused: ["needs_agreed", "evaluating", "viewing", "proposal_preparation", "closed"],
  // Reopening is a new recorded event; the closeout stays in history.
  closed: ["needs_agreed"],
  // A new need becomes a new linked service, never a silent reopening.
  completed: [],
});

export interface BuyerCaseEvidence extends DispositionEvidence {
  readonly acknowledgedBriefId?: string;
  readonly responsibleBrokerId?: string;
  readonly contactRoute?: string;
  readonly reviewedOptionCount?: number;
  readonly sourcingTaskId?: string;
  readonly appointmentId?: string;
  readonly clientRequestedProposal?: boolean;
  readonly submittedProposalVersionId?: string;
  readonly partiesIntendToProceed?: boolean;
  readonly supportingEvidenceIds?: readonly string[];
  readonly completionEvidenceIds?: readonly string[];
}

export function guardBuyerCaseTransition(
  from: BuyerCaseStage,
  to: BuyerCaseStage,
  evidence: BuyerCaseEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "needs_agreed":
      return firstDenial(
        from === "closed" ? need(evidence.reason, "reason_required") : undefined,
        need(evidence.acknowledgedBriefId, "acknowledged_brief_required"),
        need(evidence.responsibleBrokerId, "responsible_broker_required"),
        need(evidence.contactRoute, "contact_route_required"),
      );
    case "evaluating":
      return need(
        (evidence.reviewedOptionCount ?? 0) > 0 || evidence.sourcingTaskId,
        "reviewed_option_or_sourcing_task_required",
      );
    case "viewing":
      return need(evidence.appointmentId, "appointment_required");
    case "proposal_preparation":
      return need(evidence.clientRequestedProposal, "client_request_required");
    case "proposal_active":
      return need(evidence.submittedProposalVersionId, "submitted_proposal_required");
    case "coordination":
      return firstDenial(
        need(evidence.partiesIntendToProceed, "parties_intent_required"),
        need(evidence.supportingEvidenceIds?.length, "supporting_evidence_required"),
      );
    case "completed":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.completionEvidenceIds?.length, "completion_evidence_required"),
      );
    case "failed":
    case "on_hold":
      return need(evidence.reason, "reason_required");
    case "paused":
    case "closed":
      return guardDisposition(evidence);
  }
}

export const buyerCaseTransitions: TransitionSpec<BuyerCaseStage, BuyerCaseEvidence> = {
  recordType: "case",
  machine: buyerCaseMachine,
  capabilityFor: () => "case.transition",
  guard: guardBuyerCaseTransition,
};
