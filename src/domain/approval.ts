// Approvals bound to an exact subject revision by its digest (architecture §4.1, §7.2). Each
// kind is its own authority: a language approval is never factual, legal or publishing
// approval, and same-person editing and review are recorded as separate decisions.
import type { Actor, Capability } from "./capabilities";
import { type Decision, defineMachine, denied, firstDenial, need } from "./state-machine";

export const approvalStates = [
  "pending",
  "approved",
  "rejected",
  "invalidated",
  "expired",
  "withdrawn",
] as const;
export type ApprovalState = (typeof approvalStates)[number];

export const approvalMachine = defineMachine<ApprovalState>(approvalStates, {
  pending: ["approved", "rejected", "withdrawn"],
  approved: ["invalidated", "expired"],
  rejected: [],
  invalidated: [],
  expired: [],
  withdrawn: [],
});

export const approvalKinds = [
  "factual",
  "editorial",
  "language",
  "legal_process_claim",
  "owner_acknowledgment",
  "publication",
  "message_send",
  "proposal_terms",
  "locale_indexability",
  "import_apply",
  // Recorded by the one-time import as evidence of legacy decisions. The source-as-is
  // exception covers source-locale publication only: it is not factual review, translation
  // approval, indexability or media review (§18.2, §21.2).
  "legacy_source_as_is",
  "legacy_content_approval",
] as const;
export type ApprovalKind = (typeof approvalKinds)[number];

export const approvalCapability: Record<ApprovalKind, Capability> = {
  factual: "listing.review_facts",
  editorial: "listing.review_facts",
  language: "translation.review",
  legal_process_claim: "claim.approve",
  owner_acknowledgment: "portal.listing.acknowledge",
  publication: "publication.release",
  message_send: "message.send_external",
  proposal_terms: "proposal.manage",
  locale_indexability: "settings.manage",
  import_apply: "import.run",
  legacy_source_as_is: "import.run",
  legacy_content_approval: "import.run",
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

export function isApprovalValid(
  approval: Approval & { readonly expiresAt?: string },
  currentHash: string,
  now?: string,
): boolean {
  if (approval.state !== "approved" || approval.subject.hash !== currentHash) return false;
  // Fails closed: an expiring approval needs a clock to be honoured.
  return (
    !approval.expiresAt || (now !== undefined && Date.parse(now) < Date.parse(approval.expiresAt))
  );
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
