import { describe, expect, it } from "vitest";
import * as i18n from "@/i18n/config";
import {
  draftOnlyCapabilities,
  grantsForRoles,
  hasCapability,
  rolePresets,
  roles,
} from "./capabilities";
import { isKnown, known, listingPurposes, money, presentInEuro, pricePeriods } from "./facts";
import {
  formatListingReference,
  formatReference,
  parseReference,
  publicLocales,
  staffLocales,
} from "./ids";
import { isMediaPublishable, moveRelation } from "./media";
import { decideReplay } from "./operation-receipt";

describe("ids and references", () => {
  it("keeps legacy lot numbers as listing references", () => {
    expect(formatListingReference(100)).toBe("MS-00100");
    expect(parseReference(" ms-00815 ")).toEqual({ kind: "listing", reference: "MS-00815" });
  });

  it("formats and parses yearly references", () => {
    expect(formatReference("inquiry", 2026, 42)).toBe("RQ-2026-000042");
    expect(parseReference("RQ-2026-000042")?.kind).toBe("inquiry");
    expect(parseReference("XX-2026-000042")).toBeNull();
  });

  it("locale codes match the i18n configuration", () => {
    expect(publicLocales).toEqual(i18n.publicLocales);
    expect(staffLocales).toEqual(i18n.staffLocales);
  });
});

describe("facts", () => {
  it("false is a known value, not unknown", () => {
    const fact = known(false, { sourceClass: "owner_confirmed" });
    expect(isKnown(fact)).toBe(true);
  });

  it("money is integer minor units in a supported currency with a purpose period", () => {
    expect(() => money(10.5, "EUR", "total")).toThrow();
    expect(() => money(100, "XYZ", "total")).toThrow();
    expect(money(9_500_000, "EUR", "total")).toEqual({
      amountMinor: 9_500_000,
      currency: "EUR",
      period: "total",
      basis: "asking",
    });
    // Short stays are not a listing purpose; night/week periods are retired (§3.2).
    expect(pricePeriods).toEqual(["total", "month"]);
    expect(listingPurposes).toEqual(["sale", "long_term_rent"]);
  });

  it("presents historical BGN amounts in euro without rewriting the original", () => {
    // 195 583.00 BGN is exactly 100 000.00 EUR at the fixed rate.
    expect(presentInEuro({ amountMinor: 19_558_300, currency: "BGN" })).toEqual({
      amountMinor: 10_000_000,
      currency: "EUR",
      original: { amountMinor: 19_558_300, currency: "BGN" },
    });
    // Half-up to the cent: 1.00 BGN = 0.5113 EUR -> 0.51 EUR.
    expect(presentInEuro({ amountMinor: 100, currency: "BGN" }).amountMinor).toBe(51);
    expect(presentInEuro({ amountMinor: 9_500_000, currency: "EUR" })).toMatchObject({
      amountMinor: 9_500_000,
      currency: "EUR",
    });
  });
});

describe("capabilities (architecture §8.2)", () => {
  it("has a preset for every role", () => {
    expect(Object.keys(rolePresets).sort()).toEqual([...roles].sort());
  });

  it("AT52: the AI service preset holds drafting capabilities only", () => {
    expect([...rolePresets.ai_service].sort()).toEqual([...draftOnlyCapabilities].sort());
  });

  it("AT52: grants presented for the AI service cannot confer consequential authority", () => {
    const hermes = { kind: "ai_service", id: "hermes" } as const;
    const everything = grantsForRoles([...roles]);
    for (const capability of [
      "publication.release",
      "message.send_external",
      "translation.review",
      "access.grant",
    ] as const) {
      expect(hasCapability(hermes, everything, capability)).toBe(false);
    }
    expect(hasCapability(hermes, everything, "message.draft")).toBe(true);
  });

  it("a coordinator arranges viewings without reading restricted documents", () => {
    const coordinator = { kind: "staff", id: "c1" } as const;
    const grants = grantsForRoles(["coordinator"]);
    expect(hasCapability(coordinator, grants, "appointment.manage")).toBe(true);
    expect(hasCapability(coordinator, grants, "document.read_restricted")).toBe(false);
  });

  it("record-scoped and expiring grants apply only to their record and time", () => {
    const specialist = { kind: "client", id: "sp1" } as const;
    const grants = [
      {
        capability: "portal.case.read",
        scope: { recordType: "case", recordId: "case-1", expiresAt: "2026-10-01T00:00:00Z" },
      },
    ] as const;
    const context = { recordType: "case", recordId: "case-1", now: "2026-09-24T00:00:00Z" };
    expect(hasCapability(specialist, grants, "portal.case.read", context)).toBe(true);
    expect(
      hasCapability(specialist, grants, "portal.case.read", { ...context, recordId: "case-2" }),
    ).toBe(false);
    expect(
      hasCapability(specialist, grants, "portal.case.read", {
        ...context,
        now: "2026-10-02T00:00:00Z",
      }),
    ).toBe(false);
    expect(
      hasCapability(specialist, grants, "portal.case.read", {
        recordType: "case",
        recordId: "case-1",
      }),
    ).toBe(false);
  });

  it("no preset grants legal/process claim approval", () => {
    for (const role of roles) expect(rolePresets[role]).not.toContain("claim.approve");
  });
});

describe("media eligibility", () => {
  it("AT28: media is publishable only when sealed, clean, processed, cleared, reviewed and disclosed", () => {
    const eligible = {
      audience: "public_candidate",
      sealedSha256: "sha256-sealed",
      scan: "clean",
      processing: "ready",
      rights: "cleared",
      review: "approved",
      modification: "none",
    } as const;
    expect(isMediaPublishable(eligible)).toBe(true);
    expect(isMediaPublishable({ ...eligible, rights: "unknown" })).toBe(false);
    expect(isMediaPublishable({ ...eligible, sealedSha256: null })).toBe(false);
    expect(isMediaPublishable({ ...eligible, scan: "failed" })).toBe(false);
    expect(isMediaPublishable({ ...eligible, audience: "private" })).toBe(false);
    expect(isMediaPublishable({ ...eligible, modification: "virtually_staged" })).toBe(false);
    expect(
      isMediaPublishable({
        ...eligible,
        modification: "virtually_staged",
        modificationDisclosure: "Virtually staged",
      }),
    ).toBe(true);
  });

  it("AT20: a move keeps hidden relations and duplicate placements in their relative order", () => {
    const gallery = ["a", "hidden", "b", "a-again", "c"].map((relationId, position) => ({
      relationId,
      position,
    }));
    expect(moveRelation(gallery, "c", { before: "a" }).map((p) => p.relationId)).toEqual([
      "c",
      "a",
      "hidden",
      "b",
      "a-again",
    ]);
    expect(moveRelation(gallery, "a", { after: "a-again" }).map((p) => p.position)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });
});

describe("operations (§5.1)", () => {
  const receipt = {
    idempotencyKey: "k",
    operationType: "inquiry.submit",
    requestHash: "h1",
    status: "succeeded",
  } as const;

  it("AT10: a repeated submission replays the one logical receipt", () => {
    expect(decideReplay(null, "h1")).toEqual({ action: "execute" });
    expect(decideReplay(receipt, "h1")).toEqual({ action: "replay", receipt });
  });

  it("AT11: an unknown outcome is reconciled, never re-executed; a reused key with other content is rejected", () => {
    expect(decideReplay({ ...receipt, status: "outcome_unknown" }, "h1").action).toBe("reconcile");
    expect(decideReplay(receipt, "h2")).toEqual({
      action: "reject",
      code: "idempotency_key_reused",
    });
  });
});
