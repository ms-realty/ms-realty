// Paused and closed are dispositions, not stages (spec §07.2, F20, A48).
import { type Decision, denied, firstDenial, need } from "./state-machine";

// Short stays run through reservations and management through service agreements.
export const caseKinds = ["buyer", "seller", "rental"] as const;
export type CaseKind = (typeof caseKinds)[number];

export interface DispositionEvidence {
  readonly reason?: string;
  /**
   * Obligations that survive the disposition (open tasks, promises, appointments). Must be
   * stated, even as an empty list, so pausing or closing never silently drops them.
   */
  readonly outstandingObligations?: readonly string[];
  /** Optional stage to resume at when leaving a pause. */
  readonly resumeStage?: string;
}

export function guardDisposition(evidence: DispositionEvidence): Decision {
  return firstDenial(
    need(evidence.reason, "reason_required"),
    evidence.outstandingObligations === undefined ? denied("obligations_not_reviewed") : undefined,
  );
}
