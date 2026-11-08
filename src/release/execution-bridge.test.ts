// Synthetic keys/observations exercise the real local operator inspection seam only.
import { describe, expect, it } from "vitest";
// @ts-expect-error Existing Node operator script is intentionally JavaScript.
import * as cutover from "../../scripts/production-cutover.mjs";
// @ts-expect-error Test-only JavaScript fixtures reuse the existing production packet contract.
import { executionScenario } from "./execution-fixtures.mjs";
import { canonicalJson, readinessSnapshotDigest, sha256Digest } from "./signature";

const { inspectExecutionCandidate, prepareExecutionPlan } = cutover;

describe("R00–R10 purpose-bound execution inspection", () => {
  it("recomputes S and checks one separate owner grant through the actual cutover inspection seam, without activation", async () => {
    const f = executionScenario();
    expect(await prepareExecutionPlan(f.preparation, f.admission, new Date(f.at))).toEqual(
      f.packet.plan,
    );
    const result = await inspectExecutionCandidate(f.packet, f.admission, new Date(f.at));
    expect(result).toMatchObject({
      inspection: "verified",
      execution: "unavailable",
      operationId: f.packet.plan.operationId,
    });
    expect(result.remaining).toContain("durable_remote_admission_and_replay_fencing");
    expect(f.packet.candidate.snapshot.verdict).toBe("blocked");
    expect(f.packet.candidate.manifest.approvals).toHaveLength(1);
    expect(JSON.parse(f.packet.grant.payload).purpose).toBe("execution_grant");
  });

  it("requires independently supplied admission and rejects input-owned keys, flags and grant self-inclusion", async () => {
    const f = executionScenario();
    await expect(inspectExecutionCandidate(f.packet, undefined, new Date(f.at))).rejects.toThrow();
    for (const field of ["admittedTrust", "trustedKeys", "activate"]) {
      await expect(
        inspectExecutionCandidate(
          { ...f.packet, [field]: f.admission },
          f.admission,
          new Date(f.at),
        ),
      ).rejects.toThrow();
    }
    f.packet.candidate.evidence.push({ file: "grant.json", content: f.packet.grant.payload });
    await expect(inspectExecutionCandidate(f.packet, f.admission, new Date(f.at))).rejects.toThrow(
      "recomputed complete snapshot",
    );
  });

  it.each(["policyDigest", "trustedKeysDigest", "ownerKeyFingerprint"])(
    "rejects mismatched installed %s",
    async (field) => {
      const f = executionScenario();
      f.admission.release[field] = sha256Digest("different installed admission");
      await expect(
        inspectExecutionCandidate(f.packet, f.admission, new Date(f.at)),
      ).rejects.toThrow("recomputed complete snapshot");
    },
  );

  it.each(Array.from({ length: 11 }, (_, i) => `R${String(i).padStart(2, "0")}`))(
    "rejects a freshly recomputed candidate missing %s despite complete parity",
    async (id) => {
      const f = executionScenario();
      f.candidate.evidence = f.candidate.evidence.filter(
        (item: { gate: string }) => item.gate !== id,
      );
      f.refreshCandidate();
      await expect(
        prepareExecutionPlan(f.preparation, f.admission, new Date(f.at)),
      ).rejects.toThrow();
    },
  );

  it("rejects caller-authored snapshot digest, status, evidence or extended expiry", async () => {
    for (const field of ["status", "expiry", "evidence"]) {
      const f = executionScenario();
      const snapshot = f.packet.candidate.snapshot;
      if (field === "expiry") snapshot.expiresAt = new Date(f.at + 3_600_000).toISOString();
      if (field === "status") snapshot.gates[0].title = "caller-authored gate";
      if (field === "evidence") snapshot.evidence[0].digest = sha256Digest("substitute raw bytes");
      snapshot.snapshotId = readinessSnapshotDigest(snapshot);
      await expect(
        inspectExecutionCandidate(f.packet, f.admission, new Date(f.at)),
      ).rejects.toThrow("recomputed complete snapshot");
    }
  });

  it("uses the original evaluation time and expiry, and independently rejects future evaluation", async () => {
    const f = executionScenario();
    await expect(
      inspectExecutionCandidate(
        f.packet,
        f.admission,
        new Date(Date.parse(f.packet.candidate.snapshot.expiresAt)),
      ),
    ).rejects.toThrow("original snapshot freshness");
    f.packet.candidate.snapshot.evaluatedAt = new Date(f.at + 1).toISOString();
    f.packet.candidate.snapshot.snapshotId = readinessSnapshotDigest(f.packet.candidate.snapshot);
    await expect(inspectExecutionCandidate(f.packet, f.admission, new Date(f.at))).rejects.toThrow(
      "original snapshot freshness",
    );
  });

  it.each([
    "urls",
    "listings",
    "content",
    "seo",
    "locales",
    "forms",
    "tracking",
    "performanceAccessibility",
    "security",
  ])("rejects missing protected %s parity even with qualified R00–R10", async (gate) => {
    const f = executionScenario();
    const report = JSON.parse(f.packet.production.report.payload);
    delete report.gates[gate];
    f.packet.production.report = f.encode(report, "verifier");
    await expect(inspectExecutionCandidate(f.packet, f.admission, new Date(f.at))).rejects.toThrow(
      "complete nine-domain protected parity",
    );
  });

  it.each([
    "phasePermissions",
    "cutover",
    "rollback",
    "configuration",
    "data",
    "source",
    "images",
    "baseline",
    "lease",
    "scope",
    "plan",
  ])("rejects a changed %s binding", async (field) => {
    const f = executionScenario();
    if (field === "phasePermissions") f.packet.phasePermissions += " ";
    if (field === "cutover" || field === "rollback") f.packet.procedures[field] += "changed";
    if (field === "configuration") f.packet.production.artifacts.inputs += " ";
    if (field === "data") f.packet.candidateBytes.dataImport += "changed";
    if (field === "source" || field === "images") {
      const plan = JSON.parse(f.packet.production.plan);
      plan[field === "source" ? "sourceCommit" : "digest"] =
        field === "source" ? "e".repeat(40) : sha256Digest("other image");
      f.packet.production.plan = JSON.stringify(plan);
    }
    if (field === "baseline") f.packet.production.baseline += " ";
    if (field === "lease") {
      const lease = JSON.parse(f.packet.lease.payload);
      lease.leaseId = "12345678-1234-4123-8123-123456789012";
      f.packet.lease = f.encode(lease, "watchdog");
    }
    if (field === "scope") f.packet.plan.scopeDigest = sha256Digest("different scope");
    if (field === "plan") f.packet.plan.cutoverPlanDigest = sha256Digest("different plan");
    await expect(
      inspectExecutionCandidate(f.packet, f.admission, new Date(f.at)),
    ).rejects.toThrow();
  });

  it.each([
    "candidate_review",
    "deployment_acceptance",
    "operational_acceptance",
    "execution_verification",
  ])("never reuses %s as the execution grant", async (purpose) => {
    const f = executionScenario();
    f.packet.grant = f.encode({ ...JSON.parse(f.packet.grant.payload), purpose }, "owner");
    await expect(
      inspectExecutionCandidate(f.packet, f.admission, new Date(f.at)),
    ).rejects.toThrow();
  });

  it("rejects owner substitution for machine verification and machine substitution for Ivan", async () => {
    const f = executionScenario();
    const grant = f.packet.grant;
    f.packet.grant = f.encode(JSON.parse(grant.payload), "verifier");
    await expect(inspectExecutionCandidate(f.packet, f.admission, new Date(f.at))).rejects.toThrow(
      "owner genuine signature",
    );
    f.packet.grant = grant;
    f.packet.verification = f.encode(JSON.parse(f.packet.verification.payload), "owner");
    await expect(inspectExecutionCandidate(f.packet, f.admission, new Date(f.at))).rejects.toThrow(
      "verifier genuine signature",
    );
  });

  it.each(["operationId", "leaseId", "action", "planDigest", "expiresAt"])(
    "rejects a separately signed grant with the wrong %s",
    async (field) => {
      const f = executionScenario();
      const grant = JSON.parse(f.packet.grant.payload);
      grant[field] =
        field === "action"
          ? "production_preparation"
          : field === "planDigest"
            ? sha256Digest("other P")
            : field === "expiresAt"
              ? new Date(f.at).toISOString()
              : "12345678-1234-4123-8123-123456789012";
      f.packet.grant = f.encode(grant, "owner");
      await expect(
        inspectExecutionCandidate(f.packet, f.admission, new Date(f.at)),
      ).rejects.toThrow();
    },
  );

  it("rejects a purpose table not covered by the actual R00 phase bytes", async () => {
    const f = executionScenario();
    f.admission.keys.verifier.fingerprint = sha256Digest("unadmitted key");
    await expect(inspectExecutionCandidate(f.packet, f.admission, new Date(f.at))).rejects.toThrow(
      "ratified and installed key purposes",
    );
    expect(canonicalJson(f.packet.plan)).not.toContain("execution_grant");
  });

  it("rejects correctly signed duplicate keys, noncanonical encodings and conflicting extra fields", async () => {
    for (const kind of ["duplicate", "whitespace", "extra"]) {
      const f = executionScenario();
      const payload =
        kind === "duplicate"
          ? `{"purpose":"operational_acceptance",${f.packet.grant.payload.slice(1)}`
          : kind === "whitespace"
            ? `${f.packet.grant.payload} `
            : canonicalJson({ ...JSON.parse(f.packet.grant.payload), scope: "all_actions" });
      f.packet.grant = f.encodeRaw(payload, "owner");
      await expect(
        inspectExecutionCandidate(f.packet, f.admission, new Date(f.at)),
      ).rejects.toThrow();
    }
    const f = executionScenario();
    f.packet.production.plan = `{"operationId":"different-operation",${f.packet.production.plan.slice(1)}`;
    await expect(inspectExecutionCandidate(f.packet, f.admission, new Date(f.at))).rejects.toThrow(
      "canonical cutover plan",
    );
  });

  it("cannot reuse the same execution grant and lease for a different concrete plan", async () => {
    const f = executionScenario();
    const rawPlan = JSON.parse(f.preparation.production.plan);
    rawPlan.gatewayDeploymentId = "12345678-1234-4123-8123-123456789012";
    f.preparation.production.plan = canonicalJson(rawPlan);
    const plan = await prepareExecutionPlan(f.preparation, f.admission, new Date(f.at));
    await expect(
      inspectExecutionCandidate(
        { ...f.packet, production: f.preparation.production, plan },
        f.admission,
        new Date(f.at),
      ),
    ).rejects.toThrow("owner separate purpose, exact bindings");
  });

  it("does not mutate inputs, and later input mutation cannot change the prepared plan", async () => {
    const f = executionScenario();
    const before = canonicalJson(f.packet);
    const plan = await prepareExecutionPlan(f.preparation, f.admission, new Date(f.at));
    const prepared = canonicalJson(plan);
    await inspectExecutionCandidate(f.packet, f.admission, new Date(f.at));
    expect(canonicalJson(f.packet)).toBe(before);
    f.packet.candidate.manifest.artifacts.web = sha256Digest("changed after preparation");
    expect(canonicalJson(plan)).toBe(prepared);
    await expect(
      inspectExecutionCandidate(f.packet, f.admission, new Date(f.at)),
    ).rejects.toThrow();
  });
});
