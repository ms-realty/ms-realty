// Publication: immutable manifests, one current pointer per listing/locale/destination, the
// listing's publication generation, and per-destination delivery (architecture §7.1–§7.4).
// Publishing is a recorded human command; a queued job never decides eligibility by itself.
import type { Actor } from "./capabilities";
import type { PublicLocale } from "./ids";
import { sourceLocale } from "./ids";
import { type CommercialState, type FreshnessState, presentedAvailability } from "./listing";
import { type Decision, defineMachine, denied, firstDenial, need } from "./state-machine";

export const publicationStates = [
  "never_published",
  "eligible",
  "active",
  "restricted",
  "withdrawn",
] as const;
export type PublicationState = (typeof publicationStates)[number];

export const publicationMachine = defineMachine<PublicationState>(publicationStates, {
  never_published: ["eligible"],
  eligible: ["active", "never_published"],
  // A replacement manifest keeps the pointer active; restriction and withdrawal remove exposure.
  active: ["restricted", "withdrawn"],
  restricted: ["active", "withdrawn"],
  withdrawn: ["eligible"],
});

/** States a CurrentPublication pointer can hold once a manifest has been activated. */
export const pointerStates = ["active", "restricted", "withdrawn"] as const;
export type PointerState = (typeof pointerStates)[number];

/**
 * The local website and manual portal destinations, each with its own outcome. Automated
 * external distribution is not a launch capability (§15).
 */
export const publicationDestinations = ["website", "manual_portal"] as const;
export type PublicationDestination = (typeof publicationDestinations)[number];

export const deliveryKinds = ["publish", "withdraw"] as const;
export type DeliveryKind = (typeof deliveryKinds)[number];

export const deliveryStates = [
  "queued",
  "attempting",
  "acknowledged",
  "verified",
  "failed",
  "outcome_unknown",
  "withdrawing",
  "withdrawn",
] as const;
export type DeliveryState = (typeof deliveryStates)[number];

export const deliveryMachine = defineMachine<DeliveryState>(deliveryStates, {
  queued: ["attempting", "withdrawing"],
  attempting: ["acknowledged", "failed", "outcome_unknown"],
  acknowledged: ["verified", "failed", "withdrawing"],
  verified: ["withdrawing"],
  // A retry keeps the same logical external action.
  failed: ["queued", "withdrawing"],
  // Reconciled before any retry; withdrawal never waits for reconciliation.
  outcome_unknown: ["acknowledged", "verified", "failed", "withdrawing"],
  withdrawing: ["withdrawn", "failed", "outcome_unknown"],
  withdrawn: ["queued"],
});

export interface DeliveryOutcome {
  readonly destination: PublicationDestination;
  readonly locale: PublicLocale;
  readonly state: DeliveryState;
}

/** Only definite failures are retried; unknown outcomes are reconciled first (AT47). */
export function planDeliveryRepair(outcomes: readonly DeliveryOutcome[]): {
  retry: DeliveryOutcome[];
  reconcileFirst: DeliveryOutcome[];
} {
  return {
    retry: outcomes.filter((o) => o.state === "failed"),
    reconcileFirst: outcomes.filter((o) => o.state === "outcome_unknown"),
  };
}

// Activation.

export interface ActivationInput {
  readonly locale: PublicLocale;
  /** The generation the manifest was prepared under, and the listing's current one. */
  readonly manifestGeneration: number;
  readonly currentGeneration: number;
  readonly commercial: CommercialState;
  /** Valid factual review of the bound PropertyFactRevision at its stated scope. */
  readonly factReviewValid: boolean;
  /** Valid editorial approval of the bound ListingRevision. */
  readonly revisionApprovalValid: boolean;
  /** Current SellerInstruction with commercial terms and publication permission. */
  readonly sellerInstructionValid: boolean;
  /** The LocalizedRevision is approved for exactly the bound source revision. */
  readonly localeApprovedForSource: boolean;
  /** Every placed media relation has cleared rights, review and an existing derivative. */
  readonly mediaEligible: boolean;
  /** Professional review of legal/tax/process claims, when the copy makes any. */
  readonly regulatedClaimsReviewed: boolean | "not_applicable";
}

/**
 * Validates a manifest for activation, inside the transaction that switches the pointer
 * (§7.2, §7.3). Publishing authority is a capability checked by the caller; here the actor
 * must be a human. The source locale needs no localized approval.
 */
export function checkActivation(input: ActivationInput, actor: Actor): Decision {
  return firstDenial(
    need(actor.kind === "staff", "human_required"),
    need(input.manifestGeneration === input.currentGeneration, "generation_superseded"),
    need(input.commercial !== "withdrawn", "listing_withdrawn"),
    need(input.factReviewValid, "fact_review_required"),
    need(input.revisionApprovalValid, "approval_stale"),
    need(input.sellerInstructionValid, "seller_instruction_required"),
    need(
      input.locale === sourceLocale || input.localeApprovedForSource,
      "locale_not_approved_for_source",
    ),
    need(input.mediaEligible, "media_not_eligible"),
    need(input.regulatedClaimsReviewed !== false, "professional_review_required"),
  );
}

// Generation fencing.

export interface DeliveryJob {
  readonly kind: DeliveryKind;
  readonly manifestId: string;
  /** Generation the job was created under. */
  readonly generation: number;
}

export interface PointerView {
  readonly state: PointerState;
  readonly manifestId: string;
}

/**
 * Re-read before a queued delivery runs (§7.3): a job from a superseded generation is cancelled,
 * so a delayed job can never resurrect an old price, locale, asset or withdrawn Listing (AT25).
 */
export function fenceDelivery(
  job: DeliveryJob,
  currentGeneration: number,
  pointer: PointerView | null,
): Decision {
  if (job.generation !== currentGeneration) return denied("generation_superseded");
  if (job.kind === "withdraw") return need(pointer?.state !== "active", "pointer_active");
  return firstDenial(
    need(pointer?.state === "active", "pointer_not_active"),
    need(pointer?.manifestId === job.manifestId, "manifest_superseded"),
  );
}

// Restriction and withdrawal.

export interface PointerDependency {
  readonly locale: PublicLocale;
  readonly destination: PublicationDestination;
  readonly state: PointerState;
  /** Dependency analysis proved this presentation unaffected by the change. */
  readonly provenUnaffected: boolean;
}

export interface RestrictionPlan {
  readonly nextGeneration: number;
  readonly restrict: PointerDependency[];
  readonly keep: PointerDependency[];
}

/**
 * Material change (§7.4, AT24): every active presentation not proven unaffected is restricted
 * and the generation increments in the same transaction, before any correction is dispatched.
 */
export function planMaterialRestriction(
  pointers: readonly PointerDependency[],
  generation: number,
): RestrictionPlan {
  const active = pointers.filter((p) => p.state === "active");
  return {
    nextGeneration: generation + 1,
    restrict: active.filter((p) => !p.provenUnaffected),
    keep: active.filter((p) => p.provenUnaffected),
  };
}

/**
 * Withdrawal removes exposure everywhere at once and never waits for a translation, a review
 * or an external acknowledgment (§7.4).
 */
export function planWithdrawal(
  pointers: readonly PointerDependency[],
  generation: number,
): { nextGeneration: number; withdraw: PointerDependency[] } {
  return {
    nextGeneration: generation + 1,
    withdraw: pointers.filter((p) => p.state !== "withdrawn"),
  };
}

// Public presentation: one function for HTML, API, JSON-LD, sitemap and feeds (§7.3).

export type PrimaryAction = "request_viewing" | "ask_question" | "view_similar";

export interface PublicPresentation {
  readonly visible: boolean;
  readonly indexable: boolean;
  /** Restricted and withdrawn listings keep a truthful unavailable surface, not a 200 page. */
  readonly surface: "listing" | "unavailable" | "not_found";
  readonly availability: CommercialState;
  readonly primaryAction: PrimaryAction;
}

export function derivePublicPresentation(input: {
  readonly pointer: PointerState | null;
  readonly commercial: CommercialState;
  readonly freshness: FreshnessState;
  readonly localeIndexable: boolean;
}): PublicPresentation {
  const visible = input.pointer === "active";
  const availability = presentedAvailability(input.commercial, input.freshness);
  return {
    visible,
    indexable: visible && input.localeIndexable,
    surface: visible ? "listing" : input.pointer === null ? "not_found" : "unavailable",
    availability,
    primaryAction: primaryActionFor(availability),
  };
}

function primaryActionFor(availability: CommercialState): PrimaryAction {
  switch (availability) {
    case "available":
      return "request_viewing";
    case "confirmation_required":
    case "negotiating":
    case "reserved_with_recorded_basis":
      return "ask_question";
    case "sold":
    case "let":
    case "withdrawn":
      return "view_similar";
  }
}
