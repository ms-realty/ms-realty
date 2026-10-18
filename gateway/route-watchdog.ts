/// <reference types="node" />
/// <reference path="./route-watchdog.configuration.d.ts" />
// Off-runner write-ahead custody for one account-wide routing operation.
// No business host is enabled by deploying this private control service.

import { connect } from "cloudflare:sockets";
import { DurableObject } from "cloudflare:workers";
import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";

const accountId = "921d0224dcd595c87b7928d2b3c479d1";
const comZone = "f0ac7af0721419e8129e5d10ff547372";
const hex = (n: number, x: unknown): x is string =>
  typeof x === "string" && new RegExp(`^[a-f0-9]{${n}}$`, "u").test(x);
const uuid = (x: unknown): x is string =>
  typeof x === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(x);
const demand: (condition: unknown) => asserts condition = (condition) => {
  if (!condition) throw new Error("Watchdog request could not be verified");
};
const required = <T>(x: T | null | undefined): T => {
  demand(x != null);
  return x;
};
const hash = (x: string) => createHash("sha256").update(x).digest("hex");
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
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const sorted = <T>(rows: T[]) =>
  [...rows].sort((a, b) => canonical(a).localeCompare(canonical(b), "en"));

interface Route {
  id: string;
  pattern: string;
  script: string | null;
}
interface Zone {
  id: string;
  name: string;
  routes: Route[];
}
interface BaselineSnapshot {
  accountId: string;
  zones: (Zone & { dns: unknown[]; [key: string]: unknown })[];
}
interface Change {
  zoneId: string;
  pattern: string;
  baselineRouteId: string | null;
}
interface Scope {
  operationId: string;
  leaseId: string;
  sourceCommit: string;
  digest: string;
  baselineSha256: string;
  zoneIds: string[];
}
interface Envelope {
  payload: string;
  signature: string;
}
interface BoundPlan {
  operationId: string;
  accountId: string;
  sourceCommit: string;
  digest: string;
  baselineSha256: string;
  workerName: string;
  timeoutSeconds: number;
  rollbackTimeoutSeconds: number;
  routes: Change[];
  gatewayVersionId: string;
  gatewayDeploymentId: string;
  artifacts: Record<string, string>;
}
interface Intent extends Change {
  before: Route | null;
  id?: string;
  restored?: boolean;
}
interface State {
  mode?: "rehearsal";
  scope: Scope;
  reservedAt: number;
  expiresAt: number;
  deadline: number;
  status:
    | "reserved"
    | "armed"
    | "restoring"
    | "restored"
    | "reconciliation_required"
    | "accepted"
    | "released";
  receipt: Record<string, unknown>;
  plan?: BoundPlan;
  planSha256?: string;
  baseline?: Zone[];
  fullBaseline?: BaselineSnapshot;
  checkerBaselineSha256?: string;
  baselineSourceRows?: number;
  intents: Intent[];
  journal?: unknown;
  cleanReads: number;
  restoreIndex?: number;
  verifyIndex?: number;
  roundFailed?: boolean;
  restoredAt?: number;
  providerFailure?: boolean;
  acceptedReportSha256?: string;
  lateWriteFaults?: number;
  originIndex?: number;
  originChecks?: { host: string; address: string; strictTls: true; status: number }[];
}

// The binding and secret interface is generated from wrangler.watchdog.jsonc.
type Env = RouteWatchdogEnv;
const response = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
async function boundedJson(source: Request | Response, maximum = 2 * 1024 * 1024) {
  demand(source.body);
  const reader = source.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      demand(size <= maximum);
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function normalizedRoute(x: Route): Route {
  demand(
    hex(32, x.id) &&
      typeof x.pattern === "string" &&
      x.pattern.length <= 2048 &&
      !/[\r\n]/u.test(x.pattern) &&
      (x.script == null || /^[a-z0-9_-]{1,63}$/u.test(x.script)),
  );
  return { id: x.id, pattern: x.pattern, script: x.script ?? null };
}
function signed(envelope: Envelope, pem: string) {
  demand(
    typeof envelope?.payload === "string" &&
      envelope.payload.length <= 2 * 1024 * 1024 &&
      typeof envelope.signature === "string",
  );
  const key = createPublicKey(pem);
  demand(
    key.asymmetricKeyType === "ed25519" &&
      verify(null, Buffer.from(envelope.payload), key, Buffer.from(envelope.signature, "base64")),
  );
  return JSON.parse(envelope.payload);
}
function independentKeys(env: Env) {
  const owner = createPublicKey(env.WATCHDOG_OWNER_PUBLIC_KEY),
    controller = createPublicKey(env.WATCHDOG_CONTROLLER_PUBLIC_KEY);
  demand(
    !owner
      .export({ format: "der", type: "spki" })
      .equals(controller.export({ format: "der", type: "spki" })),
  );
}
async function originalOrigin(host: string) {
  demand(["makler-realty.com", "makler-realty.ru"].includes(host));
  const address = "185.80.2.102";
  const socket = connect(
    { hostname: address, port: 443 },
    { secureTransport: "starttls", allowHalfOpen: false },
  ).startTls({ expectedServerHostname: host });
  const closed = socket.closed.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await socket.opened;
        const writer = socket.writable.getWriter();
        await writer.write(
          new TextEncoder().encode(
            `GET / HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\nAccept: text/html\r\nUser-Agent: MS-Realty-Route-Recovery\r\n\r\n`,
          ),
        );
        writer.releaseLock();
        const reader = socket.readable.getReader(),
          chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const chunk = await reader.read();
          demand(!chunk.done);
          bytes += chunk.value.byteLength;
          demand(bytes <= 128 * 1024);
          chunks.push(chunk.value);
          const text = Buffer.concat(chunks).toString("latin1"),
            end = text.indexOf("\r\n\r\n");
          if (end < 0) {
            demand(bytes <= 16 * 1024);
            continue;
          }
          const headers = text.slice(0, end);
          demand(
            /^HTTP\/1\.[01] 200(?: |\r)/u.test(headers) &&
              /\r\ncontent-type:\s*text\/html(?:;|\r|$)/iu.test(headers),
          );
          return { host, address, strictTls: true as const, status: 200 };
        }
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Strict origin probe timed out")), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await socket.close().catch(() => {});
    await closed;
  }
}

export class RouteWatchdog extends DurableObject<Env> {
  private async provider(zone: string, suffix = "", method = "GET", body?: unknown) {
    demand(hex(32, zone) && /^\/?[a-f0-9]*$/u.test(suffix));
    // This service intentionally controls the provider API: a Worker binding cannot replace
    // a zone route or restore its null-script bypass. The token remains in off-runner custody.
    const result = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zone}/workers/routes${suffix}`,
      {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${this.env.WATCHDOG_ROUTE_TOKEN}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    demand(result.ok && !result.redirected);
    const packet = await boundedJson(result);
    demand(packet.success === true && Array.isArray(packet.errors) && packet.errors.length === 0);
    return packet;
  }
  private async routes(zone: string): Promise<Route[]> {
    const packet = await this.provider(zone);
    demand(
      Array.isArray(packet.result) &&
        packet.result.length <= 1000 &&
        (packet.result_info?.total_pages ?? 1) <= 1,
    );
    const rows = packet.result.map(normalizedRoute);
    demand(
      new Set(rows.map((r: Route) => r.id)).size === rows.length &&
        new Set(rows.map((r: Route) => r.pattern)).size === rows.length,
    );
    return rows;
  }
  private async save(state: State) {
    await this.ctx.storage.put("active", state);
  }
  private async reserve(scope: Scope) {
    demand(
      uuid(scope.operationId) &&
        uuid(scope.leaseId) &&
        hex(40, scope.sourceCommit) &&
        /^sha256:[a-f0-9]{64}$/u.test(scope.digest) &&
        hex(64, scope.baselineSha256) &&
        Array.isArray(scope.zoneIds) &&
        scope.zoneIds.length >= 1 &&
        scope.zoneIds.length <= 2 &&
        scope.zoneIds.every((id) => hex(32, id)) &&
        new Set(scope.zoneIds).size === scope.zoneIds.length &&
        scope.zoneIds.includes(comZone),
    );
    const prior = await this.ctx.storage.get<State>("active");
    if (prior && same(prior.scope, scope))
      return { ...prior.receipt, evidenceSha256: hash(canonical(prior.receipt)) };
    demand(!prior || ["accepted", "released"].includes(prior.status));
    demand(
      prior?.scope.operationId !== scope.operationId &&
        !(await this.ctx.storage.get(`history:${scope.operationId}`)),
    );
    if (prior) await this.ctx.storage.put(`history:${prior.scope.operationId}`, prior);
    const now = Date.now(),
      expiresAt = now + 1_800_000;
    const receipt = {
      schemaVersion: 1,
      accountId,
      holder: scope.operationId,
      id: scope.leaseId,
      sourceCommit: scope.sourceCommit,
      digest: scope.digest,
      baselineSha256: scope.baselineSha256,
      zoneIds: sorted(scope.zoneIds),
      observedAt: new Date(now).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      armed: true,
      custody: "account-wide-durable-object",
      writes: "signed-plan-only",
      serviceVersion: this.env.WATCHDOG_VERSION.id,
    };
    await this.save({
      scope,
      reservedAt: now,
      expiresAt,
      deadline: now + 600_000,
      status: "reserved",
      receipt,
      intents: [],
      cleanReads: 0,
    });
    await this.ctx.storage.setAlarm(now + 600_000);
    return { ...receipt, evidenceSha256: hash(canonical(receipt)) };
  }
  private async bind(
    state: State,
    input: {
      plan: string;
      baseline: string;
      approvals: Record<"owner" | "controller", Envelope>;
      report: Envelope;
    },
  ) {
    demand(state.status === "reserved" && Date.now() - state.reservedAt < 300_000);
    demand(
      typeof input.plan === "string" &&
        typeof input.baseline === "string" &&
        input.plan.length <= 1024 * 1024 &&
        input.baseline.length <= 1024 * 1024,
    );
    const plan: BoundPlan = JSON.parse(input.plan),
      baseline = JSON.parse(input.baseline),
      scope = state.scope;
    demand(
      plan.accountId === accountId &&
        plan.operationId === scope.operationId &&
        plan.sourceCommit === scope.sourceCommit &&
        plan.digest === scope.digest &&
        plan.baselineSha256 === scope.baselineSha256 &&
        hash(input.baseline) === scope.baselineSha256 &&
        plan.timeoutSeconds === 600 &&
        plan.rollbackTimeoutSeconds === 120 &&
        plan.workerName === `ms-realty-production-${scope.sourceCommit.slice(0, 12)}` &&
        Array.isArray(plan.routes) &&
        plan.routes.length > 0 &&
        plan.routes.length <= 100 &&
        Array.isArray(baseline.zones) &&
        same(sorted(baseline.zones.map((z: Zone) => z.id)), sorted(scope.zoneIds)),
    );
    independentKeys(this.env);
    const planSha256 = hash(input.plan),
      reportSha256 = hash(input.report.payload);
    for (const role of ["owner", "controller"] as const) {
      const approval = signed(
        input.approvals[role],
        this.env[role === "owner" ? "WATCHDOG_OWNER_PUBLIC_KEY" : "WATCHDOG_CONTROLLER_PUBLIC_KEY"],
      );
      demand(
        approval.role === role &&
          approval.decision === "approve" &&
          approval.cutoverPlanSha256 === planSha256 &&
          approval.reportSha256 === reportSha256 &&
          approval.sourceCommit === scope.sourceCommit &&
          approval.digest === scope.digest,
      );
    }
    const report = signed(input.report, this.env.WATCHDOG_CONTROLLER_PUBLIC_KEY);
    demand(
      report.environment === "staging" &&
        report.status === "PASS" &&
        report.sourceCommit === scope.sourceCommit &&
        report.digest === scope.digest &&
        report.coverage?.productionAllowed === true &&
        report.coverage.completeCurrentDelta === true &&
        report.coverage.exclusions === 0 &&
        Number.isInteger(report.coverage.baselineSourceRows) &&
        report.coverage.baselineSourceRows >= 457 &&
        report.coverage.resolvedSourceRows === report.coverage.baselineSourceRows &&
        hex(64, report.checker?.baselineSha256) &&
        report.checker?.authority === "independent-controller" &&
        Date.now() - Date.parse(report.checkedAt) >= 0 &&
        Date.now() - Date.parse(report.checkedAt) <= 86_400_000,
    );
    for (const name of [
      "urls",
      "listings",
      "content",
      "seo",
      "locales",
      "forms",
      "tracking",
      "performanceAccessibility",
      "security",
    ])
      demand(report.gates?.[name]?.status === "PASS" && hex(64, report.gates[name].evidenceSha256));
    const zones: Zone[] = baseline.zones.map((z: Zone) => ({
      id: z.id,
      name: z.name,
      routes: z.routes.map(normalizedRoute),
    }));
    demand(
      zones.length === 2 &&
        zones.some((z) => z.id === comZone && z.name === "makler-realty.com") &&
        zones.some((z) => z.name === "makler-realty.ru"),
    );
    for (const change of plan.routes) {
      const zone = zones.find((z) => z.id === change.zoneId);
      demand(zone && typeof change.pattern === "string");
      const host = required(change.pattern.split("/")[0]);
      demand(
        [
          "makler-realty.com",
          "www.makler-realty.com",
          "my.makler-realty.com",
          "app.makler-realty.com",
          "makler-realty.ru",
          "www.makler-realty.ru",
        ].includes(host) &&
          (host === zone.name || host.endsWith(`.${zone.name}`)) &&
          (change.baselineRouteId === null
            ? !zone.routes.some((r) => r.pattern === change.pattern)
            : zone.routes.some(
                (r) => r.id === change.baselineRouteId && r.pattern === change.pattern,
              )),
      );
    }
    demand(new Set(plan.routes.map((r) => `${r.zoneId}:${r.pattern}`)).size === plan.routes.length);
    for (const zone of zones) demand(same(sorted(await this.routes(zone.id)), sorted(zone.routes)));
    state.plan = plan;
    state.planSha256 = planSha256;
    state.baseline = zones;
    demand(
      baseline.accountId === accountId &&
        baseline.zones.every((z: BaselineSnapshot["zones"][number]) => Array.isArray(z.dns)) &&
        uuid(plan.gatewayVersionId) &&
        uuid(plan.gatewayDeploymentId) &&
        plan.artifacts &&
        Object.values(plan.artifacts).every((x) => hex(64, x)),
    );
    state.fullBaseline = baseline;
    state.checkerBaselineSha256 = report.checker.baselineSha256;
    state.baselineSourceRows = report.coverage.baselineSourceRows;
    state.status = "armed";
    state.deadline = Date.now() + 600_000;
    demand(state.deadline + 120_000 < state.expiresAt);
    await this.save(state);
    await this.ctx.storage.setAlarm(state.deadline);
    return { status: state.status, deadline: state.deadline, planSha256 };
  }
  private async rehearsal(operationId: string) {
    demand(
      uuid(operationId) &&
        hex(40, this.env.WATCHDOG_SOURCE_COMMIT) &&
        hex(64, this.env.WATCHDOG_SOURCE_SHA256),
    );
    const routes = await this.routes(comZone),
      pattern = `watchdog-rehearsal.makler-realty.com/${operationId}/*`;
    const existing = routes.filter((r) => r.pattern === pattern);
    demand(existing.length <= 1 && existing.every((r) => r.script === null));
    const baseline = {
      accountId,
      zones: [{ id: comZone, name: "makler-realty.com", dns: [], routes }],
    };
    const scope: Scope = {
      operationId,
      leaseId: crypto.randomUUID(),
      sourceCommit: this.env.WATCHDOG_SOURCE_COMMIT,
      digest: `sha256:${this.env.WATCHDOG_SOURCE_SHA256}`,
      baselineSha256: hash(JSON.stringify(baseline)),
      zoneIds: [comZone],
    };
    await this.reserve(scope);
    const state = required(await this.ctx.storage.get<State>("active"));
    state.mode = "rehearsal";
    state.plan = {
      operationId,
      accountId,
      sourceCommit: scope.sourceCommit,
      digest: scope.digest,
      baselineSha256: scope.baselineSha256,
      workerName: "ms-realty-route-watchdog",
      timeoutSeconds: 600,
      rollbackTimeoutSeconds: 120,
      routes: [{ zoneId: comZone, pattern, baselineRouteId: existing[0]?.id ?? null }],
      gatewayVersionId: this.env.WATCHDOG_VERSION.id,
      gatewayDeploymentId: this.env.WATCHDOG_VERSION.id,
      artifacts: {},
    };
    state.baseline = baseline.zones;
    state.fullBaseline = baseline;
    state.planSha256 = hash(canonical(state.plan));
    state.status = "armed";
    state.deadline = Date.now() + 15_000;
    await this.save(state);
    await this.ctx.storage.setAlarm(state.deadline);
    return {
      operationId,
      leaseId: scope.leaseId,
      status: state.status,
      deadline: state.deadline,
      pattern,
      evidenceClass: "isolated-live-provider-route-rehearsal",
      businessHostCoverage: false,
      serviceVersion: this.env.WATCHDOG_VERSION.id,
      serviceSourceSha256: this.env.WATCHDOG_SOURCE_SHA256,
      serviceSourceCommit: this.env.WATCHDOG_SOURCE_COMMIT,
      baselineRoutes: routes,
      baselineSha256: scope.baselineSha256,
    };
  }
  private async mutate(state: State, input: { zoneId: string; pattern: string }) {
    demand(state.status === "armed" && Date.now() < state.deadline && state.plan && state.baseline);
    const change = state.plan.routes.find(
      (r) => r.zoneId === input.zoneId && r.pattern === input.pattern,
    );
    demand(change);
    const zone = required(state.baseline.find((z) => z.id === change.zoneId));
    const previous = zone.routes.find((r) => r.id === change.baselineRouteId) ?? null;
    let intent = state.intents.find(
      (r) => r.zoneId === change.zoneId && r.pattern === change.pattern,
    );
    if (intent?.id) {
      const retainedId = intent.id;
      const actual = (await this.routes(change.zoneId)).find((r) => r.id === retainedId);
      demand(
        actual && actual.pattern === change.pattern && actual.script === state.plan.workerName,
      );
      return actual;
    }
    demand(!intent); // An acknowledgement loss is fenced; never resend it.
    const actual = await this.routes(change.zoneId);
    const expected = structuredClone(zone.routes);
    for (const done of state.intents.filter((r) => r.zoneId === zone.id)) {
      demand(done.id);
      const replacement = { id: done.id, pattern: done.pattern, script: state.plan.workerName };
      if (done.before)
        expected.splice(
          expected.findIndex((r) => r.id === required(done.before).id),
          1,
          replacement,
        );
      else expected.push(replacement);
    }
    demand(same(sorted(actual), sorted(expected)));
    intent = { ...change, before: previous };
    state.intents.push(intent);
    await this.save(state); // Output gate: provider mutation follows durable intent.
    try {
      const packet = await this.provider(
        change.zoneId,
        previous ? `/${previous.id}` : "",
        previous ? "PUT" : "POST",
        { pattern: change.pattern, script: state.plan.workerName },
      );
      const route = normalizedRoute(packet.result);
      demand(
        route.pattern === change.pattern &&
          route.script === state.plan.workerName &&
          (!previous || route.id === previous.id),
      );
      intent.id = route.id;
      await this.save(state);
      return route;
    } catch {
      state.status = "restoring";
      state.providerFailure = true;
      await this.save(state);
      await this.startRestore(state);
      throw new Error("Provider outcome requires reconciliation");
    }
  }
  private async startRestore(state: State) {
    if (!state.plan || !state.baseline) {
      state.status = "released";
      await this.save(state);
      return;
    }
    state.status = "restoring";
    state.restoreIndex = state.intents.length - 1;
    state.verifyIndex = 0;
    state.originIndex = 0;
    state.originChecks = [];
    state.roundFailed = false;
    await this.save(state);
    await this.ctx.storage.setAlarm(Date.now() + 100);
  }
  private async restoreStep(state: State) {
    demand(state.plan && state.baseline);
    // One route per wake bounds external I/O below the concurrency guard's lifetime.
    const intent = state.intents[state.restoreIndex ?? -1];
    if (intent) {
      try {
        const rows = await this.routes(intent.zoneId);
        if (intent.before) {
          const actual = rows.find((r) => r.id === required(intent.before).id);
          demand(actual);
          if (!same(actual, intent.before)) {
            demand(actual.pattern === intent.pattern && actual.script === state.plan.workerName);
            await this.provider(intent.zoneId, `/${actual.id}`, "PUT", {
              pattern: intent.before.pattern,
              ...(intent.before.script === null ? {} : { script: intent.before.script }),
            });
          }
        } else {
          const actual = rows.filter((r) => r.pattern === intent.pattern);
          demand(
            actual.length <= 1 &&
              actual.every(
                (r) =>
                  r.script === required(state.plan).workerName &&
                  (!intent.id || r.id === intent.id) &&
                  !required(state.baseline).some((z) => z.routes.some((old) => old.id === r.id)),
              ),
          );
          if (actual[0]) {
            intent.id = actual[0].id;
            await this.save(state);
            await this.provider(intent.zoneId, `/${actual[0].id}`, "DELETE");
          }
        }
        intent.restored = true;
      } catch {
        state.roundFailed = true;
      }
      state.restoreIndex = (state.restoreIndex ?? 0) - 1;
      await this.save(state);
      await this.ctx.storage.setAlarm(Date.now() + 100);
      return;
    }
    const zone = state.baseline[state.verifyIndex ?? 0];
    if (zone) {
      try {
        demand(same(sorted(await this.routes(zone.id)), sorted(zone.routes)));
      } catch {
        state.roundFailed = true;
      }
      state.verifyIndex = (state.verifyIndex ?? 0) + 1;
      await this.save(state);
      await this.ctx.storage.setAlarm(Date.now() + 100);
      return;
    }
    const host = ["makler-realty.com", "makler-realty.ru"][state.originIndex ?? 0];
    if (host && state.mode !== "rehearsal") {
      try {
        state.originChecks?.push(await originalOrigin(host));
      } catch {
        state.roundFailed = true;
      }
      state.originIndex = (state.originIndex ?? 0) + 1;
      await this.save(state);
      await this.ctx.storage.setAlarm(Date.now() + 100);
      return;
    }
    const failed = state.roundFailed;
    state.status = failed ? "reconciliation_required" : "restored";
    state.cleanReads = failed ? 0 : state.cleanReads + 1;
    if (!failed) state.restoredAt ??= Date.now();
    await this.save(state);
    // Keep the lease fenced and sweep after a lost/late provider acknowledgement, even after
    // the first exact baseline read. Only separately signed release can free a bound lease.
    await this.ctx.storage.setAlarm(
      Date.now() + (state.mode === "rehearsal" ? 2_000 : failed ? 15_000 : 30_000),
    );
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.ctx.storage.get<State>("active");
      if (!state || ["accepted", "released"].includes(state.status)) return;
      // Persist the next wake before external I/O: retry exhaustion must not silently disarm it.
      await this.ctx.storage.setAlarm(Date.now() + 30_000);
      if (["reserved", "armed"].includes(state.status) && Date.now() < state.deadline) {
        await this.ctx.storage.setAlarm(state.deadline);
        return;
      }
      if (state.status !== "restoring") await this.startRestore(state);
      else await this.restoreStep(state);
    });
  }
  async fetch(request: Request) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const path = new URL(request.url).pathname,
          state = await this.ctx.storage.get<State>("active");
        if (request.method === "GET" && path === "/status")
          return response(state ? { ...state, journal: undefined } : { status: "empty" });
        if (request.method === "GET" && path === "/origin")
          return response(
            await originalOrigin(new URL(request.url).searchParams.get("host") ?? ""),
          );
        demand(request.method === "POST");
        const input = await boundedJson(request);
        if (path === "/reserve") return response(await this.reserve(input));
        if (path === "/rehearsal") return response(await this.rehearsal(input.operationId));
        demand(
          state &&
            input.operationId === state.scope.operationId &&
            input.leaseId === state.scope.leaseId,
        );
        if (path === "/bind") return response(await this.bind(state, input));
        if (path === "/mutate") return response(await this.mutate(state, input));
        if (path === "/journal") {
          demand(
            input.journal?.operationId === state.scope.operationId &&
              input.journal?.baselineSha256 === state.scope.baselineSha256 &&
              input.journal?.planSha256 === state.planSha256,
          );
          state.journal = input.journal;
          await this.save(state);
          return response({ retained: true });
        }
        if (path === "/restore") {
          if (state.status !== "restoring") await this.startRestore(state);
          return response({ status: state.status, cleanReads: state.cleanReads });
        }
        if (path === "/rehearsal/late-write") {
          demand(
            state.mode === "rehearsal" &&
              state.status === "restored" &&
              state.plan &&
              state.intents.length === 1,
          );
          const intent = required(state.intents[0]);
          demand(
            intent.pattern === `watchdog-rehearsal.makler-realty.com/${state.scope.operationId}/*`,
          );
          for (const zone of state.baseline ?? [])
            demand(same(sorted(await this.routes(zone.id)), sorted(zone.routes)));
          intent.id = undefined;
          intent.restored = false;
          state.cleanReads = 0;
          state.restoredAt = undefined;
          state.lateWriteFaults = (state.lateWriteFaults ?? 0) + 1;
          await this.startRestore(state);
          const packet = await this.provider(
            comZone,
            intent.before ? `/${intent.before.id}` : "",
            intent.before ? "PUT" : "POST",
            { pattern: intent.pattern, script: "ms-realty-route-watchdog" },
          );
          intent.id = normalizedRoute(packet.result).id;
          await this.save(state);
          return response({
            status: "late-write-injected",
            routeId: intent.id,
            operationId: state.scope.operationId,
            evidenceClass: "isolated-live-provider-route-rehearsal",
          });
        }
        if (path === "/rehearsal/close") {
          demand(
            state.mode === "rehearsal" && state.status === "restored" && state.cleanReads >= 2,
          );
          for (const zone of state.baseline ?? [])
            demand(same(sorted(await this.routes(zone.id)), sorted(zone.routes)));
          state.status = "released";
          await this.save(state);
          await this.ctx.storage.deleteAlarm();
          return response({
            status: state.status,
            operationId: state.scope.operationId,
            evidenceClass: "isolated-live-provider-route-rehearsal",
            productionQualified: false,
          });
        }
        if (path === "/accept") {
          if (
            state.status === "accepted" &&
            state.acceptedReportSha256 === hash(input.report?.payload ?? "")
          )
            return response({ status: state.status, reportSha256: state.acceptedReportSha256 });
          demand(
            state.status === "armed" &&
              state.mode !== "rehearsal" &&
              Date.now() <= state.deadline &&
              state.plan &&
              state.baseline &&
              state.fullBaseline,
          );
          const report = signed(input.report, this.env.WATCHDOG_CONTROLLER_PUBLIC_KEY);
          const applied = structuredClone(state.fullBaseline);
          demand(applied);
          for (const intent of state.intents) {
            const zone = required(applied.zones.find((z) => z.id === intent.zoneId));
            const value = {
              id: required(intent.id),
              pattern: intent.pattern,
              script: state.plan.workerName,
            };
            const i = zone.routes.findIndex((r) => r.id === intent.before?.id);
            if (i >= 0) zone.routes.splice(i, 1, value);
            else zone.routes.push(value);
          }
          const appliedStateSha256 = hash(
            canonical({
              accountId: applied.accountId,
              zones: sorted(
                applied.zones.map((z) => ({ ...z, routes: sorted(z.routes), dns: sorted(z.dns) })),
              ),
            }),
          );
          const bindings = {
            operationId: state.scope.operationId,
            planSha256: state.planSha256,
            baselineSha256: state.scope.baselineSha256,
            appliedStateSha256,
            sourceCommit: state.scope.sourceCommit,
            digest: state.scope.digest,
            gatewayVersionId: state.plan.gatewayVersionId,
            gatewayDeploymentId: state.plan.gatewayDeploymentId,
            artifacts: state.plan.artifacts,
          };
          demand(
            report.schemaVersion === 1 &&
              report.environment === "production" &&
              report.status === "PASS" &&
              report.checker?.authority === "independent-controller" &&
              report.checker.baselineSha256 === state.checkerBaselineSha256 &&
              same(report.bindings, bindings) &&
              same(
                sorted(report.hosts ?? []),
                sorted([
                  "makler-realty.com",
                  "www.makler-realty.com",
                  "my.makler-realty.com",
                  "app.makler-realty.com",
                  "makler-realty.ru",
                  "www.makler-realty.ru",
                ]),
              ) &&
              Date.parse(report.checkedAt) >= state.deadline - 600_000 &&
              Date.parse(report.checkedAt) <= Date.now() &&
              report.coverage?.completeCurrentDelta === true &&
              report.coverage.productionAllowed === true &&
              report.coverage.exclusions === 0 &&
              report.coverage.baselineSourceRows === state.baselineSourceRows &&
              report.coverage.resolvedSourceRows === state.baselineSourceRows,
          );
          for (const name of [
            "urls",
            "listings",
            "content",
            "seo",
            "locales",
            "forms",
            "tracking",
            "performanceAccessibility",
            "security",
          ])
            demand(
              report.gates?.[name]?.status === "PASS" && hex(64, report.gates[name].evidenceSha256),
            );
          demand(
            state.intents.length === state.plan.routes.length && state.intents.every((r) => r.id),
          );
          for (const zone of state.baseline) {
            const expected = structuredClone(zone.routes);
            for (const intent of state.intents.filter((r) => r.zoneId === zone.id)) {
              const replacement = {
                id: required(intent.id),
                pattern: intent.pattern,
                script: state.plan.workerName,
              };
              if (intent.before)
                expected.splice(
                  expected.findIndex((r) => r.id === required(intent.before).id),
                  1,
                  replacement,
                );
              else expected.push(replacement);
            }
            demand(same(sorted(await this.routes(zone.id)), sorted(expected)));
          }
          demand(Date.now() <= state.deadline);
          state.status = "accepted";
          state.acceptedReportSha256 = hash(input.report.payload);
          await this.save(state);
          await this.ctx.storage.deleteAlarm();
          return response({ status: state.status, reportSha256: hash(input.report.payload) });
        }
        if (path === "/release") {
          demand(
            state.status === "restored" &&
              state.cleanReads >= 3 &&
              state.restoredAt &&
              Date.now() - state.restoredAt >= 60_000,
          );
          independentKeys(this.env);
          for (const role of ["owner", "controller"] as const) {
            const permit = signed(
              input.approvals[role],
              this.env[
                role === "owner" ? "WATCHDOG_OWNER_PUBLIC_KEY" : "WATCHDOG_CONTROLLER_PUBLIC_KEY"
              ],
            );
            const issued = Date.parse(permit.issuedAt);
            demand(
              permit.purpose === "release-restored-route-lease" &&
                permit.role === role &&
                permit.operationId === state.scope.operationId &&
                permit.leaseId === state.scope.leaseId &&
                permit.baselineSha256 === state.scope.baselineSha256 &&
                issued <= Date.now() &&
                Date.now() - issued <= 60_000,
            );
          }
          for (const zone of state.baseline ?? [])
            demand(same(sorted(await this.routes(zone.id)), sorted(zone.routes)));
          state.status = "released";
          await this.save(state);
          await this.ctx.storage.deleteAlarm();
          return response({ status: "released" });
        }
        return response({ code: "watchdog_unknown_request" }, 404);
      } catch {
        return response({ code: "watchdog_request_unverified" }, 409);
      }
    });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const actual = request.headers.get("Authorization") ?? "",
      expected = `Bearer ${env.WATCHDOG_CONTROL_SECRET}`;
    if (
      typeof env.WATCHDOG_CONTROL_SECRET !== "string" ||
      env.WATCHDOG_CONTROL_SECRET.length < 32 ||
      !timingSafeEqual(Buffer.from(hash(actual)), Buffer.from(hash(expected)))
    )
      return response({ code: "watchdog_unauthorized" }, 403);
    if (new URL(request.url).origin !== env.WATCHDOG_ORIGIN)
      return response({ code: "watchdog_origin_unverified" }, 403);
    return env.ROUTE_WATCHDOG.getByName(`route-lease-${accountId}`).fetch(request);
  },
};
