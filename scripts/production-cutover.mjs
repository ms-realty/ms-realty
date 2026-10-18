// No workflow invokes this adapter. Its only write API is exact, signed-plan Worker routing.

import { createPublicKey, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { gates, promotionGate, signedPayload } from "./launch-gate.mjs";
import { routeWatchdog } from "./production-watchdog.mjs";
import { accountId, sha256 } from "./staging-config.mjs";
import { observeRuntimeRollout, validateRuntimeIdentity } from "./staging-rollout-proof.mjs";

export const sourceHosts = ["makler-realty.com", "makler-realty.ru"];
export const productionHosts = [
  ...sourceHosts,
  "www.makler-realty.com",
  "www.makler-realty.ru",
  "my.makler-realty.com",
  "app.makler-realty.com",
];
const comZone = "f0ac7af0721419e8129e5d10ff547372";
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
const fresh = (value, now, maximum = 300_000) => {
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now && now - time <= maximum;
};
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

function planAndBaseline(bundle) {
  const plan = parsed(bundle.plan, "reviewed plan bytes"),
    baseline = parsed(bundle.baseline, "baseline bytes");
  demand(
    plan.schemaVersion === 1 &&
      plan.environment === "production" &&
      plan.purpose === "complete_parity" &&
      uuid(plan.operationId),
    "production plan identity",
  );
  demand(
    plan.accountId === accountId &&
      hex(40, plan.sourceCommit) &&
      /^sha256:[a-f0-9]{64}$/.test(plan.digest),
    "account/source/digest pins",
  );
  demand(
    plan.workerName === `ms-realty-production-${plan.sourceCommit.slice(0, 12)}` &&
      uuid(plan.gatewayVersionId) &&
      uuid(plan.gatewayDeploymentId),
    "dedicated immutable gateway version/deployment",
  );
  demand(
    plan.image === `registry.cloudflare.com/${accountId}/${plan.image?.split("/").at(-1)}` &&
      plan.image.endsWith(`@${plan.digest}`) &&
      /^[a-z0-9._-]+@sha256:[a-f0-9]{64}$/.test(plan.image.split("/").at(-1)),
    "same prebuilt image; no build or tag",
  );
  demand(
    plan.timeoutSeconds === 600 &&
      plan.rollbackTimeoutSeconds === 120 &&
      plan.databasePolicy === "preserve-current" &&
      plan.dnsPolicy === "preserve-all",
    "bounded recheck and forward-compatible rollback",
  );
  demand(
    hex(64, plan.baselineSha256) && sha256(bundle.baseline) === plan.baselineSha256,
    "exact approved baseline bytes",
  );
  demand(
    baseline.schemaVersion === 1 &&
      baseline.accountId === accountId &&
      Array.isArray(baseline.zones) &&
      baseline.zones.length === 2 &&
      same(baseline.zones.map((z) => z.name).sort(), [...sourceHosts].sort()),
    "both actual source zones; no inferred RU ownership",
  );
  demand(
    new Set(baseline.zones.map((zone) => zone.id)).size === 2,
    "distinct actual source zone IDs",
  );
  for (const zone of baseline.zones) {
    demand(
      hex(32, zone.id) &&
        zone.accountId === accountId &&
        zone.status === "active" &&
        zone.ssl === "strict" &&
        Array.isArray(zone.routes) &&
        Array.isArray(zone.dns),
      "active account-owned strict-TLS source zone",
    );
    zone.routes.forEach(route);
    demand(
      new Set(zone.routes.map((r) => r.id)).size === zone.routes.length &&
        new Set(zone.routes.map((r) => r.pattern)).size === zone.routes.length,
      "unique baseline routes",
    );
  }
  const com = baseline.zones.find((z) => z.name === sourceHosts[0]);
  demand(
    com.id === comZone &&
      com.dns.some(
        (r) =>
          r.id === "80445b86dbd30e00238697e7be909ac0" &&
          r.name === sourceHosts[0] &&
          r.type === "A" &&
          r.content === "185.80.2.102" &&
          r.proxied === true &&
          r.ttl === 1,
      ),
    "preserve the actual original COM A record",
  );
  demand(
    com.dns.some(
      (r) =>
        r.id === "be450dc427bddd5e282d17f28ecace11" &&
        r.name === "www.makler-realty.com" &&
        r.type === "CNAME" &&
        r.content === sourceHosts[0] &&
        r.proxied === true,
    ),
    "preserve actual WWW CNAME",
  );
  demand(
    com.dns.some(
      (r) => r.type === "MX" && r.name === sourceHosts[0] && r.content === "mail.makler-realty.com",
    ),
    "retain actual agency mail DNS",
  );
  demand(
    Array.isArray(plan.routes) && plan.routes.length >= 6 && plan.routes.length <= 1000,
    "explicit full route plan",
  );
  const keys = new Set(),
    covered = new Set();
  for (const change of plan.routes) {
    const zone = baseline.zones.find((z) => z.id === change.zoneId),
      key = `${change.zoneId}:${change.pattern}`;
    const host = change.pattern?.split("/")[0];
    demand(
      zone &&
        productionHosts.includes(host) &&
        (host === zone.name || host.endsWith(`.${zone.name}`)) &&
        !keys.has(key),
      "exact permitted host/zone/pattern",
    );
    keys.add(key);
    covered.add(host);
    const previous = zone.routes.find((r) => r.pattern === change.pattern);
    demand(
      previous
        ? previous.id === change.baselineRouteId
        : change.baselineRouteId === null && change.pattern === `${host}/*`,
      "exact existing ID or reviewed new whole-host route",
    );
  }
  demand(
    productionHosts.every(
      (host) => covered.has(host) && plan.routes.some((r) => r.pattern === `${host}/*`),
    ),
    "all public/client/staff source hosts explicitly covered",
  );
  for (const zone of baseline.zones) {
    for (const previous of zone.routes) {
      const hostPattern = previous.pattern.replace(/^https?:\/\//, "").split("/")[0];
      const expression = new RegExp(
        `^${hostPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`,
        "i",
      );
      if (productionHosts.some((host) => expression.test(host)))
        demand(
          keys.has(`${zone.id}:${previous.pattern}`),
          "every overlapping bypass or more-specific route explicitly reviewed",
        );
    }
  }
  return { plan, baseline, planSha256: sha256(bundle.plan) };
}

function authorizations(bundle, context) {
  const fingerprints = ["owner", "controller"].map((role) =>
    sha256(createPublicKey(bundle.trustedKeys[role]).export({ type: "spki", format: "der" })),
  );
  demand(fingerprints[0] !== fingerprints[1], "independent owner/controller custody");
  signedPayload(bundle.report, bundle.trustedKeys.controller);
  const reportSha256 = sha256(bundle.report.payload);
  for (const role of ["owner", "controller"]) {
    const approval = signedPayload(bundle.approvals[role], bundle.trustedKeys[role]);
    demand(
      approval.role === role &&
        approval.decision === "approve" &&
        approval.cutoverPlanSha256 === context.planSha256 &&
        approval.reportSha256 === reportSha256 &&
        approval.sourceCommit === context.plan.sourceCommit &&
        approval.digest === context.plan.digest,
      `${role} exact cutover plan signature`,
    );
  }
  return reportSha256;
}

export function validateProductionCutover(bundle, now = Date.now()) {
  const context = planAndBaseline(bundle),
    { plan } = context;
  const accepted = promotionGate(
    bundle.report,
    bundle.approvals,
    bundle.trustedKeys,
    bundle.expected,
    now,
  );
  demand(
    accepted.digest === plan.digest && accepted.sourceCommit === plan.sourceCommit,
    "same accepted staging release",
  );
  context.reportSha256 = authorizations(bundle, context);
  const names = [
    "gateway",
    "inputs",
    "routes",
    "media",
    "runtime",
    "database",
    "ownership",
    "recovery",
  ];
  demand(
    object(plan.artifacts) && same(Object.keys(plan.artifacts).sort(), [...names].sort()),
    "complete production artifact pins",
  );
  for (const name of names)
    demand(
      hex(64, plan.artifacts[name]) &&
        sha256(bundle.artifacts?.[name] ?? "") === plan.artifacts[name],
      `exact ${name} artifact bytes`,
    );
  demand(
    plan.artifacts.routes === bundle.expected.routesSha256 &&
      plan.artifacts.media === bundle.expected.mediaSha256,
    "same reviewed routes and media",
  );
  const inputs = parsed(bundle.artifacts.inputs, "production inputs"),
    runtime = parsed(bundle.artifacts.runtime, "runtime identity");
  demand(
    inputs.schemaVersion === 1 &&
      inputs.environment === "production" &&
      inputs.runtime === "containers" &&
      inputs.purpose === "complete_parity" &&
      inputs.accountId === accountId &&
      inputs.workerName === plan.workerName &&
      inputs.sourceCommit === plan.sourceCommit &&
      inputs.image === plan.image,
    "production configuration release binding",
  );
  demand(
    same(inputs.origins, {
      public: "https://makler-realty.com",
      client: "https://my.makler-realty.com",
      staff: "https://app.makler-realty.com",
    }) &&
      inputs.buckets?.media === "ms-realty-media" &&
      inputs.buckets.cache === "ms-realty-production-opennext-cache",
    "production surfaces and existing buckets",
  );
  demand(
    inputs.database?.name === "ms_realty_payload" &&
      inputs.database.engineVersion === "16.14" &&
      /^[a-z0-9.-]+$/.test(inputs.database.host ?? "") &&
      !/(^|[.-])staging([.-]|$)/.test(inputs.database.host) &&
      hex(64, inputs.database.schemaSha256) &&
      ["web", "worker", "migrator"].every((r) =>
        /^[a-z][a-z0-9_]+$/.test(inputs.database.roles?.[r] ?? ""),
      ) &&
      new Set(Object.values(inputs.database.roles)).size === 3,
    "separate reviewed production database and roles",
  );
  validateRuntimeIdentity({ ...plan }, runtime);
  demand(
    runtime.roles.web.state === "running" &&
      runtime.roles.worker.state === "running" &&
      runtime.roles.migrator.state === "completed",
    "actual running roles and completed migration",
  );
  const database = parsed(bundle.artifacts.database, "database measurement");
  demand(
    database.schemaVersion === 1 &&
      database.environment === "production" &&
      database.sourceCommit === plan.sourceCommit &&
      database.digest === plan.digest &&
      database.host === inputs.database.host &&
      database.schemaSha256 === inputs.database.schemaSha256 &&
      fresh(database.measuredAt, now) &&
      database.migration?.status === "completed" &&
      uuid(database.migration.operationId) &&
      database.migration.buildNonce === runtime.roles.migrator.buildNonce &&
      database.migration.sourceCommit === plan.sourceCommit &&
      database.migration.digest === plan.digest,
    "measured schema and migration receipt",
  );
  demand(
    database.compatibility?.mode === "expand-contract" &&
      database.compatibility.rollbackCodeCompatible === true &&
      database.compatibility.acceptedWritesPreserved === true &&
      hex(64, database.compatibility.evidenceSha256),
    "measured compatibility; never restore an older DB for code rollback",
  );
  for (const role of ["web", "worker", "migrator"]) {
    const connection = database.roles?.[role];
    demand(
      connection?.actorId === runtime.roles[role].actorId &&
        connection.buildNonce === runtime.roles[role].buildNonce &&
        connection.tlsVerification === "verify-full",
      "role-bound database observation",
    );
    for (const driver of ["postgres-js", "pg"]) {
      const measurement = connection.drivers?.[driver];
      demand(
        measurement?.database === inputs.database.name &&
          measurement.role === inputs.database.roles[role] &&
          measurement.engineVersion === "16.14" &&
          measurement.ssl === true &&
          ["TLSv1.2", "TLSv1.3"].includes(measurement.tlsVersion) &&
          typeof measurement.cipher === "string" &&
          measurement.cipher.length > 0,
        "both actual SQL driver TLS sessions",
      );
    }
  }
  const ownership = parsed(bundle.artifacts.ownership, "ownership measurement");
  demand(
    ownership.schemaVersion === 1 &&
      ownership.environment === "production" &&
      ownership.operationId === plan.operationId &&
      ownership.sourceCommit === plan.sourceCommit &&
      ownership.digest === plan.digest &&
      fresh(ownership.measuredAt, now) &&
      ownership.routeLease?.holder === plan.operationId &&
      uuid(ownership.routeLease.id) &&
      same(
        [...ownership.routeLease.zoneIds].sort(),
        context.baseline.zones.map((z) => z.id).sort(),
      ) &&
      Date.parse(ownership.routeLease.expiresAt) >
        now + (plan.timeoutSeconds + plan.rollbackTimeoutSeconds) * 1000 &&
      hex(64, ownership.routeLease.evidenceSha256),
    "actual exclusive route lease covers recheck and restoration",
  );
  demand(
    ownership.intake?.activeOwner === plan.workerName &&
      ownership.intake.oldConsequentialWorkersDisabled === true &&
      hex(64, ownership.intake.acceptedWritesLedgerSha256) &&
      ownership.databasePolicy === "preserve-current" &&
      uuid(ownership.recoveryPointId),
    "one intake owner and preserved accepted writes",
  );
  const recovery = parsed(bundle.artifacts.recovery, "rollback custody");
  demand(
    recovery.schemaVersion === 1 &&
      recovery.environment === "production" &&
      recovery.operationId === plan.operationId &&
      recovery.recoveryPointId === ownership.recoveryPointId &&
      recovery.retainDays >= 90 &&
      recovery.legacyUntouched === true &&
      hex(64, recovery.evidenceSha256) &&
      recovery.watchdog?.armed === true &&
      recovery.watchdog.operationId === plan.operationId &&
      recovery.watchdog.baselineSha256 === plan.baselineSha256 &&
      hex(64, recovery.watchdog.evidenceSha256) &&
      Date.parse(recovery.watchdog.expiresAt) >
        now + (plan.timeoutSeconds + plan.rollbackTimeoutSeconds) * 1000,
    "actual retained recovery point and independently armed timeout watchdog",
  );
  context.inputs = inputs;
  context.runtime = runtime;
  return context;
}

/** Independent Host/SNI probe; no public DNS, redirect following, cookies or insecure TLS. */
export async function probeLegacyOrigin(host, signal) {
  demand(sourceHosts.includes(host), "exact legacy probe host");
  return new Promise((resolveProbe, rejectProbe) => {
    const req = httpsRequest(
      {
        hostname: "185.80.2.102",
        port: 443,
        servername: host,
        path: "/",
        method: "GET",
        headers: { Host: host, "User-Agent": "MS-Realty-rollback-origin-probe" },
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        agent: false,
        timeout: 15_000,
        signal,
      },
      (response) => {
        const chunks = [];
        let bytes = 0;
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024) req.destroy();
          else chunks.push(chunk);
        });
        response.on("end", () => {
          const tlsVerified = req.socket.authorized === true,
            remoteAddress = req.socket.remoteAddress;
          if (
            !tlsVerified ||
            remoteAddress !== "185.80.2.102" ||
            response.statusCode !== 200 ||
            bytes === 0 ||
            bytes > 2 * 1024 * 1024
          )
            return rejectProbe(new Error("Legacy strict origin probe failed"));
          resolveProbe({
            host,
            serverName: host,
            address: remoteAddress,
            port: 443,
            httpStatus: 200,
            tlsVerified,
            publicDnsPathObserved: false,
            bodySha256: sha256(Buffer.concat(chunks)),
            bytes,
          });
        });
        response.on("error", () => rejectProbe(new Error("Legacy strict origin probe failed")));
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => rejectProbe(new Error("Legacy strict origin probe failed")));
    req.end();
  });
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

async function readBundle(path) {
  const specification = parsed(await readFile(path), "bundle file"),
    base = dirname(resolve(path));
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
      const { bundle, recheck } = await readBundle(input);
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
  } catch {
    console.error(
      "Production routing adapter stopped; inspect private evidence and journal. No secret values are logged.",
    );
    process.exitCode = 1;
  }
}
