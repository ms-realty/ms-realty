// Publication releases with per-destination outcomes (spec §07.4, F24, A56).
// Success is destination-specific and based on acknowledgment/read-back, not a click.
import type { Actor } from "./capabilities";
import type { PublicLocale } from "./ids";
import { sourceLocale } from "./ids";
import { type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TranslationState } from "./translation";

export const distributionStates = [
  "never_published",
  "scheduled",
  "publishing",
  "published",
  "partially_published",
  "failed",
  "withdrawing",
  "withdrawn",
] as const;
export type DistributionState = (typeof distributionStates)[number];

export const distributionMachine = defineMachine<DistributionState>(distributionStates, {
  never_published: ["scheduled", "publishing"],
  scheduled: ["publishing", "never_published"],
  publishing: ["published", "partially_published", "failed"],
  partially_published: ["publishing", "withdrawing"],
  // A failed correction leaves the previous version live, so it can still be withdrawn.
  failed: ["publishing", "never_published", "withdrawing"],
  published: ["publishing", "withdrawing"],
  withdrawing: ["withdrawn", "partially_published", "published"],
  withdrawn: ["scheduled", "publishing"],
});

export const releaseKinds = ["publish", "withdraw", "correction"] as const;
export type ReleaseKind = (typeof releaseKinds)[number];

export const publicationDestinations = ["website", "sitemap", "partner_feed"] as const;
export type PublicationDestination = (typeof publicationDestinations)[number];

export const destinationOutcomeStates = [
  "pending",
  "requested",
  "acknowledged",
  "verified",
  "failed",
  "outcome_unknown",
] as const;
export type DestinationOutcomeState = (typeof destinationOutcomeStates)[number];

export const destinationOutcomeMachine = defineMachine<DestinationOutcomeState>(
  destinationOutcomeStates,
  {
    pending: ["requested"],
    requested: ["acknowledged", "failed", "outcome_unknown"],
    acknowledged: ["verified", "failed"],
    // Reconciliation resolves an unknown outcome before anything is retried.
    outcome_unknown: ["acknowledged", "verified", "failed"],
    // A retry reuses the same release identity.
    failed: ["requested"],
    verified: [],
  },
);

export interface DestinationOutcome {
  readonly destination: PublicationDestination;
  readonly locale: PublicLocale;
  readonly state: DestinationOutcomeState;
}

const inFlight: readonly DestinationOutcomeState[] = [
  "pending",
  "requested",
  "acknowledged",
  "outcome_unknown",
];

/**
 * Derives the distribution state a release produces. A withdrawal that failed anywhere, or a
 * correction that failed everywhere, leaves stale content live and is urgent operational work.
 */
export function deriveReleaseDistribution(
  kind: ReleaseKind,
  outcomes: readonly DestinationOutcome[],
): { state: DistributionState; urgent: boolean } {
  const verified = outcomes.filter((o) => o.state === "verified").length;
  const failed = outcomes.filter((o) => o.state === "failed").length;
  const pending = outcomes.some((o) => inFlight.includes(o.state));
  if (kind === "withdraw") {
    if (pending) return { state: "withdrawing", urgent: false };
    if (failed === 0) return { state: "withdrawn", urgent: false };
    return { state: verified > 0 ? "partially_published" : "published", urgent: true };
  }
  if (pending) return { state: "publishing", urgent: false };
  if (failed === 0) return { state: "published", urgent: false };
  if (verified > 0) return { state: "partially_published", urgent: false };
  return { state: "failed", urgent: kind === "correction" };
}

/** Only failed destinations are retried; unknown outcomes are reconciled first (A56). */
export function planReleaseRepair(outcomes: readonly DestinationOutcome[]): {
  retry: DestinationOutcome[];
  reconcileFirst: DestinationOutcome[];
} {
  return {
    retry: outcomes.filter((o) => o.state === "failed"),
    reconcileFirst: outcomes.filter((o) => o.state === "outcome_unknown"),
  };
}

export interface ReleaseReadiness {
  readonly factualApprovalValid: boolean;
  /** Owner approval of the exact preview, for listings that need it. */
  readonly ownerApprovalValid: boolean | "not_required";
  readonly currentSourceVersion: number;
  readonly locales: readonly {
    readonly locale: PublicLocale;
    readonly translationState?: TranslationState;
    readonly translationSourceVersion?: number;
  }[];
  readonly mediaAllPublishable: boolean;
  readonly destinations: readonly PublicationDestination[];
}

export function guardReleaseConfirmation(readiness: ReleaseReadiness, actor: Actor): Decision {
  const unapprovedLocale = readiness.locales.some(
    (l) =>
      l.locale !== sourceLocale &&
      (l.translationState !== "approved" ||
        l.translationSourceVersion !== readiness.currentSourceVersion),
  );
  return firstDenial(
    need(actor.kind === "staff", "human_required"),
    need(readiness.destinations.length > 0, "destination_required"),
    need(readiness.locales.length > 0, "locale_required"),
    need(readiness.factualApprovalValid, "factual_approval_required"),
    need(readiness.ownerApprovalValid !== false, "owner_approval_required"),
    need(!unapprovedLocale, "translation_not_approved"),
    need(readiness.mediaAllPublishable, "media_not_publishable"),
  );
}
