import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gates } from "./launch-gate.mjs";
import {
  applyProductionCutover,
  canonical,
  cloudflareRoutes,
  productionHosts,
  restoreProductionRoutes,
  routeStateSha256,
  validateProductionCutover,
  writeJournal,
} from "./production-cutover.mjs";
import { accountId, launchBase, sha256 } from "./staging-config.mjs";

// Ephemeral keys, injected provider and SQL/session records below are UNIT FIXTURES ONLY.
// No fixture output is exported as live evidence, custody, approval or launch qualification.
function fixture() {
  let clock = Date.now(),
    sequence = 100;
  const owner = generateKeyPairSync("ed25519"),
    controller = generateKeyPairSync("ed25519");
  const keys = { owner, controller };
  const encode = (payload, role = "controller") => {
    const bytes = JSON.stringify(payload);
    return {
      payload: bytes,
      signature: sign(null, Buffer.from(bytes), keys[role].privateKey).toString("base64"),
    };
  };
  const sourceCommit = "a".repeat(40),
    digest = `sha256:${"b".repeat(64)}`;
  const workerName = `ms-realty-production-${sourceCommit.slice(0, 12)}`;
  const baseline = {
    schemaVersion: 1,
    accountId,
    observedAt: new Date(clock).toISOString(),
    zones: [
      {
        id: "f0ac7af0721419e8129e5d10ff547372",
        name: "makler-realty.com",
        accountId,
        status: "active",
        ssl: "strict",
        dns: [
          {
            id: "80445b86dbd30e00238697e7be909ac0",
            name: "makler-realty.com",
            type: "A",
            content: "185.80.2.102",
            proxied: true,
            ttl: 1,
          },
          {
            id: "be450dc427bddd5e282d17f28ecace11",
            name: "www.makler-realty.com",
            type: "CNAME",
            content: "makler-realty.com",
            proxied: true,
            ttl: 1,
          },
          {
            id: "2".repeat(32),
            name: "makler-realty.com",
            type: "MX",
            content: "mail.makler-realty.com",
            priority: 0,
            ttl: 1800,
          },
          {
            id: "3".repeat(32),
            name: "makler-realty.com",
            type: "TXT",
            content: "v=spf1 fixture",
            ttl: 1800,
          },
        ],
        routes: [
          { id: "1".repeat(32), pattern: "makler-realty.com/*", script: null },
          { id: "2".repeat(32), pattern: "www.makler-realty.com/*", script: null },
          { id: "3".repeat(32), pattern: "makler-realty.com/en*", script: null },
          { id: "4".repeat(32), pattern: "makler-realty.com/", script: null },
          {
            id: "5".repeat(32),
            pattern: "staging.makler-realty.com/*",
            script: "ms-realty-staging",
          },
        ],
      },
      // Deliberately fictitious RU zone: this does not assert actual account ownership.
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
  const runtime = { schemaVersion: 1, roles: {} },
    nonce = randomUUID();
  const database = {
    schemaVersion: 1,
    environment: "production",
    sourceCommit,
    digest,
    host: "db.production.test",
    schemaSha256: "c".repeat(64),
    measuredAt: new Date(clock).toISOString(),
    roles: {},
    migration: {
      status: "completed",
      operationId: randomUUID(),
      buildNonce: nonce,
      sourceCommit,
      digest,
    },
    compatibility: {
      mode: "expand-contract",
      rollbackCodeCompatible: true,
      acceptedWritesPreserved: true,
      evidenceSha256: "d".repeat(64),
    },
  };
  for (const [i, role] of ["web", "worker", "migrator"].entries()) {
    runtime.roles[role] = {
      schemaVersion: 1,
      role,
      sourceCommit,
      buildNonce: nonce,
      actorId: String(i + 1).repeat(64),
      state: role === "migrator" ? "completed" : "running",
    };
    const row = {
      database: "ms_realty_payload",
      role: `msr_${role}`,
      engineVersion: "16.14",
      ssl: true,
      tlsVersion: "TLSv1.3",
      cipher: "fixture-cipher",
    };
    database.roles[role] = {
      actorId: runtime.roles[role].actorId,
      buildNonce: nonce,
      tlsVerification: "verify-full",
      drivers: { "postgres-js": { ...row }, pg: { ...row } },
    };
  }
  const plan = {
    schemaVersion: 1,
    environment: "production",
    purpose: "complete_parity",
    operationId: randomUUID(),
    accountId,
    sourceCommit,
    digest,
    workerName,
    gatewayVersionId: randomUUID(),
    gatewayDeploymentId: randomUUID(),
    image: `registry.cloudflare.com/${accountId}/ms-realty-staging@${digest}`,
    timeoutSeconds: 600,
    rollbackTimeoutSeconds: 120,
    databasePolicy: "preserve-current",
    dnsPolicy: "preserve-all",
    routes: [],
  };
  const leaseExpiry = new Date(clock + 2_000_000).toISOString(),
    recoveryPointId = randomUUID();
  const inputs = {
    schemaVersion: 1,
    environment: "production",
    runtime: "containers",
    purpose: "complete_parity",
    accountId,
    sourceCommit,
    workerName,
    image: plan.image,
    origins: {
      public: "https://makler-realty.com",
      client: "https://my.makler-realty.com",
      staff: "https://app.makler-realty.com",
    },
    buckets: { media: "ms-realty-media", cache: "ms-realty-production-opennext-cache" },
    database: {
      name: "ms_realty_payload",
      host: database.host,
      engineVersion: "16.14",
      schemaSha256: database.schemaSha256,
      roles: { web: "msr_web", worker: "msr_worker", migrator: "msr_migrator" },
    },
  };
  const ownership = {
    schemaVersion: 1,
    environment: "production",
    operationId: plan.operationId,
    sourceCommit,
    digest,
    measuredAt: new Date(clock).toISOString(),
    routeLease: {
      holder: plan.operationId,
      id: randomUUID(),
      zoneIds: baseline.zones.map((z) => z.id),
      expiresAt: leaseExpiry,
      evidenceSha256: "e".repeat(64),
    },
    intake: {
      activeOwner: workerName,
      oldConsequentialWorkersDisabled: true,
      acceptedWritesLedgerSha256: "f".repeat(64),
    },
    databasePolicy: "preserve-current",
    recoveryPointId,
  };
  const recovery = {
    schemaVersion: 1,
    environment: "production",
    operationId: plan.operationId,
    recoveryPointId,
    retainDays: 90,
    legacyUntouched: true,
    evidenceSha256: "f".repeat(64),
    watchdog: {
      armed: true,
      operationId: plan.operationId,
      evidenceSha256: "e".repeat(64),
      expiresAt: leaseExpiry,
    },
  };
  for (const host of productionHosts) {
    const zone = baseline.zones.find((z) => host === z.name || host.endsWith(`.${z.name}`));
    const previous = zone.routes.find((r) => r.pattern === `${host}/*`);
    plan.routes.push({
      zoneId: zone.id,
      pattern: `${host}/*`,
      baselineRouteId: previous?.id ?? null,
    });
  }
  for (const previous of baseline.zones[0].routes.filter((r) =>
    ["makler-realty.com/en*", "makler-realty.com/"].includes(r.pattern),
  ))
    plan.routes.push({
      zoneId: baseline.zones[0].id,
      pattern: previous.pattern,
      baselineRouteId: previous.id,
    });
  const allGates = Object.fromEntries(
    gates.map((g) => [g, { status: "PASS", evidenceSha256: "e".repeat(64) }]),
  );
  const coverage = {
    productionAllowed: true,
    completeCurrentDelta: true,
    baselineSourceRows: 457,
    resolvedSourceRows: 457,
    exclusions: 0,
  };
  const report = {
    schemaVersion: 1,
    environment: "staging",
    status: "PASS",
    sourceCommit,
    digest,
    baseCommit: launchBase,
    coverage,
    gates: allGates,
    checker: { authority: "independent-controller", baselineSha256: "f".repeat(64) },
    checkedAt: new Date(clock - 1).toISOString(),
    rollback: { retainDays: 90, evidenceSha256: "e".repeat(64), legacyUntouched: true },
  };
  const bundle = {
    trustedKeys: {
      owner: owner.publicKey.export({ type: "spki", format: "pem" }),
      controller: controller.publicKey.export({ type: "spki", format: "pem" }),
    },
    approvals: {},
    artifacts: {},
    expected: {
      purpose: "complete_parity",
      sourceCommit,
      digest,
      inputsSha256: "a".repeat(64),
      provenanceSha256: "b".repeat(64),
    },
  };
  const f = {
    plan,
    baseline,
    runtime,
    database,
    inputs,
    ownership,
    recovery,
    bundle,
    report,
    encode,
    writes: [],
    journals: [],
    observations: [],
    probes: [],
  };
  f.refresh = () => {
    bundle.baseline = JSON.stringify(baseline);
    plan.baselineSha256 = sha256(bundle.baseline);
    recovery.watchdog.baselineSha256 = plan.baselineSha256;
    bundle.artifacts = {
      gateway: "// UNIT FIXTURE gateway bytes",
      inputs: JSON.stringify(inputs),
      routes: "[]",
      media: "[]",
      runtime: JSON.stringify(runtime),
      database: JSON.stringify(database),
      ownership: JSON.stringify(ownership),
      recovery: JSON.stringify(recovery),
    };
    plan.artifacts = Object.fromEntries(
      Object.entries(bundle.artifacts).map(([name, bytes]) => [name, sha256(bytes)]),
    );
    bundle.plan = JSON.stringify(plan);
    for (const name of ["routesSha256", "mediaSha256"])
      bundle.expected[name] = plan.artifacts[name.replace("Sha256", "")];
    Object.assign(
      report,
      Object.fromEntries(
        ["routesSha256", "mediaSha256", "inputsSha256", "provenanceSha256"].map((k) => [
          k,
          bundle.expected[k],
        ]),
      ),
    );
    bundle.report = encode(report);
    for (const role of ["owner", "controller"])
      bundle.approvals[role] = encode(
        {
          role,
          decision: "approve",
          sourceCommit,
          digest,
          reportSha256: sha256(bundle.report.payload),
          reviewedScreens: true,
          signedAt: new Date(clock).toISOString(),
          cutoverPlanSha256: sha256(bundle.plan),
        },
        role,
      );
  };
  f.refresh();
  f.state = structuredClone(baseline);
  f.provider = {
    snapshot: async () => structuredClone(f.state),
    routes: async (zoneId) => structuredClone(f.state.zones.find((z) => z.id === zoneId).routes),
    deployment: async () => ({
      deployments: [
        {
          id: plan.gatewayDeploymentId,
          created_on: new Date(Date.now() - 1000).toISOString(),
          versions: [{ version_id: plan.gatewayVersionId, percentage: 100 }],
        },
      ],
    }),
    replace: async (zoneId, previous, script) => {
      f.writes.push({ method: "PUT", zoneId, id: previous.id, script });
      const rows = f.state.zones.find((z) => z.id === zoneId).routes,
        i = rows.findIndex((r) => r.id === previous.id);
      assert.ok(i >= 0);
      rows[i] = { ...previous, script };
      return { ...rows[i] };
    },
    create: async (zoneId, pattern, script) => {
      const value = { id: (++sequence).toString(16).padStart(32, "0"), pattern, script };
      f.writes.push({ method: "POST", zoneId, ...value });
      f.state.zones.find((z) => z.id === zoneId).routes.push(value);
      return { ...value };
    },
    remove: async (zoneId, value) => {
      f.writes.push({ method: "DELETE", zoneId, ...value });
      const zone = f.state.zones.find((z) => z.id === zoneId);
      zone.routes = zone.routes.filter((r) => r.id !== value.id);
    },
  };
  f.pass = (journal) =>
    encode({
      schemaVersion: 1,
      environment: "production",
      status: "PASS",
      checker: report.checker,
      checkedAt: new Date(clock).toISOString(),
      hosts: productionHosts,
      gates: allGates,
      coverage,
      bindings: {
        operationId: plan.operationId,
        planSha256: sha256(bundle.plan),
        baselineSha256: plan.baselineSha256,
        appliedStateSha256: journal.appliedStateSha256,
        sourceCommit,
        digest,
        gatewayVersionId: plan.gatewayVersionId,
        gatewayDeploymentId: plan.gatewayDeploymentId,
        artifacts: plan.artifacts,
      },
    });
  f.options = {
    provider: f.provider,
    providerToken: randomUUID(),
    now: () => clock,
    persist: async (journal) => f.journals.push(structuredClone(journal)),
    readRecheck: async (journal) => f.pass(journal),
    observe: async (input, identity) => {
      f.observations.push({ input, identity });
      return { status: "observed" };
    },
    probe: async (host) => {
      f.probes.push(host);
      return {
        host,
        serverName: host,
        address: "185.80.2.102",
        port: 443,
        httpStatus: 200,
        tlsVerified: true,
        publicDnsPathObserved: false,
        bodySha256: "a".repeat(64),
        bytes: 100,
      };
    },
    wait: async (ms) => {
      clock += ms;
    },
  };
  f.advance = (ms) => {
    clock += ms;
  };
  return f;
}

test("same-digest signed plan applies every bypass ID, preserves unrelated routes/DNS and accepts only bound recheck", async () => {
  const f = fixture(),
    beforeDns = canonical(f.state.zones.map((z) => z.dns));
  const result = await applyProductionCutover(f.bundle, f.options);
  assert.equal(result.status, "accepted");
  assert.equal(f.observations.length, 2);
  assert.equal(canonical(f.state.zones.map((z) => z.dns)), beforeDns);
  assert.equal(
    f.state.zones[0].routes.find((r) => r.id === "5".repeat(32)).script,
    "ms-realty-staging",
  );
  assert.equal(f.writes.filter((w) => w.method === "PUT").length, 4);
  assert.ok(f.journals.find((j) => j.operations.some((r) => r.status === "intent")));
  assert.equal(result.productionReportSha256.length, 64);
});

test("partial staging or unsigned plan never reaches journal/provider mutation", async () => {
  const f = fixture();
  f.report.coverage.exclusions = 1;
  f.refresh();
  await assert.rejects(applyProductionCutover(f.bundle, f.options), /complete baseline coverage/);
  assert.equal(f.journals.length, 0);
  assert.equal(f.writes.length, 0);
  f.report.coverage.exclusions = 0;
  f.refresh();
  f.bundle.plan += " ";
  await assert.rejects(applyProductionCutover(f.bundle, f.options), /exact cutover plan signature/);
});

test("every artifact hash, role TLS session, schema, lease and watchdog is mandatory", () => {
  const f = fixture();
  for (const name of Object.keys(f.bundle.artifacts)) {
    const original = f.bundle.artifacts[name];
    f.bundle.artifacts[name] += " ";
    assert.throws(
      () => validateProductionCutover(f.bundle, f.options.now()),
      new RegExp(`exact ${name} artifact`),
    );
    f.bundle.artifacts[name] = original;
  }
  delete f.database.roles.worker.drivers.pg;
  f.refresh();
  assert.throws(() => validateProductionCutover(f.bundle, f.options.now()), /actual SQL driver/);
  const g = fixture();
  g.ownership.intake.oldConsequentialWorkersDisabled = false;
  g.refresh();
  assert.throws(() => validateProductionCutover(g.bundle, g.options.now()), /one intake owner/);
  const h = fixture();
  h.recovery.watchdog.armed = false;
  h.refresh();
  assert.throws(() => validateProductionCutover(h.bundle, h.options.now()), /timeout watchdog/);
  const i = fixture();
  i.inputs.database.host = "staging-db.makler-realty.com";
  i.refresh();
  assert.throws(() => validateProductionCutover(i.bundle, i.options.now()), /production database/);
});

test("missing RU ownership, inactive zones, or an omitted more-specific bypass fail closed", () => {
  const f = fixture();
  f.baseline.zones.pop();
  f.refresh();
  assert.throws(
    () => validateProductionCutover(f.bundle, f.options.now()),
    /both actual source zones/,
  );
  const g = fixture();
  g.baseline.zones[1].status = "pending";
  g.refresh();
  assert.throws(() => validateProductionCutover(g.bundle, g.options.now()), /active account-owned/);
  const h = fixture();
  h.plan.routes = h.plan.routes.filter((r) => !r.pattern.endsWith("/en*"));
  h.refresh();
  assert.throws(() => validateProductionCutover(h.bundle, h.options.now()), /overlapping bypass/);
});

test("fresh DNS or route drift prevents cutover and never gets overwritten", async () => {
  const f = fixture();
  f.state.zones[0].dns[0].content = "192.0.2.1";
  const result = await applyProductionCutover(f.bundle, f.options);
  assert.equal(result.status, "rollback_reconciliation_required");
  assert.equal(f.writes.length, 0);
  assert.equal(f.state.zones[0].dns[0].content, "192.0.2.1");
});

test("provider digest/role mismatch prevents routing even with signed fixture assertions", async () => {
  const f = fixture();
  f.options.observe = async () => {
    throw new Error("actual role digest differs");
  };
  const result = await applyProductionCutover(f.bundle, f.options);
  assert.equal(result.status, "restored");
  assert.equal(f.writes.length, 0);
});

test("failed or wrong-operation independent checker restores exact null scripts and removes only created IDs", async () => {
  for (const kind of ["FAIL", "other-operation"]) {
    const f = fixture();
    f.options.readRecheck = async (journal) => {
      const payload = JSON.parse(f.pass(journal).payload);
      if (kind === "FAIL") payload.status = "FAIL";
      else payload.bindings.operationId = randomUUID();
      return f.encode(payload);
    };
    const result = await applyProductionCutover(f.bundle, f.options);
    assert.equal(result.status, "restored");
    assert.equal(routeStateSha256(f.state), routeStateSha256(f.baseline));
    assert.equal(f.writes.filter((w) => w.method === "DELETE").length, 4);
    assert.ok(f.writes.filter((w) => w.method === "PUT" && w.script === null).length === 4);
  }
});

test("absent and hung checker paths both restore on timeout/cancellation", async () => {
  const f = fixture();
  f.options.readRecheck = async () => undefined;
  f.options.wait = async () => f.advance(600_001);
  assert.equal((await applyProductionCutover(f.bundle, f.options)).status, "restored");
  assert.equal(routeStateSha256(f.state), routeStateSha256(f.baseline));
  const g = fixture(),
    abort = new AbortController();
  g.options.signal = abort.signal;
  g.options.readRecheck = async () => {
    abort.abort();
    return new Promise(() => {});
  };
  assert.equal((await applyProductionCutover(g.bundle, g.options)).status, "restored");
});

test("lost write acknowledgements reconcile journaled intent and restore exact provider state", async () => {
  for (const method of ["replace", "create"]) {
    const f = fixture(),
      original = f.provider[method];
    let first = true;
    f.provider[method] = async (...args) => {
      const value = await original(...args);
      if (first) {
        first = false;
        throw new Error("fixture lost acknowledgement");
      }
      return value;
    };
    const result = await applyProductionCutover(f.bundle, f.options);
    assert.equal(result.status, "restored");
    assert.equal(routeStateSha256(f.state), routeStateSha256(f.baseline));
  }
});

test("concurrent foreign binding is preserved and restoration reports reconciliation", async () => {
  const f = fixture();
  f.options.readRecheck = async () => {
    f.state.zones[0].routes.find((r) => r.id === "1".repeat(32)).script = "different-owner";
    throw new Error("fixture checker failure");
  };
  const result = await applyProductionCutover(f.bundle, f.options);
  assert.equal(result.status, "rollback_reconciliation_required");
  assert.equal(
    f.state.zones[0].routes.find((r) => r.id === "1".repeat(32)).script,
    "different-owner",
  );
  assert.equal(f.state.zones[0].routes.find((r) => r.id === "2".repeat(32)).script, null);
});

test("rollback continues other routes after a restoration error and never touches DNS/DB", async () => {
  const f = fixture(),
    original = f.provider.replace;
  f.provider.replace = async (zone, previous, script) => {
    if (script === null && previous.id === "1".repeat(32)) throw new Error("fixture unavailable");
    return original(zone, previous, script);
  };
  f.options.readRecheck = async () => {
    throw new Error("fixture failed");
  };
  const result = await applyProductionCutover(f.bundle, f.options);
  assert.equal(result.status, "rollback_reconciliation_required");
  assert.equal(f.state.zones[0].routes.find((r) => r.id === "2".repeat(32)).script, null);
  assert.equal(f.writes.filter((w) => w.method === "DELETE").length, 4);
  assert.deepEqual(
    f.state.zones.map((z) => z.dns),
    f.baseline.zones.map((z) => z.dns),
  );
});

test("journal storage failure after a committed write cannot prevent restoration attempts", async () => {
  const f = fixture(),
    persist = f.options.persist;
  f.options.persist = async (journal) => {
    if (f.writes.length) throw new Error("fixture disk unavailable");
    return persist(journal);
  };
  const result = await applyProductionCutover(f.bundle, f.options);
  assert.equal(result.status, "rollback_reconciliation_required");
  assert.equal(routeStateSha256(f.state), routeStateSha256(f.baseline));
  assert.ok(
    result.rollbackFailures.some((failure) => failure.code === "journal_storage_unavailable"),
  );
});

test("different latest gateway deployment or an unpinned version never receives routes", async () => {
  const f = fixture();
  f.provider.deployment = async () => ({
    deployments: [
      {
        id: f.plan.gatewayDeploymentId,
        created_on: new Date(Date.now() - 10_000).toISOString(),
        versions: [{ version_id: f.plan.gatewayVersionId, percentage: 100 }],
      },
      {
        id: randomUUID(),
        created_on: new Date(Date.now() - 1_000).toISOString(),
        versions: [{ version_id: randomUUID(), percentage: 100 }],
      },
    ],
  });
  assert.equal((await applyProductionCutover(f.bundle, f.options)).status, "restored");
  assert.equal(f.writes.length, 0);
});

test("authenticated restoration remains available after launch evidence expires", async () => {
  const f = fixture(),
    journal = await applyProductionCutover(f.bundle, f.options);
  f.advance(86_400_001);
  const result = await restoreProductionRoutes(f.bundle, journal, f.options);
  assert.equal(result.status, "restored");
  assert.equal(routeStateSha256(f.state), routeStateSha256(f.baseline));
});

test("strict SNI evidence cannot be replaced by a successful public DNS request", async () => {
  const f = fixture(),
    probe = f.options.probe;
  f.options.probe = async (host) => ({ ...(await probe(host)), publicDnsPathObserved: true });
  const result = await applyProductionCutover(f.bundle, f.options);
  assert.equal(f.writes.length, 0);
  assert.equal(result.status, "rollback_reconciliation_required");
});

test("provider client uses only fixed routes API writes, omits script to restore null and redacts failures", async () => {
  const token = randomUUID(),
    calls = [],
    value = { id: "1".repeat(32), pattern: "makler-realty.com/*", script: null };
  const client = cloudflareRoutes(token, async (url, options) => {
    calls.push({ url, ...options });
    return Response.json({
      success: true,
      errors: [],
      result: { ...value, ...JSON.parse(options.body) },
    });
  });
  const restored = await client.replace("f".repeat(32), value, null);
  assert.equal(restored.script, null);
  assert.equal(calls[0].method, "PUT");
  assert.equal(new URL(calls[0].url).origin, "https://api.cloudflare.com");
  assert.equal(calls[0].redirect, "error");
  assert.deepEqual(JSON.parse(calls[0].body), { pattern: value.pattern });
  const broken = cloudflareRoutes(token, async () => {
    throw new Error(token);
  });
  await assert.rejects(
    broken.create("f".repeat(32), value.pattern, "fixture"),
    (error) => !error.message.includes(token),
  );
});

test("provider snapshot traverses complete DNS pages and rejects incomplete or foreign inventories", async () => {
  const f = fixture(),
    zone = f.baseline.zones[0];
  let incomplete = false,
    foreign = false;
  const token = randomUUID();
  const client = cloudflareRoutes(token, async (url, options) => {
    const parsed = new URL(url);
    assert.equal(options.method, "GET");
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    let result, result_info;
    if (parsed.pathname.endsWith("/workers/routes")) result = zone.routes;
    else if (parsed.pathname.endsWith("/settings/ssl")) result = { id: "ssl", value: "strict" };
    else if (parsed.pathname.endsWith("/dns_records")) {
      const page = Number(parsed.searchParams.get("page"));
      result = zone.dns.slice((page - 1) * 2, page * 2);
      result_info = { page, total_pages: 2, total_count: incomplete ? 5 : zone.dns.length };
    } else
      result = {
        id: zone.id,
        name: zone.name,
        status: "active",
        account: { id: foreign ? "f".repeat(32) : accountId },
      };
    return Response.json({
      success: true,
      errors: [],
      result,
      ...(result_info ? { result_info } : {}),
    });
  });
  const snapshot = await client.snapshot([{ id: zone.id, name: zone.name }]);
  assert.equal(snapshot.zones[0].dns.length, 4);
  assert.equal(snapshot.zones[0].routes.length, 5);
  incomplete = true;
  await assert.rejects(client.snapshot([{ id: zone.id, name: zone.name }]), /every DNS record/);
  incomplete = false;
  foreign = true;
  await assert.rejects(client.snapshot([{ id: zone.id, name: zone.name }]), /account-scoped zone/);
});

test("private durable journal rejects existing initial output and symlink destination", async () => {
  const directory = await mkdtemp(join(tmpdir(), "msr-cutover-unit-"));
  try {
    const file = join(directory, "journal.json");
    await writeJournal(file, { status: "prepared" }, { exclusive: true });
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    await assert.rejects(writeJournal(file, {}, { exclusive: true }));
    await writeJournal(file, { status: "restored" });
    assert.equal(JSON.parse(await readFile(file)).status, "restored");
    const pointer = join(directory, "pointer.json");
    await symlink(file, pointer);
    await assert.rejects(writeJournal(pointer, {}));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
