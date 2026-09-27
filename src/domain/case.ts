// Cases (architecture §6.2, §6.3, §6.6, §3.2). A Case is one agency outcome. Its stage follows
// the pipeline of its kind; its disposition (active, paused, closed) is a separate dimension.
// Letting uses the buying/selling foundation with tenant/landlord labels. Short-stay and
// management consultations are bounded service intake with no booking or statement data.
import type { Actor, Capability } from "./capabilities";
import {
  allowed,
  type Decision,
  defineMachine,
  denied,
  firstDenial,
  type Machine,
  need,
} from "./state-machine";
import type { TransitionSpec } from "./transition";

export const caseKinds = ["buyer", "tenant", "seller", "landlord", "service_intake"] as const;
export type CaseKind = (typeof caseKinds)[number];

/** Which labels a kind uses; tenant and landlord share the buyer and seller pipelines. */
export const caseVocabulary: Readonly<Record<CaseKind, "sale" | "letting" | "service">> = {
  buyer: "sale",
  seller: "sale",
  tenant: "letting",
  landlord: "letting",
  service_intake: "service",
};

/** What a service-intake Case is about: a consultation request, never a reservation. */
export const serviceIntakeTopics = ["short_stay_consultation", "management_consultation"] as const;
export type ServiceIntakeTopic = (typeof serviceIntakeTopics)[number];

// Buyer / tenant.

export const demandStages = [
  "needs_agreed",
  "evaluating",
  "viewing",
  "proposal_preparation",
  "proposal_active",
  "coordination",
  "completed",
] as const;
export type DemandStage = (typeof demandStages)[number];

export const demandMachine = defineMachine<DemandStage>(demandStages, {
  needs_agreed: ["evaluating"],
  // Moving back to evaluating never loses the Case's Interests.
  evaluating: ["viewing", "needs_agreed"],
  viewing: ["evaluating", "proposal_preparation"],
  proposal_preparation: ["proposal_active", "viewing", "evaluating"],
  proposal_active: ["coordination", "proposal_preparation", "evaluating"],
  coordination: ["completed", "evaluating"],
  completed: [],
});

// Seller / landlord.

export const supplyStages = [
  "request_received",
  "scope_authority_review",
  "assessment",
  "instructions_agreed",
  "preparing",
  "marketing",
  "proposal_coordination",
  "completion_handover",
] as const;
export type SupplyStage = (typeof supplyStages)[number];

export const supplyMachine = defineMachine<SupplyStage>(supplyStages, {
  request_received: ["scope_authority_review"],
  scope_authority_review: ["assessment"],
  assessment: ["instructions_agreed", "scope_authority_review"],
  instructions_agreed: ["preparing"],
  // Preparing holds parallel fact, media, disclosure, price and copy work; changed
  // instructions go back through agreement without restarting finished work.
  preparing: ["marketing", "instructions_agreed"],
  marketing: ["proposal_coordination", "preparing"],
  proposal_coordination: ["completion_handover", "marketing"],
  completion_handover: [],
});

// Service intake.

export const serviceIntakeStages = ["request_received", "consultation", "concluded"] as const;
export type ServiceIntakeStage = (typeof serviceIntakeStages)[number];

export const serviceIntakeMachine = defineMachine<ServiceIntakeStage>(serviceIntakeStages, {
  request_received: ["consultation", "concluded"],
  consultation: ["concluded"],
  concluded: [],
});

export type CaseStage = DemandStage | SupplyStage | ServiceIntakeStage;

export const stagesByKind: Readonly<Record<CaseKind, readonly CaseStage[]>> = {
  buyer: demandStages,
  tenant: demandStages,
  seller: supplyStages,
  landlord: supplyStages,
  service_intake: serviceIntakeStages,
};

export const initialStage: Readonly<Record<CaseKind, CaseStage>> = {
  buyer: "needs_agreed",
  tenant: "needs_agreed",
  seller: "request_received",
  landlord: "request_received",
  service_intake: "request_received",
};

export interface StageEvidence {
  readonly responsibleBrokerId?: string;
  /** BriefRevision the client acknowledged. */
  readonly acknowledgedBriefRevisionId?: string;
  readonly reviewedInterestCount?: number;
  readonly sourcingTaskId?: string;
  readonly appointmentId?: string;
  readonly clientRequestedProposal?: boolean;
  readonly submittedProposalRevisionId?: string;
  /** A ProposalRevision recorded as agreed_for_next_step; never a completed sale. */
  readonly agreedProposalRevisionId?: string;
  /** Authority of the instructing party, as reviewed on its participation (AT18). */
  readonly authorityReviewed?: boolean;
  readonly assessmentAppointmentId?: string;
  /** Agreed SellerInstruction with representation scope and publication permission. */
  readonly sellerInstructionId?: string;
  readonly preparationTaskIds?: readonly string[];
  /** Owner acknowledgment of the exact listing preview. */
  readonly previewAcknowledgmentId?: string;
  readonly completionEvidenceIds?: readonly string[];
  /** Every remaining obligation, stated even when empty, so nothing is silently dropped. */
  readonly remainingObligations?: readonly string[];
  readonly outcomeNote?: string;
  readonly reason?: string;
}

function completion(evidence: StageEvidence, actor: Actor): Decision {
  // A recorded human outcome; it asserts no legal completion (AT35).
  return firstDenial(
    need(actor.kind === "staff", "human_required"),
    need(evidence.completionEvidenceIds?.length, "completion_evidence_required"),
    need(evidence.remainingObligations !== undefined, "obligations_not_reviewed"),
  );
}

export function guardDemandStage(
  from: DemandStage,
  to: DemandStage,
  evidence: StageEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "needs_agreed":
      return need(evidence.acknowledgedBriefRevisionId, "acknowledged_brief_required");
    case "evaluating":
      return from === "needs_agreed"
        ? firstDenial(
            need(evidence.acknowledgedBriefRevisionId, "acknowledged_brief_required"),
            need(evidence.responsibleBrokerId, "responsible_broker_required"),
            need(
              (evidence.reviewedInterestCount ?? 0) > 0 || evidence.sourcingTaskId,
              "interest_or_sourcing_task_required",
            ),
          )
        : need(evidence.reason, "reason_required");
    case "viewing":
      return need(evidence.appointmentId, "appointment_required");
    case "proposal_preparation":
      return need(evidence.clientRequestedProposal, "client_request_required");
    case "proposal_active":
      return need(evidence.submittedProposalRevisionId, "submitted_proposal_required");
    case "coordination":
      return need(evidence.agreedProposalRevisionId, "agreed_proposal_required");
    case "completed":
      return completion(evidence, actor);
  }
}

export function guardSupplyStage(
  _from: SupplyStage,
  to: SupplyStage,
  evidence: StageEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "request_received":
      return allowed;
    case "scope_authority_review":
      return need(evidence.responsibleBrokerId, "responsible_broker_required");
    case "assessment":
      // Intake records a self-declared relationship; it never establishes authority (AT18).
      return need(evidence.authorityReviewed, "reviewed_authority_required");
    case "instructions_agreed":
      return need(evidence.sellerInstructionId, "seller_instruction_required");
    case "preparing":
      return need(evidence.preparationTaskIds?.length, "preparation_tasks_required");
    case "marketing":
      return need(evidence.previewAcknowledgmentId, "preview_acknowledgment_required");
    case "proposal_coordination":
      return need(evidence.submittedProposalRevisionId, "proposal_required");
    case "completion_handover":
      return completion(evidence, actor);
  }
}

export function guardServiceIntakeStage(
  _from: ServiceIntakeStage,
  to: ServiceIntakeStage,
  evidence: StageEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "request_received":
      return allowed;
    case "consultation":
      return need(evidence.responsibleBrokerId, "responsible_broker_required");
    case "concluded":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.outcomeNote, "outcome_required"),
      );
  }
}

const stageCapability = (): Capability => "case.transition";

/** The stage transition contract for one Case kind. */
export function caseStageTransitions(kind: CaseKind): TransitionSpec<CaseStage, StageEvidence> {
  const [machine, guard] = stageRules(kind);
  return { recordType: "case", machine, capabilityFor: stageCapability, guard };
}

function stageRules(
  kind: CaseKind,
): [Machine<CaseStage>, TransitionSpec<CaseStage, StageEvidence>["guard"]] {
  if (kind === "buyer" || kind === "tenant") {
    return [
      demandMachine as unknown as Machine<CaseStage>,
      (from, to, evidence, actor) =>
        guardDemandStage(from as DemandStage, to as DemandStage, evidence, actor),
    ];
  }
  if (kind === "seller" || kind === "landlord") {
    return [
      supplyMachine as unknown as Machine<CaseStage>,
      (from, to, evidence, actor) =>
        guardSupplyStage(from as SupplyStage, to as SupplyStage, evidence, actor),
    ];
  }
  return [
    serviceIntakeMachine as unknown as Machine<CaseStage>,
    (from, to, evidence, actor) =>
      guardServiceIntakeStage(
        from as ServiceIntakeStage,
        to as ServiceIntakeStage,
        evidence,
        actor,
      ),
  ];
}

// Disposition.

export const caseDispositions = ["active", "paused", "closed"] as const;
export type CaseDisposition = (typeof caseDispositions)[number];

export const dispositionMachine = defineMachine<CaseDisposition>(caseDispositions, {
  active: ["paused", "closed"],
  paused: ["active", "closed"],
  // Reopening is a new recorded event; the closeout stays in history.
  closed: ["active"],
});

export interface DispositionEvidence {
  readonly reason?: string;
  /** What the pause waits for, and when it is reviewed. */
  readonly waitingOn?: string;
  readonly reviewAt?: string;
  /** Closure outcome, recorded by a person. */
  readonly outcome?: string;
  /** Every open commitment of the Case, and the disposition recorded for each. */
  readonly openCommitmentIds?: readonly string[];
  readonly commitmentDispositions?: Readonly<Record<string, string>>;
}

export function guardDisposition(
  from: CaseDisposition,
  to: CaseDisposition,
  evidence: DispositionEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "paused":
      return firstDenial(
        need(evidence.reason, "reason_required"),
        need(evidence.waitingOn, "dependency_required"),
        need(evidence.reviewAt, "review_date_required"),
      );
    case "closed": {
      if (evidence.openCommitmentIds === undefined) return denied("obligations_not_reviewed");
      const undecided = evidence.openCommitmentIds.filter(
        (id) => !evidence.commitmentDispositions?.[id]?.trim(),
      );
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.outcome, "outcome_required"),
        undecided.length > 0 ? denied("commitment_disposition_required") : allowed,
      );
    }
    case "active":
      return from === "closed" ? need(evidence.reason, "reason_required") : allowed;
  }
}

export const dispositionTransitions: TransitionSpec<CaseDisposition, DispositionEvidence> = {
  recordType: "case",
  machine: dispositionMachine,
  capabilityFor: stageCapability,
  guard: guardDisposition,
};

export interface CaseOwnership {
  readonly disposition: CaseDisposition;
  readonly ownerId: string | null;
  readonly nextAction: string | null;
  readonly waitingOn: string | null;
  readonly reviewAt: string | null;
}

/**
 * Every active Case has one accountable broker and a next action or an explicit waiting
 * dependency with a review date (§6.6).
 */
export function isAccountablyOwned(c: CaseOwnership): boolean {
  if (c.disposition !== "active") return true;
  return Boolean(c.ownerId) && (Boolean(c.nextAction) || Boolean(c.waitingOn && c.reviewAt));
}
