/// <reference path="./cloudflare-runtime.generated.d.ts" />
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// Unit substitutes exercise fencing and write ordering; they are never hosted custody proof.
vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));
vi.mock("@cloudflare/containers", () => ({ Container: class {} }));

import worker, { OriginProbe, RouteWatchdog } from "./route-watchdog";

function required<T>(x: T | undefined): T {
  if (x === undefined) throw new Error("Missing unit fixture value");
  return x;
}

function fixture() {
  let clock = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  const owner = generateKeyPairSync("ed25519"),
    controller = generateKeyPairSync("ed25519");
  const com = "f0ac7af0721419e8129e5d10ff547372",
    ru = "c".repeat(32),
    operationId = randomUUID(),
    leaseId = randomUUID();
  const baseline = {
    accountId: "921d0224dcd595c87b7928d2b3c479d1",
    zones: [
      {
        id: com,
        name: "makler-realty.com",
        dns: [],
        routes: [{ id: "1".repeat(32), pattern: "makler-realty.com/*", script: null }],
      },
      { id: ru, name: "makler-realty.ru", dns: [], routes: [] },
    ],
  };
  const baselineRaw = JSON.stringify(baseline);
  const scope = {
    operationId,
    leaseId,
    sourceCommit: "a".repeat(40),
    digest: `sha256:${"b".repeat(64)}`,
    baselineSha256: hash(baselineRaw),
    zoneIds: [com, ru],
  };
  const plan = {
    ...scope,
    accountId: "921d0224dcd595c87b7928d2b3c479d1",
    workerName: `ms-realty-production-${scope.sourceCommit.slice(0, 12)}`,
    gatewayVersionId: randomUUID(),
    gatewayDeploymentId: randomUUID(),
    artifacts: { ownership: "c".repeat(64) },
    timeoutSeconds: 600,
    rollbackTimeoutSeconds: 120,
    routes: [
      { zoneId: com, pattern: "makler-realty.com/*", baselineRouteId: "1".repeat(32) },
      { zoneId: ru, pattern: "makler-realty.ru/*", baselineRouteId: null },
    ],
  };
  const planRaw = JSON.stringify(plan);
  const envelope = (payload: unknown, key = controller) => {
    const raw = JSON.stringify(payload);
    return {
      payload: raw,
      signature: sign(null, Buffer.from(raw), key.privateKey).toString("base64"),
    };
  };
  const gates = Object.fromEntries(
    [
      "urls",
      "listings",
      "content",
      "seo",
      "locales",
      "forms",
      "tracking",
      "performanceAccessibility",
      "security",
    ].map((k) => [k, { status: "PASS", evidenceSha256: "d".repeat(64) }]),
  );
  const reportPayload = {
    environment: "staging",
    status: "PASS",
    sourceCommit: scope.sourceCommit,
    digest: scope.digest,
    checkedAt: new Date(clock).toISOString(),
    coverage: {
      productionAllowed: true,
      completeCurrentDelta: true,
      exclusions: 0,
      baselineSourceRows: 457,
      resolvedSourceRows: 457,
    },
    checker: { authority: "independent-controller", baselineSha256: "e".repeat(64) },
    gates,
  };
  const report = envelope(reportPayload);
  const approval = (role: "owner" | "controller") =>
    envelope(
      {
        role,
        decision: "approve",
        cutoverPlanSha256: hash(planRaw),
        reportSha256: hash(report.payload),
        sourceCommit: scope.sourceCommit,
        digest: scope.digest,
      },
      role === "owner" ? owner : controller,
    );
  const binding = {
    operationId,
    leaseId,
    plan: planRaw,
    baseline: baselineRaw,
    report,
    approvals: { owner: approval("owner"), controller: approval("controller") },
  };
  const values = new Map<string, unknown>();
  let alarmAt: number | null = null;
  const storage = {
    get: async (key: string) => structuredClone(values.get(key)),
    put: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    setAlarm: async (at: number) => {
      alarmAt = at;
    },
    deleteAlarm: async () => {
      alarmAt = null;
    },
  };
  const env = {
    WATCHDOG_PROBE_SOURCE_COMMIT: "a".repeat(40),
    WATCHDOG_PROBE_IMAGE_DIGEST: "b".repeat(64),
    ORIGIN_PROBE: {
      getByName: () => ({
        probe: async (host: string) => ({
          host,
          address: "185.80.2.102",
          strictTls: true as const,
          status: 200,
          runtime: "unit-native-probe-substitute",
        }),
      }),
    },
    WATCHDOG_SOURCE_COMMIT: "a".repeat(40),
    WATCHDOG_SOURCE_SHA256: "b".repeat(64),
    WATCHDOG_OWNER_PUBLIC_KEY: owner.publicKey.export({ type: "spki", format: "pem" }).toString(),
    WATCHDOG_CONTROLLER_PUBLIC_KEY: controller.publicKey
      .export({ type: "spki", format: "pem" })
      .toString(),
    WATCHDOG_CONTROL_SECRET: "x".repeat(64),
    WATCHDOG_ROUTE_TOKEN: "unit-provider-token",
    WATCHDOG_VERSION: { id: randomUUID() },
    WATCHDOG_ORIGIN: "https://private-control.test",
  };
  const ctx = { storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn() };
  const instance = new RouteWatchdog(ctx as never, env as never);
  const rows = new Map(
    baseline.zones.map((z) => [
      z.id,
      structuredClone(z.routes) as { id: string; pattern: string; script: string | null }[],
    ]),
  );
  const writes: string[] = [];
  let loseAcknowledgement = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const parts = new URL(url).pathname.split("/"),
        zone = required(parts[4]),
        id = parts[7];
      const current = required(rows.get(zone));
      let result: unknown = current;
      if (init.method !== "GET") {
        // Assert the write-ahead intent was durably stored before the actual provider call.
        const state = values.get("active") as { intents: unknown[] };
        expect(state.intents.length).toBeGreaterThan(0);
        writes.push(required(init.method));
        const body = init.body ? JSON.parse(String(init.body)) : null;
        if (init.method === "PUT") {
          const index = current.findIndex((r) => r.id === id);
          expect(index).toBeGreaterThanOrEqual(0);
          result = current[index] = {
            id: required(id),
            pattern: body.pattern,
            script: body.script ?? null,
          };
        } else if (init.method === "POST") {
          result = { id: "9".repeat(32), pattern: body.pattern, script: body.script };
          current.push(result as (typeof current)[number]);
        } else if (init.method === "DELETE") {
          current.splice(
            current.findIndex((r) => r.id === id),
            1,
          );
          result = { id };
        }
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          throw new Error("Unit lost provider response after the actual write");
        }
      }
      return Response.json({ success: true, errors: [], result });
    }),
  );
  const call = (path: string, input?: unknown) =>
    instance.fetch(
      new Request(`https://private-control.test${path}`, {
        method: input === undefined ? "GET" : "POST",
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      }),
    );
  const arm = async () => {
    expect((await call("/reserve", scope)).status).toBe(200);
    expect((await call("/bind", binding)).status).toBe(200);
  };
  const mutate = (index = 0) => call("/mutate", { operationId, leaseId, ...plan.routes[index] });
  const sweep = async () => {
    for (let i = 0; i < 16; i++) {
      await instance.alarm();
      const status = ((await (await call("/status")).json()) as { status: string }).status;
      if (["restored", "reconciliation_required"].includes(status)) return;
    }
    throw new Error("Restoration did not finish a bounded sweep");
  };
  return {
    scope,
    plan,
    com,
    ru,
    rows,
    baseline,
    values,
    instance,
    ctx,
    env,
    call,
    arm,
    mutate,
    sweep,
    binding,
    writes,
    reportPayload,
    envelope,
    loseAck: () => {
      loseAcknowledgement = true;
    },
    advance: (ms: number) => {
      clock += ms;
    },
    alarm: () => alarmAt,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("off-runner route custody unit boundaries", () => {
  it("accepts only native original-host TLS evidence from the pinned source", async () => {
    const f = fixture();
    const proof = {
      host: "makler-realty.com",
      serverName: "makler-realty.com",
      address: "185.80.2.102",
      port: 443,
      httpStatus: 200,
      tlsVerified: true,
      publicDnsPathObserved: false,
      bodySha256: "d".repeat(64),
      bytes: 1000,
      sourceCommit: "a".repeat(40),
    };
    const value = { ...proof };
    const self = {
      env: f.env,
      ctx: { id: { toString: () => "unit-actor" } },
      startAndWaitForPorts: vi.fn(async () => {}),
      containerFetch: vi.fn(async () => Response.json(value)),
    };
    expect(
      (await OriginProbe.prototype.probe.call(self as never, "makler-realty.com")).strictTls,
    ).toBe(true);
    for (const invalid of [
      { tlsVerified: false },
      { serverName: "foreign.test" },
      { address: "127.0.0.1" },
      { sourceCommit: "c".repeat(40) },
      { bytes: 0 },
    ]) {
      Object.assign(value, proof, invalid);
      await expect(
        OriginProbe.prototype.probe.call(self as never, "makler-realty.com"),
      ).rejects.toThrow();
    }
    const before = self.containerFetch.mock.calls.length;
    await expect(
      OriginProbe.prototype.probe.call(self as never, "private-db.internal"),
    ).rejects.toThrow();
    expect(self.containerFetch.mock.calls).toHaveLength(before);
  });
  it("authenticates the exact private origin and does not expose the namespace", async () => {
    const f = fixture();
    const stub = vi.fn(async () => new Response("private"));
    const env = { ...f.env, ROUTE_WATCHDOG: { getByName: () => ({ fetch: stub }) } };
    expect(
      (await worker.fetch(new Request(`${f.env.WATCHDOG_ORIGIN}/status`), env as never)).status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          new Request("https://wrong.test/status", {
            headers: { Authorization: `Bearer ${f.env.WATCHDOG_CONTROL_SECRET}` },
          }),
          env as never,
        )
      ).status,
    ).toBe(403);
    expect(stub).not.toHaveBeenCalled();
    expect(
      (
        await worker.fetch(
          new Request(`${f.env.WATCHDOG_ORIGIN}/status`, {
            headers: { Authorization: `Bearer ${f.env.WATCHDOG_CONTROL_SECRET}` },
          }),
          env as never,
        )
      ).status,
    ).toBe(200);
  });
  it("retains one account-wide lease across duplicate requests and rejects competing operations", async () => {
    const f = fixture();
    const first = await (await f.call("/reserve", f.scope)).json();
    expect(await (await f.call("/reserve", f.scope)).json()).toEqual(first);
    expect(
      (await f.call("/reserve", { ...f.scope, operationId: randomUUID(), leaseId: randomUUID() }))
        .status,
    ).toBe(409);
    expect(f.writes).toEqual([]);
    expect(f.alarm()).toBeGreaterThan(Date.now());
  });
  it("rejects forged plan approval, incomplete gates and drift before arming", async () => {
    const f = fixture();
    await f.call("/reserve", f.scope);
    expect(
      (
        await f.call("/bind", {
          ...f.binding,
          approvals: { ...f.binding.approvals, owner: f.binding.approvals.controller },
        })
      ).status,
    ).toBe(409);
    required(required(f.rows.get(f.com))[0]).script = "foreign";
    expect((await f.call("/bind", f.binding)).status).toBe(409);
    expect(f.writes).toEqual([]);
  });
  it("restores original IDs and null-script bypass after the caller disappears", async () => {
    const f = fixture();
    await f.arm();
    expect((await f.mutate()).status).toBe(200);
    expect((await f.mutate(1)).status).toBe(200);
    f.advance(601_000);
    await f.sweep();
    expect(f.rows.get(f.com)).toEqual(required(f.baseline.zones[0]).routes);
    expect(f.rows.get(f.ru)).toEqual([]);
    expect(((await (await f.call("/status")).json()) as { status: string }).status).toBe(
      "restored",
    );
    expect(f.alarm()).not.toBeNull();
  });
  it("fences a lost acknowledgement and reconciles the actual provider write without replay", async () => {
    const f = fixture();
    await f.arm();
    f.loseAck();
    expect((await f.mutate()).status).toBe(409);
    expect(f.writes).toEqual(["PUT"]);
    expect((await f.mutate()).status).toBe(409);
    await f.sweep();
    expect(f.rows.get(f.com)).toEqual(required(f.baseline.zones[0]).routes);
    expect(f.writes).toEqual(["PUT", "PUT"]);
  });
  it("sweeps again for a late provider write and keeps the exclusive lease fenced", async () => {
    const f = fixture();
    await f.arm();
    await f.mutate();
    f.advance(601_000);
    await f.sweep();
    required(required(f.rows.get(f.com))[0]).script = f.plan.workerName;
    await f.sweep();
    expect(f.rows.get(f.com)).toEqual(required(f.baseline.zones[0]).routes);
    expect(
      (await f.call("/reserve", { ...f.scope, operationId: randomUUID(), leaseId: randomUUID() }))
        .status,
    ).toBe(409);
  });
  it("preserves concurrent foreign routes and reports reconciliation instead of a false restore", async () => {
    const f = fixture();
    await f.arm();
    await f.mutate();
    required(required(f.rows.get(f.com))[0]).script = "foreign";
    f.advance(601_000);
    await f.sweep();
    expect(required(required(f.rows.get(f.com))[0]).script).toBe("foreign");
    expect(((await (await f.call("/status")).json()) as { status: string }).status).toBe(
      "reconciliation_required",
    );
    expect(f.alarm()).not.toBeNull();
  });
  it("never disarms on caller labels or an unsigned accepted journal", async () => {
    const f = fixture();
    await f.arm();
    await f.mutate();
    expect(
      (
        await f.call("/accept", {
          operationId: f.scope.operationId,
          leaseId: f.scope.leaseId,
          report: { payload: JSON.stringify({ status: "PASS" }), signature: "invalid" },
        })
      ).status,
    ).toBe(409);
    expect(f.alarm()).not.toBeNull();
  });
  it("isolates a real-provider rehearsal to its generated canary path and frees no production gate", async () => {
    const f = fixture(),
      op = randomUUID();
    const start = (await (await f.call("/rehearsal", { operationId: op })).json()) as {
      leaseId: string;
      pattern: string;
      businessHostCoverage: boolean;
    };
    expect(start.pattern).toBe(`watchdog-rehearsal.makler-realty.com/${op}/*`);
    expect(start.businessHostCoverage).toBe(false);
    const binding = { operationId: op, leaseId: start.leaseId };
    expect(
      (await f.call("/mutate", { ...binding, zoneId: f.com, pattern: "makler-realty.com/*" }))
        .status,
    ).toBe(409);
    expect(
      (await f.call("/mutate", { ...binding, zoneId: f.com, pattern: start.pattern })).status,
    ).toBe(200);
    f.advance(16_000);
    await f.sweep();
    expect(f.rows.get(f.com)).toEqual(required(f.baseline.zones[0]).routes);
    expect((await f.call("/rehearsal/late-write", binding)).status).toBe(200);
    await f.sweep();
    expect(f.rows.get(f.com)).toEqual(required(f.baseline.zones[0]).routes);
    await f.sweep();
    expect((await f.call("/rehearsal/close", binding)).status).toBe(200);
    expect(f.alarm()).toBeNull();
  });
  it("expires an unused reservation without changing any route", async () => {
    const f = fixture();
    await f.call("/reserve", f.scope);
    f.advance(601_000);
    await f.instance.alarm();
    expect(((await (await f.call("/status")).json()) as { status: string }).status).toBe(
      "released",
    );
    expect(f.writes).toEqual([]);
  });
  it("requires a complete current independent production report before disarming", async () => {
    const f = fixture();
    await f.arm();
    await f.mutate();
    await f.mutate(1);
    // The actual bindings hash the complete applied snapshot, including preserved DNS fields.
    const applied = structuredClone(f.baseline);
    applied.zones.forEach((z) => {
      z.routes = structuredClone(f.rows.get(z.id) ?? []) as typeof z.routes;
    });
    const canonical = (x: unknown): string =>
      JSON.stringify(x, (_key, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, value[key]]),
            )
          : value,
      );
    const sorted = <T>(x: T[]) =>
      [...x].sort((a, b) => canonical(a).localeCompare(canonical(b), "en"));
    const hash = (x: string) => createHash("sha256").update(x).digest("hex");
    const state = f.values.get("active") as { planSha256: string };
    const report = {
      ...f.reportPayload,
      schemaVersion: 1,
      environment: "production",
      hosts: [
        "makler-realty.com",
        "www.makler-realty.com",
        "my.makler-realty.com",
        "app.makler-realty.com",
        "makler-realty.ru",
        "www.makler-realty.ru",
      ],
      bindings: {
        operationId: f.scope.operationId,
        planSha256: state.planSha256,
        baselineSha256: f.scope.baselineSha256,
        appliedStateSha256: hash(
          canonical({
            accountId: applied.accountId,
            zones: sorted(
              applied.zones.map((z) => ({ ...z, routes: sorted(z.routes), dns: sorted(z.dns) })),
            ),
          }),
        ),
        sourceCommit: f.scope.sourceCommit,
        digest: f.scope.digest,
        gatewayVersionId: f.plan.gatewayVersionId,
        gatewayDeploymentId: f.plan.gatewayDeploymentId,
        artifacts: f.plan.artifacts,
      },
    };
    const binding = { operationId: f.scope.operationId, leaseId: f.scope.leaseId };
    expect(
      (
        await f.call("/accept", {
          ...binding,
          report: f.envelope({ ...report, hosts: ["makler-realty.com"] }),
        })
      ).status,
    ).toBe(409);
    expect(f.alarm()).not.toBeNull();
    expect((await f.call("/accept", { ...binding, report: f.envelope(report) })).status).toBe(200);
    expect(f.alarm()).toBeNull();
  });
});
