import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gates, promotionGate } from "./launch-gate.mjs";
import {
  accountId,
  launchBase,
  sha256,
  stagingConfig,
  stagingRequiredSecrets,
  validateStaging,
} from "./staging-config.mjs";
import { stagingEnvironment } from "./staging-environment.mjs";
import { bindStagingInputs } from "./staging-inputs.mjs";
import {
  cloudflareReader,
  validateAccess,
  validateDatabaseAccess,
  validateRoutes,
} from "./staging-preflight.mjs";

// These generated identities and fixture reports are local negative-test inputs, never launch evidence.
test("canonical Cloudflare token cannot fall back without the independent staging custody guard", () => {
  const ephemeral = crypto.randomUUID();
  const env = {
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: ephemeral,
    STAGING_CLOUDFLARE_TOKEN_SHA256: sha256(ephemeral),
    STAGING_ENVIRONMENT_TOKEN_SENTINEL: ephemeral,
  };
  stagingEnvironment(env);
  assert.throws(() =>
    stagingEnvironment({ ...env, CLOUDFLARE_API_TOKEN: "foreign-repository-fixture" }),
  );
  assert.throws(() =>
    stagingEnvironment({ ...env, STAGING_ENVIRONMENT_TOKEN_SENTINEL: undefined }),
  );
  assert.throws(() => stagingEnvironment({ ...env, CLOUDFLARE_ACCOUNT_ID: "0".repeat(32) }));
});
test("environment-owned inputs bind only the qualified SHA and cannot replace a prior source pin", () => {
  const source = "a".repeat(40);
  assert.equal(
    bindStagingInputs(JSON.stringify({ sourceCommit: null }), source).sourceCommit,
    source,
  );
  assert.throws(() => bindStagingInputs(JSON.stringify({ sourceCommit: "b".repeat(40) }), source));
  assert.throws(() => bindStagingInputs(JSON.stringify({ sourceCommit: null }), "branch-name"));
});
function fixture() {
  const routes = JSON.stringify([
    {
      host: "makler-realty.com",
      path: "/legacy",
      query: "?x=%2F",
      status: 200,
      targetHost: "makler-realty.com",
      targetPath: "/bg/legacy/id",
    },
  ]);
  const media = JSON.stringify([
    {
      host: "makler-realty.com",
      path: "/wp-content/uploads/a.jpg",
      key: "makler-realty.com/wp-content/uploads/a.jpg",
    },
  ]);
  let connectivity = JSON.stringify({
    status: "PASS",
    database: "msr_stage_fixture",
    engineVersion: "16.14",
    tlsVerification: "verify-full",
    from: "cloudflare-containers",
    transport: "direct",
    exposesPublicPostgres: false,
  });
  const input = {
    schemaVersion: 1,
    environment: "staging",
    runtime: "containers",
    purpose: "complete_parity",
    accountId,
    zoneId: "a".repeat(32),
    workerName: "ms-realty-staging",
    baseCommit: launchBase,
    sourceCommit: "b".repeat(40),
    image: `registry.cloudflare.com/${accountId}/ms-realty-staging@sha256:${"c".repeat(64)}`,
    origins: {
      public: "https://staging.makler-realty.com",
      client: "https://staging-my.makler-realty.com",
      staff: "https://staging-app.makler-realty.com",
    },
    access: {
      applicationId: "1".repeat(36),
      controllerGroupId: "2".repeat(36),
      serviceTokenId: "3".repeat(36),
      ownerEmail: "owner@example.invalid",
      controllerEmails: ["controller@example.invalid"],
      teamDomain: "https://fixture.cloudflareaccess.com",
      audience: "d".repeat(64),
      serviceClientId: "fixture.access",
    },
    database: {
      engineVersion: "16.14",
      productionName: "ms_realty_payload",
      stagingName: "msr_stage_fixture",
      stagingHost: "db.fixture.invalid",
      transport: "direct",
      roles: { web: "web", worker: "worker", migrator: "migration" },
      privateConnectivitySha256: sha256(connectivity),
    },
    buckets: {
      productionMedia: "ms-realty-media",
      productionCache: "ms-realty-production-opennext-cache",
      stagingMedia: "ms-realty-staging-fixture-media",
      stagingCache: "ms-realty-staging-fixture-cache",
    },
    email: {
      from: "fixture@notifications.makler-realty.com",
      allowedRecipients: ["inbox@example.invalid"],
      replyDomain: null,
      inquiryCoverageNoticeEnabled: false,
      testInboxReviewed: false,
    },
    artifacts: { routesSha256: sha256(routes), mediaSha256: sha256(media) },
    runtimeVars: { CLAMAV_HOST: "scan.fixture.invalid", CLAMAV_PORT: "3310" },
    rollback: {
      retainDays: 90,
      legacyOrigin: "https://wordpress.example.invalid",
      evidenceSha256: "e".repeat(64),
    },
  };
  const isolation = JSON.stringify({
    status: "PASS",
    from: "origin-read-only-inspection",
    environment: "staging",
    database: input.database.stagingName,
    engineVersion: "16.14",
    exposesPublicPostgres: false,
    productionChanged: false,
    inspectedAt: new Date().toISOString(),
  });
  input.database.originIsolationSha256 = sha256(isolation);
  const runtime = { schemaVersion: 1, roles: {} },
    connections = { roles: {} };
  const nonce = "12345678-1234-4321-9876-123456789abc";
  for (const [index, role] of ["web", "worker", "migrator"].entries()) {
    const identity = {
      schemaVersion: 1,
      role,
      sourceCommit: input.sourceCommit,
      buildNonce: nonce,
      state: "prepared",
      actorId: String(index + 1).repeat(64),
    };
    const session = {
      database: input.database.stagingName,
      role: input.database.roles[role],
      engineVersion: "16.14",
      ssl: true,
      tlsVersion: "TLSv1.3",
      cipher: "fixture",
    };
    runtime.roles[role] = identity;
    connections.roles[role] = {
      identity,
      proof: {
        ...identity,
        connection: {
          schemaVersion: 1,
          status: "PASS",
          measuredAt: new Date().toISOString(),
          transport: input.database.transport,
          tlsVerification: "verify-full",
          drivers: { "postgres-js": session, pg: session },
        },
      },
    };
  }
  connectivity = JSON.stringify({
    ...JSON.parse(connectivity),
    schemaVersion: 2,
    sourceCommit: input.sourceCommit,
    image: input.image,
    originIsolationSha256: input.database.originIsolationSha256,
    runtime,
    connections,
  });
  input.database.privateConnectivitySha256 = sha256(connectivity);
  const manifest = JSON.stringify({
    status: "ready",
    uniqueSources: 1,
    routeArtifactSha256: sha256(routes),
    blockers: [],
  });
  input.artifacts.routeManifestSha256 = sha256(manifest);
  return { input, artifacts: { routes, media, manifest, connectivity, isolation } };
}
test("partial preview requires explicit scope, denied production and exact manifest/exclusions pins", () => {
  const { input, artifacts } = fixture();
  const manifest = {
    ...JSON.parse(artifacts.manifest),
    status: "ready_partial",
    scope: "staging_only",
    productionAllowed: false,
    exclusions: [
      {
        id: "fixture-unmapped",
        sourceUrl: "https://makler-realty.com/unmapped",
        reason: "missing_verified_source",
      },
    ],
  };
  artifacts.manifest = JSON.stringify(manifest);
  input.purpose = "protected_partial_preview";
  input.artifacts.routeManifestSha256 = sha256(artifacts.manifest);
  input.artifacts.exclusionsSha256 = sha256(JSON.stringify(manifest.exclusions));
  validateStaging(input, artifacts);
  assert.throws(() => validateStaging({ ...input, purpose: "complete_parity" }, artifacts));
  assert.throws(() =>
    validateStaging(
      { ...input, artifacts: { ...input.artifacts, exclusionsSha256: "0".repeat(64) } },
      artifacts,
    ),
  );
  manifest.productionAllowed = true;
  artifacts.manifest = JSON.stringify(manifest);
  input.artifacts.routeManifestSha256 = sha256(artifacts.manifest);
  assert.throws(() => validateStaging(input, artifacts));
});

function privateFixture() {
  const { input, artifacts } = fixture();
  input.database.transport = "cloudflared-access-tcp";
  input.database.stagingHost = "staging-db.makler-realty.com";
  input.database.access = {
    applicationId: "4".repeat(36),
    audience: "5".repeat(64),
    serviceTokenId: "6".repeat(36),
    serviceClientId: "database-fixture.access",
  };
  const network = JSON.parse(artifacts.connectivity);
  network.transport = input.database.transport;
  for (const role of ["web", "worker", "migrator"])
    network.connections.roles[role].proof.connection.transport = input.database.transport;
  artifacts.connectivity = JSON.stringify(network);
  input.database.privateConnectivitySha256 = sha256(artifacts.connectivity);
  return { input, artifacts };
}

test("bootstrap config can measure connectivity but cannot release app work without actual proof", () => {
  const { input, artifacts } = privateFixture();
  input.database.privateConnectivitySha256 = null;
  artifacts.connectivity = "";
  const probe = stagingConfig(input, artifacts, { connectivityProbe: true });
  assert.equal(probe.vars.STAGING_CONNECTIVITY_ONLY, "true");
  assert.throws(() => stagingConfig(input, artifacts), /connectivity evidence/);
  assert.throws(
    () => stagingConfig(input, { ...artifacts, isolation: "" }, { connectivityProbe: true }),
    /origin isolation/,
  );
  const exposed = JSON.stringify({
    ...JSON.parse(artifacts.isolation),
    exposesPublicPostgres: true,
  });
  input.database.originIsolationSha256 = sha256(exposed);
  assert.throws(
    () => stagingConfig(input, { ...artifacts, isolation: exposed }, { connectivityProbe: true }),
    /origin inspection/,
  );
});

test("private transport needs distinct reviewed Access identity and matching observed connectivity", () => {
  const { input, artifacts } = privateFixture();
  const config = stagingConfig(input, artifacts);
  assert.equal(config.vars.DATABASE_TRANSPORT, "cloudflared-access-tcp");
  assert.equal(config.vars.TUNNEL_SERVICE_URL, "127.0.0.1:15432");
  assert.equal(config.vars.TUNNEL_SERVICE_HOSTNAME, input.database.stagingHost);
  assert.equal(config.vars.TUNNEL_SERVICE_TOKEN_ID, input.database.access.serviceClientId);
  assert.equal(config.vars.TUNNEL_SERVICE_TOKEN_SECRET, undefined);
  assert(stagingRequiredSecrets(input).includes("DATABASE_TLS_CA_PEM"));
  assert(stagingRequiredSecrets(input).includes("TUNNEL_SERVICE_TOKEN_SECRET"));
  assert(!stagingRequiredSecrets(fixture().input).includes("TUNNEL_SERVICE_TOKEN_SECRET"));
  for (const mutate of [
    (x) => {
      x.database.stagingHost = "db.makler-realty.com";
    },
    (x) => {
      x.database.access.serviceTokenId = x.access.serviceTokenId;
    },
    (x) => {
      x.database.access.serviceClientId = null;
    },
    (x) => {
      x.database.transport = "unknown";
    },
  ]) {
    const changed = structuredClone(input);
    mutate(changed);
    assert.throws(() => validateStaging(changed, artifacts));
  }
  const wrong = {
    ...artifacts,
    connectivity: JSON.stringify({
      ...JSON.parse(artifacts.connectivity),
      transport: "direct",
    }),
  };
  input.database.privateConnectivitySha256 = sha256(wrong.connectivity);
  assert.throws(() => validateStaging(input, wrong), /actual private TLS connection/);
});

test("database Access denies human allow, bypass, foreign tokens, broad apps and Worker override", () => {
  const { input } = privateFixture();
  const app = {
    id: input.database.access.applicationId,
    aud: input.database.access.audience,
    type: "self_hosted",
    domain: input.database.stagingHost,
  };
  const policy = {
    decision: "non_identity",
    include: [{ service_token: { token_id: input.database.access.serviceTokenId } }],
  };
  validateDatabaseAccess(input, app, [policy], [app]);
  for (const changed of [
    { decision: "bypass", include: [{ everyone: {} }] },
    { decision: "allow", include: [{ email: { email: input.access.ownerEmail } }] },
    {
      decision: "non_identity",
      include: [{ service_token: { token_id: input.access.serviceTokenId } }],
    },
  ])
    assert.throws(() => validateDatabaseAccess(input, app, [changed], [app]));
  assert.throws(() => validateDatabaseAccess(input, app, [], [app]));
  assert.throws(() =>
    validateDatabaseAccess(
      input,
      app,
      [policy],
      [
        app,
        {
          id: "foreign",
          domain: "*.makler-realty.com",
        },
      ],
    ),
  );
  assert.throws(() =>
    validateDatabaseAccess(input, { ...app, domain: "*.makler-realty.com" }, [policy], [app]),
  );
  assert.throws(
    () =>
      validateRoutes(input, [
        {
          pattern: `${input.database.stagingHost}/*`,
          script: "foreign-worker",
        },
      ]),
    /database TCP hostname/,
  );
});
test("the independently prepared public projection satisfies the protected-preview artifact contract only", () => {
  const { input, artifacts } = fixture();
  const root = new URL("../data/legacy/migration/", import.meta.url);
  artifacts.routes = readFileSync(new URL("staging-legacy-routes.json", root), "utf8");
  artifacts.manifest = readFileSync(new URL("staging-route-manifest.json", root), "utf8");
  artifacts.media = readFileSync(new URL("public-media.json", root), "utf8");
  const manifest = JSON.parse(artifacts.manifest);
  input.purpose = "protected_partial_preview";
  input.artifacts.routesSha256 = sha256(artifacts.routes);
  input.artifacts.routeManifestSha256 = sha256(artifacts.manifest);
  input.artifacts.exclusionsSha256 = sha256(JSON.stringify(manifest.exclusions));
  input.artifacts.mediaSha256 = sha256(artifacts.media);
  validateStaging(input, artifacts);
  assert.equal(manifest.productionAllowed, false);
  assert(manifest.exclusions.length > 0);
  assert.throws(() => validateStaging({ ...input, purpose: "complete_parity" }, artifacts));
});
test("staging config rejects production aliases, nonisolated resources, incomplete maps and missing inputs", () => {
  const { input, artifacts } = fixture();
  const config = stagingConfig(input, artifacts);
  assert.equal(config.workers_dev, false);
  assert.equal(config.containers.length, 3);
  assert(config.containers.every((x) => x.image === input.image));
  assert.equal(config.routes.length, 3);
  assert.deepEqual(
    config.routes.map((route) => route.pattern).sort(),
    Object.values(input.origins)
      .map((origin) => `${new URL(origin).host}/*`)
      .sort(),
  );
  assert.equal(config.vars.LEGACY_ROUTES_JSON, undefined);
  assert.equal(config.vars.PUBLIC_MEDIA_JSON, undefined);
  assert.deepEqual(config.send_email[0], {
    name: "EMAIL",
    allowed_destination_addresses: input.email.allowedRecipients,
    allowed_sender_addresses: [input.email.from],
  });
  for (const mutate of [
    (x) => {
      x.origins.public = "https://makler-realty.com";
    },
    (x) => {
      x.database.stagingName = "ms_realty_payload";
    },
    (x) => {
      x.buckets.stagingMedia = "ms-realty-media";
    },
    (x) => {
      x.image = input.image.replace("@sha256:", ":");
    },
    (x) => {
      x.access.audience = null;
    },
    (x) => {
      x.runtime = "opennext";
    },
    (x) => {
      x.runtimeVars.DATABASE_URL = "forbidden";
    },
  ]) {
    const copy = structuredClone(input);
    mutate(copy);
    assert.throws(() => validateStaging(copy, artifacts));
  }
  assert.throws(() => validateStaging(input, { ...artifacts, routes: "[]" }));
  assert.throws(() =>
    validateStaging(input, {
      ...artifacts,
      manifest: JSON.stringify({ status: "blocked", blockers: ["missing_capture"] }),
    }),
  );
  assert.throws(() => validateStaging(input, artifacts, {}));
});
test("inquiry notice can target only the explicit reviewed staging binding recipient", () => {
  const { input, artifacts } = fixture();
  assert.equal(stagingConfig(input, artifacts).vars.INQUIRY_COVERAGE_NOTICE_ENABLED, "0");
  input.email.inquiryCoverageNoticeEnabled = true;
  assert.throws(() => validateStaging(input, artifacts), /explicit reviewed staging inbox/);
  input.email.testInboxReviewed = true;
  const config = stagingConfig(input, artifacts);
  assert.equal(config.vars.INQUIRY_COVERAGE_NOTICE_ENABLED, "1");
  assert.equal(config.vars.INQUIRY_COVERAGE_TEST_INBOX_REVIEWED, "true");
  assert.equal(config.vars.INQUIRY_COVERAGE_TEST_INBOX, input.email.allowedRecipients[0]);
  assert.deepEqual(config.send_email[0].allowed_destination_addresses, [
    config.vars.INQUIRY_COVERAGE_TEST_INBOX,
  ]);
  input.email.testInboxReviewed = "true";
  assert.throws(() => validateStaging(input, artifacts), /explicit reviewed staging inbox/);
});
test("large artifact bytes stay outside bindings while oversized runtime variables fail before deploy", () => {
  const { input, artifacts } = fixture();
  const media = JSON.parse(artifacts.media);
  for (let i = 0; i < 100; i++)
    media.push({
      host: "makler-realty.com",
      path: `/wp-content/uploads/${i}.jpg`,
      key: `makler-realty.com/wp-content/uploads/${i}.jpg`,
    });
  artifacts.media = JSON.stringify(media);
  input.artifacts.mediaSha256 = sha256(artifacts.media);
  assert(Buffer.byteLength(artifacts.media) > 5 * 1024);
  const config = stagingConfig(input, artifacts);
  assert(Object.values(config.vars).every((value) => Buffer.byteLength(value) <= 5 * 1024));
  input.runtimeVars.WEBAUTHN_RP_NAME = "и".repeat(2561);
  assert.throws(() => stagingConfig(input, artifacts));
});
test("Unicode-equivalent redirect chains are blocked even when target spelling is percent encoded", () => {
  const { input, artifacts } = fixture();
  const rows = [
    {
      host: "makler-realty.ru",
      path: "/old",
      query: "",
      status: 301,
      targetHost: "makler-realty.com",
      targetPath: "/%D0%B4",
    },
    {
      host: "makler-realty.com",
      path: "/д",
      query: "",
      status: 301,
      targetHost: "makler-realty.com",
      targetPath: "/bg/end",
    },
  ];
  artifacts.routes = JSON.stringify(rows);
  input.artifacts.routesSha256 = sha256(artifacts.routes);
  const manifest = {
    ...JSON.parse(artifacts.manifest),
    uniqueSources: 2,
    routeArtifactSha256: input.artifacts.routesSha256,
  };
  artifacts.manifest = JSON.stringify(manifest);
  input.artifacts.routeManifestSha256 = sha256(artifacts.manifest);
  assert.throws(() => validateStaging(input, artifacts), /single-hop legacy redirect/);
});
test("route preflight rejects foreign subpaths, bypasses and wildcard staging overrides", () => {
  const { input } = fixture();
  const owned = [
    "staging.makler-realty.com",
    "staging-my.makler-realty.com",
    "staging-app.makler-realty.com",
  ].map((host) => ({ pattern: `${host}/*`, script: input.workerName }));
  validateRoutes(input, owned);
  validateRoutes(input, [
    ...owned,
    { pattern: "makler-realty.com/*", script: "existing-production-worker" },
  ]);
  for (const pattern of [
    "staging.makler-realty.com/api/*",
    "https://staging.makler-realty.com/api/*",
    "http://STAGING-APP.makler-realty.com/login*",
    "staging-my.makler-realty.com/private/*",
    "*.makler-realty.com/api/*",
    "*staging.makler-realty.com/*",
  ]) {
    for (const script of ["foreign-worker", null, input.workerName])
      assert.throws(
        () => validateRoutes(input, [...owned, { pattern, script }]),
        /competing or bypass route/,
      );
  }
  assert.throws(
    () =>
      validateRoutes(input, [
        ...owned,
        { pattern: "makler-realty.com/*", script: input.workerName },
      ]),
    /no production route/,
  );
  assert.throws(() => validateRoutes(input, undefined), /known Worker route inventory/);
});

test("Access accepts the owner's human identity plus the named controller service token without inventing a human group", () => {
  const { input, artifacts } = fixture();
  input.access.controllerGroupId = null;
  input.access.controllerEmails = [];
  validateStaging(input, artifacts);
  const app = {
    id: input.access.applicationId,
    type: "self_hosted",
    aud: input.access.audience,
    domain: "staging.makler-realty.com",
    destinations: [
      "staging.makler-realty.com",
      "staging-my.makler-realty.com",
      "staging-app.makler-realty.com",
    ].map((uri) => ({ type: "public", uri })),
  };
  const policies = [
    { decision: "allow", include: [{ email: { email: input.access.ownerEmail } }] },
    {
      decision: "non_identity",
      include: [{ service_token: { token_id: input.access.serviceTokenId } }],
    },
  ];
  validateAccess(input, app, policies, null, [app]);
  assert.throws(() => validateAccess(input, app, policies.slice(0, 1), null, [app]));
  assert.throws(() => validateAccess(input, app, policies.slice(1), null, [app]));
  assert.throws(() =>
    validateAccess(
      input,
      app,
      [...policies, { decision: "allow", include: [{ group: { id: "2".repeat(36) } }] }],
      null,
      [app],
    ),
  );
  input.access.controllerEmails = ["unapproved@example.invalid"];
  assert.throws(() => validateStaging(input, artifacts));
  assert.throws(() => validateAccess(input, app, policies, null, [app]));
});

test("Access preflight denies bypass, everyone, foreign controllers and more-specific app overrides", () => {
  const { input } = fixture();
  const app = {
    id: input.access.applicationId,
    type: "self_hosted",
    aud: input.access.audience,
    domain: "staging.makler-realty.com",
    destinations: [
      "staging.makler-realty.com",
      "staging-my.makler-realty.com",
      "staging-app.makler-realty.com",
    ].map((uri) => ({ type: "public", uri })),
  };
  const policies = [
    {
      decision: "allow",
      include: [
        { email: { email: input.access.ownerEmail } },
        { group: { id: input.access.controllerGroupId } },
      ],
    },
    {
      decision: "non_identity",
      include: [{ service_token: { token_id: input.access.serviceTokenId } }],
    },
  ];
  const group = { include: [{ email: { email: input.access.controllerEmails[0] } }] };
  validateAccess(input, app, policies, group, [app]);
  assert.throws(() =>
    validateAccess(
      input,
      app,
      [...policies, { decision: "bypass", include: [{ everyone: {} }] }],
      group,
      [app],
    ),
  );
  assert.throws(() =>
    validateAccess(
      input,
      app,
      [...policies, { decision: "allow", include: [{ everyone: {} }] }],
      group,
      [app],
    ),
  );
  assert.throws(() =>
    validateAccess(
      input,
      app,
      policies,
      { include: [{ email: { email: "foreign@example.invalid" } }] },
      [app],
    ),
  );
  assert.throws(() =>
    validateAccess(input, app, policies, group, [
      app,
      { id: "other", domain: "staging.makler-realty.com/public" },
    ]),
  );
  assert.throws(() => validateAccess(input, { ...app, destinations: [] }, policies, group, [app]));
});
test("Cloudflare inventory reader uses GET only and reads every paginated result", async () => {
  const ephemeral = crypto.randomUUID();
  let calls = 0;
  const api = cloudflareReader(ephemeral, async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(url.origin, "https://api.cloudflare.com");
    calls++;
    return Response.json({
      success: true,
      result: [url.searchParams.get("page")],
      result_info: { total_pages: 2 },
    });
  });
  assert.deepEqual(await api("/accounts/fixture/access/apps", true), ["1", "2"]);
  assert.equal(calls, 2);
});

test("Access uses current public destinations and does not fill missing coverage from deprecated domains", () => {
  const { input } = fixture();
  input.access.controllerGroupId = null;
  input.access.controllerEmails = [];
  const destinations = Object.values(input.origins).map((origin) => ({
    type: "public",
    uri: new URL(origin).host,
  }));
  const app = {
    id: input.access.applicationId,
    type: "self_hosted",
    aud: input.access.audience,
    domain: "superseded.example.invalid",
    destinations,
    self_hosted_domains: ["deprecated.example.invalid"],
  };
  const policies = [
    { decision: "allow", include: [{ email: { email: input.access.ownerEmail } }] },
    {
      decision: "non_identity",
      include: [{ service_token: { token_id: input.access.serviceTokenId } }],
    },
  ];
  validateAccess(input, app, policies, null, [app]);
  for (const changed of [
    { ...app, id: "foreign" },
    {
      ...app,
      destinations: destinations.slice(0, 2),
      self_hosted_domains: destinations.map((x) => x.uri),
    },
    {
      ...app,
      destinations: undefined,
      domain: destinations[0].uri,
      self_hosted_domains: destinations.map((x) => x.uri),
    },
    { ...app, destinations: {} },
    { ...app, destinations: [{ type: "public" }] },
    {
      ...app,
      destinations: [...destinations, { type: "private", hostname: "private.example.invalid" }],
    },
    {
      ...app,
      destinations: destinations.map((x) => ({
        ...x,
        overrides: [{ behavior: "public", path_pattern: "/api/*" }],
      })),
    },
    { ...app, destinations: destinations.map((x) => ({ ...x, overrides: {} })) },
  ])
    assert.throws(() => validateAccess(input, changed, policies, null, [changed]));
  for (const uri of [
    "staging-my.makler-realty.com/private/*",
    "*.makler-realty.com",
    "STAGING-APP.makler-realty.com/login",
  ])
    assert.throws(() =>
      validateAccess(input, app, policies, null, [
        app,
        { id: "foreign", destinations: [{ type: "public", uri }] },
      ]),
    );
  validateAccess(input, app, policies, null, [
    app,
    {
      id: "unrelated",
      destinations: [{ type: "public", uri: "other.example.invalid" }],
    },
  ]);
});

test("unknown public destination shapes cannot hide an overlapping application", () => {
  const { input } = privateFixture();
  const app = {
    id: input.database.access.applicationId,
    type: "self_hosted",
    aud: input.database.access.audience,
    domain: input.database.stagingHost,
  };
  const policies = [
    {
      decision: "non_identity",
      include: [{ service_token: { token_id: input.database.access.serviceTokenId } }],
    },
  ];
  assert.throws(() =>
    validateDatabaseAccess(input, app, policies, [
      app,
      { id: "foreign", destinations: [{ type: "unknown", uri: input.database.stagingHost }] },
    ]),
  );
});

test("database Access reads public destinations with domain fallback and denies destination bypasses", () => {
  const { input } = privateFixture();
  const app = {
    id: input.database.access.applicationId,
    type: "self_hosted",
    aud: input.database.access.audience,
    domain: "superseded.example.invalid",
    destinations: [{ type: "public", uri: input.database.stagingHost }],
  };
  const policies = [
    {
      decision: "non_identity",
      include: [{ service_token: { token_id: input.database.access.serviceTokenId } }],
    },
  ];
  validateDatabaseAccess(input, app, policies, [app]);
  for (const destinations of [undefined, []])
    validateDatabaseAccess(
      input,
      { ...app, domain: input.database.stagingHost, destinations },
      policies,
      [app],
    );
  assert.throws(() =>
    validateDatabaseAccess(
      input,
      {
        ...app,
        destinations: [
          {
            type: "public",
            uri: input.database.stagingHost,
            overrides: [{ behavior: "public", path_pattern: "/*" }],
          },
        ],
      },
      policies,
      [app],
    ),
  );
  assert.throws(() =>
    validateDatabaseAccess(input, app, policies, [
      app,
      {
        id: "foreign",
        destinations: [{ type: "public", uri: `${input.database.stagingHost}/private` }],
      },
    ]),
  );
});
test("promotion requires actual independent signatures, all nine gates, exact pins and both signoffs", () => {
  const owner = generateKeyPairSync("ed25519"),
    controller = generateKeyPairSync("ed25519");
  const keys = {
    owner: owner.publicKey.export({ type: "spki", format: "pem" }),
    controller: controller.publicKey.export({ type: "spki", format: "pem" }),
  };
  const envelope = (payload, key) => {
    const bytes = JSON.stringify(payload);
    return { payload: bytes, signature: sign(null, Buffer.from(bytes), key).toString("base64") };
  };
  const now = Date.now(),
    checkedAt = new Date(now - 1000).toISOString();
  const expected = {
    purpose: "complete_parity",
    sourceCommit: "a".repeat(40),
    digest: `sha256:${"b".repeat(64)}`,
    routesSha256: "c".repeat(64),
    mediaSha256: "d".repeat(64),
    inputsSha256: "e".repeat(64),
    provenanceSha256: "f".repeat(64),
  };
  const report = {
    coverage: {
      productionAllowed: true,
      completeCurrentDelta: true,
      baselineSourceRows: 457,
      resolvedSourceRows: 457,
      exclusions: 0,
    },
    schemaVersion: 1,
    environment: "staging",
    status: "PASS",
    baseCommit: launchBase,
    ...expected,
    checkedAt,
    checker: { authority: "independent-controller", baselineSha256: "1".repeat(64) },
    gates: Object.fromEntries(
      gates.map((gate) => [gate, { status: "PASS", evidenceSha256: "2".repeat(64) }]),
    ),
    rollback: { retainDays: 90, evidenceSha256: "3".repeat(64), legacyUntouched: true },
  };
  const signed = envelope(report, controller.privateKey);
  const approvals = Object.fromEntries(
    ["owner", "controller"].map((role) => [
      role,
      envelope(
        {
          role,
          decision: "approve",
          digest: expected.digest,
          sourceCommit: expected.sourceCommit,
          reportSha256: sha256(signed.payload),
          reviewedScreens: true,
          signedAt: new Date(now).toISOString(),
        },
        role === "owner" ? owner.privateKey : controller.privateKey,
      ),
    ]),
  );
  assert.equal(promotionGate(signed, approvals, keys, expected, now).digest, expected.digest);
  assert.throws(() =>
    promotionGate(
      signed,
      approvals,
      keys,
      { ...expected, purpose: "protected_partial_preview" },
      now,
    ),
  );
  assert.throws(() =>
    promotionGate(signed, { ...approvals, owner: approvals.controller }, keys, expected, now),
  );
  assert.throws(() =>
    promotionGate(
      signed,
      approvals,
      { owner: keys.controller, controller: keys.controller },
      expected,
      now,
    ),
  );
  assert.throws(() =>
    promotionGate(
      { ...signed, payload: signed.payload.replace('"PASS"', '"FAIL"') },
      approvals,
      keys,
      expected,
      now,
    ),
  );
  assert.throws(() =>
    promotionGate(
      signed,
      approvals,
      keys,
      { ...expected, digest: `sha256:${"0".repeat(64)}` },
      now,
    ),
  );
  const failed = structuredClone(report);
  failed.gates.forms.status = "FAIL";
  assert.throws(() =>
    promotionGate(envelope(failed, controller.privateKey), approvals, keys, expected, now),
  );
  assert.throws(() => promotionGate(signed, approvals, keys, expected, now + 86401000));
  assert.throws(() => promotionGate(null, approvals, keys, expected, now));
});
