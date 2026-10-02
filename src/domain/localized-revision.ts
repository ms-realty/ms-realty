// LocalizedRevision: one locale's copy bound to exactly one source ListingRevision
// (architecture §4.1, §7.1). Approving language is not factual, legal or publishing approval,
// and approval covers only the source it was reviewed against.
import type { Actor, Capability } from "./capabilities";
import type { PublicLocale } from "./ids";
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const localeStates = [
  "missing",
  "draft",
  "reviewing",
  "approved_for_source",
  "stale",
  "rejected",
] as const;
export type LocaleState = (typeof localeStates)[number];

export const localeMachine = defineMachine<LocaleState>(localeStates, {
  missing: ["draft"],
  draft: ["reviewing", "stale"],
  reviewing: ["approved_for_source", "rejected", "draft", "stale"],
  rejected: ["draft", "stale"],
  approved_for_source: ["stale"],
  // Bound to a superseded source: the replacement is a new revision against the new source.
  stale: [],
});

export interface LocalizedRevisionRecord {
  readonly locale: PublicLocale;
  readonly state: LocaleState;
  /** The ListingRevision this copy translates. */
  readonly sourceRevisionId: string;
}

export interface LocaleEvidence {
  readonly sourceRevisionId: string;
  readonly currentSourceRevisionId: string;
  /** The reviewer checked every protected fact (price, area, rooms, location, reference). */
  readonly protectedFactsChecked?: boolean;
  readonly reason?: string;
}

export function guardLocaleTransition(
  _from: LocaleState,
  to: LocaleState,
  evidence: LocaleEvidence,
  actor: Actor,
): Decision {
  const current = evidence.sourceRevisionId === evidence.currentSourceRevisionId;
  switch (to) {
    case "reviewing":
      return need(current, "source_revision_changed");
    case "approved_for_source":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(current, "source_revision_changed"),
        need(evidence.protectedFactsChecked, "protected_facts_unchecked"),
      );
    case "rejected":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(evidence.reason, "reason_required"),
      );
    case "stale":
      return need(!current, "source_unchanged");
    default:
      return allowed;
  }
}

const reviewTargets: readonly LocaleState[] = ["approved_for_source", "rejected"];

export const localeTransitions: TransitionSpec<LocaleState, LocaleEvidence> = {
  recordType: "localized_revision",
  machine: localeMachine,
  capabilityFor: (_from, to): Capability =>
    reviewTargets.includes(to) ? "translation.review" : "translation.draft",
  guard: guardLocaleTransition,
};

/** Localized revisions a new source revision makes stale; revisions of the new source stay. */
export function staleAfterSourceChange(
  revisions: readonly LocalizedRevisionRecord[],
  newSourceRevisionId: string,
): LocalizedRevisionRecord[] {
  return revisions
    .filter(
      (r) =>
        r.sourceRevisionId !== newSourceRevisionId &&
        localeMachine.check(r.state, "stale").outcome === "allowed",
    )
    .map((r) => ({ ...r, state: "stale" }));
}

/** Servable only when approved against the current source revision. */
export function isApprovedForSource(
  revision: LocalizedRevisionRecord,
  currentSourceRevisionId: string,
): boolean {
  return (
    revision.state === "approved_for_source" &&
    revision.sourceRevisionId === currentSourceRevisionId
  );
}
