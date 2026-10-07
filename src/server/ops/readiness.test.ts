// AT67: the readiness endpoint reports the evaluated snapshot only for the running release.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateRelease } from "@/release/evaluate";
import { gateIds, gatePolicySchema, type ReleaseManifest } from "@/release/schemas";
import { readinessSnapshotDigest } from "@/release/signature";
import policyJson from "../../../release/policy.json";
import { readinessResponseSchema } from "../transport/registry";
import { loadReadinessSnapshot, summarizeReadiness } from "./readiness";

const sha = "c".repeat(40);
const policy = gatePolicySchema.parse(policyJson);
const manifest: ReleaseManifest = {
  schemaVersion: 1,
  product: "ms-realty",
  specVersion: "architecture-1.0",
  releaseSha: sha,
  environment: "staging",
  artifacts: { web: null, worker: null, migration: null, gateway: null },
  revisions: { dependencies: null, model: null, prompts: null, schemas: null },
  providerAccounts: {},
  database: { schemaDigest: null, lastMigration: null },
  manifests: { domains: null, redirects: null, media: null, dataImport: null },
  scope: { services: [], regions: [], locales: [], channels: [] },
  policies: {
    policyRevision: policy.policyRevision,
    roles: null,
    retention: null,
    templates: null,
  },
  evidenceIds: [],
  evidenceDigests: {},
  approvals: [],
  recoveryPoint: null,
  procedures: { cutover: null, rollback: null },
};
const now = new Date("2026-09-27T12:00:00.000Z");
const snapshot = evaluateRelease({ manifest, policy, evidence: [], now });
const binding = {
  environment: snapshot.release.environment,
  manifestDigest: snapshot.release.manifestDigest,
  policyDigest: snapshot.policy.policyDigest,
  snapshotDigest: snapshot.snapshotId,
  now,
};
const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("readiness summary (AT67)", () => {
  it("reports the snapshot evaluated for the running build", () => {
    const status = summarizeReadiness(JSON.parse(JSON.stringify(snapshot)), sha, binding);
    expect(readinessResponseSchema.parse(status)).toEqual(status);
    expect(status.snapshotState).toBe("current");
    expect(status.snapshot?.snapshotId).toBe(snapshot.snapshotId);
    expect(status.verdict).toBe("blocked");
    expect(status.gates.map((g) => g.status)).toEqual(snapshot.gates.map((g) => g.status));
  });

  it.each([
    ["missing", null, sha],
    ["other_release", snapshot, "d".repeat(40)],
    ["other_release", snapshot, null],
    ["invalid", { invalid: true }, sha],
  ] as const)("blocks every gate when the snapshot is %s", (state, input, build) => {
    const status = summarizeReadiness(input, build, binding);
    expect(status.snapshotState).toBe(state);
    expect(status.snapshot).toBeNull();
    expect(status.verdict).toBe("blocked");
    expect(status.gates.map((g) => g.id)).toEqual([...gateIds]);
    expect(status.gates.every((g) => g.status === "blocked")).toBe(true);
  });

  it("reads a snapshot file, and treats an absent one as missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "readiness-"));
    tempDirs.push(dir);
    expect(await loadReadinessSnapshot(join(dir, "readiness.json"))).toBeNull();
    writeFileSync(join(dir, "readiness.json"), JSON.stringify(snapshot));
    expect(await loadReadinessSnapshot(join(dir, "readiness.json"))).toEqual(
      JSON.parse(JSON.stringify(snapshot)),
    );
    writeFileSync(join(dir, "broken.json"), "{");
    expect(
      summarizeReadiness(await loadReadinessSnapshot(join(dir, "broken.json")), sha, binding)
        .snapshotState,
    ).toBe("invalid");
  });

  it.each([
    ["unbound", { manifestDigest: null }],
    ["other_environment", { environment: "production" }],
    ["other_manifest", { manifestDigest: `sha256:${"0".repeat(64)}` }],
    ["other_policy", { policyDigest: `sha256:${"0".repeat(64)}` }],
    ["other_snapshot", { snapshotDigest: `sha256:${"0".repeat(64)}` }],
    ["expired", { now: new Date(snapshot.expiresAt) }],
    ["invalid", { now: new Date("2026-09-27T11:00:00.000Z") }],
  ] as const)("blocks every gate for %s snapshot binding", (state, change) => {
    const status = summarizeReadiness(snapshot, sha, { ...binding, ...change });
    expect(status.snapshotState).toBe(state);
    expect(status.verdict).toBe("blocked");
    expect(status.gates.every((gate) => gate.status === "blocked")).toBe(true);
  });

  it("rejects edited reports, empty/duplicate gates and contradictory verdicts", () => {
    for (const change of [
      { verdict: "pass" },
      { gates: [] },
      { gates: [snapshot.gates[0], ...snapshot.gates.slice(0, -1)] },
      { expiresAt: "2026-09-29T12:00:00.000Z" },
      { evaluatedAt: "2026-09-27T12:01:00.000Z" },
    ]) {
      expect(summarizeReadiness({ ...snapshot, ...change }, sha, binding).snapshotState).toBe(
        "invalid",
      );
    }
    const forged = { ...snapshot, evaluatedAt: "2026-09-27T12:01:00.000Z" };
    forged.snapshotId = readinessSnapshotDigest(forged);
    expect(summarizeReadiness(forged, sha, binding).snapshotState).toBe("other_snapshot");
  });
});
