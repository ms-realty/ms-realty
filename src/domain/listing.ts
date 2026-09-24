// Listing state is five independent dimensions (spec §07.4). Public presentation is derived
// from all of them together: "published" never implies "available".
import type { Actor } from "./capabilities";
import type { ListingPurpose } from "./facts";
import type { PublicLocale } from "./ids";
import { sourceLocale } from "./ids";
import {
  type DestinationOutcome,
  type DistributionState,
  deriveReleaseDistribution,
  distributionMachine,
  type ReleaseKind,
} from "./publication";
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";
import type { TranslationState } from "./translation";

// Commercial availability.

export const commercialStates = [
  "available",
  "availability_unconfirmed",
  "under_negotiation",
  "reserved",
  "sold",
  "let",
  "withdrawn",
] as const;
export type CommercialState = (typeof commercialStates)[number];

export const commercialMachine = defineMachine<CommercialState>(commercialStates, {
  available: [
    "availability_unconfirmed",
    "under_negotiation",
    "reserved",
    "sold",
    "let",
    "withdrawn",
  ],
  availability_unconfirmed: [
    "available",
    "under_negotiation",
    "reserved",
    "sold",
    "let",
    "withdrawn",
  ],
  under_negotiation: [
    "available",
    "availability_unconfirmed",
    "reserved",
    "sold",
    "let",
    "withdrawn",
  ],
  reserved: [
    "available",
    "availability_unconfirmed",
    "under_negotiation",
    "sold",
    "let",
    "withdrawn",
  ],
  // A re-offered property must be reconfirmed before it reads as available again.
  let: ["availability_unconfirmed"],
  withdrawn: ["availability_unconfirmed"],
  sold: [],
});

export interface CommercialEvidence {
  readonly purpose: ListingPurpose;
  readonly reason?: string;
  /** "Reserved subject to a stated basis". */
  readonly reservationBasis?: string;
  readonly evidenceIds?: readonly string[];
}

export function guardCommercialTransition(
  _from: CommercialState,
  to: CommercialState,
  evidence: CommercialEvidence,
  actor: Actor,
): Decision {
  const base = need(evidence.reason, "reason_required");
  switch (to) {
    case "available":
      // A timer or import cannot prove continued availability.
      return firstDenial(base, need(actor.kind === "staff", "human_required"));
    case "reserved":
      return firstDenial(base, need(evidence.reservationBasis, "reservation_basis_required"));
    case "sold":
      return firstDenial(
        base,
        need(evidence.purpose === "sale", "purpose_mismatch"),
        need(evidence.evidenceIds?.length, "evidence_required"),
      );
    case "let":
      return firstDenial(
        base,
        need(evidence.purpose === "long_term_rent", "purpose_mismatch"),
        need(evidence.evidenceIds?.length, "evidence_required"),
      );
    default:
      return base;
  }
}

export const commercialTransitions: TransitionSpec<CommercialState, CommercialEvidence> = {
  recordType: "listing",
  machine: commercialMachine,
  capabilityFor: () => "listing.edit",
  guard: guardCommercialTransition,
};

// Editorial.

export const editorialStates = [
  "draft",
  "needs_facts",
  "in_review",
  "approved",
  "changes_requested",
] as const;
export type EditorialState = (typeof editorialStates)[number];

export const editorialMachine = defineMachine<EditorialState>(editorialStates, {
  draft: ["needs_facts", "in_review"],
  needs_facts: ["draft", "in_review"],
  in_review: ["approved", "changes_requested", "needs_facts"],
  changes_requested: ["draft", "in_review"],
  // Any edit to approved content opens a new revision.
  approved: ["draft"],
});

export interface EditorialEvidence {
  readonly missingRequiredFacts?: number;
  /** Factual approval bound to this revision's hash, already checked as valid. */
  readonly approvalValid?: boolean;
  readonly reason?: string;
}

export function guardEditorialTransition(
  _from: EditorialState,
  to: EditorialState,
  evidence: EditorialEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "in_review":
      return need((evidence.missingRequiredFacts ?? 0) === 0, "required_facts_missing");
    case "approved":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.approvalValid, "approval_required"),
      );
    case "changes_requested":
      return need(evidence.reason, "reason_required");
    default:
      return allowed;
  }
}

export const editorialTransitions: TransitionSpec<EditorialState, EditorialEvidence> = {
  recordType: "listing",
  machine: editorialMachine,
  capabilityFor: (_from, to) =>
    to === "approved" || to === "changes_requested" ? "listing.review_facts" : "listing.edit",
  guard: guardEditorialTransition,
};

// Public distribution: the machine lives with publication releases.

export interface DistributionEvidence {
  /** The release this change reports on, as recorded, with its destination outcomes. */
  readonly release?: {
    readonly id: string;
    readonly kind: ReleaseKind;
    readonly outcomes: readonly DestinationOutcome[];
    /** ISO 8601 instant a scheduled release runs. */
    readonly scheduledFor?: string;
  };
}

/**
 * Distribution only ever reports a release: the target must be what the release's recorded
 * destination outcomes derive, never what a button asserts (§07.4).
 */
export function guardDistributionTransition(
  _from: DistributionState,
  to: DistributionState,
  evidence: DistributionEvidence,
  actor: Actor,
): Decision {
  if (to === "never_published") return allowed;
  const { release } = evidence;
  return firstDenial(
    need(actor.kind === "staff" || actor.kind === "system", "human_or_release_job_required"),
    need(release?.id, "release_required"),
    to === "scheduled"
      ? need(release?.scheduledFor, "schedule_required")
      : need(
          release?.outcomes.length &&
            deriveReleaseDistribution(release.kind, release.outcomes).state === to,
          "release_outcome_mismatch",
        ),
  );
}

export const distributionTransitions: TransitionSpec<DistributionState, DistributionEvidence> = {
  recordType: "listing",
  machine: distributionMachine,
  capabilityFor: () => "publication.release",
  guard: guardDistributionTransition,
};

// Evidence freshness.

export const freshnessStates = ["current", "review_due", "conflicting", "unknown"] as const;
export type FreshnessState = (typeof freshnessStates)[number];

export const freshnessMachine = defineMachine<FreshnessState>(freshnessStates, {
  current: ["review_due", "conflicting", "unknown"],
  review_due: ["current", "conflicting", "unknown"],
  conflicting: ["current", "review_due", "unknown"],
  unknown: ["current", "review_due", "conflicting"],
});

export interface FreshnessEvidence {
  readonly reviewedAt?: string;
  readonly conflictingFactKeys?: readonly string[];
}

export function guardFreshnessTransition(
  _from: FreshnessState,
  to: FreshnessState,
  evidence: FreshnessEvidence,
  actor: Actor,
): Decision {
  switch (to) {
    case "current":
      // A timer can request review; it cannot prove the facts are still true.
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.reviewedAt, "review_required"),
      );
    case "conflicting":
      return need(evidence.conflictingFactKeys?.length, "conflicting_facts_required");
    default:
      return allowed;
  }
}

export const freshnessTransitions: TransitionSpec<FreshnessState, FreshnessEvidence> = {
  recordType: "listing",
  machine: freshnessMachine,
  capabilityFor: () => "listing.review_facts",
  guard: guardFreshnessTransition,
};

// Public presentation.

export interface ListingDimensions {
  readonly commercial: CommercialState;
  readonly editorial: EditorialState;
  /** State of the latest release; a correction in flight or failed leaves the old version live. */
  readonly distribution: DistributionState;
  /** Version currently served at the website destination; null when nothing is live. */
  readonly publishedVersion: number | null;
  readonly freshness: FreshnessState;
  /** Translation state per locale for the current source version; the source locale needs none. */
  readonly translations: Partial<Record<PublicLocale, TranslationState>>;
}

export const publicAvailabilities = [
  "available",
  "needs_confirmation",
  "under_negotiation",
  "reserved",
  "sold",
  "let",
  "withdrawn",
] as const;
export type PublicAvailability = (typeof publicAvailabilities)[number];

export type PrimaryAction = "request_viewing" | "ask_question" | "view_similar";

export interface PublicPresentation {
  /** Served publicly at all (content is live at the website destination). */
  readonly visible: boolean;
  /** Served in the requested locale: source locale, or a human-approved current translation. */
  readonly servedInLocale: boolean;
  readonly indexable: boolean;
  readonly availability: PublicAvailability;
  readonly primaryAction: PrimaryAction;
  /** Newer unpublished edits exist; the public version stays the last released one. */
  readonly pendingChanges: boolean;
}

const notLive: readonly DistributionState[] = ["never_published", "withdrawn"];

export function derivePublicPresentation(
  dimensions: ListingDimensions,
  options: { readonly locale: PublicLocale; readonly localeIndexable: boolean },
): PublicPresentation {
  // What is live is recorded apart from the release in progress (publishing, failed).
  const visible =
    dimensions.publishedVersion !== null && !notLive.includes(dimensions.distribution);
  const servedInLocale =
    visible &&
    (options.locale === sourceLocale || dimensions.translations[options.locale] === "approved");
  const availability = publicAvailability(dimensions);
  return {
    visible,
    servedInLocale,
    indexable:
      servedInLocale && options.localeIndexable && dimensions.distribution !== "withdrawing",
    availability,
    primaryAction: primaryActionFor(availability),
    pendingChanges: dimensions.editorial !== "approved",
  };
}

function publicAvailability({ commercial, freshness }: ListingDimensions): PublicAvailability {
  if (commercial === "availability_unconfirmed") return "needs_confirmation";
  if (commercial === "available" && freshness !== "current") return "needs_confirmation";
  return commercial;
}

function primaryActionFor(availability: PublicAvailability): PrimaryAction {
  switch (availability) {
    case "available":
      return "request_viewing";
    case "needs_confirmation":
    case "under_negotiation":
    case "reserved":
      return "ask_question";
    case "sold":
    case "let":
    case "withdrawn":
      return "view_similar";
  }
}
