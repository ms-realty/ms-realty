import { describe, expect, it } from "vitest";
import type { Actor, CapabilityGrant } from "@/domain/capabilities";
import { heldCapabilitiesFromGrants } from "./authz";

const actor: Actor = { kind: "staff", id: "00000000-0000-4000-8000-000000000001" };

describe("workspace grant projection", () => {
  it("uses the same unscoped authorization rules for one fresh grant snapshot", () => {
    const grants: CapabilityGrant[] = [{ capability: "listing.read" }];
    expect([
      ...heldCapabilitiesFromGrants(actor, grants, ["listing.read", "access.grant"]),
    ]).toEqual(["listing.read"]);
  });

  it("does not widen a record-scoped grant into an agency-wide control", () => {
    const grants: CapabilityGrant[] = [
      {
        capability: "listing.read",
        scope: { recordType: "listing", recordId: "00000000-0000-4000-8000-000000000002" },
      },
    ];
    expect(heldCapabilitiesFromGrants(actor, grants, ["listing.read"]).size).toBe(0);
  });

  it("retains no permission between separate request snapshots", () => {
    expect(
      heldCapabilitiesFromGrants(actor, [{ capability: "access.grant" }], ["access.grant"]).has(
        "access.grant",
      ),
    ).toBe(true);
    expect(heldCapabilitiesFromGrants(actor, [], ["access.grant"]).size).toBe(0);
  });
});
