import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  accountId,
  createPacer,
  errorEvidence,
  observeTransport,
  origins,
  protocol,
  qualificationPassed,
  readBoundedBody,
  stagingUrl,
  validateCandidate,
  validateDispatch,
  validateMediaProof,
  validateProviderRead,
} from "./staging-http-qualification.mjs";

const source = "a".repeat(40),
  hash = "b".repeat(64);
const copy = (value) => structuredClone(value);
const env = {
  GITHUB_REPOSITORY: "ms-realty/ms-realty",
  GITHUB_REF: "refs/heads/main",
  STAGING_ENVIRONMENT_CONFIGURED: "true",
  CLOUDFLARE_ACCOUNT_ID: accountId,
  EXPECTED_SOURCE: source,
  STAGING_SOURCE_QUALIFIED_SHA: source,
  DEPLOYMENT_RUN_ID: "123",
  QUALIFICATION_MODE: "full",
};
const run = {
  id: 123,
  repository: { full_name: "ms-realty/ms-realty" },
  path: ".github/workflows/staging.yml",
  head_branch: "codex/msr-staging",
  head_sha: source,
  status: "completed",
  conclusion: "success",
  run_attempt: 2,
};
const candidate = {
  environment: "staging",
  runtime: "containers",
  accountId,
  workerName: "ms-realty-staging",
  sourceCommit: source,
  image: `registry.cloudflare.com/${accountId}/ms-realty-staging@sha256:${hash}`,
  origins,
  access: { serviceClientId: "synthetic.access" },
  artifacts: {
    routes: "data/legacy/migration/routes.json",
    routesSha256: hash,
    routeManifest: "data/legacy/migration/manifest.json",
    routeManifestSha256: hash,
    media: "data/legacy/migration/media.json",
    mediaSha256: hash,
  },
};

test("R07/R08 only a successful pinned staging workflow from main resolves the environment", () => {
  assert.deepEqual(validateDispatch(env, run), { source, runId: "123", attempt: 2, mode: "full" });
  for (const change of [
    { GITHUB_REF: "refs/heads/untrusted" },
    { GITHUB_REPOSITORY: "another/repository" },
    { STAGING_ENVIRONMENT_CONFIGURED: "false" },
    { STAGING_SOURCE_QUALIFIED_SHA: "c".repeat(40) },
    { EXPECTED_SOURCE: "main" },
    { DEPLOYMENT_RUN_ID: "123/../secrets" },
    { CLOUDFLARE_ACCOUNT_ID: "0".repeat(32) },
    { QUALIFICATION_MODE: "deploy" },
  ])
    assert.throws(() => validateDispatch({ ...env, ...change }, run));
  for (const change of [
    { head_sha: "c".repeat(40) },
    { conclusion: "failure" },
    { status: "in_progress" },
    { path: ".github/workflows/monitoring-drill.yml" },
    { head_branch: "main" },
    { id: 456 },
    { repository: { full_name: "another/repository" } },
    { run_attempt: 0 },
  ])
    assert.throws(() => validateDispatch(env, { ...run, ...change }));
});

test("R07/R08 production, wrong images and escaped source paths fail before credentials are used", () => {
  assert.equal(validateCandidate(candidate, source), candidate);
  for (const change of [
    { environment: "production" },
    { runtime: "opennext" },
    { workerName: "ms-realty" },
    { sourceCommit: "c".repeat(40) },
    { image: `registry.cloudflare.com/${accountId}/ms-realty-staging:latest` },
    { origins: { ...origins, public: "https://makler-realty.com" } },
  ])
    assert.throws(() => validateCandidate({ ...candidate, ...change }, source));
  for (const path of [
    "/etc/passwd",
    "data/legacy/migration/../../secret",
    "data/legacy/elsewhere.json",
  ])
    assert.throws(() =>
      validateCandidate(
        { ...candidate, artifacts: { ...candidate.artifacts, routes: path } },
        source,
      ),
    );
});

test("R07/R08 redirect targets cannot move staging credentials to another origin", () => {
  assert.equal(stagingUrl("/bg/access", origins.staff), `${origins.staff}/bg/access`);
  for (const path of [
    "https://example.test/",
    "//example.test/",
    "https://user:pass@staging.makler-realty.com/",
    "/path#fragment",
  ])
    assert.throws(() => stagingUrl(path));
  assert.throws(() => stagingUrl("/api/health", "https://makler-realty.com"));
});

test("R08 provider transport accepts ordinary default GET and rejects writes or other accounts", () => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/ms-realty-staging/settings`;
  assert.equal(validateProviderRead(url), url);
  assert.equal(validateProviderRead(url, { method: "GET" }), url);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"])
    assert.throws(() => validateProviderRead(url, { method }));
  assert.throws(() => validateProviderRead(url.replace(accountId, "0".repeat(32))));
  assert.throws(() => validateProviderRead(url.replace("api.cloudflare.com", "example.test")));
  assert.throws(() => validateProviderRead(url.replace("https://", "https://user:password@")));
});

test("R07 byte proof covers every selected object and preserves rights holds", () => {
  const media = [
    {
      host: "makler-realty.com",
      path: "/wp-content/uploads/synthetic.jpg",
      key: "makler-realty.com/wp-content/uploads/synthetic.jpg",
    },
  ];
  const proof = {
    schemaVersion: 1,
    scope: "protected_staging_source_media_byte_parity",
    productionAllowed: false,
    humanRightsApproved: false,
    publicationApproved: false,
    mediaIndexSha256: hash,
    sourceProofPlanSha256: hash,
    objects: [{ key: media[0].key, bytes: 10, sha256: hash, sourceReceiptSha256: hash }],
  };
  assert.equal(validateMediaProof(proof, media, hash).size, 1);
  for (const change of [
    { productionAllowed: true },
    { humanRightsApproved: true },
    { publicationApproved: true },
    { mediaIndexSha256: "c".repeat(64) },
    { objects: [] },
    { objects: [...proof.objects, ...proof.objects] },
  ])
    assert.throws(() => validateMediaProof({ ...proof, ...change }, media, hash));
  for (const change of [
    { key: "makler-realty.com/wp-content/uploads/another.jpg" },
    { bytes: 0 },
    { bytes: 26 * 1024 * 1024 },
    { sha256: "unknown" },
    { sourceReceiptSha256: null },
  ]) {
    const broken = copy(proof);
    Object.assign(broken.objects[0], change);
    assert.throws(() => validateMediaProof(broken, media, hash));
  }
});

test("R07 the portable proof matches the complete selected source corpus", async () => {
  const bytes = await readFile(
    new URL("../data/legacy/migration/public-media.json", import.meta.url),
  );
  const proof = JSON.parse(
    await readFile(
      new URL("../data/legacy/migration/source-media-byte-proof.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    validateMediaProof(proof, JSON.parse(bytes), createHash("sha256").update(bytes).digest("hex"))
      .size,
    JSON.parse(bytes).length,
  );
  assert(!JSON.stringify(proof).includes("/Users/"));
});

test("R08 eventual healthy responses cannot erase a failed initial access or partial sweep", () => {
  const passing = {
    initialHealth: Array.from({ length: 3 }, () => ({ passed: true })),
    before: { passed: true },
    after: { passed: true },
    routes: { passed: true },
    media: { passed: true },
    availability: { passed: true },
    anonymous: Array.from({ length: 3 }, () => ({ denied: true })),
  };
  assert.equal(qualificationPassed(passing), true);
  const failedInitial = copy(passing);
  failedInitial.initialHealth[0] = { passed: false, error: { name: "TimeoutError" } };
  assert.equal(qualificationPassed(failedInitial), false);
  for (const key of ["before", "after", "routes", "media", "availability"])
    assert.equal(qualificationPassed({ ...passing, [key]: { passed: false } }), false);
  assert.equal(qualificationPassed({ ...passing, initialHealth: [] }), false);
  assert.equal(qualificationPassed({ ...passing, anonymous: [{ denied: true }] }), false);
});

test("R07 streamed bytes stay binary-exact and oversized bodies fail", async () => {
  const bytes = Uint8Array.from([255, 216, 255, 13, 10, 0, 128]);
  assert.deepEqual(await readBoundedBody(new Response(bytes), bytes.length), Buffer.from(bytes));
  await assert.rejects(readBoundedBody(new Response(bytes), bytes.length - 1), /byte bound/);
});

test("R08 concurrent callers share the original request pacing budget", async () => {
  let now = 0;
  const waits = [];
  const pace = createPacer({
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  await Promise.all([pace(), pace(), pace()]);
  assert.deepEqual(waits, [0, protocol.pacingMs, protocol.pacingMs * 2]);
  now = 10_000;
  await pace();
  assert.equal(waits.at(-1), 0);
  assert.equal(protocol.routeDeadlineMs, 20_000);
  assert.equal(protocol.mediaHeaderDeadlineMs, 30_000);
  assert.equal(protocol.smallMediaTotalDeadlineMs, 30_000);
  assert.equal(protocol.largeMediaBodyDeadlineMs, 120_000);
});

test("R08 nested transport evidence preserves causes and redacts credentials", () => {
  const error = new Error("failed secret-value", {
    cause: Object.assign(new Error("connect secret-value"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
  });
  const result = errorEvidence(error, ["secret-value"]);
  assert.equal(result.cause.code, "UND_ERR_CONNECT_TIMEOUT");
  assert(!JSON.stringify(result).includes("secret-value"));
});

function transportFixture({ failHealth = false, exposeCases = false, externalLogin = false } = {}) {
  const calls = [];
  return {
    calls,
    fetcher: async (url, init) => {
      calls.push({ url, init });
      const target = new URL(url),
        headers = { "x-robots-tag": "noindex, nofollow" };
      assert(Object.values(origins).includes(target.origin));
      assert.equal(init.redirect, "manual");
      assert(!init.method || init.method === "GET");
      if (!init.headers["CF-Access-Client-Secret"])
        return new Response(null, {
          status: 302,
          headers: { location: "https://synthetic.cloudflareaccess.com/login" },
        });
      if (target.pathname === "/api/health") {
        if (failHealth && target.origin === origins.client)
          throw Object.assign(new Error("synthetic timeout"), { name: "TimeoutError" });
        return Response.json({ status: "ok", build: source }, { headers });
      }
      if (target.pathname === "/bg/access")
        return new Response("<main>Saved-key sign-in</main>", {
          headers: { ...headers, "content-type": "text/html" },
        });
      assert.equal(target.pathname, "/bg/cases");
      if (exposeCases) return new Response("Restricted case data", { headers });
      return new Response(null, {
        status: 307,
        headers: {
          ...headers,
          location: externalLogin ? "https://example.test/bg/access" : "/bg/access",
        },
      });
    },
  };
}

test("R08 bounded transport performs exactly eight reads and never claims a manager session or full qualification", async () => {
  const fixture = transportFixture();
  const result = await observeTransport(candidate, "synthetic-secret", fixture);
  assert.equal(result.passed, true);
  assert.equal(fixture.calls.length, 8);
  assert.equal(result.mode, "transport");
  assert.equal(result.fullQualificationPassed, false);
  assert.equal(result.managerSessionVerified, false);
  assert.equal(result.ownerAcceptance, false);
  assert.equal(result.caseSessionGate.locationPath, "/bg/access");
  assert(fixture.calls.every(({ url }) => !url.includes("/__staging/")));
});

test("R08 bounded transport retains failed health, rejects an exposed case page and refuses external login redirects", async () => {
  for (const change of [{ failHealth: true }, { exposeCases: true }, { externalLogin: true }]) {
    const fixture = transportFixture(change);
    const result = await observeTransport(candidate, "synthetic-secret", fixture);
    assert.equal(result.passed, false);
    assert.equal(fixture.calls.length, 8);
    assert.equal(result.perRequestRetries, 0);
    if (change.failHealth)
      assert.equal(result.health.find((row) => row.role === "client").error.name, "TimeoutError");
  }
});

test("R07/R08 hosted qualification holds the same staging lock and exposes only observation secrets", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/staging-http-qualification.yml", import.meta.url),
    "utf8",
  );
  assert(
    workflow.includes("group: ms-realty-staging") && workflow.includes("cancel-in-progress: false"),
  );
  assert(workflow.indexOf("needs: prerequisites") < workflow.indexOf("environment: staging"));
  assert(workflow.includes('test "$GITHUB_REF" = refs/heads/main'));
  assert(workflow.includes("if: always()") && workflow.includes("staging-http-qualification/"));
  for (const forbidden of [
    "wrangler deploy",
    "STAGING_WEB_DATABASE_URL",
    "STAGING_MIGRATOR_DATABASE_URL",
    "secrets.CLOUDFLARE_API_TOKEN",
    "contents: write",
    "actions: write",
    "id-token: write",
    "migrate --",
  ])
    assert(!workflow.includes(forbidden), forbidden);
});
