import { describe, expect, it } from "vitest";
import {
  type DestinationOutcome,
  deriveReleaseDistribution,
  guardReleaseConfirmation,
  planReleaseRepair,
  type ReleaseReadiness,
} from "./publication";

const outcome = (
  destination: DestinationOutcome["destination"],
  state: DestinationOutcome["state"],
) => ({ destination, locale: "bg", state }) as const;

const ready: ReleaseReadiness = {
  factualApprovalValid: true,
  ownerApprovalValid: true,
  currentSourceVersion: 7,
  locales: [
    { locale: "bg" },
    { locale: "en", translationState: "approved", translationSourceVersion: 7 },
  ],
  mediaAllPublishable: true,
  destinations: ["website"],
};
const publisher = { kind: "staff", id: "pub-1" } as const;

describe("publication releases (F24)", () => {
  it("A56: partial publication is destination-specific", () => {
    const outcomes = [outcome("website", "verified"), outcome("partner_feed", "failed")];
    expect(deriveReleaseDistribution("publish", outcomes)).toEqual({
      state: "partially_published",
      urgent: false,
    });
    expect(deriveReleaseDistribution("publish", [outcome("website", "acknowledged")]).state).toBe(
      "publishing",
    );
    expect(deriveReleaseDistribution("publish", [outcome("website", "verified")]).state).toBe(
      "published",
    );
  });

  it("A56: repair retries only failed destinations and reconciles unknown ones first", () => {
    const outcomes = [
      outcome("website", "verified"),
      outcome("sitemap", "outcome_unknown"),
      outcome("partner_feed", "failed"),
    ];
    const plan = planReleaseRepair(outcomes);
    expect(plan.retry.map((o) => o.destination)).toEqual(["partner_feed"]);
    expect(plan.reconcileFirst.map((o) => o.destination)).toEqual(["sitemap"]);
  });

  it("a correction that failed everywhere leaves stale content live and is urgent", () => {
    expect(deriveReleaseDistribution("correction", [outcome("website", "failed")])).toEqual({
      state: "failed",
      urgent: true,
    });
    expect(deriveReleaseDistribution("publish", [outcome("website", "failed")]).urgent).toBe(false);
  });

  it("a failed withdrawal leaves content live and is urgent", () => {
    expect(deriveReleaseDistribution("withdraw", [outcome("website", "failed")])).toEqual({
      state: "published",
      urgent: true,
    });
    expect(deriveReleaseDistribution("withdraw", [outcome("website", "verified")]).state).toBe(
      "withdrawn",
    );
  });

  it("confirms a release only for approved facts, translations of the current source and cleared media", () => {
    expect(guardReleaseConfirmation(ready, publisher).outcome).toBe("allowed");
    expect(
      guardReleaseConfirmation(
        {
          ...ready,
          locales: [{ locale: "en", translationState: "approved", translationSourceVersion: 6 }],
        },
        publisher,
      ),
    ).toEqual({ outcome: "denied", code: "translation_not_approved" });
    expect(guardReleaseConfirmation({ ...ready, mediaAllPublishable: false }, publisher)).toEqual({
      outcome: "denied",
      code: "media_not_publishable",
    });
    expect(guardReleaseConfirmation({ ...ready, ownerApprovalValid: false }, publisher)).toEqual({
      outcome: "denied",
      code: "owner_approval_required",
    });
  });

  it("A66: the AI service cannot confirm a release", () => {
    expect(guardReleaseConfirmation(ready, { kind: "ai_service", id: "hermes" })).toEqual({
      outcome: "denied",
      code: "human_required",
    });
  });
});
