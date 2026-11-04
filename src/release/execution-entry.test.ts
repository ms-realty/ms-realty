import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error Existing Node operator script is intentionally JavaScript.
import { productionConfig } from "../../scripts/production-config.mjs";
// @ts-expect-error Existing Node operator script is intentionally JavaScript.
import * as cutover from "../../scripts/production-cutover.mjs";
// @ts-expect-error Existing Node operator script is intentionally JavaScript.
import { routeWatchdog } from "../../scripts/production-watchdog.mjs";
// @ts-expect-error Synthetic JavaScript fixture; no real keys or provider calls.
import { executionScenario } from "./execution-fixtures.mjs";

const { applyProductionCutover, restoreProductionRoutes } = cutover;

describe("R00 execution remains unavailable at real forward entry points", () => {
  it("rejects the verified new grant before local apply, configuration or watchdog requests", async () => {
    const f = executionScenario();
    const bundle = {
      ...f.packet.production,
      trustedKeys: f.production.bundle.trustedKeys,
      approvals: { owner: f.packet.grant, controller: f.packet.verification },
    };
    const transport = vi.fn();
    await expect(applyProductionCutover(bundle, { transport })).rejects.toThrow(
      "execution unavailable",
    );
    expect(() =>
      productionConfig(bundle.artifacts.inputs, bundle.artifacts, bundle, bundle.trustedKeys),
    ).toThrow("execution unavailable");
    const watchdog = routeWatchdog({
      secret: "fixture-only".repeat(8),
      operationId: f.packet.plan.operationId,
      leaseId: f.packet.plan.leaseId,
      transport,
    });
    await expect(watchdog.bind(bundle)).rejects.toThrow("execution unavailable");
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(["candidate_review", "deployment_acceptance", "operational_acceptance"])(
    "rejects %s relabeled as a legacy forward approval",
    async (purpose) => {
      const f = executionScenario();
      const grant = f.encode({ ...JSON.parse(f.packet.grant.payload), purpose }, "owner");
      await expect(
        applyProductionCutover({ ...f.packet.production, approvals: { owner: grant } }),
      ).rejects.toThrow("execution unavailable");
    },
  );

  it("rejects a CLI input-owned activation marker before reading its artifact paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "msr-execution-entry-"));
    try {
      const file = join(dir, "packet.json");
      writeFileSync(
        file,
        JSON.stringify({ execution: "single_operator_owner_review", activate: true }),
      );
      const result = spawnSync(
        process.execPath,
        ["scripts/production-cutover.mjs", "apply", file, join(dir, "receipt.json")],
        {
          encoding: "utf8",
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH,
            CLOUDFLARE_API_TOKEN: "synthetic-not-a-provider-token",
          },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("execution unavailable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("retains original-operation restoration after the forward grant and snapshot expire", async () => {
    const f = executionScenario();
    const bundle = {
      ...f.packet.production,
      trustedKeys: f.production.bundle.trustedKeys,
      approvals: { owner: f.packet.grant, controller: f.packet.verification },
    };
    const persist = vi.fn();
    const result = await restoreProductionRoutes(
      bundle,
      {
        schemaVersion: 1,
        operationId: f.packet.plan.operationId,
        planSha256: f.packet.plan.cutoverPlanDigest.slice(7),
        baselineSha256: f.packet.plan.baselineDigest.slice(7),
        operations: [],
      },
      {
        now: () => Date.parse(f.packet.candidate.snapshot.expiresAt) + 1,
        persist,
        provider: { snapshot: async () => JSON.parse(bundle.baseline) },
        probe: async (host: string) => ({
          host,
          serverName: host,
          address: "185.80.2.102",
          port: 443,
          httpStatus: 200,
          tlsVerified: true,
          publicDnsPathObserved: false,
          bodySha256: "a".repeat(64),
          bytes: 1,
        }),
      },
    );
    expect(result.status).toBe("restored");
    expect(result.rollbackFailures).toEqual([]);
    expect(persist).toHaveBeenCalled();
  });

  it("loads a normal CLI file specification then rejects the execution grant before watchdog access", () => {
    const f = executionScenario();
    const dir = mkdtempSync(join(tmpdir(), "msr-execution-bundle-"));
    const save = (name: string, value: unknown) => {
      writeFileSync(join(dir, name), typeof value === "string" ? value : JSON.stringify(value));
      return name;
    };
    try {
      const production = f.packet.production;
      const specification = {
        plan: save("plan.json", production.plan),
        baseline: save("baseline.json", production.baseline),
        report: save("report.json", production.report),
        expected: save("expected.json", production.expected),
        approvals: {
          owner: save("owner.json", f.packet.grant),
          controller: save("controller.json", f.packet.verification),
        },
        artifacts: Object.fromEntries(
          Object.entries(production.artifacts).map(([name, bytes]) => [
            name,
            save(`${name}.json`, bytes),
          ]),
        ),
        recheck: "unused-recheck.json",
      };
      save("bundle.json", specification);
      const result = spawnSync(
        process.execPath,
        [
          "scripts/production-cutover.mjs",
          "apply",
          join(dir, "bundle.json"),
          join(dir, "receipt.json"),
        ],
        {
          encoding: "utf8",
          env: {
            NODE_ENV: "test",
            PATH: process.env.PATH,
            CLOUDFLARE_API_TOKEN: "synthetic-not-a-provider-token",
          },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("execution unavailable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
