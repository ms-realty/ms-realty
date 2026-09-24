import { describe, expect, it } from "vitest";
import type { Actor } from "./capabilities";
import {
  derivePublicPresentation,
  distributionTransitions,
  guardCommercialTransition,
  guardDistributionTransition,
  guardEditorialTransition,
  guardFreshnessTransition,
  type ListingDimensions,
} from "./listing";

const broker: Actor = { kind: "staff", id: "staff-1" };
const timer: Actor = { kind: "system", id: "freshness-timer" };

const live: ListingDimensions = {
  commercial: "available",
  editorial: "approved",
  distribution: "published",
  publishedVersion: 3,
  freshness: "current",
  translations: { en: "approved", de: "stale", ru: "draft" },
};

describe("listing dimensions (§07.4)", () => {
  it("commercial transitions need a reason; reserved needs its stated basis", () => {
    expect(
      guardCommercialTransition(
        "available",
        "reserved",
        { purpose: "sale", reason: "Deposit" },
        broker,
      ),
    ).toEqual({
      outcome: "denied",
      code: "reservation_basis_required",
    });
  });

  it("sold is only for a sale and let only for a rental, both with evidence", () => {
    expect(
      guardCommercialTransition(
        "reserved",
        "let",
        { purpose: "sale", reason: "x", evidenceIds: ["d"] },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "purpose_mismatch" });
    expect(
      guardCommercialTransition(
        "reserved",
        "sold",
        { purpose: "sale", reason: "x", evidenceIds: ["d"] },
        broker,
      ).outcome,
    ).toBe("allowed");
  });

  it("a timer cannot prove availability or freshness", () => {
    expect(
      guardCommercialTransition(
        "availability_unconfirmed",
        "available",
        { purpose: "sale", reason: "Checked" },
        timer,
      ),
    ).toEqual({
      outcome: "denied",
      code: "human_required",
    });
    expect(
      guardFreshnessTransition(
        "review_due",
        "current",
        { reviewedAt: "2026-09-24T09:00:00Z" },
        timer,
      ),
    ).toEqual({
      outcome: "denied",
      code: "human_required",
    });
    expect(guardFreshnessTransition("current", "review_due", {}, timer).outcome).toBe("allowed");
  });

  it("A53: editorial approval needs a valid approval of this revision; review needs complete facts", () => {
    expect(
      guardEditorialTransition("draft", "in_review", { missingRequiredFacts: 2 }, broker),
    ).toEqual({
      outcome: "denied",
      code: "required_facts_missing",
    });
    expect(
      guardEditorialTransition("in_review", "approved", { approvalValid: false }, broker),
    ).toEqual({
      outcome: "denied",
      code: "approval_required",
    });
  });
});

describe("derivePublicPresentation", () => {
  it("serves the source locale and approved translations only", () => {
    expect(derivePublicPresentation(live, { locale: "bg", localeIndexable: true })).toMatchObject({
      visible: true,
      servedInLocale: true,
      indexable: true,
      availability: "available",
      primaryAction: "request_viewing",
    });
    expect(
      derivePublicPresentation(live, { locale: "en", localeIndexable: true }).servedInLocale,
    ).toBe(true);
    // Material change: the stale locale is paused, the others stay live.
    expect(
      derivePublicPresentation(live, { locale: "de", localeIndexable: true }).servedInLocale,
    ).toBe(false);
    expect(
      derivePublicPresentation(live, { locale: "ru", localeIndexable: true }).servedInLocale,
    ).toBe(false);
  });

  it("A55: an approved translation is not indexable unless the locale is approved for indexing", () => {
    expect(derivePublicPresentation(live, { locale: "en", localeIndexable: false }).indexable).toBe(
      false,
    );
  });

  it("published is not available: stale evidence asks for confirmation", () => {
    const presentation = derivePublicPresentation(
      { ...live, freshness: "review_due" },
      { locale: "bg", localeIndexable: true },
    );
    expect(presentation.availability).toBe("needs_confirmation");
    expect(presentation.primaryAction).toBe("ask_question");
  });

  it("A25: a sold listing can stay published for history and leads to similar properties", () => {
    const presentation = derivePublicPresentation(
      { ...live, commercial: "sold" },
      { locale: "bg", localeIndexable: true },
    );
    expect(presentation).toMatchObject({
      visible: true,
      availability: "sold",
      primaryAction: "view_similar",
    });
  });

  it("an unpublished listing can be privately available", () => {
    const presentation = derivePublicPresentation(
      { ...live, distribution: "never_published", publishedVersion: null },
      { locale: "bg", localeIndexable: true },
    );
    expect(presentation).toMatchObject({
      visible: false,
      indexable: false,
      availability: "available",
    });
  });

  it("A53: a newer draft does not unpublish the released version", () => {
    const presentation = derivePublicPresentation(
      { ...live, editorial: "draft" },
      { locale: "bg", localeIndexable: true },
    );
    expect(presentation).toMatchObject({ visible: true, pendingChanges: true });
  });

  it("§07.4: a correction in flight or failed keeps the live version visible and indexable", () => {
    for (const distribution of ["publishing", "failed"] as const) {
      expect(
        derivePublicPresentation(
          { ...live, distribution },
          { locale: "bg", localeIndexable: true },
        ),
      ).toMatchObject({ visible: true, indexable: true });
    }
    // A first release that failed has nothing live.
    expect(
      derivePublicPresentation(
        { ...live, distribution: "failed", publishedVersion: null },
        { locale: "bg", localeIndexable: true },
      ).visible,
    ).toBe(false);
  });
});

describe("distribution transitions (§07.4)", () => {
  const release = (kind: "publish" | "correction" | "withdraw", state: "verified" | "failed") => ({
    release: {
      id: "rel-1",
      kind,
      outcomes: [{ destination: "website", locale: "bg", state }] as const,
    },
  });
  const job = { kind: "system", id: "publication-release" } as const;

  it("the target must be what the release's destination outcomes derive, not a bare release id", () => {
    expect(
      guardDistributionTransition(
        "publishing",
        "published",
        { release: { id: "rel-1", kind: "publish", outcomes: [] } },
        broker,
      ),
    ).toEqual({ outcome: "denied", code: "release_outcome_mismatch" });
    expect(
      guardDistributionTransition("publishing", "published", release("publish", "failed"), job),
    ).toEqual({ outcome: "denied", code: "release_outcome_mismatch" });
    expect(
      guardDistributionTransition("publishing", "published", release("publish", "verified"), job)
        .outcome,
    ).toBe("allowed");
  });

  it("a failed correction can still be withdrawn", () => {
    expect(distributionTransitions.machine.check("failed", "withdrawing").outcome).toBe("allowed");
  });
});
