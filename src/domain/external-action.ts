// Durable work and external effects (architecture §15). An OutboxEvent is the business intent
// committed with the change; an ExternalAction is one logical provider effect with its own
// identity, source generation, attempts and reconciliation; an InboxEvent is one deduplicated
// signed webhook. Exactly-once delivery is never assumed.
import { type Decision, defineMachine, denied, need } from "./state-machine";

export const outboxEventStates = ["pending", "dispatched", "completed", "cancelled"] as const;
export type OutboxEventState = (typeof outboxEventStates)[number];

export const externalActionKinds = [
  "email_send",
  "destination_publish",
  "destination_withdraw",
  "media_purge",
] as const;
export type ExternalActionKind = (typeof externalActionKinds)[number];

export const externalActionStates = [
  "queued",
  "attempting",
  "acknowledged",
  "verified",
  "failed",
  "outcome_unknown",
  "cancelled",
] as const;
export type ExternalActionState = (typeof externalActionStates)[number];

export const externalActionMachine = defineMachine<ExternalActionState>(externalActionStates, {
  queued: ["attempting", "cancelled"],
  // Back to queued only when the provider definitely did not take the request.
  attempting: ["acknowledged", "failed", "outcome_unknown", "queued"],
  acknowledged: ["verified", "failed"],
  verified: [],
  // An operator retry keeps the logical key and scope.
  failed: ["queued"],
  // Suspends resend: only reconciliation moves it on.
  outcome_unknown: ["acknowledged", "verified", "failed"],
  // A superseded generation or revoked actor cancels obsolete work (AT51).
  cancelled: [],
});

/** Initial default retry limit (§15); a provider's idempotency deadline can end it earlier. */
export const defaultMaxAttempts = 8;

export interface ExecutionCheck {
  /** Generation the action was created under, and the subject's generation now. */
  readonly sourceGeneration: number | null;
  readonly currentGeneration: number | null;
  /** The initiating actor still holds the capability, re-checked at execution. */
  readonly actorStillAuthorized: boolean;
}

/** Re-read before a consequential action runs: a stale generation or revoked actor cancels it. */
export function checkExecution(check: ExecutionCheck): Decision {
  if (check.sourceGeneration !== null && check.sourceGeneration !== check.currentGeneration) {
    return denied("generation_superseded");
  }
  return need(check.actorStillAuthorized, "actor_revoked");
}

export const inboxEventStates = ["received", "processed", "rejected", "ignored"] as const;
export type InboxEventState = (typeof inboxEventStates)[number];
