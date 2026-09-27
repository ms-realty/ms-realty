// SellerInstruction: the seller's or landlord's recorded instruction at a defined revision
// (architecture §6.3, plan §7 brokerage agreement evidence). It records commercial terms,
// privacy/location disclosure, media usage rights, representation scope, exclusivity,
// commission terms and publication permission as evidence for the agency. It is not a
// substitute for staff publishing capability or for professional title review.
import { canonicalJson } from "./approval";
import type { Actor } from "./capabilities";
import type { LocationPrecision, Money } from "./facts";
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const sellerInstructionStates = [
  "draft",
  "agreed",
  "superseded",
  "withdrawn",
  "expired",
] as const;
export type SellerInstructionState = (typeof sellerInstructionStates)[number];

export const sellerInstructionMachine = defineMachine<SellerInstructionState>(
  sellerInstructionStates,
  {
    draft: ["agreed", "withdrawn"],
    // Price changes, pauses and altered terms are a new instruction revision.
    agreed: ["superseded", "withdrawn", "expired"],
    superseded: [],
    withdrawn: [],
    expired: [],
  },
);

export const representationScopes = ["sale", "letting", "sale_and_letting"] as const;
export type RepresentationScope = (typeof representationScopes)[number];

export const exclusivityKinds = ["exclusive", "non_exclusive", "not_recorded"] as const;
export type Exclusivity = (typeof exclusivityKinds)[number];

export interface SellerInstructionContent {
  readonly commercialTerms: { readonly price: Money | null; readonly notes?: string };
  readonly disclosure: {
    readonly publicPrecision: LocationPrecision;
    readonly showOwnerName: false;
  };
  readonly mediaUsageRights: { readonly granted: boolean; readonly scope?: string };
  readonly representationScope: RepresentationScope;
  readonly exclusivity: Exclusivity;
  /** Commission as recorded in the brokerage agreement; wording, never computed. */
  readonly commissionTerms: string | null;
  readonly publicationPermission: boolean;
  /** ISO 8601 instant after which the instruction lapses, when the agreement says so. */
  readonly expiresAt?: string;
}

/** The canonical content an acknowledgment or approval digest is computed from. */
export function sellerInstructionDigestContent(content: SellerInstructionContent): string {
  return canonicalJson(content);
}

export interface SellerInstructionEvidence {
  /** Signed agreement document or recorded consent that evidences the instruction. */
  readonly evidenceDocumentIds?: readonly string[];
  readonly content?: SellerInstructionContent;
  readonly replacementId?: string;
  readonly reason?: string;
}

export function guardSellerInstructionTransition(
  _from: SellerInstructionState,
  to: SellerInstructionState,
  evidence: SellerInstructionEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "agreed":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.evidenceDocumentIds?.length, "agreement_evidence_required"),
        need(evidence.content, "instruction_content_required"),
        need(evidence.content?.commissionTerms?.trim(), "commission_terms_required"),
      );
    case "superseded":
      return need(evidence.replacementId, "replacement_required");
    case "withdrawn":
      return need(evidence.reason, "reason_required");
    default:
      return allowed;
  }
}

export const sellerInstructionTransitions: TransitionSpec<
  SellerInstructionState,
  SellerInstructionEvidence
> = {
  recordType: "seller_instruction",
  machine: sellerInstructionMachine,
  capabilityFor: () => "listing.edit",
  guard: guardSellerInstructionTransition,
};

/** An instruction supports publication only while agreed, unexpired and permitting it. */
export function permitsPublication(
  instruction: {
    readonly state: SellerInstructionState;
    readonly content: SellerInstructionContent;
  },
  now: string,
): boolean {
  const { content } = instruction;
  return (
    instruction.state === "agreed" &&
    content.publicationPermission &&
    (!content.expiresAt || Date.parse(now) < Date.parse(content.expiresAt))
  );
}
