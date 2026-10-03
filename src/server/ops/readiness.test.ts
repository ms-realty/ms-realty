// AT67: the readiness endpoint reports the evaluated snapshot only for the running release.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRelease } from "@/release/evaluate";
import { gateIds, gatePolicySchema, type ReleaseManifest } from "@/release/schemas";
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
  approvals: [],
  recoveryPoint: null,
  procedures: { cutover: null, rollback: null },
};
const snapshot = evaluateRelease({ manifest, policy, evidence: [], now: new Date() });

describe("readiness summary (AT67)", () => {
  it("reports the snapshot evaluated for the running build", () => {
    const status = summarizeReadiness(JSON.parse(JSON.stringify(snapshot)), sha);
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
    const status = summarizeReadiness(input, build);
    expect(status.snapshotState).toBe(state);
    expect(status.snapshot).toBeNull();
    expect(status.verdict).toBe("blocked");
    expect(status.gates.map((g) => g.id)).toEqual([...gateIds]);
    expect(status.gates.every((g) => g.status === "blocked")).toBe(true);
  });

  it("reads a snapshot file, and treats an absent one as missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "readiness-"));
    expect(await loadReadinessSnapshot(join(dir, "readiness.json"))).toBeNull();
    writeFileSync(join(dir, "readiness.json"), JSON.stringify(snapshot));
    expect(await loadReadinessSnapshot(join(dir, "readiness.json"))).toEqual(
      JSON.parse(JSON.stringify(snapshot)),
    );
    writeFileSync(join(dir, "broken.json"), "{");
    expect(
      summarizeReadiness(await loadReadinessSnapshot(join(dir, "broken.json")), sha).snapshotState,
    ).toBe("invalid");
  });
});
