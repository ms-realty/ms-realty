import { describe, expect, it } from "vitest";
import * as i18n from "@/i18n/config";
import {
  draftOnlyCapabilities,
  grantsForRoles,
  hasCapability,
  rolePresets,
  roles,
} from "./capabilities";
import { isKnown, known, money } from "./facts";
import {
  formatListingReference,
  formatReference,
  parseReference,
  publicLocales,
  staffLocales,
} from "./ids";
import { isMediaPublishable } from "./media";
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

  it("money is integer minor units in a supported currency", () => {
    expect(() => money(10.5, "EUR", "total")).toThrow();
    expect(() => money(100, "XYZ", "total")).toThrow();
    expect(money(9_500_000, "EUR", "total")).toEqual({
      amountMinor: 9_500_000,
      currency: "EUR",
      period: "total",
      basis: "asking",
    });
  });
});

describe("capabilities (§03)", () => {
  it("has a preset for every role", () => {
    expect(Object.keys(rolePresets).sort()).toEqual([...roles].sort());
  });

  it("A66: the AI service preset holds drafting capabilities only", () => {
    expect([...rolePresets.ai_service].sort()).toEqual([...draftOnlyCapabilities].sort());
  });

  it("A66: grants presented for the AI service cannot confer consequential authority", () => {
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
  it("A54: media is not publishable until rights are cleared and review passed; modifications are disclosed", () => {
    const cleared = { rights: "cleared", review: "approved", modification: "none" } as const;
    expect(isMediaPublishable(cleared)).toBe(true);
    expect(isMediaPublishable({ ...cleared, rights: "pending" })).toBe(false);
    expect(isMediaPublishable({ ...cleared, modification: "virtually_staged" })).toBe(false);
    expect(
      isMediaPublishable({
        ...cleared,
        modification: "virtually_staged",
        modificationDisclosure: "Virtually staged",
      }),
    ).toBe(true);
  });
});

describe("operation receipts", () => {
  const receipt = {
    idempotencyKey: "k",
    operationType: "inquiry.submit",
    requestHash: "h1",
    status: "succeeded",
  } as const;

  it("A18: a repeated submission replays the one logical receipt", () => {
    expect(decideReplay(null, "h1")).toEqual({ action: "execute" });
    expect(decideReplay(receipt, "h1")).toEqual({ action: "replay", receipt });
  });

  it("A40: an unknown outcome is reconciled, never re-executed; a reused key with other content is rejected", () => {
    expect(decideReplay({ ...receipt, status: "outcome_unknown" }, "h1").action).toBe("reconcile");
    expect(decideReplay(receipt, "h2")).toEqual({
      action: "reject",
      code: "idempotency_key_reused",
    });
  });
});
