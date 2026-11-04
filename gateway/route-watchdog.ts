/// <reference types="node" />
/// <reference path="./route-watchdog.configuration.d.ts" />
// Off-runner write-ahead custody for one account-wide routing operation.
// No business host is enabled by deploying this private control service.

import { DurableObject } from "cloudflare:workers";
import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { Container } from "@cloudflare/containers";
import {
  type InstalledExecutionAdmission,
  loadExecutionAdmission,
} from "../src/release/execution-admission";
import { verifyRuntimeExecution } from "../src/release/execution-bridge";
import {
  type RuntimeExecutionPacket,
  remoteLeaseStateSchema,
  runtimeExecutionPacketSchema,
} from "../src/release/execution-contract";
// @ts-expect-error Shared fixed-provider observer is an existing-style Node/Worker JS module.
import { observeExecutionRuntime } from "../src/release/execution-observer.mjs";
import { rejectExecutionActivation } from "../src/release/execution-runtime";

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
interface ExecutionAcceptanceReceipt {
  schemaVersion: 1;
  purpose: "conditional_cutover_acceptance";
  operationId: string;
  leaseId: string;
  grantRequestDigest: string;
  admissionDigest: string;
  planDigest: string;
  snapshotId: string;
  planSha256: string;
  reportSha256: string;
  requestDigest: string;
  decisionAt: number;
  forwardDeadline: number;
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
  acceptance?: ExecutionAcceptanceReceipt;
  selectedAdmissionDigest?: string;
  lateWriteFaults?: number;
  originIndex?: number;
  originChecks?: { host: string; address: string; strictTls: true; status: number }[];
  execution?: {
    recordKey: string;
    requestDigest: string;
    admissionDigest: string;
    forwardExpiresAt: number;
    originalKeys: { owner: string; controller: string };
    lastObservation?: unknown;
  };
}

interface ExecutionRecord {
  requestDigest: string;
  admissionDigest: string;
  packetDigest: string;
  packetChunks: number;
  packetBytes: number;
  planDigest: string;
  snapshotId: string;
  operationId: string;
  leaseId: string;
  admittedAt: number;
  forwardExpiresAt: number;
  deadline: number;
  runtimeObservation?: unknown;
}

// The binding and secret interface is generated from wrangler.watchdog.jsonc.
type Env = RouteWatchdogEnv & {
  MS_REALTY_EXECUTION_ADMISSION?: string;
  WATCHDOG_READ_TOKEN?: string;
};
const response = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
async function boundedJson(
  source: Request | Response,
  maximum = 2 * 1024 * 1024,
  requireCanonical = false,
) {
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
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    Buffer.concat(chunks),
  );
  const value = JSON.parse(text);
  if (requireCanonical) demand(canonical(value) === text);
  return value;
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
function signed(envelope: Envelope, pem: string, requireCanonical = false) {
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
  const value = JSON.parse(envelope.payload);
  if (requireCanonical)
    demand(
      canonical(value) === envelope.payload &&
        Buffer.from(envelope.signature, "base64").toString("base64") === envelope.signature,
    );
  return value;
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
export class OriginProbe extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = "20m";
  envVars = {};
  async probe(host: string) {
    demand(["makler-realty.com", "makler-realty.ru"].includes(host));
    await this.startAndWaitForPorts([3000]);
    const result = await this.containerFetch(
      `http://origin-probe/origin?host=${host}`,
      { method: "GET" },
      3000,
    );
    demand(result.ok);
    const row = (await result.json()) as {
      host: string;
      serverName: string;
      address: string;
      port: number;
      httpStatus: number;
      tlsVerified: boolean;
      publicDnsPathObserved: boolean;
      bodySha256: string;
      bytes: number;
      sourceCommit: string;
    };
    demand(
      row.host === host &&
        row.serverName === host &&
        row.address === "185.80.2.102" &&
        row.port === 443 &&
        row.httpStatus === 200 &&
        row.tlsVerified === true &&
        row.publicDnsPathObserved === false &&
        hex(64, row.bodySha256) &&
        Number.isSafeInteger(row.bytes) &&
        row.bytes > 0 &&
        row.bytes <= 2 * 1024 * 1024 &&
        row.sourceCommit === this.env.WATCHDOG_PROBE_SOURCE_COMMIT,
    );
    return {
      ...row,
      strictTls: true as const,
      status: 200,
      actorId: this.ctx.id.toString(),
      runtime: "isolated-native-node-container",
    };
  }
}

export class RouteWatchdog extends DurableObject<Env> {
  private async completedAcceptance(state: State) {
    if (state.status !== "accepted") return false;
    if (!state.execution) return true; // Existing legacy acceptance has no v2 finalization record.
    const receipt = state.acceptance;
    if (receipt?.schemaVersion !== 1 || receipt.purpose !== "conditional_cutover_acceptance")
      return false;
    const record = await this.ctx.storage.get<ExecutionRecord>(state.execution.recordKey);
    return (
      !!record &&
      receipt.operationId === state.scope.operationId &&
      receipt.operationId === record.operationId &&
      receipt.leaseId === state.scope.leaseId &&
      receipt.leaseId === record.leaseId &&
      receipt.grantRequestDigest === state.execution.requestDigest &&
      receipt.grantRequestDigest === record.requestDigest &&
      receipt.admissionDigest === state.execution.admissionDigest &&
      receipt.admissionDigest === record.admissionDigest &&
      receipt.planDigest === record.planDigest &&
      receipt.snapshotId === record.snapshotId &&
      receipt.planSha256 === state.planSha256 &&
      receipt.reportSha256 === state.acceptedReportSha256 &&
      state.deadline === record.deadline &&
      state.execution.forwardExpiresAt === record.forwardExpiresAt &&
      hex(64, receipt.requestDigest) &&
      hex(64, receipt.reportSha256) &&
      Number.isSafeInteger(receipt.decisionAt) &&
      receipt.decisionAt >= record.admittedAt &&
      receipt.forwardDeadline === Math.min(state.deadline, record.forwardExpiresAt) &&
      receipt.decisionAt < receipt.forwardDeadline
    );
  }
  private acceptanceResponse(state: State) {
    return {
      status: "accepted",
      reportSha256: state.acceptedReportSha256,
      acceptance: state.acceptance,
    };
  }
  private async finalizeExecutionAcceptance(
    state: State,
    input: Record<string, unknown>,
    packet: RuntimeExecutionPacket,
  ) {
    const execution = required(state.execution);
    const requestDigest = hash(canonical(input));
    const reportSha256 = hash((input.report as Envelope).payload);
    try {
      return await this.ctx.storage.transaction(async (txn) => {
        const active = required(await txn.get<State>("active"));
        demand(
          active.status === "armed" &&
            same(active.scope, state.scope) &&
            active.execution?.requestDigest === execution.requestDigest &&
            active.planSha256 === state.planSha256 &&
            same(active.intents, state.intents) &&
            active.deadline === state.deadline,
        );
        const accepted: State = {
          ...state,
          status: "accepted",
          acceptedReportSha256: reportSha256,
          acceptance: undefined,
        };
        // This label alone is never terminal. Both awaited operations roll back together.
        await txn.put("active", accepted);
        await txn.deleteAlarm();
        // SQLite's synchronous KV participates in this enclosing transaction. No await follows
        // this decision instant inside the callback; a throw rolls back the receipt and alarm.
        const installed = required(
          loadExecutionAdmission(this.env as unknown as Record<string, unknown>, "watchdog"),
        );
        const decisionAt = Date.now();
        demand(installed.digest === execution.admissionDigest && decisionAt < state.deadline);
        const verified = verifyRuntimeExecution(
          packet,
          installed,
          this.leaseState(state),
          new Date(decisionAt),
          true,
        );
        accepted.acceptance = {
          schemaVersion: 1,
          purpose: "conditional_cutover_acceptance",
          operationId: state.scope.operationId,
          leaseId: state.scope.leaseId,
          grantRequestDigest: execution.requestDigest,
          admissionDigest: installed.digest,
          planDigest: verified.receipt.planDigest,
          snapshotId: verified.plan.snapshotId,
          planSha256: required(state.planSha256),
          reportSha256,
          requestDigest,
          decisionAt,
          forwardDeadline: Math.min(state.deadline, verified.forwardExpiresAt),
        };
        this.ctx.storage.kv.put("active", accepted);
        demand(
          loadExecutionAdmission(this.env as unknown as Record<string, unknown>, "watchdog")
            ?.digest === installed.digest && Date.now() < accepted.acceptance.forwardDeadline,
        );
        return this.acceptanceResponse(accepted);
      });
    } catch {
      // A failed acknowledgement is not evidence of an aborted transaction. Read the exact
      // terminal receipt before deciding; a valid commit survives later expiry/config drift.
      const retained = await this.ctx.storage.get<State>("active");
      if (retained && same(retained.scope, state.scope)) {
        if (await this.completedAcceptance(retained)) {
          demand(retained.acceptance?.requestDigest === requestDigest);
          return this.acceptanceResponse(retained);
        }
        if (["armed", "accepted"].includes(retained.status)) await this.startRestore(retained);
      }
      throw new Error("Acceptance finalization requires original-operation recovery");
    }
  }
  private async executionPacket(
    recordKey: string,
    record: ExecutionRecord,
  ): Promise<RuntimeExecutionPacket> {
    demand(
      Number.isSafeInteger(record.packetBytes) &&
        record.packetBytes > 0 &&
        record.packetBytes <= 2 * 1024 * 1024 &&
        record.packetChunks === Math.ceil(record.packetBytes / 49_152) &&
        record.packetChunks <= 43,
    );
    const parts: Buffer[] = [];
    for (let i = 0; i < record.packetChunks; i++) {
      const value = required(await this.ctx.storage.get<string>(`${recordKey}:packet:${i}`));
      demand(typeof value === "string" && value.length <= 65_536);
      const bytes = Buffer.from(value, "base64");
      demand(
        bytes.toString("base64") === value &&
          bytes.length === Math.min(49_152, record.packetBytes - i * 49_152),
      );
      parts.push(bytes);
    }
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      Buffer.concat(parts),
    );
    demand(Buffer.byteLength(text) === record.packetBytes && hash(text) === record.packetDigest);
    return runtimeExecutionPacketSchema.parse(JSON.parse(text));
  }
  private async executionMode() {
    const installed = loadExecutionAdmission(
      this.env as unknown as Record<string, unknown>,
      "watchdog",
    );
    demand(!(await this.ctx.storage.get("execution-mode")) || installed);
    return installed;
  }
  private leaseState(state: State) {
    return remoteLeaseStateSchema.parse({
      scope: state.scope,
      reservedAt: state.reservedAt,
      expiresAt: state.expiresAt,
      status: state.status,
      receipt: state.receipt,
    });
  }
  private expectedState(state: State) {
    const expected = structuredClone(required(state.fullBaseline));
    for (const intent of state.intents) {
      const zone = required(expected.zones.find((item) => item.id === intent.zoneId));
      const route = {
        id: required(intent.id),
        pattern: intent.pattern,
        script: required(state.plan).workerName,
      };
      const index = zone.routes.findIndex((item) => item.id === intent.before?.id);
      if (index >= 0) zone.routes[index] = route;
      else zone.routes.push(route);
    }
    return expected;
  }
  private async verifyForward(state: State, observe: boolean) {
    const installed = await this.executionMode();
    if (!state.execution) {
      demand(!installed); // Installing v2 never promotes a pre-existing legacy operation.
      return;
    }
    demand(
      installed &&
        installed.digest === state.execution.admissionDigest &&
        Date.now() < state.deadline,
    );
    const record = required(await this.ctx.storage.get<ExecutionRecord>(state.execution.recordKey));
    demand(
      record.requestDigest === state.execution.requestDigest &&
        record.admissionDigest === installed.digest &&
        record.operationId === state.scope.operationId &&
        record.leaseId === state.scope.leaseId,
    );
    const packet = await this.executionPacket(state.execution.recordKey, record);
    const checked = verifyRuntimeExecution(
      packet,
      installed,
      this.leaseState(state),
      new Date(Date.now()),
      true,
    );
    demand(
      checked.receipt.planDigest === record.planDigest && Date.now() < record.forwardExpiresAt,
    );
    if (observe) {
      state.execution.lastObservation = await observeExecutionRuntime(
        checked.context.plan,
        checked.context.runtime,
        this.env.WATCHDOG_READ_TOKEN,
        { maximumMs: 8_000, expectedBaseline: this.expectedState(state) },
      );
      demand(Buffer.byteLength(canonical(state.execution.lastObservation)) <= 16_384);
      await this.verifyForward(state, false);
    }
  }
  private async bindExecution(
    state: State | undefined,
    input: Record<string, unknown>,
    installed: InstalledExecutionAdmission,
  ) {
    demand(same(Object.keys(input).sort(), ["leaseId", "operationId", "packet"]));
    const packet = runtimeExecutionPacketSchema.parse(input.packet);
    demand(input.operationId === packet.plan.operationId && input.leaseId === packet.plan.leaseId);
    const requestDigest = hash(canonical(input));
    const recordKey = `execution:${packet.plan.operationId}`;
    const prior = await this.ctx.storage.get<ExecutionRecord>(recordKey);
    if (prior) {
      demand(prior.requestDigest === requestDigest && prior.leaseId === input.leaseId);
      demand(same(await this.executionPacket(recordKey, prior), packet));
      return {
        status: state?.scope.operationId === prior.operationId ? state.status : "consumed",
        deadline: prior.deadline,
        planSha256: packet.plan.cutoverPlanDigest.slice(7),
        requestDigest,
        idempotent: true,
      };
    }
    demand(
      state &&
        state.mode !== "rehearsal" &&
        state.status === "reserved" &&
        (!state.selectedAdmissionDigest || state.selectedAdmissionDigest === installed.digest) &&
        state.scope.operationId === input.operationId &&
        state.scope.leaseId === input.leaseId,
    );
    const checked = verifyRuntimeExecution(
      packet,
      installed,
      this.leaseState(state),
      new Date(Date.now()),
    );
    const report = signed(packet.production.report, installed.keys.controller);
    const deadline = Math.min(Date.now() + 600_000, checked.forwardExpiresAt);
    demand(deadline > Date.now() && deadline + 120_000 < state.expiresAt);
    const armed: State = {
      ...state,
      status: "armed",
      deadline,
      plan: checked.context.plan,
      planSha256: checked.context.planSha256,
      baseline: checked.context.baseline.zones.map((zone: Zone) => ({
        id: zone.id,
        name: zone.name,
        routes: zone.routes.map(normalizedRoute),
      })),
      fullBaseline: checked.context.baseline,
      checkerBaselineSha256: report.checker.baselineSha256,
      baselineSourceRows: report.coverage.baselineSourceRows,
      execution: {
        recordKey,
        requestDigest,
        admissionDigest: installed.digest,
        forwardExpiresAt: checked.forwardExpiresAt,
        originalKeys: installed.keys,
      },
    };
    const packetBytes = Buffer.from(canonical(packet));
    const completeIntents = checked.context.plan.routes.map((change: Change) => ({
      ...change,
      before:
        armed.baseline
          ?.find((zone) => zone.id === change.zoneId)
          ?.routes.find((route) => route.id === change.baselineRouteId) ?? null,
      id: change.baselineRouteId ?? "0".repeat(32),
      restored: true,
    }));
    demand(
      packetBytes.length <= 2 * 1024 * 1024 &&
        Buffer.byteLength(canonical(armed)) +
          Buffer.byteLength(canonical(completeIntents)) +
          2 * 16_384 +
          2048 <=
          100 * 1024,
    );
    const chunks: Record<string, string> = {};
    for (let offset = 0, i = 0; offset < packetBytes.length; offset += 49_152, i++)
      chunks[`${recordKey}:packet:${i}`] = packetBytes
        .subarray(offset, offset + 49_152)
        .toString("base64");
    const record: ExecutionRecord = {
      requestDigest,
      admissionDigest: installed.digest,
      packetDigest: hash(packetBytes.toString()),
      packetChunks: Object.keys(chunks).length,
      packetBytes: packetBytes.length,
      planDigest: checked.receipt.planDigest,
      snapshotId: packet.plan.snapshotId,
      operationId: packet.plan.operationId,
      leaseId: packet.plan.leaseId,
      admittedAt: Date.now(),
      forwardExpiresAt: checked.forwardExpiresAt,
      deadline,
    };
    record.runtimeObservation = await observeExecutionRuntime(
      checked.context.plan,
      checked.context.runtime,
      this.env.WATCHDOG_READ_TOKEN,
      { maximumMs: 8_000, expectedBaseline: checked.context.baseline },
    );
    demand(Buffer.byteLength(canonical(record.runtimeObservation)) <= 16_384);
    demand((await this.executionMode())?.digest === installed.digest);
    verifyRuntimeExecution(packet, installed, this.leaseState(state), new Date(Date.now()));
    record.admittedAt = Date.now();
    await this.ctx.storage.transaction(async (txn) => {
      const active = required(await txn.get<State>("active"));
      demand(
        active.status === "reserved" &&
          same(active.scope, state.scope) &&
          !(await txn.get(recordKey)) &&
          !(await txn.get(`execution-lease:${state.scope.leaseId}`)),
      );
      demand(Date.now() < deadline);
      await txn.put({
        ...chunks,
        active: armed,
        "execution-mode": (await txn.get("execution-mode")) ?? {
          schemaVersion: 2,
          mode: "single_operator_owner_review",
        },
        [recordKey]: record,
        [`execution-lease:${state.scope.leaseId}`]: state.scope.operationId,
      });
      await txn.setAlarm(deadline);
      demand(Date.now() < deadline);
    });
    try {
      demand((await this.executionMode())?.digest === installed.digest && Date.now() < deadline);
    } catch {
      await this.startRestore(armed);
      throw new Error("Committed execution requires original-operation restoration");
    }
    return {
      status: "armed",
      deadline,
      planSha256: armed.planSha256,
      requestDigest,
      idempotent: false,
    };
  }
  private async originalOrigin(host: string) {
    demand(["makler-realty.com", "makler-realty.ru"].includes(host));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.env.ORIGIN_PROBE.getByName("original-wordpress").probe(host),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Native origin probe is not ready")), 25_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

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
  private async selectReservationMode(
    state: State,
    installed: InstalledExecutionAdmission,
    prior?: State,
  ) {
    await this.ctx.storage.transaction(async (txn) => {
      demand(same(await txn.get<State>("active"), prior));
      const retained = structuredClone(state);
      if (retained.status === "reserved") {
        demand(
          !retained.selectedAdmissionDigest ||
            retained.selectedAdmissionDigest === installed.digest,
        );
        retained.selectedAdmissionDigest = installed.digest;
      }
      if (prior && prior.scope.operationId !== state.scope.operationId)
        await txn.put(`history:${prior.scope.operationId}`, prior);
      const latch = (await txn.get("execution-mode")) ?? {
        schemaVersion: 2,
        mode: "single_operator_owner_review",
        selectedBy: "reservation",
        admissionDigest: installed.digest,
      };
      await txn.put({ active: retained, "execution-mode": latch });
      if (!prior || prior.scope.operationId !== state.scope.operationId)
        await txn.setAlarm(state.deadline);
      demand(
        loadExecutionAdmission(this.env as unknown as Record<string, unknown>, "watchdog")
          ?.digest === installed.digest,
      );
    });
  }
  private async reserve(scope: Scope) {
    const installed = await this.executionMode();
    if (installed) {
      remoteLeaseStateSchema.shape.scope.parse(scope);
    } else rejectExecutionActivation(scope);
    demand(
      hex(40, this.env.WATCHDOG_PROBE_SOURCE_COMMIT) &&
        hex(64, this.env.WATCHDOG_PROBE_IMAGE_DIGEST) &&
        typeof this.env.WATCHDOG_ROUTE_TOKEN === "string" &&
        this.env.WATCHDOG_ROUTE_TOKEN.length > 0,
    );
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
    if (prior && same(prior.scope, scope)) {
      if (installed) await this.selectReservationMode(prior, installed, prior);
      return { ...prior.receipt, evidenceSha256: hash(canonical(prior.receipt)) };
    }
    if (installed)
      demand(
        !(await this.ctx.storage.get(`execution-lease:${scope.leaseId}`)) &&
          !(await this.ctx.storage.get(`execution:${scope.operationId}`)),
      );
    demand(!prior || ["accepted", "released"].includes(prior.status));
    demand(
      prior?.scope.operationId !== scope.operationId &&
        !(await this.ctx.storage.get(`history:${scope.operationId}`)),
    );
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
      originProbe: {
        sourceCommit: this.env.WATCHDOG_PROBE_SOURCE_COMMIT,
        imageDigest: this.env.WATCHDOG_PROBE_IMAGE_DIGEST,
        runtime: "isolated-native-node-container",
      },
    };
    const reserved: State = {
      scope,
      reservedAt: now,
      expiresAt,
      deadline: now + 600_000,
      status: "reserved",
      receipt,
      intents: [],
      cleanReads: 0,
    };
    if (installed) await this.selectReservationMode(reserved, installed, prior);
    else {
      if (prior) await this.ctx.storage.put(`history:${prior.scope.operationId}`, prior);
      await this.save(reserved);
      await this.ctx.storage.setAlarm(now + 600_000);
    }
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
    rejectExecutionActivation(input);
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
    try {
      if (state.execution)
        demand(same(Object.keys(input).sort(), ["leaseId", "operationId", "pattern", "zoneId"]));
      await this.verifyForward(state, true);
    } catch {
      if (state.plan && state.status === "armed") await this.startRestore(state);
      throw new Error("Forward operation is unavailable; original restoration remains fenced");
    }
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
      await this.verifyForward(state, false);
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
      await this.verifyForward(state, false);
      await this.save(state);
      await this.verifyForward(state, false);
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
        state.originChecks?.push(await this.originalOrigin(host));
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
      if (!state || state.status === "released" || (await this.completedAcceptance(state))) return;
      // Persist the next wake before external I/O: retry exhaustion must not silently disarm it.
      await this.ctx.storage.setAlarm(Date.now() + 30_000);
      if (state.execution && state.status === "armed") {
        try {
          demand((await this.executionMode())?.digest === state.execution.admissionDigest);
        } catch {
          await this.startRestore(state);
          return;
        }
      }
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
        if (
          state?.execution &&
          state.status === "accepted" &&
          !(await this.completedAcceptance(state))
        ) {
          // Old v2 labels have no proof that the final authority/storage boundary completed.
          // Establish a wake before migration so an interrupted repair remains recoverable.
          await this.ctx.storage.setAlarm(Date.now() + 100);
          await this.startRestore(state);
        }
        if (request.method === "GET" && path === "/status")
          return response(state ? { ...state, journal: undefined } : { status: "empty" });
        if (request.method === "GET" && path === "/origin") {
          try {
            return response(
              await this.originalOrigin(new URL(request.url).searchParams.get("host") ?? ""),
            );
          } catch {
            return response({ code: "native_original_origin_unverified" }, 502);
          }
        }
        demand(request.method === "POST");
        const forward = [
          "/reserve",
          "/bind",
          "/mutate",
          "/rehearsal",
          "/rehearsal/late-write",
        ].includes(path);
        let installed: InstalledExecutionAdmission | null = null;
        if (forward) {
          try {
            installed = await this.executionMode();
          } catch {
            if (path === "/mutate" && state?.plan && state.status === "armed")
              await this.startRestore(state);
            throw new Error("Forward operation is unavailable");
          }
        }
        const input = await boundedJson(
          request,
          2 * 1024 * 1024,
          !!installed || (path === "/accept" && !!state?.execution),
        );
        if (path === "/reserve") return response(await this.reserve(input));
        if (path === "/rehearsal") {
          demand(!installed);
          return response(await this.rehearsal(input.operationId));
        }
        if (path === "/bind") {
          if (installed) return response(await this.bindExecution(state, input, installed));
        }
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
          if (state.execution) demand(Buffer.byteLength(canonical(input.journal)) <= 16_384);
          state.journal = input.journal;
          await this.save(state);
          return response({ retained: true });
        }
        if (path === "/restore") {
          if (state.status !== "restoring") await this.startRestore(state);
          return response({ status: state.status, cleanReads: state.cleanReads });
        }
        if (path === "/rehearsal/late-write") {
          demand(!installed);
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
          if (state.status === "accepted" && state.execution) {
            demand(
              (await this.completedAcceptance(state)) &&
                state.acceptance?.requestDigest === hash(canonical(input)),
            );
            return response(this.acceptanceResponse(state));
          }
          if (
            state.status === "accepted" &&
            state.acceptedReportSha256 === hash(input.report?.payload ?? "")
          )
            return response({ status: state.status, reportSha256: state.acceptedReportSha256 });
          demand(
            state.status === "armed" &&
              state.mode !== "rehearsal" &&
              Date.now() < state.deadline &&
              state.plan &&
              state.baseline &&
              state.fullBaseline,
          );
          if (state.execution) await this.verifyForward(state, true);
          const report = signed(
            input.report,
            state.execution?.originalKeys.controller ?? this.env.WATCHDOG_CONTROLLER_PUBLIC_KEY,
            !!state.execution,
          );
          let acceptedNotBefore = state.deadline - 600_000;
          let executionPacket: RuntimeExecutionPacket | undefined;
          if (state.execution) {
            const record = required(
              await this.ctx.storage.get<ExecutionRecord>(state.execution.recordKey),
            );
            acceptedNotBefore = record.admittedAt;
            const packet = await this.executionPacket(state.execution.recordKey, record);
            executionPacket = packet;
            const verifier = JSON.parse(packet.verification.payload);
            demand(
              report.purpose === "conditional_cutover_acceptance" &&
                same(report.actor, verifier.actor) &&
                report.keyId === verifier.keyId &&
                report.admissionDigest === record.admissionDigest &&
                report.planDigest === record.planDigest &&
                report.snapshotId === record.snapshotId,
            );
          }
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
              Date.parse(report.checkedAt) >= acceptedNotBefore &&
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
          if (state.execution) await this.verifyForward(state, false);
          demand(Date.now() < state.deadline);
          if (executionPacket)
            return response(await this.finalizeExecutionAcceptance(state, input, executionPacket));
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
          const releaseKeys = state.execution?.originalKeys ?? {
            owner: this.env.WATCHDOG_OWNER_PUBLIC_KEY,
            controller: this.env.WATCHDOG_CONTROLLER_PUBLIC_KEY,
          };
          demand(
            hash(
              createPublicKey(releaseKeys.owner)
                .export({ type: "spki", format: "der" })
                .toString("base64"),
            ) !==
              hash(
                createPublicKey(releaseKeys.controller)
                  .export({ type: "spki", format: "der" })
                  .toString("base64"),
              ),
          );
          for (const role of ["owner", "controller"] as const) {
            const permit = signed(input.approvals[role], releaseKeys[role], !!state.execution);
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
