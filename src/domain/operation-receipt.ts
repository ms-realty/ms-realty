// Operation receipts (spec §19.4, AD6, A18, A40, A72). One idempotency key per actor and
// operation type yields one logical outcome across reloads, second tabs and retries.

export const operationStatuses = [
  "accepted",
  "in_progress",
  "succeeded",
  "failed",
  "outcome_unknown",
] as const;
export type OperationStatus = (typeof operationStatuses)[number];

export interface OperationReceipt {
  readonly idempotencyKey: string;
  readonly operationType: string;
  /** Hash of the canonical request body the key was first used with. */
  readonly requestHash: string;
  readonly status: OperationStatus;
  readonly resultReference?: string;
}

export type ReplayDecision =
  | { readonly action: "execute" }
  | { readonly action: "replay"; readonly receipt: OperationReceipt }
  | { readonly action: "reconcile"; readonly receipt: OperationReceipt }
  | { readonly action: "reject"; readonly code: "idempotency_key_reused" };

/**
 * Decides what to do with a command given any receipt already stored under its key. A key
 * reused with a different body is rejected; an unknown outcome is reconciled, never re-run.
 */
export function decideReplay(
  existing: OperationReceipt | null,
  requestHash: string,
): ReplayDecision {
  if (!existing) return { action: "execute" };
  if (existing.requestHash !== requestHash)
    return { action: "reject", code: "idempotency_key_reused" };
  if (existing.status === "outcome_unknown") return { action: "reconcile", receipt: existing };
  return { action: "replay", receipt: existing };
}
