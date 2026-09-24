// Approvals bound to an exact subject version (spec §19.2, F12, F24, F29, A31).
import type { Actor, Capability } from "./capabilities";
import { type Decision, defineMachine, denied, firstDenial, need } from "./state-machine";

export const approvalStates = [
  "pending",
  "approved",
  "rejected",
  "invalidated",
  "withdrawn",
] as const;
export type ApprovalState = (typeof approvalStates)[number];

export const approvalMachine = defineMachine<ApprovalState>(approvalStates, {
  pending: ["approved", "rejected", "withdrawn"],
  approved: ["invalidated"],
  rejected: [],
  invalidated: [],
  withdrawn: [],
});

/** Each kind is its own authority: a language approval is never factual or legal approval. */
export const approvalKinds = [
  "factual",
  "language",
  "legal_process_claim",
  "owner_instruction",
  "publication",
  "message_send",
  "proposal_terms",
  "spending",
  "locale_indexability",
  "import_apply",
  // Approvals given in the legacy system, recorded with their evidence during the one-time
  // import (F32). They document history; the release flow decides what they are worth.
  "legacy_owner_publication_approval",
  "legacy_content_approval",
] as const;
export type ApprovalKind = (typeof approvalKinds)[number];

export const approvalCapability: Record<ApprovalKind, Capability> = {
  factual: "listing.review_facts",
  language: "translation.review",
  legal_process_claim: "claim.approve",
  owner_instruction: "portal.listing.approve",
  publication: "publication.release",
  message_send: "message.send_external",
  proposal_terms: "proposal.manage",
  spending: "spending.approve",
  locale_indexability: "settings.manage",
  import_apply: "import.run",
  legacy_owner_publication_approval: "publication.release",
  legacy_content_approval: "publication.release",
};

export interface ApprovalSubject {
  readonly type: string;
  readonly id: string;
  readonly version: number;
  /** Hash of the canonical subject content (see canonicalJson). */
  readonly hash: string;
}

export interface Approval {
  readonly kind: ApprovalKind;
  readonly subject: ApprovalSubject;
  readonly state: ApprovalState;
  readonly decidedBy?: string;
}

export interface DecisionContext {
  readonly actor: Actor;
  /** Hash of the subject as it is now. */
  readonly currentHash: string;
  /** Who authored the subject, when policy requires a second person. */
  readonly authorId?: string;
  readonly independentReviewRequired?: boolean;
}

export function guardApprovalDecision(
  approval: Approval,
  to: "approved" | "rejected",
  context: DecisionContext,
): Decision {
  return firstDenial(
    approvalMachine.check(approval.state, to),
    need(context.actor.kind === "staff" || context.actor.kind === "client", "human_required"),
    need(approval.subject.hash === context.currentHash, "subject_changed"),
    // Fails closed: without a known author, a required second-person review cannot be shown.
    context.independentReviewRequired
      ? firstDenial(
          need(context.authorId, "author_unknown"),
          context.authorId === context.actor.id ? denied("independent_review_required") : undefined,
        )
      : undefined,
  );
}

export function isApprovalValid(approval: Approval, currentHash: string): boolean {
  return approval.state === "approved" && approval.subject.hash === currentHash;
}

/** Invalidates an approval whose subject changed; any other approval is returned as is. */
export function invalidateIfChanged(approval: Approval, currentHash: string): Approval {
  if (approval.state === "approved" && approval.subject.hash !== currentHash) {
    return { ...approval, state: "invalidated" };
  }
  return approval;
}

/**
 * Deterministic JSON with sorted object keys: the input to the subject hash, so the same
 * content always binds the same approval regardless of key order.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
