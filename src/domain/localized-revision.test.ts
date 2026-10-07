import { describe, expect, it } from "vitest";
import { type CapabilityGrant, grantsForRoles } from "./capabilities";
import {
  guardLocaleTransition,
  isApprovedForSource,
  type LocaleState,
  localeStates,
  localeTransitions,
  staleAfterSourceChange,
} from "./localized-revision";
import { applyTransition } from "./transition";

const reviewer = { kind: "staff", id: "rev-1" } as const;
const current = { sourceRevisionId: "rev-4", currentSourceRevisionId: "rev-4" };

describe("localized revisions (architecture §7.1, §7.2)", () => {
  it("match the architecture's locale states", () => {
    expect([...localeStates]).toEqual([
      "missing",
      "draft",
      "reviewing",
      "approved_for_source",
      "stale",
      "rejected",
    ]);
  });

  it("AT23: a source change makes approved copy stale and leaves the new source's copy alone", () => {
    const revisions = [
      { locale: "en", state: "approved_for_source", sourceRevisionId: "rev-3" },
      { locale: "de", state: "draft", sourceRevisionId: "rev-3" },
      { locale: "ru", state: "reviewing", sourceRevisionId: "rev-4" },
    ] as const;
    expect(staleAfterSourceChange(revisions, "rev-4")).toEqual([
      { locale: "en", state: "stale", sourceRevisionId: "rev-3" },
      { locale: "de", state: "stale", sourceRevisionId: "rev-3" },
    ]);
    expect(isApprovedForSource(revisions[0], "rev-4")).toBe(false);
    expect(isApprovedForSource({ ...revisions[0], sourceRevisionId: "rev-4" }, "rev-4")).toBe(true);
  });

  it("AT23: approval of copy reviewed against an older source is refused", () => {
    expect(
      guardLocaleTransition(
        "reviewing",
        "approved_for_source",
        {
          sourceRevisionId: "rev-3",
          currentSourceRevisionId: "rev-4",
          protectedFactsChecked: true,
        },
        reviewer,
      ),
    ).toEqual({ outcome: "denied", code: "source_revision_changed" });
  });

  it("AT21: approval needs the protected facts checked against the source", () => {
    expect(guardLocaleTransition("reviewing", "approved_for_source", current, reviewer)).toEqual({
      outcome: "denied",
      code: "protected_facts_unchecked",
    });
  });

  it("AT52: Butler drafts copy but never approves it", () => {
    expect(
      guardLocaleTransition(
        "reviewing",
        "approved_for_source",
        { ...current, protectedFactsChecked: true },
        { kind: "ai_service", id: "hermes" },
      ),
    ).toEqual({ outcome: "denied", code: "human_required" });
  });

  it("AT22: locale review is scoped to the reviewer's locales", () => {
    const grants: CapabilityGrant[] = [
      ...grantsForRoles(["translation_reviewer"]).filter(
        (g) => g.capability !== "translation.review",
      ),
      { capability: "translation.review", scope: { locales: ["de"] } },
    ];
    const record = {
      id: "lr1",
      state: "reviewing" as LocaleState,
      version: 1,
      locale: "en" as const,
    };
    const request = {
      actor: reviewer,
      capabilities: grants,
      expectedVersion: 1,
      to: "approved_for_source" as LocaleState,
      evidence: { ...current, protectedFactsChecked: true },
      operationId: "op",
      at: "2026-09-24T10:00:00Z",
    };
    expect(applyTransition(localeTransitions, record, request)).toEqual({
      outcome: "denied",
      code: "missing_capability",
    });
    expect(applyTransition(localeTransitions, { ...record, locale: "de" }, request).outcome).toBe(
      "applied",
    );
  });
});
