// Long-term rental case (spec F26). Rental work has its own stage vocabulary, not the
// buyer/seller pipeline, and never produces automatic eligibility decisions (A60).
import type { Actor } from "./capabilities";
import { type DispositionEvidence, guardDisposition } from "./case-disposition";
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const rentalCaseStages = [
  "requirements_agreed",
  "viewing_arranged",
  "application_review",
  "terms_agreed",
  "tenancy_agreement",
  "handover",
  "tenancy_started",
  "application_declined",
  "paused",
  "closed",
] as const;
export type RentalCaseStage = (typeof rentalCaseStages)[number];

export const rentalCaseMachine = defineMachine<RentalCaseStage>(rentalCaseStages, {
  requirements_agreed: ["viewing_arranged", "paused", "closed"],
  viewing_arranged: ["application_review", "requirements_agreed", "paused", "closed"],
  application_review: ["terms_agreed", "application_declined", "viewing_arranged", "closed"],
  terms_agreed: ["tenancy_agreement", "application_review", "closed"],
  tenancy_agreement: ["handover", "closed"],
  handover: ["tenancy_started", "closed"],
  application_declined: ["viewing_arranged", "closed"],
  paused: ["requirements_agreed", "viewing_arranged", "closed"],
  closed: ["requirements_agreed"],
  tenancy_started: [],
});

export interface RentalCaseEvidence extends DispositionEvidence {
  readonly acknowledgedBriefId?: string;
  readonly responsibleBrokerId?: string;
  readonly appointmentId?: string;
  /** A viewing precedes document collection. */
  readonly viewingCompleted?: boolean;
  /** The proportionate application checklist agreed for this process. */
  readonly applicationChecklistId?: string;
  /** Code from the approved, respectful decline-reason policy. */
  readonly declineReasonCode?: string;
  readonly agreedTermsId?: string;
  readonly agreementDocumentId?: string;
  readonly handoverAppointmentId?: string;
  readonly inventoryRecordId?: string;
  readonly startEvidenceIds?: readonly string[];
}

export function guardRentalCaseTransition(
  from: RentalCaseStage,
  to: RentalCaseStage,
  evidence: RentalCaseEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "requirements_agreed":
      return firstDenial(
        from === "closed" ? need(evidence.reason, "reason_required") : allowed,
        need(evidence.acknowledgedBriefId, "acknowledged_brief_required"),
        need(evidence.responsibleBrokerId, "responsible_broker_required"),
      );
    case "viewing_arranged":
      return need(evidence.appointmentId, "appointment_required");
    case "application_review":
      return firstDenial(
        need(evidence.viewingCompleted, "viewing_required_before_application"),
        need(evidence.applicationChecklistId, "application_checklist_required"),
      );
    case "application_declined":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.declineReasonCode, "decline_reason_required"),
      );
    case "terms_agreed":
      return need(evidence.agreedTermsId, "agreed_terms_required");
    case "tenancy_agreement":
      return need(evidence.agreementDocumentId, "agreement_document_required");
    case "handover":
      return need(evidence.handoverAppointmentId, "handover_appointment_required");
    case "tenancy_started":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.inventoryRecordId, "inventory_record_required"),
        need(evidence.startEvidenceIds?.length, "start_evidence_required"),
      );
    case "paused":
    case "closed":
      return guardDisposition(evidence);
  }
}

export const rentalCaseTransitions: TransitionSpec<RentalCaseStage, RentalCaseEvidence> = {
  recordType: "case",
  machine: rentalCaseMachine,
  capabilityFor: () => "case.transition",
  guard: guardRentalCaseTransition,
};
