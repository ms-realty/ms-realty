import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { recoveryRestriction } from "./journal";

it("R08 restrictive payloads exclude commands, credentials, unknown targets and permissive effects", () => {
  const restriction = {
    kind: "access_revocation",
    decisionId: randomUUID(),
    authorizationDigest: "a".repeat(64),
    principalKind: "staff",
    principalId: randomUUID(),
    target: { kind: "grant", id: randomUUID(), version: 1 },
  };
  expect(recoveryRestriction.parse(restriction)).toEqual(restriction);
  for (const malformed of [
    { ...restriction, kind: "accepted_operation" },
    { ...restriction, kind: "access_grant" },
    { ...restriction, bearerToken: "synthetic-secret-for-negative-check" },
    { ...restriction, target: { ...restriction.target, kind: "unknown_table" } },
    { ...restriction, target: { ...restriction.target, version: 0 } },
    { ...restriction, principalKind: "service" },
  ])
    expect(recoveryRestriction.safeParse(malformed).success).toBe(false);
});
