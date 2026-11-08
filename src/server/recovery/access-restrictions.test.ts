import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { canonicalJson } from "@/domain/approval";
import {
  accessRecoveryRestriction,
  decodeAccessRecoveryRestriction,
  encodeAccessRecoveryRestriction,
  type GrantRevocationDecision,
  grantRevocationRestrictions,
} from "./access-restrictions";
import type { RecoverySourceContext } from "./write-fence";

const context: RecoverySourceContext = {
  product: "ms-realty",
  environment: "staging",
  releaseSha: "a".repeat(40),
  releaseContextDigest: "b".repeat(64),
  schemaDigest: "c".repeat(64),
  writerRegistryDigest: "d".repeat(64),
  databaseLineage: "synthetic-lineage",
  sourceInstance: "synthetic-source",
  writerEpoch: "synthetic-epoch",
  archiveNamespace: "synthetic-archive",
  euR2: "synthetic-eu",
  outsideAccount: "synthetic-outside",
  encryptionProfileDigest: "e".repeat(64),
};
function fixture(): GrantRevocationDecision {
  const actorId = randomUUID(),
    principalId = randomUUID();
  return {
    kind: "grant_revocation_server_observation_v2",
    basis: "observed_server_checks_and_audit_projection",
    decisionId: randomUUID(),
    operationId: randomUUID(),
    requestHash: "f".repeat(64),
    action: "access.capability.revoked",
    capability: "access.grant",
    reasonCode: "grant_revoked",
    actor: { kind: "staff", id: actorId },
    checkedSession: { id: randomUUID(), principalId: actorId, principalKind: "staff" },
    targetPrincipal: { kind: "client", id: principalId },
    grant: {
      kind: "grant",
      id: randomUUID(),
      observedVersion: 7,
      version: 8,
      role: null,
      capability: "document.review",
      scope: { recordType: null, recordId: null, locales: null, expiresAt: null },
    },
    checks: {
      liveFreshStaffSession: true,
      activePasskeyMinimum: true,
      authorityCapabilities: ["document.review"],
      usableManagerRemains: true,
    },
    revokedSessions: [0, 1].map(() => ({ id: randomUUID(), principalId, principalKind: "client" })),
  };
}

it("R08 C1 canonicalizes the exact set, retains the decision and independently recomputes its digest", () => {
  const decision = fixture();
  const first = grantRevocationRestrictions(decision);
  const reversed = grantRevocationRestrictions({
    ...decision,
    revokedSessions: [...decision.revokedSessions].reverse(),
  });
  expect(first).toEqual(reversed);
  expect(first).toHaveLength(3);
  for (const input of first) {
    const encoded = encodeAccessRecoveryRestriction(context, input);
    const decoded = decodeAccessRecoveryRestriction(context, encoded.canonicalBody);
    expect(decoded).toEqual(input);
    expect(input.authorizationDigest).toBe(
      createHash("sha256")
        .update(canonicalJson(["access-grant-revocation-observation-v2", input.decision]))
        .digest("hex"),
    );
    expect(encoded.digest).toBe(createHash("sha256").update(encoded.canonicalBody).digest("hex"));
    if (input.target.kind === "session") {
      expect(Object.keys(input.target).sort()).toEqual([
        "id",
        "kind",
        "principalId",
        "principalKind",
      ]);
      expect(input.target.principalKind).toBe("client");
    }
    expect(() =>
      decodeAccessRecoveryRestriction({ ...context, writerEpoch: "other" }, encoded.canonicalBody),
    ).toThrow();
    expect(() => decodeAccessRecoveryRestriction(context, ` ${encoded.canonicalBody}`)).toThrow();
  }
});

it("R08 C1 rejects invented versions, missing canonical decisions and contradictory bindings", () => {
  const decision = fixture();
  const [grant, session] = grantRevocationRestrictions(decision);
  if (!grant || !session) throw new Error("Missing fixture");
  for (const invalid of [
    { ...grant, codecVersion: 1 },
    { ...grant, kind: "access_grant" },
    { ...grant, decision: undefined },
    { ...grant, decisionId: randomUUID() },
    { ...grant, authorizationDigest: "0".repeat(64) },
    { ...grant, principal: { ...grant.principal, kind: "staff" } },
    { ...grant, target: { ...grant.target, id: randomUUID() } },
    { ...grant, target: { ...grant.target, version: 9 } },
    { ...grant, target: { ...grant.target, kind: "invitation" } },
    { ...session, target: { ...session.target, version: 1 } },
    { ...session, target: { ...session.target, principalKind: "staff" } },
    { ...session, target: { ...session.target, principalId: randomUUID() } },
    { ...grant, tokenHash: "synthetic-sensitive-negative" },
    { ...grant, decision: { ...grant.decision, reason: "arbitrary note" } },
    {
      ...grant,
      decision: {
        ...grant.decision,
        checkedSession: { ...grant.decision.checkedSession, token: "synthetic-sensitive-negative" },
      },
    },
  ]) {
    expect(accessRecoveryRestriction.safeParse(invalid).success).toBe(false);
    expect(() =>
      decodeAccessRecoveryRestriction(
        context,
        canonicalJson(["recovery-access-restriction-v2", "a".repeat(64), invalid]),
      ),
    ).toThrow();
  }
  for (const invalid of [
    { ...decision, revokedSessions: [decision.revokedSessions[0], decision.revokedSessions[0]] },
    {
      ...decision,
      revokedSessions: [{ ...decision.revokedSessions[0], principalId: randomUUID() }],
    },
    { ...decision, grant: { ...decision.grant, observedVersion: 6 } },
    { ...decision, grant: { ...decision.grant, version: Number.MAX_SAFE_INTEGER + 1 } },
  ])
    expect(() => grantRevocationRestrictions(invalid as GrantRevocationDecision)).toThrow();
});
