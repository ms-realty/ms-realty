// Messages and their delivery attempts (architecture §9). Provider acceptance is not delivery,
// an unknown outcome is reconciled before any retry, and one logical send keeps one identity
// bound to one exact payload.
import type { Actor } from "./capabilities";
import { allowed, type Decision, defineMachine, denied, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const messageStates = [
  "draft",
  "approved",
  "queued",
  "attempting",
  "provider_accepted",
  "delivered",
  "bounced",
  "failed",
  "outcome_unknown",
] as const;
export type MessageState = (typeof messageStates)[number];

/**
 * Internal notes are staff-only text and never enter the send pipeline. Service messages are
 * deterministic templates sent under a pre-approved rule (receipts, appointment notices).
 */
export const messageKinds = ["case_message", "service_message", "internal_note"] as const;
export type MessageKind = (typeof messageKinds)[number];

export const messageDirections = ["outbound", "inbound"] as const;
export type MessageDirection = (typeof messageDirections)[number];

/** Email is the only launch transport; the others record truthful manual summaries (§9). */
export const messageChannels = ["email", "phone", "whatsapp", "viber", "in_app"] as const;
export type MessageChannel = (typeof messageChannels)[number];

export const messageMachine = defineMachine<MessageState>(messageStates, {
  draft: ["approved"],
  // Editing approved content returns it to draft; the approval does not carry over.
  approved: ["draft", "queued"],
  queued: ["attempting"],
  attempting: ["provider_accepted", "failed", "outcome_unknown"],
  provider_accepted: ["delivered", "bounced", "failed"],
  // A late bounce is an adverse outcome that is never discarded; nothing regresses to delivered.
  delivered: ["bounced"],
  outcome_unknown: ["provider_accepted", "delivered", "bounced", "failed"],
  // A definite failure may be retried under the same logical send.
  failed: ["queued"],
  bounced: [],
});

/** Retries stop here; later work is owned operator reconciliation. */
export const maxDeliveryAttempts = 3;

/** Resend's documented idempotency window (§9): after it, a replay is no longer deduplicated. */
export const providerIdempotencyWindowMs = 24 * 60 * 60 * 1000;

export interface MessageEvidence {
  readonly kind: MessageKind;
  /** Digest of audience, channel, attachments and content as they are now. */
  readonly payloadDigest?: string;
  /** Digest the human approval (or the approved service rule) is bound to. */
  readonly approvedDigest?: string;
  readonly providerReference?: string;
  readonly attempts?: number;
  /** ISO 8601 instant of the first provider attempt of this logical send. */
  readonly firstAttemptAt?: string;
  readonly now?: string;
  /** Reconciliation established that the provider never took the earlier attempt. */
  readonly duplicateRiskResolved?: boolean;
}

export function guardMessageTransition(
  from: MessageState,
  to: MessageState,
  evidence: MessageEvidence,
  actor: Actor,
): Decision {
  if (evidence.kind === "internal_note" && to !== "draft") {
    return denied("internal_note_not_sendable");
  }
  switch (to) {
    case "approved":
      return firstDenial(
        // Butler drafts; approving is a human act. Service messages carry their rule approval.
        evidence.kind === "service_message"
          ? allowed
          : need(actor.kind === "staff", "human_required"),
        need(evidence.payloadDigest, "payload_digest_required"),
      );
    case "queued":
      return firstDenial(
        need(
          evidence.approvedDigest && evidence.approvedDigest === evidence.payloadDigest,
          "approval_does_not_match_payload",
        ),
        from === "failed" ? guardRetry(evidence) : allowed,
      );
    case "provider_accepted":
      return need(evidence.providerReference, "provider_reference_required");
    default:
      return allowed;
  }
}

/**
 * A definite failure is retried with the same provider idempotency key, within the attempt
 * limit, only after any duplicate risk is resolved, and never blindly once the provider's
 * idempotency window has passed (AT47).
 */
export function guardRetry(evidence: MessageEvidence): Decision {
  const windowPassed =
    evidence.firstAttemptAt !== undefined &&
    evidence.now !== undefined &&
    Date.parse(evidence.now) - Date.parse(evidence.firstAttemptAt) >= providerIdempotencyWindowMs;
  return firstDenial(
    need((evidence.attempts ?? 0) < maxDeliveryAttempts, "retry_limit_reached"),
    need(evidence.duplicateRiskResolved, "duplicate_risk_unresolved"),
    windowPassed ? denied("idempotency_window_passed") : allowed,
  );
}

export const messageTransitions: TransitionSpec<MessageState, MessageEvidence> = {
  recordType: "message",
  machine: messageMachine,
  capabilityFor: (_from, to) => (to === "draft" ? "message.draft" : "message.send_external"),
  guard: guardMessageTransition,
};

export interface LogicalSend {
  readonly logicalSendId: string;
  readonly payloadDigest: string;
}

/**
 * One logical send identity is bound to one exact payload (AT46): the same payload replays the
 * existing send, a changed payload needs a new approval and a new identity.
 */
export function checkLogicalSend(
  existing: LogicalSend | null,
  attempt: LogicalSend,
): Decision & { readonly replay?: boolean } {
  if (!existing || existing.logicalSendId !== attempt.logicalSendId) return allowed;
  return existing.payloadDigest === attempt.payloadDigest
    ? { outcome: "allowed", replay: true }
    : denied("payload_changed");
}

export interface ComposerDraft {
  readonly kind: MessageKind;
  readonly body: string;
}

/**
 * Switching between the internal-note and client-message composers never carries text across.
 * The previous draft is returned so the caller can keep it in its own composer.
 */
export function switchComposer(
  current: ComposerDraft,
  to: MessageKind,
): { active: ComposerDraft; kept: ComposerDraft } {
  return { active: { kind: to, body: "" }, kept: current };
}

/** Client-facing wording never claims more than the state proves. */
export const clientDeliveryLabel: Record<MessageState, string> = {
  draft: "Draft",
  approved: "Approved, not yet sent",
  queued: "Waiting to send",
  attempting: "Sending",
  provider_accepted: "Handed to the email service; delivery not yet confirmed",
  delivered: "Delivered",
  bounced: "Not delivered: the address rejected it",
  failed: "Not delivered",
  outcome_unknown: "Delivery is not yet confirmed",
};
