import { describe, expect, it } from "vitest";
import {
  type MigrationReceipt,
  migrationCompletion,
  migrationStopped,
  type RuntimeProof,
  runtimeProof,
} from "./runtime-proof";

const source = "a".repeat(40);
const nonce = "12345678-1234-4321-9876-123456789abc";
const operation = "12345678-5678-4321-9876-123456789abc";
const running: MigrationReceipt = {
  status: "running",
  operationId: operation,
  configuredDigest: `sha256:${"b".repeat(64)}`,
  digestVerification: "unqualified",
  sourceCommit: source,
  buildNonce: nonce,
};
const completed: RuntimeProof = {
  schemaVersion: 1,
  role: "migrator",
  sourceCommit: source,
  buildNonce: nonce,
  state: "completed",
  operationId: operation,
  completedAt: "2026-10-01T12:00:00.000Z",
};
describe("Explicit migration completion and immutable source proof", () => {
  it("holds a synthesized SDK exit zero and cannot promote uncertainty on later polling", () => {
    const unknown = migrationStopped(running, { exitCode: 0, reason: "exit" });
    expect(unknown.status).toBe("unknown");
    expect(migrationCompletion(unknown, runtimeProof(completed, "migrator", source))).toEqual(
      unknown,
    );
    expect(migrationStopped(running, { exitCode: 0, reason: "runtime_signal" }).status).toBe(
      "unknown",
    );
  });
  it("records only explicit completion of the same operation and image nonce, without digest attestation", () => {
    const receipt = migrationCompletion(running, runtimeProof(completed, "migrator", source));
    expect(receipt).toMatchObject({
      status: "completed",
      sourceCommit: source,
      operationId: operation,
      buildNonce: nonce,
      digestVerification: "unqualified",
    });
    expect(receipt).not.toHaveProperty("observedDigest");
    expect(migrationCompletion({ ...running, buildNonce: undefined }, completed).status).toBe(
      "unknown",
    );
    expect(migrationStopped(receipt, { exitCode: 0, reason: "exit" })).toEqual(receipt);
    for (const changed of [
      { operationId: "87654321-5678-4321-9876-123456789abc" },
      { buildNonce: "87654321-1234-4321-9876-123456789abc" },
      { sourceCommit: "c".repeat(40) },
      { completedAt: "invalid" },
    ])
      expect(
        migrationCompletion(
          running,
          runtimeProof({ ...completed, ...changed }, "migrator", changed.sourceCommit ?? source),
        ).status,
      ).toBe("unknown");
  });
  it("holds incomplete operations and rejects another role or Worker-configured source", () => {
    expect(
      migrationCompletion(
        running,
        runtimeProof({ ...completed, state: "running" }, "migrator", source),
      ).status,
    ).toBe("running");
    expect(
      migrationCompletion(
        running,
        runtimeProof({ ...completed, state: "failed" }, "migrator", source),
      ).status,
    ).toBe("failed");
    expect(() => runtimeProof(completed, "web", source)).toThrow();
    expect(() => runtimeProof(completed, "migrator", "c".repeat(40))).toThrow();
    expect(() =>
      runtimeProof({ ...completed, buildNonce: "env-digest" }, "migrator", source),
    ).toThrow();
    expect(migrationStopped(running, { exitCode: 1, reason: "exit" }).status).toBe("failed");
  });
});
