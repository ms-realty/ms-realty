import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { test } from "node:test";
import { gates } from "./launch-gate.mjs";
import { productionConfig, productionSecrets } from "./production-config.mjs";
import { accountId, launchBase, sha256 } from "./staging-config.mjs";

// All reports/signatures/data below are ephemeral UNIT FIXTURES, never live acceptance.
function fixture() {
  const now = Date.now(),
    sourceCommit = "a".repeat(40),
    digest = `sha256:${"b".repeat(64)}`;
  const keys = Object.fromEntries(
    ["owner", "controller"].map((role) => [role, generateKeyPairSync("ed25519")]),
  );
  const trusted = Object.fromEntries(
    Object.entries(keys).map(([role, pair]) => [
      role,
      pair.publicKey.export({ type: "spki", format: "pem" }),
    ]),
  );
  const encode = (body, role = "controller") => {
    const payload = JSON.stringify(body);
    return {
      payload,
      signature: sign(null, Buffer.from(payload), keys[role].privateKey).toString("base64"),
    };
  };
  const ownership = {
    schemaVersion: 1,
    environment: "production",
    sourceCommit,
    digest,
    measuredAt: new Date(now).toISOString(),
    intake: {
      activeOwner: `ms-realty-production-${sourceCommit.slice(0, 12)}`,
      oldConsequentialWorkersDisabled: true,
      acceptedWritesLedgerSha256: "c".repeat(64),
    },
    databasePolicy: "preserve-current",
    recoveryPointId: randomUUID(),
  };
  const input = {
    schemaVersion: 1,
    environment: "production",
    runtime: "containers",
    purpose: "complete_parity",
    accountId,
    sourceCommit,
    workerName: ownership.intake.activeOwner,
    image: `registry.cloudflare.com/${accountId}/ms-realty-staging@${digest}`,
    control: {
      zoneId: "f0ac7af0721419e8129e5d10ff547372",
      pattern: "app.makler-realty.com/__release/*",
    },
    origins: {
      public: "https://makler-realty.com",
      client: "https://my.makler-realty.com",
      staff: "https://app.makler-realty.com",
    },
    buckets: { media: "ms-realty-media", cache: "ms-realty-production-opennext-cache" },
    database: {
      name: "ms_realty_payload",
      engineVersion: "16.14",
      schemaSha256: "d".repeat(64),
      host: "db.production.msr.invalid",
      transport: "direct",
      roles: { web: "msr_web", worker: "msr_worker", migrator: "msr_migrator" },
    },
    access: {
      applicationId: randomUUID(),
      serviceTokenId: randomUUID(),
      audience: "e".repeat(64),
      teamDomain: "https://unit.cloudflareaccess.com",
      serviceClientId: "unit.access",
    },
    email: { from: "unit@notifications.makler-realty.com", allowedRecipients: [] },
    runtimeVars: { FILE_SCAN_MODE: "clamav", CLAMAV_HOST: "scan.production.msr.invalid" },
    artifacts: {},
  };
  const artifacts = {
    routes: JSON.stringify(
      Array.from({ length: 454 }, (_, i) => ({
        host: "makler-realty.com",
        path: `/unit-${i}/`,
        query: "",
        status: 200,
        targetHost: "makler-realty.com",
        targetPath: `/bg/unit-${i}/`,
      })),
    ),
    media: JSON.stringify([
      {
        host: "makler-realty.com",
        path: "/wp-content/uploads/unit.jpg",
        key: "makler-realty.com/wp-content/uploads/unit.jpg",
      },
    ]),
    ownership: JSON.stringify(ownership),
    manifest: "",
  };
  const manifest = {
    status: "ready",
    sourceRows: 457,
    uniqueSources: 454,
    blockers: [],
    routeArtifactSha256: sha256(artifacts.routes),
  };
  const report = {
    schemaVersion: 1,
    environment: "staging",
    status: "PASS",
    baseCommit: launchBase,
    sourceCommit,
    digest,
    checkedAt: new Date(now - 1).toISOString(),
    checker: { authority: "independent-controller", baselineSha256: "f".repeat(64) },
    coverage: {
      productionAllowed: true,
      completeCurrentDelta: true,
      baselineSourceRows: 457,
      resolvedSourceRows: 457,
      exclusions: 0,
    },
    gates: Object.fromEntries(
      gates.map((gate) => [gate, { status: "PASS", evidenceSha256: "e".repeat(64) }]),
    ),
    rollback: { retainDays: 90, legacyUntouched: true, evidenceSha256: "f".repeat(64) },
  };
  const evidence = {
    report: {},
    approvals: {},
    expected: {
      purpose: "complete_parity",
      sourceCommit,
      digest,
      inputsSha256: "a".repeat(64),
      provenanceSha256: "b".repeat(64),
    },
  };
  const f = { input, artifacts, manifest, report, evidence, trusted, encode, now };
  f.refresh = () => {
    artifacts.manifest = JSON.stringify(manifest);
    input.artifacts = Object.fromEntries(
      Object.entries(artifacts).map(([name, bytes]) => [name, sha256(bytes)]),
    );
    for (const [field, name] of [
      ["routesSha256", "routes"],
      ["mediaSha256", "media"],
    ])
      evidence.expected[field] = input.artifacts[name];
    Object.assign(
      report,
      Object.fromEntries(
        ["routesSha256", "mediaSha256", "inputsSha256", "provenanceSha256"].map((field) => [
          field,
          evidence.expected[field],
        ]),
      ),
    );
    evidence.report = encode(report);
    f.bytes = JSON.stringify(input);
    for (const role of ["owner", "controller"])
      evidence.approvals[role] = encode(
        {
          role,
          decision: "approve",
          sourceCommit,
          digest,
          reportSha256: sha256(evidence.report.payload),
          signedAt: new Date(now).toISOString(),
          reviewedScreens: true,
          productionInputsSha256: sha256(f.bytes),
        },
        role,
      );
  };
  f.policy = (purpose, extra) =>
    encode({
      schemaVersion: 1,
      purpose,
      environment: "production",
      sourceCommit,
      digest,
      ownershipSha256: sha256(artifacts.ownership),
      observedAt: new Date(now).toISOString(),
      evidenceSha256: "f".repeat(64),
      ...extra,
    });
  f.refresh();
  f.config = (options) =>
    productionConfig(f.bytes, artifacts, evidence, trusted, { now, ...options });
  return f;
}
test("prepares only authenticated staff controls and three copies of the accepted digest", () => {
  const f = fixture(),
    config = f.config();
  assert.deepEqual(config.routes, [
    { pattern: "app.makler-realty.com/__release/*", zone_id: f.input.control.zoneId },
  ]);
  assert.ok(config.containers.every((container) => container.image === f.input.image));
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.vars.STAGING, "false");
  assert.equal(config.vars.RELEASE_ENVIRONMENT, "production");
  assert.equal(config.vars.BUTLER_ENABLED, "0");
  assert.equal(config.vars.CASE_EMAIL_ENABLED, "0");
  assert.equal(config.send_email, undefined);
  assert.equal(config.vars.PRODUCTION_INPUTS_SHA256, sha256(f.bytes));
});
test("partial reports/manifests and changed production inputs cannot generate config", () => {
  const f = fixture();
  f.report.coverage.exclusions = 1;
  f.refresh();
  assert.throws(() => f.config(), /complete baseline coverage/);
  const g = fixture();
  g.manifest.status = "ready_partial";
  g.manifest.productionAllowed = false;
  g.refresh();
  assert.throws(() => g.config(), /partial previews/);
  const h = fixture();
  h.bytes += " ";
  assert.throws(() => h.config(), /exact production configuration approval/);
});
test("rejects a rebuilt/substituted image, public control route, stale ownership or runtime-variable override", () => {
  for (const change of [
    (f) => {
      f.input.image = f.input.image.replace("b".repeat(64), "c".repeat(64));
    },
    (f) => {
      f.input.control.pattern = "makler-realty.com/*";
    },
    (f) => {
      f.input.runtimeVars.PRODUCTION_CONTROL_SECRET = "unit";
    },
    (f) => {
      f.artifacts.ownership = JSON.stringify({
        ...JSON.parse(f.artifacts.ownership),
        measuredAt: new Date(f.now - 300_001).toISOString(),
      });
    },
  ]) {
    const f = fixture();
    change(f);
    f.refresh();
    assert.throws(() => f.config());
  }
});
test("every input artifact is exact and absent feature/delivery proof cannot be replaced by flags", () => {
  const f = fixture();
  f.artifacts.media += " ";
  assert.throws(() => f.config(), /exact media artifact/);
  const g = fixture();
  g.input.runtimeVars.BUTLER_ENABLED = "1";
  g.refresh();
  assert.throws(() => g.config(), /allowlist/);
  const h = fixture();
  h.artifacts.features = JSON.stringify(
    h.policy("production-feature-policy", {
      features: { CASE_EMAIL_ENABLED: "1", CASE_INBOUND_ENABLED: "0", BUTLER_ENABLED: "0" },
    }),
  );
  h.refresh();
  assert.throws(() => h.config(), /email features require/);
});
test("only exact independently signed email policy enables a reviewed recipient binding", () => {
  const f = fixture();
  f.input.email.allowedRecipients = ["unit-inbox@example.test"];
  f.artifacts.emailPolicy = JSON.stringify(
    f.policy("production-email-policy", {
      from: f.input.email.from,
      allowedRecipients: f.input.email.allowedRecipients,
    }),
  );
  f.refresh();
  assert.deepEqual(
    f.config().send_email[0].allowed_destination_addresses,
    f.input.email.allowedRecipients,
  );
  f.input.email.allowedRecipients = ["other-unit@example.test"];
  f.refresh();
  assert.throws(() => f.config(), /authorized recipients/);
});
test("production secrets are checked in memory and never emitted in a config", () => {
  const f = fixture(),
    runtime = Object.fromEntries(productionSecrets.map((name) => [name, randomUUID()]));
  for (const role of ["web", "worker", "migrator"])
    runtime[`${role.toUpperCase()}_DATABASE_URL`] =
      `postgres://msr_${role}:unit@db.production.msr.invalid/ms_realty_payload?sslmode=verify-full`;
  const config = f.config({ runtime });
  for (const name of productionSecrets) assert.equal(config.vars[name], undefined);
  runtime.WEB_DATABASE_URL = runtime.WORKER_DATABASE_URL;
  assert.throws(() => f.config({ runtime }), /reviewed production runtime/);
});
