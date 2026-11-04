// No workflow invokes this adapter. Its only write API is exact, signed-plan Worker routing.

import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  authorizations,
  planAndBaseline,
  productionHosts,
  validateProductionCutover,
} from "../src/release/execution-production.mjs";
import {
  ExecutionUnavailableError,
  rejectExecutionActivation,
} from "../src/release/execution-runtime.ts";
import { gates, signedPayload } from "./launch-gate.mjs";
import { probeLegacyOrigin, sourceHosts } from "./legacy-origin-probe.mjs";
import { routeWatchdog } from "./production-watchdog.mjs";
import { accountId, sha256 } from "./staging-config.mjs";
import { observeRuntimeRollout } from "./staging-rollout-proof.mjs";

export {
  productionHosts,
  validateProductionCutover,
} from "../src/release/execution-production.mjs";

export { probeLegacyOrigin, sourceHosts };
// Read-only tooling seam. Use tsx; no CLI trust loader or runtime activation exists.
export async function inspectExecutionCandidate(packet, installedAdmission, now = new Date()) {
  const bridge = await import("../src/release/execution-bridge.ts");
  return bridge.inspectExecutionCandidate(packet, installedAdmission, now);
}
export async function prepareExecutionPlan(packet, installedAdmission, now = new Date()) {
  const bridge = await import("../src/release/execution-bridge.ts");
  return bridge.prepareExecutionPlan(packet, installedAdmission, now);
}
const hex = (n, value) => typeof value === "string" && new RegExp(`^[a-f0-9]{${n}}$`).test(value);
const uuid = (value) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value ?? "");
const demand = (condition, field) => {
  if (!condition) throw new Error(`Production cutover blocked: ${field}`);
};
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    object(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
const same = (a, b) => canonical(a) === canonical(b);
const sort = (rows) => [...rows].sort((a, b) => canonical(a).localeCompare(canonical(b), "en"));
const parsed = (bytes, field) => {
  try {
    demand(typeof bytes === "string" || Buffer.isBuffer(bytes), field);
    demand(Buffer.byteLength(bytes) <= 16 * 1024 * 1024, field);
    return JSON.parse(bytes.toString());
  } catch {
    throw new Error(`Production cutover blocked: ${field}`);
  }
};
const route = (value) => {
  demand(
    object(value) &&
      hex(32, value.id) &&
      typeof value.pattern === "string" &&
      value.pattern.length > 0 &&
      value.pattern.length <= 2048 &&
      !/[\r\n]/.test(value.pattern) &&
      (value.script == null || /^[a-z0-9_-]{1,63}$/.test(value.script)),
    "provider route shape",
  );
  return { id: value.id, pattern: value.pattern, script: value.script ?? null };
};
const routeBody = (value) => ({
  pattern: value.pattern,
  ...(value.script === null ? {} : { script: value.script }),
});
const dns = (value) =>
  Object.fromEntries(
    ["id", "name", "type", "content", "priority", "proxied", "ttl", "data", "settings"]
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
const identity = (state) => ({
  accountId: state.accountId,
  zones: sort(
    state.zones.map((zone) => ({ ...zone, routes: sort(zone.routes), dns: sort(zone.dns) })),
  ),
});
export const routeStateSha256 = (state) => sha256(canonical(identity(state)));

/** Credential values never appear in URLs, return values, journals or diagnostics. */
export function cloudflareRoutes(token, transport = fetch) {
  demand(
    typeof token === "string" &&
      token.trim() === token &&
      token.length > 0 &&
      !/[\r\n]/.test(token),
    "scoped provider credential",
  );
  async function call(path, method = "GET", body, signal) {
    let response, packet;
    try {
      response = await transport(`https://api.cloudflare.com/client/v4${path}`, {
        method,
        redirect: "error",
        signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]),
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      demand(response.ok && !response.redirected, "provider HTTP response");
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        demand(size <= 4 * 1024 * 1024, "bounded provider response");
        chunks.push(chunk);
      }
      packet = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      demand(
        packet.success === true &&
          Array.isArray(packet.errors) &&
          packet.errors.length === 0 &&
          packet.result !== undefined,
        "provider envelope",
      );
    } catch {
      throw new Error("Production cutover blocked: provider request could not be verified");
    }
    return packet;
  }
  const zonePath = (zoneId) => {
    demand(hex(32, zoneId), "exact zone ID");
    return `/zones/${zoneId}`;
  };
  const routes = async (zoneId, signal) => {
    const packet = await call(`${zonePath(zoneId)}/workers/routes`, "GET", undefined, signal);
    demand(
      Array.isArray(packet.result) &&
        packet.result.length <= 1000 &&
        (packet.result_info?.total_pages ?? 1) <= 1,
      "complete route inventory",
    );
    const rows = packet.result.map(route);
    demand(
      new Set(rows.map((r) => r.id)).size === rows.length &&
        new Set(rows.map((r) => r.pattern)).size === rows.length,
      "unique provider routes",
    );
    return rows;
  };
  return {
    routes,
    async snapshot(zones, signal) {
      const rows = [];
      for (const expected of zones) {
        const path = zonePath(expected.id),
          zone = (await call(path, "GET", undefined, signal)).result;
        demand(
          zone.id === expected.id && zone.name === expected.name && zone.account?.id === accountId,
          "account-scoped zone readback",
        );
        const observedRoutes = await routes(expected.id, signal);
        const records = [];
        let totalRecords, totalPages;
        for (let page = 1; ; page++) {
          const packet = await call(
            `${path}/dns_records?per_page=1000&page=${page}`,
            "GET",
            undefined,
            signal,
          );
          demand(
            Array.isArray(packet.result) &&
              packet.result.every(object) &&
              packet.result_info?.page === page &&
              Number.isInteger(packet.result_info.total_pages) &&
              packet.result_info.total_pages >= 1 &&
              packet.result_info.total_pages <= 10 &&
              Number.isInteger(packet.result_info.total_count) &&
              packet.result_info.total_count >= 0 &&
              packet.result_info.total_count <= 10_000,
            "complete DNS inventory",
          );
          totalRecords ??= packet.result_info.total_count;
          totalPages ??= packet.result_info.total_pages;
          demand(
            totalRecords === packet.result_info.total_count &&
              totalPages === packet.result_info.total_pages,
            "stable DNS pagination",
          );
          records.push(...packet.result.map(dns));
          if (page >= packet.result_info.total_pages) break;
        }
        demand(
          records.length === totalRecords &&
            new Set(records.map((r) => r.id)).size === records.length &&
            records.every(
              (r) =>
                hex(32, r.id) &&
                typeof r.name === "string" &&
                typeof r.type === "string" &&
                typeof r.content === "string" &&
                Number.isInteger(r.ttl),
            ),
          "every DNS record observed exactly once",
        );
        const ssl = (await call(`${path}/settings/ssl`, "GET", undefined, signal)).result;
        demand(ssl.id === "ssl" && typeof ssl.value === "string", "SSL readback");
        rows.push({
          id: zone.id,
          name: zone.name,
          accountId: zone.account.id,
          status: zone.status,
          ssl: ssl.value,
          dns: sort(records),
          routes: sort(observedRoutes),
        });
      }
      return {
        schemaVersion: 1,
        accountId,
        observedAt: new Date().toISOString(),
        zones: sort(rows),
      };
    },
    async deployment(workerName, signal) {
      demand(
        /^ms-realty-production-[a-f0-9]{12}$/.test(workerName),
        "dedicated production Worker name",
      );
      const deployments = [];
      for (let page = 1; ; page++) {
        const packet = await call(
          `/accounts/${accountId}/workers/scripts/${workerName}/deployments?per_page=100&page=${page}`,
          "GET",
          undefined,
          signal,
        );
        demand(
          Array.isArray(packet.result?.deployments) &&
            Number.isInteger(packet.result_info?.total_pages ?? 1) &&
            (packet.result_info?.total_pages ?? 1) >= 1 &&
            (packet.result_info?.total_pages ?? 1) <= 10,
          "bounded complete gateway deployment history",
        );
        deployments.push(...packet.result.deployments);
        if (page >= (packet.result_info?.total_pages ?? 1)) break;
      }
      return { deployments };
    },
    async replace(zoneId, previous, script, signal) {
      route(previous);
      return route(
        (
          await call(
            `${zonePath(zoneId)}/workers/routes/${previous.id}`,
            "PUT",
            routeBody({ ...previous, script }),
            signal,
          )
        ).result,
      );
    },
    async create(zoneId, pattern, script, signal) {
      return route(
        (await call(`${zonePath(zoneId)}/workers/routes`, "POST", { pattern, script }, signal))
          .result,
      );
    },
    async remove(zoneId, value, signal) {
      route(value);
      await call(`${zonePath(zoneId)}/workers/routes/${value.id}`, "DELETE", undefined, signal);
    },
  };
}

async function origins(probe, signal) {
  const observations = [];
  for (const host of sourceHosts) {
    const row = await probe(host, signal);
    demand(
      row?.host === host &&
        row.serverName === host &&
        row.address === "185.80.2.102" &&
        row.port === 443 &&
        row.httpStatus === 200 &&
        row.tlsVerified === true &&
        row.publicDnsPathObserved === false &&
        hex(64, row.bodySha256) &&
        row.bytes > 0,
      "actual independent strict Host/SNI origin probe",
    );
    observations.push(row);
  }
  return observations;
}
function deploymentMatches(packet, plan) {
  demand(
    object(packet) && Array.isArray(packet.deployments) && packet.deployments.length > 0,
    "actual gateway deployment",
  );
  demand(
    packet.deployments.every(
      (row) =>
        uuid(row.id) &&
        Number.isFinite(Date.parse(row.created_on)) &&
        Date.parse(row.created_on) <= Date.now(),
    ),
    "actual gateway deployment timestamps",
  );
  const ordered = [...packet.deployments].sort(
    (a, b) => Date.parse(b.created_on) - Date.parse(a.created_on),
  );
  const latest = ordered[0];
  demand(
    (ordered.length === 1 || Date.parse(latest.created_on) > Date.parse(ordered[1].created_on)) &&
      latest.id === plan.gatewayDeploymentId &&
      Array.isArray(latest.versions) &&
      latest.versions.length === 1 &&
      latest.versions[0].version_id === plan.gatewayVersionId &&
      latest.versions[0].percentage === 100,
    "exact latest gateway deployment/version receives all traffic",
  );
}
function validateRecheck(envelope, bundle, context, journal, now) {
  const report = signedPayload(envelope, bundle.trustedKeys.controller);
  const stagingReport = signedPayload(bundle.report, bundle.trustedKeys.controller);
  const bindings = {
    operationId: context.plan.operationId,
    planSha256: context.planSha256,
    baselineSha256: context.plan.baselineSha256,
    appliedStateSha256: journal.appliedStateSha256,
    sourceCommit: context.plan.sourceCommit,
    digest: context.plan.digest,
    gatewayVersionId: context.plan.gatewayVersionId,
    gatewayDeploymentId: context.plan.gatewayDeploymentId,
    artifacts: context.plan.artifacts,
  };
  demand(
    report.schemaVersion === 1 &&
      report.environment === "production" &&
      report.status === "PASS" &&
      report.checker?.authority === "independent-controller" &&
      report.checker.baselineSha256 === stagingReport.checker.baselineSha256 &&
      same(report.bindings, bindings),
    "independent production recheck bound to this operation and all artifacts",
  );
  demand(
    Date.parse(report.checkedAt) >= Date.parse(journal.cutoverStartedAt) &&
      Date.parse(report.checkedAt) <= now &&
      now <= journal.deadline &&
      same([...report.hosts].sort(), [...productionHosts].sort()),
    "actual host coverage within cutover timeout",
  );
  demand(
    report.coverage?.productionAllowed === true &&
      report.coverage.completeCurrentDelta === true &&
      report.coverage.exclusions === 0 &&
      Number.isInteger(report.coverage.baselineSourceRows) &&
      report.coverage.baselineSourceRows >= 457 &&
      report.coverage.baselineSourceRows === stagingReport.coverage.baselineSourceRows &&
      report.coverage.resolvedSourceRows === report.coverage.baselineSourceRows &&
      gates.every(
        (g) => report.gates?.[g]?.status === "PASS" && hex(64, report.gates[g].evidenceSha256),
      ),
    "all nine live production gates and complete coverage",
  );
  return sha256(envelope.payload);
}
const zoneRefs = (baseline) => baseline.zones.map(({ id, name }) => ({ id, name }));
function intendedState(baseline, plan, operations) {
  const next = structuredClone(baseline);
  for (const operation of operations) {
    const routes = next.zones.find((z) => z.id === operation.zoneId).routes;
    const i = routes.findIndex((r) => r.id === operation.before?.id);
    const candidate = { id: operation.id, pattern: operation.pattern, script: plan.workerName };
    if (i >= 0) routes[i] = candidate;
    else routes.push(candidate);
  }
  return next;
}
async function bounded(task, deadline, now, signal) {
  demand(now() < deadline && !signal?.aborted, "failure/timeout; restoration required");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), Math.max(1, deadline - now()));
  const combined = AbortSignal.any([abort.signal, ...(signal ? [signal] : [])]);
  let onAbort;
  const cancelled = new Promise((_resolve, reject) => {
    onAbort = () => reject(new Error("Production cutover timeout or cancellation"));
    if (combined.aborted) onAbort();
    else combined.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([cancelled, Promise.resolve().then(() => task(combined))]);
  } finally {
    clearTimeout(timer);
    combined.removeEventListener("abort", onAbort);
  }
}

/** A write-ahead intent is durable before every provider mutation, including uncertain replies. */
export async function restoreProductionRoutes(
  bundle,
  journal,
  { provider, persist, probe = probeLegacyOrigin, now = Date.now } = {},
) {
  const context = planAndBaseline(bundle),
    { plan, baseline } = context;
  authorizations(bundle, context); // Expired launch evidence must not prevent an authenticated restore.
  demand(
    journal?.schemaVersion === 1 &&
      journal.operationId === plan.operationId &&
      journal.planSha256 === context.planSha256 &&
      journal.baselineSha256 === plan.baselineSha256 &&
      Array.isArray(journal.operations),
    "authentic operation journal binding",
  );
  const deadline = now() + plan.rollbackTimeoutSeconds * 1000,
    failures = [];
  let storageFailed = false;
  const record = async () => {
    try {
      await persist(structuredClone(journal));
    } catch {
      storageFailed = true;
    }
  };
  journal.status = "restoring";
  await record();
  for (const operation of [...journal.operations].reverse()) {
    try {
      const change = plan.routes.find(
        (r) => r.zoneId === operation.zoneId && r.pattern === operation.pattern,
      );
      demand(
        change &&
          (operation.before
            ? operation.before.id === change.baselineRouteId &&
              same(
                operation.before,
                baseline.zones
                  .find((z) => z.id === operation.zoneId)
                  .routes.find((r) => r.id === change.baselineRouteId),
              )
            : change.baselineRouteId === null),
        "journal mutation belongs to signed route plan",
      );
      const rows = await bounded(
        (signal) => provider.routes(operation.zoneId, signal),
        deadline,
        now,
      );
      if (operation.before) {
        const value = rows.find((r) => r.id === operation.before.id);
        demand(value, "original route ID still exists");
        if (!same(value, operation.before)) {
          demand(
            value.pattern === operation.pattern && value.script === plan.workerName,
            "never overwrite a concurrent foreign route binding",
          );
          await bounded(
            (signal) =>
              provider.replace(operation.zoneId, operation.before, operation.before.script, signal),
            deadline,
            now,
          );
        }
      } else {
        // The signed exclusive lease permits reconciling a lost create acknowledgement by exact
        // pattern + dedicated candidate script; a foreign binding or ambiguous result is held.
        const values = rows.filter((r) => r.pattern === operation.pattern);
        demand(
          values.length <= 1 &&
            values.every(
              (r) =>
                r.script === plan.workerName &&
                !baseline.zones.some((z) => z.routes.some((old) => old.id === r.id)) &&
                (!operation.id || operation.id === r.id),
            ),
          "only candidate-created route IDs may be removed",
        );
        if (values[0]) {
          operation.id = values[0].id;
          await record();
          await bounded(
            (signal) => provider.remove(operation.zoneId, values[0], signal),
            deadline,
            now,
          );
        }
      }
      operation.restored = true;
      await record();
    } catch {
      failures.push({
        zoneId: operation.zoneId,
        pattern: operation.pattern,
        code: "route_restore_unverified",
      });
    }
  }
  try {
    const restored = await bounded(
      (signal) => provider.snapshot(zoneRefs(baseline), signal),
      deadline,
      now,
    );
    demand(
      routeStateSha256(restored) === routeStateSha256(baseline),
      "exact full route/DNS/SSL baseline restored",
    );
    journal.restoredStateSha256 = routeStateSha256(restored);
    journal.legacyOrigin = await bounded((signal) => origins(probe, signal), deadline, now);
  } catch {
    failures.push({ code: "baseline_or_strict_origin_restore_unverified" });
  }
  if (storageFailed) failures.push({ code: "journal_storage_unavailable" });
  journal.status = failures.length ? "rollback_reconciliation_required" : "restored";
  journal.rollbackFailures = failures;
  await record();
  if (storageFailed) journal.status = "rollback_reconciliation_required";
  return journal;
}

/** No deploy/build/SQL/DNS APIs. Only signed, exact Worker route bindings can change. */
export async function applyProductionCutover(
  bundle,
  {
    provider,
    providerToken,
    persist,
    readRecheck,
    probe = probeLegacyOrigin,
    observe = observeRuntimeRollout,
    transport = fetch,
    signal,
    now = Date.now,
    wait = delay,
  } = {},
) {
  rejectExecutionActivation(bundle);
  const context = validateProductionCutover(bundle, now()),
    { plan, baseline } = context;
  demand(
    typeof persist === "function" && typeof readRecheck === "function" && provider,
    "durable journal and independent checker reader",
  );
  const started = now(),
    deadline = started + plan.timeoutSeconds * 1000;
  const journal = {
    schemaVersion: 1,
    operationId: plan.operationId,
    planSha256: context.planSha256,
    baselineSha256: plan.baselineSha256,
    reportSha256: context.reportSha256,
    status: "prepared",
    cutoverStartedAt: new Date(started).toISOString(),
    deadline,
    operations: [],
  };
  await persist(structuredClone(journal));
  try {
    const current = await bounded(
      (s) => provider.snapshot(zoneRefs(baseline), s),
      deadline,
      now,
      signal,
    );
    demand(
      routeStateSha256(current) === routeStateSha256(baseline),
      "fresh provider state equals approved baseline",
    );
    await bounded((s) => origins(probe, s), deadline, now, signal);
    deploymentMatches(
      await bounded((s) => provider.deployment(plan.workerName, s), deadline, now, signal),
      plan,
    );
    await bounded(
      () => observe(plan, context.runtime, providerToken, transport),
      deadline,
      now,
      signal,
    );
    for (const change of plan.routes) {
      const beforeWrite = await bounded(
        (s) => provider.routes(change.zoneId, s),
        deadline,
        now,
        signal,
      );
      demand(
        same(
          sort(beforeWrite),
          sort(
            intendedState(baseline, plan, journal.operations).zones.find(
              (z) => z.id === change.zoneId,
            ).routes,
          ),
        ),
        "fresh zone route state before mutation",
      );
      const previous =
        baseline.zones
          .find((z) => z.id === change.zoneId)
          .routes.find((r) => r.id === change.baselineRouteId) ?? null;
      const operation = {
        zoneId: change.zoneId,
        pattern: change.pattern,
        before: previous,
        status: "intent",
      };
      journal.operations.push(operation);
      await persist(structuredClone(journal));
      const value = await bounded(
        (s) =>
          previous
            ? provider.replace(change.zoneId, previous, plan.workerName, s)
            : provider.create(change.zoneId, change.pattern, plan.workerName, s),
        deadline,
        now,
        signal,
      );
      route(value);
      demand(
        value.pattern === change.pattern &&
          value.script === plan.workerName &&
          (!previous || value.id === previous.id),
        "exact mutation acknowledgement",
      );
      operation.id = value.id;
      operation.status = "applied";
      await persist(structuredClone(journal));
      const observed = await bounded(
        (s) => provider.routes(change.zoneId, s),
        deadline,
        now,
        signal,
      );
      demand(
        same(
          sort(observed),
          sort(
            intendedState(baseline, plan, journal.operations).zones.find(
              (z) => z.id === change.zoneId,
            ).routes,
          ),
        ),
        "exact full zone route readback; unrelated bindings untouched",
      );
    }
    const applied = await bounded(
      (s) => provider.snapshot(zoneRefs(baseline), s),
      deadline,
      now,
      signal,
    );
    demand(
      routeStateSha256(applied) ===
        routeStateSha256(intendedState(baseline, plan, journal.operations)),
      "all routes, DNS and SSL match the approved resulting state",
    );
    journal.status = "checking";
    journal.appliedStateSha256 = routeStateSha256(
      intendedState(baseline, plan, journal.operations),
    );
    await persist(structuredClone(journal));
    for (;;) {
      const envelope = await bounded(
        (s) => readRecheck(structuredClone(journal), s),
        deadline,
        now,
        signal,
      );
      if (envelope) {
        journal.productionReportSha256 = validateRecheck(envelope, bundle, context, journal, now());
        break;
      }
      await bounded(
        (s) => wait(Math.min(1000, deadline - now()), undefined, { signal: s }),
        deadline,
        now,
        signal,
      );
    }
    deploymentMatches(
      await bounded((s) => provider.deployment(plan.workerName, s), deadline, now, signal),
      plan,
    );
    await bounded(
      () => observe(plan, context.runtime, providerToken, transport),
      deadline,
      now,
      signal,
    );
    const final = await bounded(
      (s) => provider.snapshot(zoneRefs(baseline), s),
      deadline,
      now,
      signal,
    );
    demand(
      routeStateSha256(final) === journal.appliedStateSha256,
      "final route/DNS/SSL state unchanged during independent recheck",
    );
    journal.status = "accepted";
    await persist(structuredClone(journal));
    return journal;
  } catch {
    journal.failure = "cutover_or_independent_recheck_failed_or_timed_out";
    // Restoration uses a new bounded signal even when the cutover signal was cancelled.
    return restoreProductionRoutes(bundle, journal, { provider, persist, probe, now });
  }
}

export async function writeJournal(path, value, { exclusive = false } = {}) {
  const destination = resolve(path),
    directory = dirname(destination);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const parent = await lstat(directory);
  demand(
    parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o077) === 0,
    "private journal directory",
  );
  try {
    const existing = await lstat(destination);
    demand(
      !exclusive && existing.isFile() && !existing.isSymbolicLink(),
      "new operation or regular journal file",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    if (exclusive) await link(temporary, destination);
    else await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  const folder = await open(directory, "r");
  try {
    await folder.sync();
  } finally {
    await folder.close();
  }
}

async function readBundle(path, forward = false) {
  const specification = parsed(await readFile(path), "bundle file"),
    base = dirname(resolve(path));
  if (forward) rejectExecutionActivation(specification);
  const raw = async (name) => {
    demand(typeof name === "string" && !name.includes("\0"), "explicit artifact path");
    return readFile(resolve(base, name));
  };
  const bundle = {
    plan: await raw(specification.plan),
    baseline: await raw(specification.baseline),
    report: parsed(await raw(specification.report), "report envelope"),
    expected: parsed(await raw(specification.expected), "expected staging pins"),
    approvals: {},
    artifacts: {},
    trustedKeys: {
      owner: process.env.LAUNCH_OWNER_PUBLIC_KEY,
      controller: process.env.LAUNCH_CONTROLLER_PUBLIC_KEY,
    },
  };
  for (const role of ["owner", "controller"])
    bundle.approvals[role] = parsed(
      await raw(specification.approvals?.[role]),
      "approval envelope",
    );
  for (const [name, file] of Object.entries(specification.artifacts ?? {}))
    bundle.artifacts[name] = await raw(file);
  return { bundle, recheck: resolve(base, specification.recheck) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [mode, input, output] = process.argv.slice(2);
    demand(
      ["snapshot", "apply", "restore"].includes(mode) &&
        input &&
        output &&
        process.argv.length === 5,
      "snapshot|apply|restore <input.json> <private-receipt.json>",
    );
    const provider = cloudflareRoutes(process.env.CLOUDFLARE_API_TOKEN);
    if (mode === "snapshot") {
      const specification = parsed(await readFile(input), "explicit snapshot zone IDs");
      demand(
        specification.accountId === accountId &&
          Array.isArray(specification.zones) &&
          specification.zones.length >= 1 &&
          specification.zones.length <= 2 &&
          specification.zones.every((z) => sourceHosts.includes(z.name) && hex(32, z.id)),
        "exact source zone inventory scope",
      );
      await writeJournal(output, await provider.snapshot(specification.zones), { exclusive: true });
      console.log("Read-only routing/DNS/SSL snapshot retained; no readiness claim.");
    } else {
      const { bundle, recheck } = await readBundle(input, mode === "apply");
      if (mode === "apply") rejectExecutionActivation(bundle);
      const plan = parsed(bundle.plan, "reviewed cutover plan"),
        ownership = parsed(bundle.artifacts.ownership, "off-runner custody binding"),
        recovery = parsed(bundle.artifacts.recovery, "off-runner recovery binding");
      const watchdog = routeWatchdog({
        secret: process.env.PRODUCTION_WATCHDOG_CONTROL_SECRET,
        operationId: plan.operationId,
        leaseId: ownership.routeLease?.id,
      });
      const custody = await watchdog.status();
      const receiptHash = sha256(canonical(custody.receipt));
      demand(
        custody.scope?.sourceCommit === plan.sourceCommit &&
          custody.scope.digest === plan.digest &&
          custody.scope.baselineSha256 === plan.baselineSha256 &&
          custody.receipt.holder === plan.operationId &&
          custody.receipt.id === ownership.routeLease.id &&
          same([...custody.receipt.zoneIds].sort(), [...ownership.routeLease.zoneIds].sort()) &&
          custody.receipt.expiresAt === ownership.routeLease.expiresAt &&
          custody.receipt.expiresAt === recovery.watchdog.expiresAt &&
          receiptHash === ownership.routeLease.evidenceSha256 &&
          receiptHash === recovery.watchdog.evidenceSha256,
        "actual independently retained watchdog receipt matches signed custody artifacts",
      );
      if (mode === "apply") {
        validateProductionCutover(bundle);
        await watchdog.bind(bundle);
      }
      let first = mode === "apply";
      const persist = async (value) => {
        const retained =
          value.status === "accepted"
            ? { ...value, status: "awaiting_watchdog_acceptance" }
            : value;
        await writeJournal(output, retained, { exclusive: first });
        first = false;
        await watchdog.persist(retained);
      };
      const options = {
        provider: watchdog.provider(provider, plan.workerName),
        providerToken: process.env.CLOUDFLARE_API_TOKEN,
        persist,
      };
      let result;
      if (mode === "restore")
        result = await restoreProductionRoutes(
          bundle,
          parsed(await readFile(output), "retained operation journal"),
          options,
        );
      else {
        const abort = new AbortController();
        for (const name of ["SIGINT", "SIGTERM"]) process.once(name, () => abort.abort());
        result = await applyProductionCutover(bundle, {
          ...options,
          signal: abort.signal,
          readRecheck: async () => {
            try {
              return parsed(await readFile(recheck), "independent production envelope");
            } catch (error) {
              if (error.code === "ENOENT") return undefined;
              throw error;
            }
          },
        });
        if (result.status === "accepted") {
          const envelope = parsed(await readFile(recheck), "independent production envelope");
          const receipt = await watchdog.accept(envelope);
          demand(
            receipt.status === "accepted" && receipt.reportSha256 === sha256(envelope.payload),
            "independent durable acceptance acknowledgement",
          );
          const final = { ...result, watchdog: receipt };
          await writeJournal(output, final);
          await watchdog.persist(final);
        }
      }
      console.log(`Routing operation ${result.status}; receipt retained privately.`);
      if (
        !["accepted", "restored"].includes(result.status) ||
        (mode === "apply" && result.status !== "accepted")
      )
        process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      error instanceof ExecutionUnavailableError
        ? error.message
        : "Production routing adapter stopped; inspect private evidence and journal. No secret values are logged.",
    );
    process.exitCode = 1;
  }
}
