// I/O-free production plan verification. Provider reads and mutations stay in the adapters.
import { createPublicKey } from "node:crypto";
import { validateRuntimeIdentity } from "../../scripts/staging-rollout-proof.mjs";
import { accountId, promotionGate, sha256, signedPayload } from "./execution-parity.mjs";

const sourceHosts = ["makler-realty.com", "makler-realty.ru"];

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
export function planAndBaseline(bundle) {
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

export function authorizations(bundle, context) {
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
