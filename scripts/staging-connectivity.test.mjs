import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { validateConnectionProof } from "./staging-connection-proof.mjs";

function fixture() {
  const sourceCommit = "a".repeat(40),
    accountId = "b".repeat(32),
    buildNonce = randomUUID();
  const input = {
    accountId,
    workerName: "ms-realty-staging",
    sourceCommit,
    image: `registry.cloudflare.com/${accountId}/ms-realty-staging@sha256:${"c".repeat(64)}`,
    database: {
      transport: "cloudflared-access-tcp",
      stagingName: "local_fixture",
      roles: { web: "web", worker: "worker", migrator: "migrator" },
    },
  };
  const runtime = { schemaVersion: 1, roles: {} },
    packet = { roles: {} };
  for (const [index, role] of ["web", "worker", "migrator"].entries()) {
    const identity = {
      schemaVersion: 1,
      role,
      sourceCommit,
      buildNonce,
      state: "prepared",
      actorId: String(index + 1).repeat(64),
    };
    runtime.roles[role] = identity;
    const session = {
      database: input.database.stagingName,
      role,
      engineVersion: "16.14",
      ssl: true,
      tlsVersion: "TLSv1.3",
      cipher: "fixture",
    };
    packet.roles[role] = {
      identity: structuredClone(identity),
      proof: {
        ...identity,
        connection: {
          schemaVersion: 1,
          status: "PASS",
          measuredAt: new Date(Date.now() - 1000).toISOString(),
          transport: input.database.transport,
          tlsVerification: "verify-full",
          drivers: { "postgres-js": structuredClone(session), pg: structuredClone(session) },
        },
      },
    };
  }
  return { input, runtime, packet };
}
test("a listener or image label alone cannot qualify a staging SQL connection", () => {
  const { input, runtime, packet } = fixture();
  validateConnectionProof(input, runtime, packet);
  assert.throws(() => validateConnectionProof(input, runtime, {}));
  for (const role of ["web", "worker", "migrator"]) {
    const changed = structuredClone(packet);
    delete changed.roles[role].proof.connection;
    assert.throws(() => validateConnectionProof(input, runtime, changed));
  }
});
test("each driver and each role require real TLS, exact database/role/engine and fresh measurement", () => {
  for (const role of ["web", "worker", "migrator"]) {
    for (const driver of ["postgres-js", "pg"]) {
      for (const override of [
        { ssl: false },
        { database: "production" },
        { role: "postgres" },
        { engineVersion: "18" },
        { tlsVersion: "TLSv1" },
      ]) {
        const { input, runtime, packet } = fixture();
        Object.assign(packet.roles[role].proof.connection.drivers[driver], override);
        assert.throws(() => validateConnectionProof(input, runtime, packet));
      }
    }
    for (const mutate of [
      (entry) => {
        entry.proof.buildNonce = randomUUID();
      },
      (entry) => {
        entry.identity.actorId = "f".repeat(64);
      },
      (entry) => {
        entry.proof.state = "running";
      },
      (entry) => {
        entry.proof.connection.transport = "direct";
      },
      (entry) => {
        entry.proof.connection.measuredAt = new Date(Date.now() - 600_000).toISOString();
      },
      (entry) => {
        entry.proof.connection.measuredAt = new Date(Date.now() + 60_000).toISOString();
      },
    ]) {
      const { input, runtime, packet } = fixture();
      mutate(packet.roles[role]);
      assert.throws(() => validateConnectionProof(input, runtime, packet));
    }
  }
});
