// Documents and evidence (spec §07.5, F15, A37, A38). Uploading, malware scanning, human
// review and professional validation are separate facts; a clean scan proves neither
// authenticity nor legal sufficiency.
import type { Actor } from "./capabilities";
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const documentStates = [
  "selected",
  "uploading",
  "uploaded",
  "scanning",
  "ready_for_review",
  "reviewed",
  "rejected",
  "needs_replacement",
  "expired",
  "superseded",
] as const;
export type DocumentState = (typeof documentStates)[number];

export const scanStates = ["pending", "clean", "infected", "failed"] as const;
export type ScanState = (typeof scanStates)[number];

/** The precise review performed, shown as such in the UI. */
export const documentReviewTypes = [
  "accepted_for_purpose",
  "needs_replacement",
  "reviewed_with_open_questions",
] as const;
export type DocumentReviewType = (typeof documentReviewTypes)[number];

export const professionalValidationStates = [
  "not_requested",
  "requested",
  "validated",
  "declined",
] as const;
export type ProfessionalValidationState = (typeof professionalValidationStates)[number];

export const documentClassifications = [
  "identity",
  "title",
  "financial",
  "contract",
  "property",
  "other",
] as const;
export type DocumentClassification = (typeof documentClassifications)[number];

export const documentMachine = defineMachine<DocumentState>(documentStates, {
  selected: ["uploading"],
  // An interrupted upload returns to selected; it never appears complete.
  uploading: ["uploaded", "selected"],
  uploaded: ["scanning"],
  scanning: ["ready_for_review", "rejected"],
  ready_for_review: ["reviewed", "rejected", "needs_replacement"],
  reviewed: ["needs_replacement", "expired", "superseded"],
  needs_replacement: ["superseded"],
  rejected: ["superseded"],
  expired: ["superseded"],
  superseded: [],
});

export interface DocumentEvidence {
  readonly bytesReceived?: number;
  readonly byteSize?: number;
  readonly sha256?: string;
  readonly scan?: ScanState;
  readonly reviewType?: DocumentReviewType;
  readonly reason?: string;
  readonly replacementVersionId?: string;
}

export function guardDocumentTransition(
  _from: DocumentState,
  to: DocumentState,
  evidence: DocumentEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "uploaded":
      return firstDenial(
        need(
          evidence.byteSize !== undefined && evidence.bytesReceived === evidence.byteSize,
          "upload_incomplete",
        ),
        need(evidence.sha256, "checksum_required"),
      );
    case "ready_for_review":
      return need(evidence.scan === "clean", "scan_not_clean");
    case "reviewed":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.reviewType, "review_type_required"),
      );
    case "rejected":
    case "needs_replacement":
      return need(evidence.reason, "reason_required");
    case "superseded":
      return need(evidence.replacementVersionId, "replacement_required");
    default:
      return allowed;
  }
}

export const documentTransitions: TransitionSpec<DocumentState, DocumentEvidence> = {
  recordType: "document",
  machine: documentMachine,
  capabilityFor: (_from, to) =>
    to === "reviewed" || to === "rejected" || to === "needs_replacement" || to === "expired"
      ? "document.review"
      : "portal.document.upload",
  guard: guardDocumentTransition,
};

/** Only scanned-clean content may be exposed to its audience (A38). */
export function isDocumentExposable(state: DocumentState, scan: ScanState): boolean {
  return scan === "clean" && (state === "ready_for_review" || state === "reviewed");
}
