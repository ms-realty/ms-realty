// Property-management service requests (spec F28, A63). Every waiting state names its
// dependency; AI may suggest a category but never approves expenditure.
import type { Actor } from "./capabilities";
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const serviceRequestStates = [
  "received",
  "triaged",
  "awaiting_access",
  "awaiting_approval",
  "awaiting_parts",
  "scheduled",
  "work_performed",
  "awaiting_verification",
  "resolved",
  "reopened",
  "cancelled",
] as const;
export type ServiceRequestState = (typeof serviceRequestStates)[number];

export const serviceRequestUrgencies = ["routine", "soon", "urgent"] as const;
export type ServiceRequestUrgency = (typeof serviceRequestUrgencies)[number];

const waitingStates = ["awaiting_access", "awaiting_approval", "awaiting_parts"] as const;

export const serviceRequestMachine = defineMachine<ServiceRequestState>(serviceRequestStates, {
  received: ["triaged", "cancelled"],
  triaged: [...waitingStates, "scheduled", "cancelled"],
  awaiting_access: ["awaiting_approval", "awaiting_parts", "scheduled", "cancelled"],
  awaiting_approval: ["awaiting_access", "awaiting_parts", "scheduled", "cancelled"],
  awaiting_parts: ["awaiting_access", "awaiting_approval", "scheduled", "cancelled"],
  scheduled: ["work_performed", "awaiting_access", "cancelled"],
  work_performed: ["awaiting_verification"],
  awaiting_verification: ["resolved", "reopened"],
  resolved: ["reopened"],
  reopened: ["triaged"],
  cancelled: [],
});

export interface ServiceRequestEvidence {
  readonly responsibleStaffId?: string;
  readonly waitingOn?: string;
  readonly followUpAt?: string;
  /** Estimated cost in minor units; any cost needs spending authority before scheduling. */
  readonly estimatedCostMinor?: number;
  /** Approval id of the owner or agreement authority covering the cost. */
  readonly spendingApprovalId?: string;
  readonly scheduledAt?: string;
  readonly completionEvidenceIds?: readonly string[];
  readonly confirmedBy?: string;
  readonly reason?: string;
}

export function guardServiceRequestTransition(
  _from: ServiceRequestState,
  to: ServiceRequestState,
  evidence: ServiceRequestEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "triaged":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.responsibleStaffId, "responsible_staff_required"),
      );
    case "awaiting_access":
    case "awaiting_approval":
    case "awaiting_parts":
      return firstDenial(
        need(evidence.waitingOn, "dependency_required"),
        need(evidence.followUpAt, "follow_up_required"),
      );
    case "scheduled":
      return firstDenial(
        need(evidence.scheduledAt, "schedule_required"),
        (evidence.estimatedCostMinor ?? 0) > 0
          ? need(evidence.spendingApprovalId, "spending_approval_required")
          : undefined,
      );
    case "work_performed":
      return need(evidence.completionEvidenceIds?.length, "completion_evidence_required");
    case "resolved":
      return need(evidence.confirmedBy, "confirmation_required");
    case "reopened":
    case "cancelled":
      return need(evidence.reason, "reason_required");
    default:
      return allowed;
  }
}

export const serviceRequestTransitions: TransitionSpec<
  ServiceRequestState,
  ServiceRequestEvidence
> = {
  recordType: "service_request",
  machine: serviceRequestMachine,
  capabilityFor: () => "service_request.manage",
  guard: guardServiceRequestTransition,
};

/** Statement line states are distinct amounts, never blurred together (A64). */
export const statementLineStates = ["expected", "invoiced", "paid", "reconciled"] as const;
export type StatementLineState = (typeof statementLineStates)[number];

export const serviceAgreementStates = ["draft", "active", "ended", "cancelled"] as const;
export type ServiceAgreementState = (typeof serviceAgreementStates)[number];
