import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { encodeRecoveryRestriction, recoveryRestriction } from "./journal";

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

it("R08 preserves the fixed v1 canonical bytes and digests", () => {
  const context = {
    product: "ms-realty",
    environment: "staging",
    releaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    releaseContextDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    schemaDigest: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    writerRegistryDigest: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    databaseLineage: "synthetic-lineage",
    sourceInstance: "synthetic-source",
    writerEpoch: "synthetic-epoch",
    archiveNamespace: "synthetic-archive",
    euR2: "synthetic-eu",
    outsideAccount: "synthetic-outside",
    encryptionProfileDigest: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  } as const;
  const input = {
    kind: "access_revocation",
    decisionId: "10000000-0000-4000-8000-000000000001",
    authorizationDigest: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    principalKind: "staff",
    principalId: "10000000-0000-4000-8000-000000000002",
    target: {
      kind: "grant",
      id: "10000000-0000-4000-8000-000000000003",
      version: 7,
    },
  } as const;
  expect(encodeRecoveryRestriction(context, input)).toEqual({
    contextDigest: "636eabff086cc3c664de3dafd1a0fe2349bdf993562f2ae5f03d8576c8c960be",
    kind: "access_revocation",
    subjectDigest: "a1829c81f7cc2a6d4ed862af8c9fcbe2101c337bb551ec478b8367d5faf8cbff",
    digest: "9ce1773f651d24820b32e5f3c807f6170fdea34fc8f0f2613c7ea247954e30f0",
    canonicalBody:
      '["recovery-restriction-v1","636eabff086cc3c664de3dafd1a0fe2349bdf993562f2ae5f03d8576c8c960be",{"authorizationDigest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","decisionId":"10000000-0000-4000-8000-000000000001","kind":"access_revocation","principalId":"10000000-0000-4000-8000-000000000002","principalKind":"staff","target":{"id":"10000000-0000-4000-8000-000000000003","kind":"grant","version":7}}]',
    byteLength: 423,
  });
});
