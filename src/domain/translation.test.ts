import { describe, expect, it } from "vitest";
import { type CapabilityGrant, grantsForRoles } from "./capabilities";
import { applyTransition } from "./transition";
import {
  guardTranslationTransition,
  isTranslationIndexable,
  staleAfterSourceChange,
  type TranslationEvidence,
  type TranslationState,
  translationTransitions,
} from "./translation";

const reviewer = { kind: "staff", id: "rev-1" } as const;
const hermes = { kind: "ai_service", id: "hermes" } as const;
const current: TranslationEvidence = { sourceVersion: 4, currentSourceVersion: 4 };

describe("translation (§18.2, F24)", () => {
  it("A55: a source change makes approved translations stale and leaves the new-source ones alone", () => {
    const result = staleAfterSourceChange(
      [
        { locale: "en", state: "approved", sourceVersion: 4 },
        { locale: "de", state: "approved", sourceVersion: 5 },
        { locale: "ru", state: "missing", sourceVersion: 4 },
      ],
      5,
    );
    expect(result).toEqual([{ locale: "en", state: "stale", sourceVersion: 4 }]);
  });

  it("A55: AI drafting never leads to approval or indexability", () => {
    expect(guardTranslationTransition("reviewing", "approved", current, hermes)).toEqual({
      outcome: "denied",
      code: "human_required",
    });
    expect(
      isTranslationIndexable({ locale: "en", state: "draft", sourceVersion: 4 }, 4, true),
    ).toBe(false);
  });

  it("A55: an approval of an older source version is refused", () => {
    expect(
      guardTranslationTransition(
        "reviewing",
        "approved",
        { sourceVersion: 3, currentSourceVersion: 4 },
        reviewer,
      ),
    ).toEqual({ outcome: "denied", code: "source_version_changed" });
  });

  it("A55: indexable only when approved for the current source and the locale is indexable", () => {
    const approved = { locale: "en", state: "approved", sourceVersion: 4 } as const;
    expect(isTranslationIndexable(approved, 4, true)).toBe(true);
    expect(isTranslationIndexable(approved, 5, true)).toBe(false);
    expect(isTranslationIndexable(approved, 4, false)).toBe(false);
  });

  it("translation review is scoped to the reviewer's locales", () => {
    const grants: CapabilityGrant[] = [
      ...grantsForRoles(["translation_reviewer"]).filter(
        (g) => g.capability !== "translation.review",
      ),
      { capability: "translation.review", scope: { locales: ["de"] } },
    ];
    const record = {
      id: "t1",
      state: "reviewing" as TranslationState,
      version: 1,
      locale: "en" as const,
    };
    const request = {
      actor: reviewer,
      capabilities: grants,
      expectedVersion: 1,
      to: "approved" as TranslationState,
      evidence: current,
      operationId: "op",
      at: "2026-09-24T10:00:00Z",
    };
    expect(applyTransition(translationTransitions, record, request)).toEqual({
      outcome: "denied",
      code: "missing_capability",
    });
    expect(
      applyTransition(translationTransitions, { ...record, locale: "de" }, request).outcome,
    ).toBe("applied");
  });
});
