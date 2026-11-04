/// <reference path="./cloudflare-runtime.generated.d.ts" />
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Native public entry points share the remote consumer's unchanged signatures.
import * as cutover from "../scripts/production-cutover.mjs";
// @ts-expect-error Existing native operator client.
import { routeWatchdog } from "../scripts/production-watchdog.mjs";
import { verifyRuntimeExecution } from "../src/release/execution-bridge";
// @ts-expect-error Node-only adapter loads the fixed process environment.
import { executionBundle } from "../src/release/execution-node.mjs";
// @ts-expect-error Synthetic test-only packets reuse existing production contracts.
import { runtimeExecutionScenario } from "../src/release/execution-runtime-fixtures.mjs";
import { canonicalJson, readinessSnapshotDigest, sha256Digest } from "../src/release/signature";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));
vi.mock("@cloudflare/containers", () => ({ Container: class {} }));

import { RouteWatchdog } from "./route-watchdog";

const { applyProductionCutover, cloudflareRoutes, productionHosts, routeStateSha256 } = cutover;

type Row = { id: string; pattern: string; script: string | null };
function fixture() {
  const f = runtimeExecutionScenario();
  let clock = f.at;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  const { context } = verifyRuntimeExecution(f.packet, f.installed, f.lease, new Date(clock));
  const { plan, baseline, runtime } = context;
  let values = new Map<string, unknown>();
  let alarm: number | null = null;
  let failTransaction = false;
  let commitAdvance = 0;
  let commits = 0;
  const storageApi = (rows: Map<string, unknown>, setAlarm: (at: number | null) => void) => ({
    get: async (key: string) => structuredClone(rows.get(key)),
    put: async (key: string | Record<string, unknown>, value?: unknown) => {
      const entries = typeof key === "string" ? [[key, value] as const] : Object.entries(key);
      for (const [name, item] of entries) {
        expect(Buffer.byteLength(canonicalJson(item))).toBeLessThan(128 * 1024);
        rows.set(name, structuredClone(item));
      }
    },
    setAlarm: async (at: number) => setAlarm(at),
    deleteAlarm: async () => setAlarm(null),
  });
  const storage = {
    get: async (key: string) => structuredClone(values.get(key)),
    put: async (key: string | Record<string, unknown>, value?: unknown) =>
      storageApi(values, (at) => {
        alarm = at;
      }).put(key, value),
    setAlarm: async (at: number) => {
      alarm = at;
    },
    deleteAlarm: async () => {
      alarm = null;
    },
    transaction: async (callback: (txn: ReturnType<typeof storageApi>) => Promise<void>) => {
      const staged = structuredClone(values);
      let stagedAlarm = alarm;
      await callback(
        storageApi(staged, (at) => {
          stagedAlarm = at;
        }),
      );
      if (failTransaction) throw new Error("Synthetic storage failure before atomic commit");
      values = staged;
      alarm = stagedAlarm;
      commits++;
      clock += commitAdvance;
    },
  };
  let queue = Promise.resolve();
  const ctx = {
    storage,
    blockConcurrencyWhile: <T>(fn: () => Promise<T>) => {
      const next = queue.then(fn);
      queue = next.then(
        () => {},
        () => {},
      );
      return next;
    },
  };
  const env = {
    ...f.environment,
    WATCHDOG_READ_TOKEN: "synthetic-read-token",
    WATCHDOG_ROUTE_TOKEN: "synthetic-route-token",
    WATCHDOG_PROBE_SOURCE_COMMIT: "a".repeat(40),
    WATCHDOG_PROBE_IMAGE_DIGEST: "b".repeat(64),
    WATCHDOG_SOURCE_COMMIT: "a".repeat(40),
    WATCHDOG_SOURCE_SHA256: "b".repeat(64),
    WATCHDOG_VERSION: { id: randomUUID() },
    ORIGIN_PROBE: {
      getByName: () => ({
        probe: async (host: string) => ({
          host,
          address: "185.80.2.102",
          strictTls: true,
          status: 200,
        }),
      }),
    },
  };
  let instance = new RouteWatchdog(ctx as never, env as never);
  const rows = new Map<string, Row[]>(
    baseline.zones.map((z: { id: string; routes: Row[] }) => [z.id, structuredClone(z.routes)]),
  );
  const documents = new Map<string, Record<string, unknown>>();
  const root = `/client/v4/accounts/${plan.accountId}`;
  const applications = `${root}/containers/applications`;
  const worker = `${root}/workers/scripts/${plan.workerName}`;
  const bindings = [];
  const apps = [];
  for (const [index, role] of ["web", "worker", "migrator"].entries()) {
    const namespace = String(index + 1).repeat(32);
    bindings.push({
      name: ["MS_REALTY", "MS_REALTY_WORKER", "MS_REALTY_MIGRATOR"][index],
      type: "durable_object_namespace",
      namespace_id: namespace,
    });
    const app = {
      id: `app-${role}`,
      account_id: plan.accountId,
      durable_objects: { namespace_id: namespace },
      scheduling_policy: "default",
      configuration: { image: plan.image },
      version: 1,
      active_rollout_id: null,
    };
    apps.push(app);
    const path = `${applications}/${app.id}`;
    documents.set(path, { result: app });
    documents.set(`${path}/rollouts`, { result: [] });
    documents.set(`${path}/instances-v2`, {
      result: [
        {
          id: runtime.roles[role].actorId,
          application_id: app.id,
          image: plan.image,
          status: { state: "running", updated_at: new Date(clock - 1000).toISOString() },
          started_at: new Date(clock - 1000).toISOString(),
        },
      ],
      result_info: {},
    });
  }
  documents.set(`${worker}/settings`, { result: { bindings } });
  documents.set(applications, { result: apps, result_info: {} });
  documents.set(`${worker}/deployments?per_page=100&page=1`, {
    result: {
      deployments: [
        {
          id: plan.gatewayDeploymentId,
          created_on: new Date(clock - 500).toISOString(),
          versions: [{ version_id: plan.gatewayVersionId, percentage: 100 }],
        },
      ],
    },
    result_info: { total_pages: 1 },
  });
  for (const zone of baseline.zones) {
    const path = `/client/v4/zones/${zone.id}`;
    documents.set(path, {
      result: { id: zone.id, name: zone.name, account: { id: plan.accountId }, status: "active" },
    });
    documents.set(`${path}/settings/ssl`, { result: { id: "ssl", value: "strict" } });
    documents.set(`${path}/dns_records?per_page=1000&page=1`, {
      result: structuredClone(zone.dns),
      result_info: { page: 1, total_pages: 1, total_count: zone.dns.length },
    });
  }
  const calls: string[] = [];
  const writes: string[] = [];
  let lost = false;
  let hook: (url: URL, init: RequestInit) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input);
      calls.push(url.pathname + url.search);
      expect(url.origin).toBe("https://api.cloudflare.com");
      hook(url, init);
      const match = url.pathname.match(
        /^\/client\/v4\/zones\/([a-f0-9]{32})\/workers\/routes(?:\/([a-f0-9]{32}))?$/,
      );
      if (!match) {
        expect(init.method).toBe("GET");
        const document = documents.get(url.pathname + url.search);
        expect(document, url.pathname + url.search).toBeDefined();
        return Response.json({ success: true, errors: [], ...document });
      }
      const current = rows.get(match[1] ?? "");
      if (!current) throw new Error("Unknown synthetic zone");
      let result: unknown = current;
      if (init.method !== "GET") {
        expect((values.get("active") as { intents: unknown[] }).intents.length).toBeGreaterThan(0);
        writes.push(init.method ?? "");
        const body = init.body ? JSON.parse(String(init.body)) : null;
        if (init.method === "PUT") {
          const index = current.findIndex((r) => r.id === match[2]);
          expect(index).toBeGreaterThanOrEqual(0);
          result = current[index] = {
            id: match[2] ?? "",
            pattern: body.pattern,
            script: body.script ?? null,
          };
        } else if (init.method === "POST") {
          result = {
            id: `9${String(writes.length).padStart(31, "0")}`,
            pattern: body.pattern,
            script: body.script,
          };
          current.push(result as Row);
        } else if (init.method === "DELETE") {
          current.splice(
            current.findIndex((r) => r.id === match[2]),
            1,
          );
          result = { id: match[2] };
        }
        if (lost) {
          lost = false;
          throw new Error("Lost acknowledgement with synthetic bearer token");
        }
      }
      return Response.json({ success: true, errors: [], result });
    }),
  );
  const call = (path: string, input?: unknown, raw?: string) =>
    instance.fetch(
      new Request(`https://private.test${path}`, {
        method: input === undefined && raw === undefined ? "GET" : "POST",
        ...(input === undefined && raw === undefined ? {} : { body: raw ?? canonicalJson(input) }),
      }),
    );
  const active = () =>
    values.get("active") as {
      scope: typeof f.scope;
      reservedAt: number;
      expiresAt: number;
      status: string;
      receipt: Record<string, unknown>;
      deadline: number;
      intents: { id?: string; pattern: string }[];
    };
  const reserve = async () => {
    expect((await call("/reserve", f.scope)).status).toBe(200);
    const state = active();
    return f.build({
      scope: state.scope,
      reservedAt: state.reservedAt,
      expiresAt: state.expiresAt,
      status: state.status,
      receipt: state.receipt,
    });
  };
  const binding = (packet: unknown) => ({
    operationId: f.scope.operationId,
    leaseId: f.scope.leaseId,
    packet,
  });
  const arm = async () => {
    const packet = await reserve();
    expect((await call("/bind", binding(packet))).status).toBe(200);
    return packet;
  };
  const mutate = (index = 0) =>
    call("/mutate", {
      operationId: f.scope.operationId,
      leaseId: f.scope.leaseId,
      zoneId: plan.routes[index].zoneId,
      pattern: plan.routes[index].pattern,
    });
  const sweep = async () => {
    for (let i = 0; i < 24; i++) {
      await instance.alarm();
      if (["restored", "reconciliation_required"].includes(active().status)) return;
    }
    throw new Error("Bounded synthetic restoration did not finish");
  };
  const productionReport = (
    packet: typeof f.packet,
    purpose = "conditional_cutover_acceptance",
  ) => {
    const verification = JSON.parse(packet.verification.payload);
    const applied = {
      ...baseline,
      zones: baseline.zones.map((z: { id: string }) => ({ ...z, routes: rows.get(z.id) })),
    };
    return f.encode(
      {
        ...JSON.parse(packet.production.report.payload),
        environment: "production",
        purpose,
        actor: verification.actor,
        keyId: verification.keyId,
        admissionDigest: packet.plan.admissionDigest,
        planDigest: sha256Digest(canonicalJson(packet.plan)),
        snapshotId: packet.plan.snapshotId,
        checkedAt: new Date(clock).toISOString(),
        hosts: productionHosts,
        bindings: {
          operationId: plan.operationId,
          planSha256: packet.plan.cutoverPlanDigest.slice(7),
          baselineSha256: plan.baselineSha256,
          appliedStateSha256: routeStateSha256(applied),
          sourceCommit: plan.sourceCommit,
          digest: plan.digest,
          gatewayVersionId: plan.gatewayVersionId,
          gatewayDeploymentId: plan.gatewayDeploymentId,
          artifacts: JSON.parse(packet.production.plan).artifacts,
        },
      },
      "verifier",
    );
  };
  return {
    f,
    env,
    plan,
    baseline,
    rows,
    documents,
    applications,
    calls,
    writes,
    call,
    reserve,
    binding,
    arm,
    mutate,
    active,
    sweep,
    productionReport,
    values: () => values,
    alarm: () => alarm,
    commits: () => commits,
    restart: () => {
      instance = new RouteWatchdog(ctx as never, env as never);
    },
    advance: (ms: number) => {
      clock += ms;
    },
    clock: () => clock,
    onFetch: (next: typeof hook) => {
      hook = next;
    },
    loseAck: () => {
      lost = true;
    },
    failTransaction: (value = true) => {
      failTransaction = value;
    },
    advanceOnCommit: (ms: number) => {
      commitAdvance = ms;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("R00 watchdog installed execution and durable replay", () => {
  it("admits full S/P conjunction from real state and makes exact bind replay read-only across restart", async () => {
    const r = fixture();
    const packet = await r.arm();
    const deadline = r.active().deadline,
      alarm = r.alarm(),
      calls = r.calls.length;
    expect(r.commits()).toBe(1);
    expect(r.values().get("execution-mode")).toMatchObject({
      mode: "single_operator_owner_review",
    });
    expect(r.values().size).toBeGreaterThan(5); // Chunked packet exceeds a single storage value.
    r.advance(1000);
    r.restart();
    const again = await r.call("/bind", r.binding(packet));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ idempotent: true });
    expect(r.active().deadline).toBe(deadline);
    expect(r.alarm()).toBe(alarm);
    expect(r.commits()).toBe(1);
    expect(r.calls.length).toBe(calls);
    expect((await r.mutate()).status).toBe(200);
    expect((await r.mutate()).status).toBe(200);
    expect(r.writes).toEqual(["PUT"]);
  });

  it("commits no chunk, latch, grant or armed state when the durable transaction fails", async () => {
    const r = fixture();
    const packet = await r.reserve();
    const before = structuredClone(r.values()),
      alarm = r.alarm();
    r.failTransaction();
    expect((await r.call("/bind", r.binding(packet))).status).toBe(409);
    expect(r.values()).toEqual(before);
    expect(r.alarm()).toBe(alarm);
    expect(r.writes).toEqual([]);
    r.restart();
    r.failTransaction(false);
    expect((await r.call("/bind", r.binding(packet))).status).toBe(200);
    expect(r.commits()).toBe(1);
  });

  it("keeps a committed grant consumed and starts restoration if storage completion crosses expiry", async () => {
    const r = fixture();
    const packet = await r.reserve();
    r.advanceOnCommit(60_000);
    expect((await r.call("/bind", r.binding(packet))).status).toBe(409);
    expect(r.commits()).toBe(1);
    expect(r.values().get("execution-mode")).toBeDefined();
    expect(r.active().status).toBe("restoring");
    expect(r.writes).toEqual([]);
    r.restart();
    expect((await r.call("/bind", r.binding(packet))).status).toBe(200);
    expect(r.active().status).toBe("restoring");
    expect(r.commits()).toBe(1);
    await r.sweep();
    expect(r.active().status).toBe("restored");
  });

  it.each([
    "snapshot",
    "future snapshot",
    "grant purpose",
    "duplicate grant",
    "ambiguous plan",
    "data bytes",
    "image bytes",
    "scope",
    "expiry",
  ])(
    "rejects changed %s at the direct bind boundary before provider reads or durable admission",
    async (change) => {
      const r = fixture();
      const packet = await r.reserve();
      if (change === "snapshot") {
        packet.candidate.snapshot.gates[0].title = "self-authored";
        packet.candidate.snapshot.snapshotId = readinessSnapshotDigest(packet.candidate.snapshot);
      }
      if (change === "future snapshot") {
        packet.candidate.snapshot.evaluatedAt = new Date(r.clock() + 1).toISOString();
        packet.candidate.snapshot.snapshotId = readinessSnapshotDigest(packet.candidate.snapshot);
      }
      if (change === "grant purpose")
        packet.grant = r.f.encode(
          { ...JSON.parse(packet.grant.payload), purpose: "deployment_acceptance" },
          "owner",
        );
      if (change === "duplicate grant")
        packet.grant = r.f.encodeRaw(
          `{"purpose":"operational_acceptance",${packet.grant.payload.slice(1)}`,
          "owner",
        );
      if (change === "ambiguous plan")
        packet.production.plan = `{"operationId":"different",${packet.production.plan.slice(1)}`;
      if (change === "data bytes") packet.candidateBytes.dataImport += "changed";
      if (change === "image bytes") packet.production.artifacts.gateway += "changed";
      if (change === "scope") packet.plan.action = "production_preparation";
      if (change === "expiry") r.advance(60_000);
      expect((await r.call("/bind", r.binding(packet))).status).toBe(409);
      expect(r.calls).toEqual([]);
      expect(r.writes).toEqual([]);
      expect(r.commits()).toBe(0);
      expect(r.values().get("execution-mode")).toBeUndefined();
    },
  );

  it("rejects aggregate oversize before any provider or storage effect", async () => {
    const r = fixture();
    const packet = await r.reserve();
    const before = structuredClone(r.values());
    packet.procedures.cutover = "x".repeat(2 * 1024 * 1024);
    expect((await r.call("/bind", r.binding(packet))).status).toBe(409);
    expect(r.values()).toEqual(before);
    expect(r.calls).toEqual([]);
    expect(r.writes).toEqual([]);
  });

  it.each(["", "{malformed", undefined])(
    "retains the global mode latch when installation becomes %s",
    async (installed) => {
      const r = fixture();
      await r.arm();
      r.env.MS_REALTY_EXECUTION_ADMISSION = installed;
      r.restart();
      expect(
        (
          await r.call("/reserve", {
            ...r.f.scope,
            operationId: randomUUID(),
            leaseId: randomUUID(),
          })
        ).status,
      ).toBe(409);
      expect((await r.call("/bind", { ...r.f.scope, plan: "{}" })).status).toBe(409);
      expect((await r.call("/rehearsal", { operationId: randomUUID() })).status).toBe(409);
      expect((await r.mutate()).status).toBe(409);
      expect(r.active().status).toBe("restoring");
      expect(r.writes).toEqual([]);
      expect((await r.call("/restore", r.f.scope)).status).toBe(200);
      await r.sweep();
      expect(r.active().status).toBe("restored");
    },
  );

  it("rejects an omitted marker, input-owned trust, noncanonical wrapper and conflicting replay", async () => {
    const r = fixture();
    const packet = await r.reserve();
    const valid = r.binding(packet);
    for (const input of [
      r.f.production.bundle,
      { ...valid, admission: r.f.installed },
      { ...valid, packet: { ...packet, protocolVersion: 1 } },
    ])
      expect((await r.call("/bind", input)).status).toBe(409);
    expect((await r.call("/bind", undefined, JSON.stringify(valid))).status).toBe(409);
    expect(
      (
        await r.call(
          "/bind",
          undefined,
          `{"operationId":"conflict",${canonicalJson(valid).slice(1)}`,
        )
      ).status,
    ).toBe(409);
    expect(r.calls).toEqual([]);
    expect((await r.call("/bind", valid)).status).toBe(200);
    const altered = structuredClone(packet);
    altered.grant.payload += " ";
    expect((await r.call("/bind", r.binding(altered))).status).toBe(409);
    expect((await r.call("/reserve", { ...r.f.scope, operationId: randomUUID() })).status).toBe(
      409,
    );
    expect(r.writes).toEqual([]);
  });

  it.each(["missing", "swapped", "length"])(
    "rejects %s retained packet chunks before a forward write",
    async (damage) => {
      const r = fixture();
      await r.arm();
      const key = `execution:${r.f.scope.operationId}`,
        first = `${key}:packet:0`,
        second = `${key}:packet:1`;
      if (damage === "missing") r.values().delete(first);
      else if (damage === "swapped") {
        const value = r.values().get(first);
        r.values().set(first, r.values().get(second));
        r.values().set(second, value);
      } else (r.values().get(key) as { packetBytes: number }).packetBytes++;
      r.restart();
      expect((await r.mutate()).status).toBe(409);
      expect(r.writes).toEqual([]);
      expect(r.active().status).toBe("restoring");
    },
  );

  it.each(["role image", "DNS", "SSL"])(
    "observes current %s before remote mutation",
    async (change) => {
      const r = fixture();
      await r.arm();
      if (change === "role image") {
        const doc = r.documents.get(`${r.applications}/app-worker`) as {
          result: { configuration: { image: string } };
        };
        doc.result.configuration.image += "-changed";
      } else if (change === "DNS") {
        const doc = r.documents.get(
          `/client/v4/zones/${r.f.scope.zoneIds[0]}/dns_records?per_page=1000&page=1`,
        ) as { result: unknown[] };
        doc.result.push({
          id: "f".repeat(32),
          name: "unexpected.test",
          type: "TXT",
          content: "changed",
          ttl: 1,
        });
      } else
        r.documents.set(`/client/v4/zones/${r.f.scope.zoneIds[0]}/settings/ssl`, {
          result: { id: "ssl", value: "flexible" },
        });
      const result = await r.mutate();
      expect(result.status).toBe(409);
      expect(await result.text()).not.toContain("token");
      expect(r.writes).toEqual([]);
      expect(r.active().status).toBe("restoring");
    },
  );

  it("checks expiry after observation and after a provider write, then restores with original authority", async () => {
    const r = fixture();
    await r.arm();
    r.onFetch((_url, init) => {
      if (init.method === "PUT") r.advance(60_000);
    });
    expect((await r.mutate()).status).toBe(409);
    expect(r.writes).toEqual(["PUT"]);
    r.onFetch(() => {});
    r.env.MS_REALTY_EXECUTION_ADMISSION = "";
    r.env.WATCHDOG_OWNER_PUBLIC_KEY = "removed";
    r.env.WATCHDOG_CONTROLLER_PUBLIC_KEY = "removed";
    r.restart();
    await r.sweep();
    expect(r.active().status).toBe("restored");
    expect(r.rows.get(r.plan.routes[0].zoneId)).toEqual(r.baseline.zones[0].routes);
    expect((await r.mutate()).status).toBe(409);
  });

  it("does not write when a provider read crosses the forward deadline", async () => {
    const r = fixture();
    await r.arm();
    r.advance(59_999);
    r.onFetch(() => {
      r.advance(1);
    });
    expect((await r.mutate()).status).toBe(409);
    expect(r.writes).toEqual([]);
  });

  it("fences lost acknowledgements and reconciles a late provider write after expiry", async () => {
    const r = fixture();
    await r.arm();
    r.loseAck();
    expect((await r.mutate()).status).toBe(409);
    expect((await r.mutate()).status).toBe(409);
    expect(r.writes).toEqual(["PUT"]);
    r.advance(61_000);
    r.env.MS_REALTY_EXECUTION_ADMISSION = "";
    await r.sweep();
    expect(r.active().status).toBe("restored");
    const row = r.rows
      .get(r.plan.routes[0].zoneId)
      ?.find((x) => x.pattern === r.plan.routes[0].pattern);
    if (!row) throw new Error("Missing synthetic restored route");
    row.script = r.plan.workerName;
    r.restart();
    await r.sweep();
    expect(row.script).toBe(r.plan.workerName); // The provider response is replaced, not mutated in place.
    expect(r.rows.get(r.plan.routes[0].zoneId)?.find((x) => x.id === row.id)?.script).toBeNull();
  });

  it("requires a separate current release decision after expiry and retains the global latch after release", async () => {
    const r = fixture();
    const packet = await r.arm();
    expect((await r.mutate()).status).toBe(200);
    r.advance(61_000);
    r.env.MS_REALTY_EXECUTION_ADMISSION = "";
    r.env.WATCHDOG_OWNER_PUBLIC_KEY = "removed";
    r.env.WATCHDOG_CONTROLLER_PUBLIC_KEY = "removed";
    await r.sweep();
    await r.sweep();
    await r.sweep();
    r.advance(60_000);
    const binding = { operationId: r.f.scope.operationId, leaseId: r.f.scope.leaseId };
    expect(
      (
        await r.call("/release", {
          ...binding,
          approvals: { owner: packet.grant, controller: packet.verification },
        })
      ).status,
    ).toBe(409);
    const permit = (role: string) =>
      r.f.encode(
        {
          purpose: "release-restored-route-lease",
          role,
          ...binding,
          baselineSha256: r.f.scope.baselineSha256,
          issuedAt: new Date(r.clock()).toISOString(),
        },
        role === "owner" ? "owner" : "verifier",
      );
    const approvals = { owner: permit("owner"), controller: permit("controller") };
    expect((await r.call("/release", { ...binding, approvals })).status).toBe(200);
    expect(r.active().status).toBe("released");
    expect(r.alarm()).toBeNull();
    expect(
      (await r.call("/reserve", { ...r.f.scope, operationId: randomUUID(), leaseId: randomUUID() }))
        .status,
    ).toBe(409);
    expect((await r.call("/rehearsal", { operationId: randomUUID() })).status).toBe(409);
    expect(r.active().status).toBe("released");
  });

  it("uses one owner envelope through actual Node client, cutover and remote conditional acceptance", async () => {
    const r = fixture();
    const packet = await r.reserve();
    for (const [name, value] of Object.entries(r.f.environment)) vi.stubEnv(name, value as string);
    const custody = routeWatchdog({
      secret: "synthetic-control-".repeat(4),
      operationId: r.f.scope.operationId,
      leaseId: r.f.scope.leaseId,
      now: r.clock,
      transport: (url: string, init: RequestInit) =>
        r.call(new URL(url).pathname, undefined, init.body as string | undefined),
    });
    const bundle = executionBundle(packet, r.f.installed.keys);
    expect(bundle.approvals.owner.payload).toBe(packet.grant.payload);
    expect((await custody.bind(bundle)).status).toBe("armed");
    const result = await applyProductionCutover(bundle, {
      custody,
      provider: cloudflareRoutes("synthetic-read-only"),
      providerToken: "synthetic-read-only",
      now: r.clock,
      persist: custody.persist,
      readRecheck: async () => r.productionReport(packet),
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
    });
    expect(result.status).toBe("accepted");
    expect(r.active().status).toBe("accepted");
    expect(r.alarm()).toBeNull();
    expect(r.writes).toHaveLength(r.plan.routes.length);
    expect(r.commits()).toBe(1);
  });

  it("cannot replace conditional acceptance with R11/R12 or an execution grant", async () => {
    const r = fixture();
    const packet = await r.arm();
    for (let i = 0; i < r.plan.routes.length; i++) expect((await r.mutate(i)).status).toBe(200);
    for (const purpose of ["deployment_acceptance", "operational_acceptance", "execution_grant"])
      expect(
        (await r.call("/accept", { ...r.f.scope, report: r.productionReport(packet, purpose) }))
          .status,
      ).toBe(409);
    expect(r.active().status).toBe("armed");
    expect(r.alarm()).not.toBeNull();
    expect(
      (await r.call("/accept", { ...r.f.scope, report: r.productionReport(packet) })).status,
    ).toBe(200);
    r.advance(60_000);
    expect((await r.call("/bind", r.binding(packet))).status).toBe(200); // Read-only consumed receipt, never rearmed.
    expect((await r.mutate()).status).toBe(409);
    expect(r.active().status).toBe("accepted");
  });
});
