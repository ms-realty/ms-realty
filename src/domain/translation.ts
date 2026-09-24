// Translations per locale per source version (spec §07.4, §18.2, F24, A55).
// Approval of language is not factual approval and neither publishes nor makes indexable.
import type { Actor, Capability } from "./capabilities";
import type { PublicLocale } from "./ids";
import { allowed, type Decision, defineMachine, firstDenial, need } from "./state-machine";
import type { TransitionSpec } from "./transition";

export const translationStates = [
  "missing",
  "draft",
  "reviewing",
  "approved",
  "stale",
  "rejected",
] as const;
export type TranslationState = (typeof translationStates)[number];

export const translationMachine = defineMachine<TranslationState>(translationStates, {
  missing: ["draft"],
  draft: ["reviewing", "stale"],
  reviewing: ["approved", "rejected", "draft", "stale"],
  rejected: ["draft"],
  approved: ["stale"],
  stale: ["draft", "reviewing"],
});

export interface TranslationRecord {
  readonly locale: PublicLocale;
  readonly state: TranslationState;
  /** Source (bg) version this text translates. */
  readonly sourceVersion: number;
}

export interface TranslationEvidence {
  readonly sourceVersion: number;
  readonly currentSourceVersion: number;
  readonly reason?: string;
}

export function guardTranslationTransition(
  _from: TranslationState,
  to: TranslationState,
  evidence: TranslationEvidence,
  actor: Actor,
): Decision {
  const current = evidence.sourceVersion === evidence.currentSourceVersion;
  switch (to) {
    case "reviewing":
      return need(current, "source_version_changed");
    case "approved":
      return firstDenial(
        need(actor.kind === "staff", "human_required"),
        need(current, "source_version_changed"),
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

const reviewTargets: readonly TranslationState[] = ["approved", "rejected"];

export const translationTransitions: TransitionSpec<TranslationState, TranslationEvidence> = {
  recordType: "translation",
  machine: translationMachine,
  capabilityFor: (_from, to): Capability =>
    reviewTargets.includes(to) ? "translation.review" : "translation.draft",
  guard: guardTranslationTransition,
};

/** Translations that a new source version makes stale. Other locales keep their state. */
export function staleAfterSourceChange(
  translations: readonly TranslationRecord[],
  newSourceVersion: number,
): TranslationRecord[] {
  return translations
    .filter(
      (t) =>
        t.sourceVersion !== newSourceVersion &&
        translationMachine.check(t.state, "stale").outcome === "allowed",
    )
    .map((t) => ({ ...t, state: "stale" }));
}

/** Only a human-approved translation of the current source, in an indexable locale (A55). */
export function isTranslationIndexable(
  translation: TranslationRecord,
  currentSourceVersion: number,
  localeIndexable: boolean,
): boolean {
  return (
    localeIndexable &&
    translation.state === "approved" &&
    translation.sourceVersion === currentSourceVersion
  );
}
