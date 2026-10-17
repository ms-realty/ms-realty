import { describe, expect, it } from "vitest";
import {
  type ActivationInput,
  checkActivation,
  deliveryMachine,
  deliveryStates,
  derivePublicPresentation,
  fenceDelivery,
  type PointerDependency,
  planDeliveryRepair,
  planMaterialRestriction,
  planWithdrawal,
  publicationStates,
} from "./publication";

const publisher = { kind: "staff", id: "pub-1" } as const;

const eligible: ActivationInput = {
  locale: "en",
  manifestGeneration: 3,
  currentGeneration: 3,
  commercial: "available",
  factReviewValid: true,
  revisionApprovalValid: true,
  sellerInstructionValid: true,
  localeApprovedForSource: true,
  mediaEligible: true,
  regulatedClaimsReviewed: "not_applicable",
};

const pointer = (
  locale: PointerDependency["locale"],
  provenUnaffected = false,
): PointerDependency => ({ locale, destination: "website", state: "active", provenUnaffected });

describe("publication (architecture §7.1–§7.4)", () => {
  it("matches the architecture's publication and destination delivery states", () => {
    expect([...publicationStates]).toEqual([
      "never_published",
      "eligible",
      "active",
      "restricted",
      "withdrawn",
    ]);
    expect([...deliveryStates]).toEqual([
      "queued",
      "attempting",
      "acknowledged",
      "verified",
      "failed",
      "outcome_unknown",
      "withdrawing",
      "withdrawn",
    ]);
  });

  it("activates an approved manifest of the current generation", () => {
    expect(checkActivation(eligible, publisher).outcome).toBe("allowed");
    // The source locale needs no localized approval.
    expect(
      checkActivation({ ...eligible, locale: "bg", localeApprovedForSource: false }, publisher)
        .outcome,
    ).toBe("allowed");
  });

  it("AT22: publishing is a human decision; Butler and jobs cannot activate", () => {
    expect(checkActivation(eligible, { kind: "ai_service", id: "hermes" })).toEqual({
      outcome: "denied",
      code: "human_required",
    });
    expect(checkActivation(eligible, { kind: "system", id: "publication-delivery" })).toEqual({
      outcome: "denied",
      code: "human_required",
    });
  });

  it("AT23: a locale approved for an older source cannot be activated", () => {
    expect(checkActivation({ ...eligible, localeApprovedForSource: false }, publisher)).toEqual({
      outcome: "denied",
      code: "locale_not_approved_for_source",
    });
    expect(checkActivation({ ...eligible, revisionApprovalValid: false }, publisher)).toEqual({
      outcome: "denied",
      code: "approval_stale",
    });
  });

  it("refuses missing fact review, instruction, media or professional review", () => {
    expect(checkActivation({ ...eligible, factReviewValid: false }, publisher).outcome).toBe(
      "denied",
    );
    expect(checkActivation({ ...eligible, sellerInstructionValid: false }, publisher)).toEqual({
      outcome: "denied",
      code: "seller_instruction_required",
    });
    expect(checkActivation({ ...eligible, mediaEligible: false }, publisher)).toEqual({
      outcome: "denied",
      code: "media_not_eligible",
    });
    expect(checkActivation({ ...eligible, regulatedClaimsReviewed: false }, publisher)).toEqual({
      outcome: "denied",
      code: "professional_review_required",
    });
    expect(checkActivation({ ...eligible, commercial: "withdrawn" }, publisher)).toEqual({
      outcome: "denied",
      code: "listing_withdrawn",
    });
  });

  it("AT24: a material change restricts every active presentation not proven unaffected and increments the generation", () => {
    const plan = planMaterialRestriction([pointer("bg"), pointer("en"), pointer("de", true)], 3);
    expect(plan.nextGeneration).toBe(4);
    expect(plan.restrict.map((p) => p.locale)).toEqual(["bg", "en"]);
    expect(plan.keep.map((p) => p.locale)).toEqual(["de"]);
    // A manifest prepared before the restriction is now stale.
    expect(
      checkActivation({ ...eligible, currentGeneration: plan.nextGeneration }, publisher),
    ).toEqual({
      outcome: "denied",
      code: "generation_superseded",
    });
  });

  it("withdrawal removes every exposure at once and never waits for translation", () => {
    const plan = planWithdrawal(
      [
        pointer("bg"),
        { ...pointer("en"), state: "restricted" },
        { ...pointer("de"), state: "withdrawn" },
      ],
      7,
    );
    expect(plan).toEqual({
      nextGeneration: 8,
      withdraw: [pointer("bg"), { ...pointer("en"), state: "restricted" }],
    });
  });

  it("AT25: an old queued publication after withdrawal cannot resurrect any locale or destination", () => {
    const job = { kind: "publish", manifestId: "m-old", generation: 3 } as const;
    expect(fenceDelivery(job, 4, { state: "withdrawn", manifestId: "m-old" })).toEqual({
      outcome: "denied",
      code: "generation_superseded",
    });
    expect(fenceDelivery(job, 3, { state: "active", manifestId: "m-new" })).toEqual({
      outcome: "denied",
      code: "manifest_superseded",
    });
    expect(fenceDelivery(job, 3, { state: "active", manifestId: "m-old" }).outcome).toBe("allowed");
    // A delayed withdrawal cannot take down a newer publication either.
    expect(
      fenceDelivery({ kind: "withdraw", manifestId: "m-old", generation: 3 }, 5, {
        state: "active",
        manifestId: "m-new",
      }).outcome,
    ).toBe("denied");
  });

  it("destination outcomes are separate; unknown outcomes are reconciled before retry", () => {
    const outcomes = [
      { destination: "website", locale: "bg", state: "verified" },
      { destination: "manual_portal", locale: "bg", state: "failed" },
      { destination: "manual_portal", locale: "en", state: "outcome_unknown" },
    ] as const;
    const plan = planDeliveryRepair(outcomes);
    expect(plan.retry.map((o) => o.locale)).toEqual(["bg"]);
    expect(plan.reconcileFirst.map((o) => o.locale)).toEqual(["en"]);
    expect(deliveryMachine.check("outcome_unknown", "queued").outcome).toBe("denied");
    expect(deliveryMachine.check("acknowledged", "verified").outcome).toBe("allowed");
  });

  it("published is not available, and restricted keeps a truthful unavailable surface", () => {
    expect(
      derivePublicPresentation({
        pointer: "active",
        commercial: "available",
        freshness: "review_due",
        localeIndexable: true,
      }),
    ).toEqual({
      visible: true,
      indexable: true,
      surface: "listing",
      availability: "confirmation_required",
      primaryAction: "ask_question",
    });
    expect(
      derivePublicPresentation({
        pointer: "restricted",
        commercial: "available",
        freshness: "current_under_policy",
        localeIndexable: true,
      }),
    ).toMatchObject({ visible: false, indexable: false, surface: "unavailable" });
    expect(
      derivePublicPresentation({
        pointer: null,
        commercial: "available",
        freshness: "current_under_policy",
        localeIndexable: true,
      }).surface,
    ).toBe("not_found");
  });
});
