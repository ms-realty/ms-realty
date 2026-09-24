// Messages and delivery (spec §07.5, F17, A41, A42). Provider acceptance is not delivery,
// and an unknown outcome is reconciled before any retry so one logical message stays one.
import type { Actor } from "./capabilities";
import { allowed, type Decision, defineMachine, denied, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const messageStates = [
  "draft",
  "human_approved",
  "queued",
  "provider_accepted",
  "delivered",
  "read",
  "failed",
  "outcome_unknown",
] as const;
export type MessageState = (typeof messageStates)[number];

/** Internal notes are staff-only text and never enter the send pipeline. */
export const messageKinds = ["external", "internal_note"] as const;
export type MessageKind = (typeof messageKinds)[number];

export const messageDirections = ["outbound", "inbound"] as const;
export type MessageDirection = (typeof messageDirections)[number];

export const messageChannels = ["email", "sms", "whatsapp", "viber", "portal"] as const;
export type MessageChannel = (typeof messageChannels)[number];

export const messageMachine = defineMachine<MessageState>(messageStates, {
  draft: ["human_approved"],
  // Editing approved content returns it to draft; the approval does not carry over.
  human_approved: ["draft", "queued"],
  queued: ["provider_accepted", "failed", "outcome_unknown"],
  provider_accepted: ["delivered", "failed", "outcome_unknown"],
  delivered: ["read"],
  outcome_unknown: ["provider_accepted", "delivered", "failed"],
  failed: ["queued"],
  read: [],
});

export const maxDeliveryAttempts = 3;

export interface MessageEvidence {
  readonly kind: MessageKind;
  /** Hash of recipients, channel, attachments and content now. */
  readonly contentHash?: string;
  /** Hash the human approval was bound to. */
  readonly approvedContentHash?: string;
  readonly channelSupportsReadReceipts?: boolean;
  readonly providerMessageId?: string;
  readonly attempts?: number;
  /** Reconciliation proved the provider never received the earlier attempt. */
  readonly duplicateRiskResolved?: boolean;
}

export function guardMessageTransition(
  from: MessageState,
  to: MessageState,
  evidence: MessageEvidence,
  actor: Actor,
): Decision {
  if (evidence.kind === "internal_note" && to !== "draft")
    return denied("internal_note_not_sendable");
  switch (to) {
    case "human_approved":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.contentHash, "content_hash_required"),
      );
    case "queued":
      return firstDenial(
        need(
          evidence.approvedContentHash && evidence.approvedContentHash === evidence.contentHash,
          "approval_does_not_match_content",
        ),
        from === "failed" ? guardRetry(evidence) : undefined,
      );
    case "provider_accepted":
      return need(evidence.providerMessageId, "provider_reference_required");
    case "read":
      return need(evidence.channelSupportsReadReceipts, "read_receipts_unsupported");
    default:
      return allowed;
  }
}

function guardRetry(evidence: MessageEvidence): Decision {
  return firstDenial(
    need((evidence.attempts ?? 0) < maxDeliveryAttempts, "retry_limit_reached"),
    need(evidence.duplicateRiskResolved, "duplicate_risk_unresolved"),
  );
}

export const messageTransitions: TransitionSpec<MessageState, MessageEvidence> = {
  recordType: "message",
  machine: messageMachine,
  capabilityFor: (_from, to) => (to === "draft" ? "message.draft" : "message.send_external"),
  guard: guardMessageTransition,
};

export interface ComposerDraft {
  readonly kind: MessageKind;
  readonly body: string;
}

/**
 * Switching between the internal-note and customer composers never carries text across
 * (A41). The previous draft is returned so the caller can keep it in its own composer.
 */
export function switchComposer(
  current: ComposerDraft,
  to: MessageKind,
): { active: ComposerDraft; kept: ComposerDraft } {
  return { active: { kind: to, body: "" }, kept: current };
}

/** Client-facing wording never claims more than the state proves (§18.3). */
export const clientDeliveryLabel: Record<MessageState, string> = {
  draft: "Draft",
  human_approved: "Approved, not yet sent",
  queued: "Sending",
  provider_accepted: "Sent to the messaging service; delivery pending",
  delivered: "Delivered",
  read: "Read",
  failed: "Not delivered",
  outcome_unknown: "Delivery is not yet confirmed",
};
