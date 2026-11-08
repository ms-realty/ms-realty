import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Existing operator hash defines the state receipt identity.
import { routeStateSha256 } from "../../scripts/production-cutover.mjs";
// @ts-expect-error Shared JavaScript observer also runs in the remote Worker.
import { observeExecutionRuntime } from "./execution-observer.mjs";

const roles = ["web", "worker", "migrator"] as const;
type Role = (typeof roles)[number];
const accountId = "921d0224dcd595c87b7928d2b3c479d1";
const token = "synthetic-read-only-provider-token";
const failure = "Execution runtime observation failed";

// Actual-shaped injected responses are contract fixtures, never live release evidence.
function fixture() {
  const at = Date.now();
  const sourceCommit = "b".repeat(40);
  const digest = `sha256:${"c".repeat(64)}`;
  const image = `registry.cloudflare.com/${accountId}/ms-realty-staging@${digest}`;
  const plan = {
    schemaVersion: 1,
    environment: "production",
    purpose: "complete_parity",
    accountId,
    sourceCommit,
    digest,
    image,
    workerName: `ms-realty-production-${sourceCommit.slice(0, 12)}`,
    gatewayVersionId: "66666666-6666-4666-8666-666666666666",
    gatewayDeploymentId: "77777777-7777-4777-8777-777777777777",
  };
  const completedAt = new Date(at - 1_000).toISOString().replace(/Z$/, "000064Z");
  const buildNonce = "88888888-8888-4888-8888-888888888888";
  const entries = roles.map((role, index) => {
    const actorId = String(index + 1).repeat(64);
    const namespaceId = String(index + 1).repeat(32);
    const row = {
      identity: {
        schemaVersion: 1,
        actorId,
        sourceCommit,
        role,
        buildNonce,
        state: role === "migrator" ? "completed" : "running",
      },
      binding: {
        name: ["MS_REALTY", "MS_REALTY_WORKER", "MS_REALTY_MIGRATOR"][index],
        type: "durable_object_namespace",
        namespace_id: namespaceId,
      },
      application: {
        id: `app-${role}`,
        account_id: accountId,
        durable_objects: { namespace_id: namespaceId },
        scheduling_policy: "default",
        configuration: { image },
        version: 2,
        active_rollout_id: null as string | null,
      },
      rollout: {
        id: `rollout-${role}`,
        status: "completed",
        kind: "full_auto",
        current_version: 1,
        target_version: 2,
        target_configuration: { image },
        last_updated_at: completedAt,
      },
      instance: {
        id: actorId,
        application_id: `app-${role}`,
        image,
        status: { state: "running", updated_at: completedAt },
        started_at: completedAt,
      },
    };
    return [role, row] as const;
  });
  const roleData = Object.fromEntries(entries) as Record<Role, (typeof entries)[number][1]>;
  const runtime = {
    schemaVersion: 1,
    roles: Object.fromEntries(entries.map(([role, row]) => [role, row.identity])),
  };
  const root = `/client/v4/accounts/${accountId}`;
  const base = `${root}/containers/applications`;
  const worker = `${root}/workers/scripts/${plan.workerName}`;
  const deployment = {
    id: plan.gatewayDeploymentId,
    created_on: new Date(at - 500).toISOString(),
    versions: [{ version_id: plan.gatewayVersionId, percentage: 100 }],
  };
  const documents = new Map<string, Record<string, unknown>>([
    [`${worker}/settings`, { result: { bindings: entries.map(([, row]) => row.binding) } }],
    [base, { result: entries.map(([, row]) => row.application), result_info: {} }],
    [
      `${worker}/deployments?per_page=100&page=1`,
      { result: { deployments: [deployment] }, result_info: { total_pages: 1 } },
    ],
  ]);
  for (const [, row] of entries) {
    const path = `${base}/${row.application.id}`;
    documents.set(path, { result: row.application });
    documents.set(`${path}/rollouts`, { result: [row.rollout] });
    documents.set(`${path}/instances-v2`, { result: [row.instance], result_info: {} });
  }
  const calls: { url: string; options: RequestInit | undefined }[] = [];
  const transport: typeof fetch = async (input, options) => {
    const url = new URL(String(input));
    calls.push({ url: url.href, options });
    expect(url.origin).toBe("https://api.cloudflare.com");
    expect(options?.method).toBe("GET");
    expect(options?.redirect).toBe("error");
    expect(options?.body).toBeUndefined();
    expect([...new Headers(options?.headers)]).toEqual([["authorization", `Bearer ${token}`]]);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const document = documents.get(url.pathname + url.search);
    expect(document, `fixture provider path ${url.pathname + url.search}`).toBeDefined();
    return Response.json({ success: true, errors: [], ...document });
  };
  return { plan, runtime, roleData, deployment, documents, calls, transport, base, worker, at };
}

function addBaseline(f: ReturnType<typeof fixture>) {
  const baseline = {
    schemaVersion: 1,
    accountId,
    observedAt: new Date(f.at).toISOString(),
    zones: [
      {
        id: "f0ac7af0721419e8129e5d10ff547372",
        name: "makler-realty.com",
        accountId,
        status: "active",
        ssl: "strict",
        dns: [
          {
            id: "1".repeat(32),
            name: "makler-realty.com",
            type: "A",
            content: "185.80.2.102",
            proxied: true,
            ttl: 1,
            settings: { ipv4_only: false, ipv6_only: false },
          },
          {
            id: "2".repeat(32),
            name: "makler-realty.com",
            type: "MX",
            content: "mail.makler-realty.com",
            priority: 10,
            proxied: false,
            ttl: 3600,
          },
          {
            id: "3".repeat(32),
            name: "_service._tcp.makler-realty.com",
            type: "SRV",
            content: "0 5 443 service.makler-realty.com",
            ttl: 3600,
            data: { priority: 0, weight: 5, port: 443, target: "service.makler-realty.com" },
          },
        ],
        routes: [
          { id: "4".repeat(32), pattern: "makler-realty.com/*", script: null as string | null },
          {
            id: "5".repeat(32),
            pattern: "staging.makler-realty.com/*",
            script: "ms-realty-staging",
          },
        ],
      },
      // Synthetic RU ownership; this fixture does not establish live account access.
      {
        id: "c".repeat(32),
        name: "makler-realty.ru",
        accountId,
        status: "active",
        ssl: "strict",
        dns: [],
        routes: [],
      },
    ],
  };
  const provider = baseline.zones.map((zone) => {
    const path = `/client/v4/zones/${zone.id}`;
    const value = {
      path,
      zone: { id: zone.id, name: zone.name, account: { id: accountId }, status: "active" },
      dns: structuredClone(zone.dns).map((record) => ({
        ...record,
        comment: "Provider metadata excluded from the state projection",
      })),
      routes: structuredClone(zone.routes),
      ssl: { id: "ssl", value: "strict" },
    };
    f.documents.set(path, { result: value.zone });
    f.documents.set(`${path}/workers/routes`, { result: value.routes });
    f.documents.set(`${path}/settings/ssl`, { result: value.ssl });
    f.documents.set(`${path}/dns_records?per_page=1000&page=1`, {
      result: value.dns,
      result_info: { page: 1, total_pages: 1, total_count: value.dns.length },
    });
    return value;
  });
  const com = provider.find((row) => row.zone.name === "makler-realty.com");
  if (!com) throw new Error("COM fixture required");
  return { baseline, provider, com };
}

describe("R00 bounded execution runtime provider observation", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the exact gateway and all three provider-observed actor images", async () => {
    const f = fixture();
    const result = await observeExecutionRuntime(f.plan, f.runtime, token, {
      transport: f.transport,
      now: () => f.at,
    });
    expect(result).toMatchObject({
      schemaVersion: 1,
      status: "observed",
      sourceCommit: f.plan.sourceCommit,
      observedDigest: f.plan.digest,
      image: f.plan.image,
      workerName: f.plan.workerName,
      gateway: {
        deploymentId: f.plan.gatewayDeploymentId,
        versionId: f.plan.gatewayVersionId,
        percentage: 100,
      },
    });
    expect(result.roles).toHaveLength(3);
    for (const role of roles) {
      expect(result.roles).toContainEqual({
        role,
        actorId: f.roleData[role].identity.actorId,
        namespaceId: f.roleData[role].binding.namespace_id,
        applicationId: `app-${role}`,
        rolloutId: `rollout-${role}`,
        applicationVersion: 2,
        rolloutVersion: 2,
        image: f.plan.image,
        state: "running",
        startedAt: f.roleData[role].instance.started_at,
        statusUpdatedAt: f.roleData[role].instance.status.updated_at,
        completedAt: f.roleData[role].rollout.last_updated_at,
        buildNonce: f.roleData[role].identity.buildNonce,
      });
    }
    expect(f.calls).toHaveLength(12);
    expect(new Set(f.calls.map((call) => call.options?.signal)).size).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/PASS|launch|Authorization|synthetic-read-only/);
  });

  it.each(roles)("rejects %s image drift at each provider layer", async (role) => {
    for (const layer of ["application", "rollout", "instance"] as const) {
      const f = fixture();
      const drift = `${f.plan.image.slice(0, -1)}d`;
      const row = f.roleData[role];
      if (layer === "application") row.application.configuration.image = drift;
      if (layer === "rollout") row.rollout.target_configuration.image = drift;
      if (layer === "instance") row.instance.image = drift;
      await expect(
        observeExecutionRuntime(f.plan, f.runtime, token, { transport: f.transport }),
        `${role} ${layer} image drift`,
      ).rejects.toThrow(failure);
    }
  });

  it.each(roles)("rejects the wrong %s namespace, actor, or unfinished rollout", async (role) => {
    for (const defect of ["binding", "namespace", "actor", "unfinished", "stopped"] as const) {
      const f = fixture();
      const row = f.roleData[role];
      if (defect === "binding") row.binding.namespace_id = "f".repeat(32);
      if (defect === "namespace") row.application.durable_objects.namespace_id = "f".repeat(32);
      if (defect === "actor") row.instance.id = "f".repeat(64);
      if (defect === "unfinished") row.rollout.status = "progressing";
      if (defect === "stopped") row.instance.status.state = "stopped";
      await expect(
        observeExecutionRuntime(f.plan, f.runtime, token, { transport: f.transport }),
        `${role} ${defect}`,
      ).rejects.toThrow(failure);
    }
  });

  it("keeps exact-role checks when a caller supplies observed status labels", async () => {
    const f = fixture();
    f.roleData.worker.instance.image = "status-labels-do-not-attest-the-image";
    await expect(
      observeExecutionRuntime(
        { ...f.plan, status: "observed" },
        { ...f.runtime, status: "observed", rolesObserved: true },
        token,
        { transport: f.transport },
      ),
    ).rejects.toThrow(failure);
  });

  it("retains the original observer's newly-created application and stale inventory behavior", async () => {
    const f = fixture();
    f.documents.set(f.base, {
      result: roles.map((role) => ({
        ...f.roleData[role].application,
        configuration: { image: "stale-inventory-image" },
      })),
      result_info: {},
    });
    for (const role of roles) {
      f.roleData[role].application.version = 1;
      f.documents.set(`${f.base}/app-${role}/rollouts`, { result: [] });
    }
    const result = await observeExecutionRuntime(f.plan, f.runtime, token, {
      transport: f.transport,
    });
    expect(result.roles.map((row: { rolloutId: unknown }) => row.rolloutId)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it.each(["deployment", "version", "split", "percentage", "future", "tie", "newer"])(
    "rejects gateway %s drift or ambiguity",
    async (defect) => {
      const f = fixture();
      const other = "99999999-9999-4999-8999-999999999999";
      const rows = [f.deployment];
      if (defect === "deployment") f.deployment.id = other;
      if (defect === "version") f.deployment.versions = [{ version_id: other, percentage: 100 }];
      if (defect === "split") f.deployment.versions.push({ version_id: other, percentage: 0 });
      if (defect === "percentage")
        f.deployment.versions = [{ version_id: f.plan.gatewayVersionId, percentage: 99 }];
      if (defect === "future") f.deployment.created_on = new Date(f.at + 60_000).toISOString();
      if (defect === "tie" || defect === "newer")
        rows.push({
          ...f.deployment,
          id: other,
          created_on:
            defect === "tie" ? f.deployment.created_on : new Date(f.at - 100).toISOString(),
        });
      f.documents.set(`${f.worker}/deployments?per_page=100&page=1`, {
        result: { deployments: rows },
        result_info: { total_pages: 1 },
      });
      await expect(
        observeExecutionRuntime(f.plan, f.runtime, token, {
          transport: f.transport,
          now: () => f.at,
        }),
      ).rejects.toThrow(failure);
    },
  );

  it("reads every gateway history page before selecting the uniquely latest deployment", async () => {
    const f = fixture();
    f.documents.set(`${f.worker}/deployments?per_page=100&page=1`, {
      result: {
        deployments: [
          {
            ...f.deployment,
            id: "99999999-9999-4999-8999-999999999999",
            created_on: new Date(f.at - 10_000).toISOString(),
          },
        ],
      },
      result_info: { total_pages: 2 },
    });
    f.documents.set(`${f.worker}/deployments?per_page=100&page=2`, {
      result: { deployments: [f.deployment] },
      result_info: { total_pages: 2 },
    });
    const result = await observeExecutionRuntime(f.plan, f.runtime, token, {
      transport: f.transport,
    });
    expect(result.gateway.deploymentId).toBe(f.plan.gatewayDeploymentId);
    expect(f.calls).toHaveLength(13);
  });

  it.each([
    { success: false, result: {} },
    { errors: [token], result: {} },
    { result: null },
    { result: { deployments: null } },
    { result: { deployments: [] } },
    { result: { deployments: [null] } },
    { result: { deployments: [{}] } },
    { result: { deployments: [] }, result_info: { total_pages: 11 } },
    { result: { deployments: [] }, result_info: { total_pages: 0 } },
    { result: { deployments: [] }, result_info: { total_pages: "1" } },
  ])("rejects malformed gateway provider packet %#", async (document) => {
    const f = fixture();
    f.documents.set(`${f.worker}/deployments?per_page=100&page=1`, document);
    await expect(
      observeExecutionRuntime(f.plan, f.runtime, token, { transport: f.transport }),
    ).rejects.toThrow(failure);
  });

  it("rejects gateway pagination that changes while it is read", async () => {
    const f = fixture();
    f.documents.set(`${f.worker}/deployments?per_page=100&page=1`, {
      result: { deployments: [f.deployment] },
      result_info: { total_pages: 2 },
    });
    f.documents.set(`${f.worker}/deployments?per_page=100&page=2`, {
      result: { deployments: [] },
      result_info: { total_pages: 1 },
    });
    await expect(
      observeExecutionRuntime(f.plan, f.runtime, token, { transport: f.transport }),
    ).rejects.toThrow(failure);
  });

  it.each(["settings", "applications", "rollout", "instances"])(
    "rejects malformed %s provider data",
    async (part) => {
      const f = fixture();
      const path = {
        settings: `${f.worker}/settings`,
        applications: f.base,
        rollout: `${f.base}/app-web/rollouts`,
        instances: `${f.base}/app-web/instances-v2`,
      }[part];
      if (!path) throw new Error("Unknown fixture part");
      f.documents.set(path, { result: null });
      await expect(
        observeExecutionRuntime(f.plan, f.runtime, token, { transport: f.transport }),
      ).rejects.toThrow(failure);
    },
  );

  it.each(["account", "worker", "source", "digest", "image", "gateway"])(
    "rejects an invalid %s plan pin before any request",
    async (pin) => {
      const f = fixture();
      if (pin === "account") f.plan.accountId = "a".repeat(32);
      if (pin === "worker") f.plan.workerName = "https://unexpected.example/credential";
      if (pin === "source") f.plan.sourceCommit = "branch-main";
      if (pin === "digest") f.plan.digest = `sha256:${"d".repeat(64)}`;
      if (pin === "image") f.plan.image = "https://unexpected.example/image";
      if (pin === "gateway") f.plan.gatewayVersionId = "supplied-status-observed";
      await expect(
        observeExecutionRuntime(f.plan, f.runtime, token, { transport: f.transport }),
      ).rejects.toThrow(failure);
      expect(f.calls).toHaveLength(0);
    },
  );

  it("never uses packet-supplied endpoints or credentials and snapshots the exact identities", async () => {
    const f = fixture();
    const expected = structuredClone(f.plan);
    let first = true;
    const result = await observeExecutionRuntime(
      { ...f.plan, url: "https://unexpected.example", key: "untrusted-packet-key" },
      f.runtime,
      token,
      {
        transport: async (url: string, options: RequestInit) => {
          if (first) {
            first = false;
            f.plan.image = "changed-after-the-first-await";
            f.roleData.web.identity.actorId = "f".repeat(64);
          }
          return f.transport(url, options);
        },
      },
    );
    expect(result.image).toBe(expected.image);
    expect(result.roles[0].actorId).toBe("1".repeat(64));
    expect(JSON.stringify(result)).not.toMatch(/unexpected|untrusted|changed-after/);
  });

  it.each(["fetch", "body", "json"])("redacts credential-bearing %s errors", async (stage) => {
    const f = fixture();
    const transport = async () => {
      if (stage === "fetch") throw new Error(`request failed with ${token}`);
      if (stage === "json") return new Response(`invalid JSON containing ${token}`);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error(`body failed with ${token}`));
          },
        }),
      );
    };
    const error = await observeExecutionRuntime(f.plan, f.runtime, token, { transport }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toEqual(new Error(failure));
    expect(String(error.stack)).not.toContain(token);
    expect(error.cause).toBeUndefined();
  });

  it.each(["declared", "single", "streamed"])(
    "rejects a %s body over two MiB without trusting content-length",
    async (shape) => {
      const f = fixture();
      let cancelled = false;
      const chunk = new Uint8Array(1_048_577).fill(32);
      const transport = async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              if (shape === "single") controller.enqueue(new Uint8Array(2_097_153));
              if (shape === "streamed") {
                controller.enqueue(chunk);
                controller.enqueue(chunk);
              }
            },
            cancel() {
              cancelled = true;
              return new Promise(() => {});
            },
          }),
          { headers: { "content-length": shape === "declared" ? "2097153" : "1" } },
        );
      await expect(
        observeExecutionRuntime(f.plan, f.runtime, token, { transport }),
      ).rejects.toThrow(failure);
      expect(cancelled).toBe(true);
    },
  );

  it.each(["transport", "body"])(
    "rejects expiry between awaited %s reads without making a further request",
    async (stage) => {
      const f = fixture();
      let at = f.at;
      let chunks = 0;
      await expect(
        observeExecutionRuntime(f.plan, f.runtime, token, {
          now: () => at,
          transport: async (url: string, options: RequestInit) => {
            const response = await f.transport(url, options);
            if (!url.includes("/deployments?")) return response;
            if (stage === "transport") {
              at += 15_000;
              return response;
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            return new Response(
              new ReadableStream({
                pull(controller) {
                  chunks++;
                  if (chunks === 1) controller.enqueue(bytes.slice(0, 1));
                  else {
                    at += 15_000;
                    controller.enqueue(bytes.slice(1));
                    controller.close();
                  }
                },
              }),
            );
          },
        }),
      ).rejects.toThrow(failure);
      expect(f.calls).toHaveLength(12);
      if (stage === "body") expect(chunks).toBe(2);
    },
  );

  it.each([15_000, 120_000])(
    "caps the entire delegation at 15 seconds even with maximumMs=%i and a late fetch",
    async (maximumMs) => {
      vi.useFakeTimers();
      const f = fixture();
      let resolve: ((response: Response) => void) | undefined;
      let signal: AbortSignal | undefined;
      let cancelled = false;
      const pending = new Promise<Response>((done) => {
        resolve = done;
      });
      const outcome = observeExecutionRuntime(f.plan, f.runtime, token, {
        maximumMs,
        now: () => f.at,
        transport: (_url: string, options: RequestInit) => {
          signal = options.signal ?? undefined;
          return pending;
        },
      }).catch((caught: unknown) => caught);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(await outcome).toEqual(new Error(failure));
      expect(signal?.aborted).toBe(true);
      resolve?.(
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
        ),
      );
      await vi.advanceTimersByTimeAsync(1);
      expect(cancelled).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("times out a body whose cancellation never resolves", async () => {
    vi.useFakeTimers();
    const f = fixture();
    let cancelled = false;
    const outcome = observeExecutionRuntime(f.plan, f.runtime, token, {
      transport: async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
              return new Promise(() => {});
            },
          }),
        ),
    }).catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await outcome).toEqual(new Error(failure));
    expect(cancelled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applies one shared budget across successful requests", async () => {
    const f = fixture();
    let at = f.at;
    await expect(
      observeExecutionRuntime(f.plan, f.runtime, token, {
        now: () => at,
        transport: async (url: string, options: RequestInit) => {
          const response = await f.transport(url, options);
          at += 1_000;
          return response;
        },
        maximumMs: 5_000,
      }),
    ).rejects.toThrow(failure);
    expect(f.calls).toHaveLength(5);
  });

  it("observes the complete baseline and returns the existing canonical state hash", async () => {
    const f = fixture();
    const { baseline } = addBaseline(f);
    baseline.zones.reverse();
    for (const zone of baseline.zones) {
      zone.routes.reverse();
      zone.dns.reverse();
    }
    const result = await observeExecutionRuntime(f.plan, f.runtime, token, {
      transport: f.transport,
      expectedBaseline: baseline,
    });
    expect(result.observedStateSha256).toBe(routeStateSha256(baseline));
    expect(f.calls).toHaveLength(20);
    expect(new Set(f.calls.map((call) => call.options?.signal)).size).toBe(1);
    expect(JSON.stringify(result)).not.toContain("Provider metadata");
  });

  it.each(["id", "name", "type", "content", "priority", "proxied", "ttl", "data", "settings"])(
    "rejects baseline DNS %s drift",
    async (field) => {
      const f = fixture();
      const { baseline, com } = addBaseline(f);
      const record = com.dns[0];
      if (!record) throw new Error("DNS fixture required");
      const changed = {
        id: "6".repeat(32),
        name: "other.makler-realty.com",
        type: "TXT",
        content: "changed",
        priority: 20,
        proxied: false,
        ttl: 3600,
        data: { port: 8443 },
        settings: { ipv4_only: true, ipv6_only: false },
      };
      Object.assign(record, { [field]: changed[field as keyof typeof changed] });
      await expect(
        observeExecutionRuntime(f.plan, f.runtime, token, {
          transport: f.transport,
          expectedBaseline: baseline,
        }),
      ).rejects.toThrow(failure);
    },
  );

  it.each(["ssl", "account", "name", "status", "unrelatedRoute", "missingRoute", "newRoute"])(
    "rejects actual source state %s drift",
    async (part) => {
      const f = fixture();
      const { baseline, com } = addBaseline(f);
      if (part === "ssl") com.ssl.value = "full";
      if (part === "account") com.zone.account.id = "a".repeat(32);
      if (part === "name") com.zone.name = "unexpected.example";
      if (part === "status") com.zone.status = "pending";
      if (part === "unrelatedRoute") {
        const route = com.routes.find((row) => row.script === "ms-realty-staging");
        if (!route) throw new Error("Unrelated route fixture required");
        route.script = "unrelated-worker-drift";
      }
      if (part === "missingRoute") com.routes.pop();
      if (part === "newRoute")
        com.routes.push({
          id: "6".repeat(32),
          pattern: "new.makler-realty.com/*",
          script: "unrelated-worker",
        });
      await expect(
        observeExecutionRuntime(f.plan, f.runtime, token, {
          transport: f.transport,
          expectedBaseline: baseline,
        }),
      ).rejects.toThrow(failure);
    },
  );

  it("reads all DNS pages and compares projected data and settings without provider metadata", async () => {
    const f = fixture();
    const { baseline, com } = addBaseline(f);
    f.documents.set(`${com.path}/dns_records?per_page=1000&page=1`, {
      result: com.dns.slice(0, 1),
      result_info: { page: 1, total_pages: 2, total_count: com.dns.length },
    });
    f.documents.set(`${com.path}/dns_records?per_page=1000&page=2`, {
      result: com.dns.slice(1),
      result_info: { page: 2, total_pages: 2, total_count: com.dns.length },
    });
    const result = await observeExecutionRuntime(f.plan, f.runtime, token, {
      transport: f.transport,
      expectedBaseline: baseline,
    });
    expect(result.observedStateSha256).toBe(routeStateSha256(baseline));
    expect(f.calls).toHaveLength(21);
  });

  it.each(["missingInfo", "wrongPage", "wrongCount", "tooManyPages", "changingPages", "duplicate"])(
    "rejects incomplete DNS inventory: %s",
    async (part) => {
      const f = fixture();
      const { baseline, com } = addBaseline(f);
      const document: Record<string, unknown> = {
        result: com.dns,
        result_info: { page: 1, total_pages: 1, total_count: com.dns.length },
      };
      if (part === "missingInfo") delete document.result_info;
      if (part === "wrongPage")
        document.result_info = { page: 2, total_pages: 1, total_count: com.dns.length };
      if (part === "wrongCount")
        document.result_info = { page: 1, total_pages: 1, total_count: com.dns.length + 1 };
      if (part === "tooManyPages")
        document.result_info = { page: 1, total_pages: 11, total_count: com.dns.length };
      if (part === "changingPages") {
        document.result_info = { page: 1, total_pages: 2, total_count: com.dns.length };
        f.documents.set(`${com.path}/dns_records?per_page=1000&page=2`, {
          result: [],
          result_info: { page: 2, total_pages: 1, total_count: com.dns.length },
        });
      }
      if (part === "duplicate") document.result = [com.dns[0], com.dns[0], com.dns[0]];
      f.documents.set(`${com.path}/dns_records?per_page=1000&page=1`, document);
      await expect(
        observeExecutionRuntime(f.plan, f.runtime, token, {
          transport: f.transport,
          expectedBaseline: baseline,
        }),
      ).rejects.toThrow(failure);
    },
  );

  it.each(["pages", "count", "duplicateId", "duplicatePattern"])(
    "rejects incomplete or ambiguous route inventory: %s",
    async (part) => {
      const f = fixture();
      const { baseline, com } = addBaseline(f);
      const document: Record<string, unknown> = { result: com.routes };
      if (part === "pages") document.result_info = { total_pages: 2 };
      if (part === "count") document.result_info = { total_count: com.routes.length + 1 };
      const first = com.routes[0];
      if (!first) throw new Error("Route fixture required");
      if (part === "duplicateId")
        com.routes.push({ ...first, pattern: "other.makler-realty.com/*" });
      if (part === "duplicatePattern") com.routes.push({ ...first, id: "6".repeat(32) });
      f.documents.set(`${com.path}/workers/routes`, document);
      await expect(
        observeExecutionRuntime(f.plan, f.runtime, token, {
          transport: f.transport,
          expectedBaseline: baseline,
        }),
      ).rejects.toThrow(failure);
    },
  );

  it("fails closed when the installed token cannot read source-zone state", async () => {
    const f = fixture();
    const { baseline } = addBaseline(f);
    await expect(
      observeExecutionRuntime(f.plan, f.runtime, token, {
        expectedBaseline: baseline,
        transport: (url: string, options: RequestInit) =>
          url.includes("/zones/")
            ? Promise.resolve(Response.json({ errors: [token] }, { status: 403 }))
            : f.transport(url, options),
      }),
    ).rejects.toThrow(failure);
  });

  it("uses the same total deadline for baseline reads and actor observations", async () => {
    const f = fixture();
    const { baseline } = addBaseline(f);
    let at = f.at;
    await expect(
      observeExecutionRuntime(f.plan, f.runtime, token, {
        expectedBaseline: baseline,
        now: () => at,
        transport: async (url: string, options: RequestInit) => {
          const response = await f.transport(url, options);
          at += 1_000;
          return response;
        },
      }),
    ).rejects.toThrow(failure);
    expect(f.calls).toHaveLength(15);
    expect(f.calls.some((call) => call.url.includes("/zones/"))).toBe(true);
    expect(f.calls.some((call) => call.url.includes("/deployments?"))).toBe(false);
  });
});
