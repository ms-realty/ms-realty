import { describe, expect, it } from "vitest";
import { loadExecutionAdmission } from "./execution-admission";
import { verifyRuntimeExecution } from "./execution-bridge";
// @ts-expect-error Synthetic fixture uses JavaScript for the existing operator contracts.
import { runtimeExecutionScenario } from "./execution-runtime-fixtures.mjs";
import { canonicalJson } from "./signature";

describe("R00 installed runtime admission", () => {
  it("reads only the fixed independently installed value and existing role keys", () => {
    const f = runtimeExecutionScenario();
    expect(loadExecutionAdmission(f.environment, "operator")?.digest).toBe(f.installed.digest);
    expect(loadExecutionAdmission(f.environment, "watchdog")?.digest).toBe(f.installed.digest);
    const result = verifyRuntimeExecution(f.packet, f.installed, f.lease, new Date(f.at));
    expect(result.plan.leaseAuthority).toBe("watchdog_durable_state");
    expect(result.plan.leaseObservationDigest).not.toContain("signature");
    expect(result.forwardExpiresAt).toBe(f.at + 60_000);
  });
  it("keeps absent installation legacy and rejects malformed, duplicate-key, path or key mismatch inputs", () => {
    expect(loadExecutionAdmission({}, "operator")).toBeNull();
    expect(loadExecutionAdmission({ MS_REALTY_EXECUTION_ADMISSION: "" }, "operator")).toBeNull();
    const f = runtimeExecutionScenario();
    for (const value of [
      " ",
      "/tmp/admission.json",
      "{}",
      `{"mode":"separate_reviewers",${f.environment.MS_REALTY_EXECUTION_ADMISSION.slice(1)}`,
    ])
      expect(() =>
        loadExecutionAdmission(
          { ...f.environment, MS_REALTY_EXECUTION_ADMISSION: value },
          "operator",
        ),
      ).toThrow("Installed execution admission");
    expect(() =>
      loadExecutionAdmission(
        { ...f.environment, LAUNCH_OWNER_PUBLIC_KEY: f.environment.LAUNCH_CONTROLLER_PUBLIC_KEY },
        "operator",
      ),
    ).toThrow("Installed execution admission");
  });
  it("cannot use packet-owned lease or admission fields or v1 lease signatures in runtime v2", () => {
    const f = runtimeExecutionScenario();
    for (const field of ["admission", "lease", "installedKeys", "activate"])
      expect(() =>
        verifyRuntimeExecution(
          { ...f.packet, [field]: f.lease },
          f.installed,
          f.lease,
          new Date(f.at),
        ),
      ).toThrow();
    expect(() =>
      verifyRuntimeExecution(
        f.packet,
        f.installed,
        { ...f.lease, scope: { ...f.scope, leaseId: "12345678-1234-4123-8123-123456789012" } },
        new Date(f.at),
      ),
    ).toThrow("actual reserved durable lease");
    const changed = structuredClone(f.packet);
    changed.phasePermissions = canonicalJson({
      ...JSON.parse(changed.phasePermissions),
      schemaVersion: 1,
    });
    expect(() => verifyRuntimeExecution(changed, f.installed, f.lease, new Date(f.at))).toThrow();
  });
});
