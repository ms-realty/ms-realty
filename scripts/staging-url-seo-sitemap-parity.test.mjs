import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import {
  accountId,
  auditedBaseline,
  decodeMember,
  encodeMember,
  jsonBytes,
  limits,
  normalizeVisible,
  origins,
  packageBudget,
  parseJson,
  requestPlan,
  safePath,
  sha256,
  sourceIdentity,
  urlId,
  validateExpectations,
  validatePlan,
  verifyCapture,
  zoneId,
} from "../src/release/staging-url-seo-sitemap-parity.mjs";
import {
  classifyLocation,
  collectCapture,
  loadParser,
  verifyDirectory,
} from "./staging-url-seo-sitemap-parity.mjs";

const h = (n) => String(n).repeat(64).slice(0, 64);
const git = "a".repeat(40);
const credentials = {
  clientId: "synthetic-service-client",
  clientSecret: "synthetic-secret-never-persist",
};
const proofNames = [
  "frozenInventory",
  "routeManifest",
  "sourcePages",
  "decisions",
  "exclusions",
  "sourceCaptures",
  "eligibility",
  "revisionBoundary",
  "independentReview",
  "humanDecisions",
  "providerObservation",
  "runtimeObservation",
];

async function fixture(count = 2) {
  const lock = await readFile(new URL("../package-lock.json", import.meta.url));
  const inputFiles = new Map(
    proofNames.map((name) => [
      `inputs/${name}.bin`,
      Buffer.from(`SYNTHETIC TEST ONLY: ${name}. No human review or current data authority.`),
    ]),
  );
  const context = {
    sourceCommit: git,
    sourceTree: "b".repeat(40),
    imageDigest: h(1),
    gatewayDigest: h(2),
    lockfileDigest: sha256(lock),
    routesDigest: h(3),
    sourceDataDigest: h(4),
    importDigest: h(5),
    schemaDigest: h(6),
    configDigest: h(7),
    localePolicyDigest: h(8),
    catalogPolicyDigest: h(9),
    policyRevision: "synthetic-policy",
    policyDigest: h(0),
    providerDeploymentId: "synthetic-deployment",
    workerVersionId: "synthetic-version",
  };
  const plan = {
    schemaVersion: 1,
    kind: "r07_observation_plan",
    accountId,
    zoneId,
    workerName: "ms-realty-staging",
    expectedContext: context,
    sourcePins: { application: git, releaseTools: "c".repeat(40) },
    parser: {
      name: "jsdom",
      version: parseJson(lock).packages["node_modules/jsdom"].version,
      lockfileDigest: sha256(lock),
    },
    inputs: Object.fromEntries(proofNames.map((name) => [name, `inputs/${name}.bin`])),
    files: [...inputFiles].map(([path, bytes]) => ({
      path,
      bytes: bytes.length,
      sha256: sha256(bytes),
    })),
    currentDelta: "recorded",
    urls: [],
    sitemapPaths: ["/sitemap.xml"],
  };
  const revision = {
    snapshotId: "synthetic-snapshot",
    startSequence: "synthetic-42",
    endSequence: "synthetic-42",
  };
  const expectations = {
    schemaVersion: 1,
    kind: "r07_expected_state",
    planSha256: h(0),
    context,
    provenanceRef: plan.inputs.independentReview,
    eligibilityRef: plan.inputs.eligibility,
    revisionBoundaryRef: plan.inputs.revisionBoundary,
    revision,
    urls: [],
    sitemap: { state: "recorded", entries: [] },
  };
  for (let i = 0; i < count; i++) {
    const url = `https://makler-realty.com/bg/example-${i}`;
    const id = urlId(url);
    plan.urls.push({
      id,
      sourceUrl: url,
      normalizedId: sourceIdentity(url).id,
      groups: ["frozen", "snapshot"],
      pendingSource: false,
      capture: true,
      exclusionReason: null,
      followPath: null,
    });
    const alternates = [
      { locale: "bg", url },
      { locale: "x-default", url },
    ];
    expectations.urls.push({
      id,
      state: "recorded",
      disposition: {
        status: 200,
        targetUrl: url,
        rationale: "Synthetic expected preservation",
        provenanceRef: plan.inputs.decisions,
      },
      canonical: url,
      locale: "bg",
      eligibility: "eligible",
      eligibilityRef: plan.inputs.eligibility,
      revision: {
        snapshotId: revision.snapshotId,
        publication: h(1),
        facts: h(2),
        terms: h(3),
        localized: null,
        cms: null,
        source: h(4),
      },
      title: { state: "value", value: `Example ${i}` },
      description: { state: "absent" },
      alternates,
      jsonLd: [{ "@context": "https://schema.org", "@type": "WebPage", name: `Example ${i}` }],
      visible: {
        selector: "main",
        textSha256: sha256(normalizeVisible(`Example ${i} Price unknown`)),
      },
    });
    expectations.sitemap.entries.push({ url, lastmod: null, alternates });
  }
  const observed = {
    schemaVersion: 1,
    kind: "r07_unverified_observed_identity",
    context,
    providerObservationRef: plan.inputs.providerObservation,
    runtimeObservationRef: plan.inputs.runtimeObservation,
    revisionBoundaryRef: plan.inputs.revisionBoundary,
    revision,
  };
  return { plan, expectations, observed, inputFiles };
}
const escapeHtml = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const stage = (url) => origins.public + new URL(url).pathname + new URL(url).search;
function html(row) {
  return `<!doctype html><html lang="${row.locale}"><head><title>${escapeHtml(row.title.value ?? "")}</title>${row.description.state === "value" ? `<meta name="description" content="${escapeHtml(row.description.value)}">` : ""}<meta name="robots" content="noindex,nofollow"><link rel="canonical" href="${escapeHtml(stage(row.canonical))}">${(row.alternates ?? []).map((a) => `<link rel="alternate" hreflang="${a.locale}" href="${escapeHtml(stage(a.url))}">`).join("")}${(row.jsonLd ?? []).map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("")}</head><body><main>${escapeHtml(row.title.value)} Price unknown</main></body></html>`;
}
function sitemap(entries) {
  return `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.map((r) => `<url><loc>${escapeHtml(stage(r.url))}</loc>${r.lastmod ? `<lastmod>${r.lastmod}</lastmod>` : ""}${r.alternates.map((a) => `<xhtml:link rel="alternate" hreflang="${a.locale}" href="${escapeHtml(stage(a.url))}"/>`).join("")}</url>`).join("")}</urlset>`;
}
function response(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      "x-robots-tag": "noindex, nofollow",
      "content-type": "text/html; charset=utf-8",
      ...extra,
    },
  });
}
function transportFor(f, mutate, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    const requestPath = new URL(url).pathname + new URL(url).search;
    if (mutate) {
      const changed = await mutate(url, init, f);
      if (changed !== undefined) return changed;
    }
    if (init.method === "HEAD")
      return response(null, init.headers["CF-Access-Client-Secret"] ? 200 : 403);
    if (requestPath === "/robots.txt")
      return response("User-Agent: *\nDisallow: /\n", 200, { "content-type": "text/plain" });
    if (requestPath === "/sitemap.xml")
      return response(sitemap(f.expectations.sitemap.entries), 200, {
        "content-type": "application/xml",
      });
    const input = f.plan.urls.find(
      (r) =>
        new URL(r.sourceUrl).pathname + new URL(r.sourceUrl).search === requestPath &&
        new URL(r.sourceUrl).hostname ===
          (init.headers["x-msr-legacy-host"] ?? "makler-realty.com"),
    );
    const row = input
      ? f.expectations.urls.find((r) => r.id === input.id)
      : f.expectations.urls.find((r) => new URL(r.canonical).pathname === requestPath);
    assert(row, `Unknown synthetic route: ${requestPath}`);
    if (input && row.disposition?.status === 301)
      return response("", 301, { location: origins.public + input.followPath });
    if (row.disposition?.status === 410) return response("Gone", 410);
    return response(html(row));
  };
}
async function run(t, f, mutate, options = {}) {
  const parent = await mkdtemp(resolve(process.env.MSR_PARITY_TEST_TMP ?? tmpdir(), "r07-parity-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const outputDir = resolve(parent, "capture");
  f.expectations.planSha256 = sha256(jsonBytes(f.plan));
  const calls = [];
  const report = await collectCapture({
    planBytes: jsonBytes(f.plan),
    expectationBytes: jsonBytes(f.expectations),
    inputFiles: f.inputFiles,
    observedBytes: jsonBytes(f.observed),
    outputDir,
    credentials,
    transport: transportFor(f, mutate, calls),
    testTiming: { pacingMs: 0, requestMs: 1000, captureMs: 120_000 },
    ...options,
  });
  return { report, outputDir, calls, parent };
}
const failed = (report, id) => report.checks.some((c) => c.id === id && c.status === "FAIL");
const blocked = (report, id) => report.checks.some((c) => c.id === id && c.status === "BLOCKED");
async function readCapture(outputDir) {
  const supportingFiles = JSON.parse(await readFile(resolve(outputDir, "supporting-files.json")));
  const files = new Map();
  for (const f of supportingFiles.filter((r) => r.path !== "staging-url-seo-sitemap-parity.json"))
    files.set(f.path, await readFile(resolve(outputDir, f.path)));
  return {
    files,
    supportingFiles: supportingFiles.filter(
      (r) => r.path !== "staging-url-seo-sitemap-parity.json",
    ),
  };
}
const references = (files) =>
  [...files].map(([path, bytes]) => ({ path, sha256: sha256(bytes), bytes: bytes.length }));
function rewriteMember(files, id, change) {
  const index = parseJson(files.get("raw-index.json")),
    chunks = [],
    failures = [];
  let offset = 0;
  for (const entry of index.members) {
    const record = decodeMember(
      files.get(entry.shard).subarray(entry.offset, entry.offset + entry.length),
    );
    if (entry.id === id) change(record.metadata);
    if (record.metadata.failure) failures.push({ id: entry.id, code: record.metadata.failure });
    const bytes = encodeMember(record.metadata, record.body);
    chunks.push(bytes);
    Object.assign(entry, {
      shard: "raw-0000.bin",
      offset,
      length: bytes.length,
      sha256: sha256(bytes),
    });
    offset += bytes.length;
  }
  for (const name of files.keys()) if (/^raw-\d+\.bin$/.test(name)) files.delete(name);
  files.set("raw-0000.bin", Buffer.concat(chunks));
  files.set("raw-index.json", jsonBytes(index));
  files.set("failure-journal.json", jsonBytes(failures));
  files.set("failure-events.jsonl", Buffer.concat(failures.map(jsonBytes)));
}
async function writeEnvelope(directory, input, report) {
  const files = new Map(input);
  files.set("staging-url-seo-sitemap-parity.json", jsonBytes(report));
  await mkdir(directory);
  for (const [name, bytes] of files) {
    await mkdir(dirname(resolve(directory, name)), { recursive: true });
    await writeFile(resolve(directory, name), bytes, { flag: "wx" });
  }
  await writeFile(resolve(directory, "supporting-files.json"), jsonBytes(references(files)), {
    flag: "wx",
  });
}

test("R07 mechanical parity passes with independent synthetic expectations; no authority is granted", async (t) => {
  const f = await fixture();
  const { report, outputDir, calls } = await run(t, f);
  assert.equal(
    report.technicalStatus,
    "PASS",
    JSON.stringify(report.checks.filter((c) => c.status !== "PASS")),
  );
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.captureComplete, true);
  assert.equal(report.evidenceClass, "test");
  assert.equal(report.completeUniverseProven, false);
  for (const key of [
    "productionQualified",
    "publicationApproved",
    "humanApproval",
    "cutoverAuthorized",
    "gateCompletion",
    "identityAuthenticated",
    "eligibilityAuthenticated",
    "revisionCoherenceProven",
    "evidenceClassAuthenticated",
    "producerSourcesAuthenticated",
  ])
    assert.equal(report[key], false);
  assert.deepEqual(await verifyDirectory(outputDir), report);
  const offlineOutput = resolve(outputDir, "..", "offline.json");
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          "scripts/staging-url-seo-sitemap-parity.mjs",
          "verify",
          "--capture",
          outputDir,
          "--output",
          offlineOutput,
        ],
        { stdio: "pipe" },
      ),
    (error) => error.status === 2 && error.stdout.toString().includes('"status":"BLOCKED"'),
  );
  assert.deepEqual(JSON.parse(await readFile(offlineOutput)), report);
  const manifest = JSON.parse(await readFile(resolve(outputDir, "supporting-files.json")));
  const manifestBytes = (await readFile(resolve(outputDir, "supporting-files.json"))).length;
  assert.equal(
    report.package.totalBytes,
    manifest.reduce((sum, f) => sum + f.bytes, manifestBytes),
  );
  assert.equal(report.package.entries, manifest.length + 1);
  assert(
    calls.every(
      (c) =>
        ["GET", "HEAD"].includes(c.init.method) &&
        c.init.redirect === "manual" &&
        Object.values(origins).includes(new URL(c.url).origin),
    ),
  );
  assert(
    calls
      .filter((c) => !c.init.headers["CF-Access-Client-Secret"])
      .every((c) => c.init.method === "HEAD"),
  );
  assert.equal(report.auditedBaseline.pendingSnapshots, 1257);
});

test("AT57 contracts reject missing, duplicate, conflicting and misidentified spellings", async () => {
  const f = await fixture();
  const cases = [
    (p) => p.urls.push(structuredClone(p.urls[0])),
    (p) => {
      p.urls[0].normalizedId = "1".repeat(24);
    },
    (p) => {
      p.urls[0].id = "wrong";
    },
    (p) => {
      p.urls[0].capture = false;
    },
    (p) => {
      p.inputs.decisions = "inputs/missing.bin";
    },
    (p) => {
      p.approved = true;
    },
    (p) => {
      p.expectedContext.reviewer = "Ivan";
    },
  ];
  for (const mutate of cases) {
    const p = structuredClone(f.plan);
    mutate(p);
    assert.throws(() => validatePlan(p));
  }
  f.expectations.planSha256 = sha256(jsonBytes(f.plan));
  const p = validatePlan(f.plan);
  for (const mutate of [
    (e) => e.urls.pop(),
    (e) => e.urls.push(e.urls[0]),
    (e) => {
      e.provenanceRef = "inputs/absent.bin";
    },
    (e) => {
      e.context = { ...e.context, policyDigest: h(2) };
    },
    (e) => {
      e.urls[0].approved = true;
    },
  ]) {
    const e = structuredClone(f.expectations);
    mutate(e);
    assert.throws(() => validateExpectations(e, p, sha256(jsonBytes(f.plan))));
  }
  const conflict = structuredClone(f.plan);
  const row = {
    ...conflict.urls[0],
    sourceUrl: conflict.urls[0].sourceUrl.replace("/example", "/%65xample"),
    followPath: "/other",
  };
  row.id = urlId(row.sourceUrl);
  row.normalizedId = sourceIdentity(row.sourceUrl).id;
  conflict.urls.push(row);
  assert.throws(() => validatePlan(conflict), /conflicting_url_mapping/);
  assert(Object.isFrozen(p.urls[0]));
});

test("AT57 one-hop redirect is compared against its explicit target; off-origin and chains never receive credentials", async (t) => {
  const f = await fixture(1);
  const original = f.plan.urls[0];
  const old = "https://makler-realty.ru/old";
  f.plan.urls[0] = {
    ...original,
    sourceUrl: old,
    id: urlId(old),
    normalizedId: sourceIdentity(old).id,
    followPath: "/bg/example-0",
  };
  f.expectations.urls[0].id = urlId(old);
  f.expectations.urls[0].disposition.status = 301;
  // The canonical target must also be independently observed for reciprocal links.
  f.plan.urls.push(original);
  f.expectations.urls.push({
    ...structuredClone(f.expectations.urls[0]),
    id: original.id,
    disposition: { ...f.expectations.urls[0].disposition, status: 200 },
  });
  const good = await run(t, f);
  assert.equal(good.report.technicalStatus, "PASS");
  for (const location of [
    "https://evil.example/leak?access_token=do-not-retain",
    "https://staging-my.makler-realty.com/",
    "/other",
    "/bg/example-0?access_token=do-not-retain",
  ]) {
    const bad = await run(t, f, (url) =>
      url.endsWith("/old") ? response("", 301, { location }) : undefined,
    );
    assert.equal(bad.report.status, "FAIL");
    assert.equal(
      bad.calls.filter((c) => c.init.headers["x-msr-legacy-host"] === "makler-realty.ru").length,
      1,
    );
    assert(
      !bad.calls.some((c) => c.url.includes("evil.example") || c.url.includes("access_token")),
    );
  }
  const chain = await run(t, f, (url, init) =>
    url.endsWith("/bg/example-0") && !init.headers["x-msr-legacy-host"]
      ? response("", 301, { location: "/bg/example-1" })
      : undefined,
  );
  assert(failed(chain.report, "one_hop_final_200"));
});

test("R07 preserves useful complete capture while pending equivalence, exclusions and unsupported retained ru block parity", async (t) => {
  const f = await fixture(2);
  f.plan.currentDelta = "pending";
  f.plan.urls[0].pendingSource = true;
  f.expectations.urls[0].state = "pending";
  f.plan.urls[1].capture = false;
  f.plan.urls[1].exclusionReason = "Source unresolved";
  const { report } = await run(t, f);
  assert.equal(report.captureComplete, true);
  assert.equal(report.technicalStatus, "BLOCKED");
  assert.equal(report.coverage.pendingSnapshotReviews, 1);
  assert.equal(report.coverage.exclusions.length, 1);
  assert(blocked(report, "current_delta_pending"));
  assert(blocked(report, "excluded_or_unresolved_sources"));
  const ru = await fixture(1),
    url = "https://makler-realty.ru/bg/example-0";
  ru.plan.urls[0] = {
    ...ru.plan.urls[0],
    sourceUrl: url,
    id: urlId(url),
    normalizedId: sourceIdentity(url).id,
  };
  ru.expectations.urls[0].id = urlId(url);
  const capture = await run(t, ru);
  assert(blocked(capture.report, "retained_ru_200_unsupported"));
  assert.equal(
    capture.calls.some(
      (c) => c.url.endsWith("/bg/example-0") && !c.init.headers["x-msr-legacy-host"],
    ),
    false,
  );
  assert.deepEqual(capture.report.auditedBaseline, auditedBaseline);
});

test("AT57 keeps encoded exact spellings and permitted query bytes without silent normalization", async (t) => {
  const f = await fixture(1);
  const base = f.plan.urls[0],
    copy = structuredClone(f.expectations.urls[0]);
  const url = base.sourceUrl.replace("example", "%65xample");
  const extra = { ...base, sourceUrl: url, id: urlId(url) };
  f.plan.urls.push(extra);
  copy.id = extra.id;
  f.expectations.urls.push(copy);
  const capture = await run(t, f, (url) =>
    url.includes("%65xample") ? response(html(copy)) : undefined,
  );
  assert.equal(capture.report.coverage.plannedExactSpellings, 2);
  assert.equal(capture.report.coverage.plannedNormalized, 1);
  assert(capture.calls.some((c) => c.url.includes("%65xample")));
  assert.equal(
    safePath("/bg/query?paged=2&s=%D0%B4%D0%BE%D0%BC%2Bstone&lang=bg"),
    "/bg/query?paged=2&s=%D0%B4%D0%BE%D0%BC%2Bstone&lang=bg",
  );
  for (const path of [
    "//evil.example",
    "/a/../b",
    "/a/%2e%2e/b",
    "/%252e%252e/b",
    "/a\\b",
    "/api/send",
    "/__staging/runtime",
    "/bg?access_token=secret",
    "/bg?%63ookie=secret",
    "/bg#x",
    "/bg\n",
  ])
    assert.throws(() => safePath(path));
});

test("AT27 wrong metadata, JSON-LD, visible facts, canonical, language or reciprocal eligibility fails", async (t) => {
  const f = await fixture(1);
  const original = html(f.expectations.urls[0]);
  const cases = [
    [original.replace("<title>Example 0</title>", ""), "title_exact_presence"],
    [
      original.replace("</head>", '<meta name="description" content="invented"></head>'),
      "description_exact_presence",
    ],
    [original.replace('"@type":"WebPage"', '"@type":"Offer","price":0'), "jsonld_exact_projection"],
    [original.replace("Price unknown", "Price 0"), "visible_exact_projection"],
    [
      original.replace(
        'rel="canonical" href="https://staging.makler-realty.com/bg/example-0"',
        'rel="canonical" href="https://makler-realty.com/bg/example-0"',
      ),
      "staging_canonical_transform",
    ],
    [original.replace('lang="bg"', 'lang="ru"'), "html_locale"],
    [original.replace('hreflang="bg"', 'hreflang="en"'), "exact_hreflang_set"],
    [
      original.replace('content="noindex,nofollow"', 'content="index,follow"'),
      "html_noindex_contradiction",
    ],
  ];
  for (const [body, id] of cases) {
    const { report } = await run(t, f, (url) =>
      url.endsWith("/bg/example-0") ? response(body) : undefined,
    );
    assert(failed(report, id), id);
  }
  const present = await fixture(1);
  present.expectations.urls[0].description = { state: "value", value: "Recorded description" };
  const lost = await run(t, present, (url) =>
    url.endsWith("/bg/example-0") ? response(original) : undefined,
  );
  assert(failed(lost.report, "description_exact_presence"));
});

test("AT27 zero eligible pages preserve holds without positive clearance; stale and revision drift block or fail", async (t) => {
  const f = await fixture(1);
  f.expectations.urls[0].eligibility = "held";
  f.expectations.urls[0].alternates = [];
  f.expectations.sitemap.entries = [];
  const held = await run(t, f);
  assert.equal(held.report.technicalStatus, "BLOCKED");
  assert(blocked(held.report, "positive_eligible_coverage_unobserved"));
  assert(!held.report.checks.some((c) => c.status === "FAIL"));
  for (const state of [
    "stale",
    "fallback",
    "withdrawn",
    "unavailable",
    "expired",
    "restricted",
    "superseded",
  ]) {
    const f = await fixture(1);
    f.expectations.urls[0].eligibility = state;
    const bad = await run(t, f);
    assert(failed(bad.report, "held_edition_excluded"));
    if (state === "stale") assert(blocked(bad.report, "eligibility_or_revision_pending"));
  }
  const drift = await fixture(1);
  drift.observed.revision = { ...drift.observed.revision, endSequence: "synthetic-43" };
  assert(failed((await run(t, drift)).report, "revision_boundary_claim_consistency"));
  const wrong = await fixture(1);
  wrong.observed.context = { ...wrong.observed.context, imageDigest: h(2) };
  assert(failed((await run(t, wrong)).report, "expected_observed_identity_bytes"));
});

test("AT27 sitemap exact membership, duplicates, lastmod, robots and bounded parts are checked", async (t) => {
  const f = await fixture(1);
  for (const bad of [
    sitemap([]),
    sitemap([...f.expectations.sitemap.entries, ...f.expectations.sitemap.entries]),
    sitemap([{ ...f.expectations.sitemap.entries[0], lastmod: "wrong-revision" }]),
  ]) {
    const { report } = await run(t, f, (url) =>
      url.endsWith("/sitemap.xml") ? response(bad) : undefined,
    );
    assert(failed(report, "sitemap_exact_entries"));
  }
  const robots = await run(t, f, (url) =>
    url.endsWith("/robots.txt") ? response("User-agent: *\nAllow: /\n") : undefined,
  );
  assert(failed(robots.report, "robots_staging_disallow"));
  f.plan.sitemapPaths.push("/sitemap/part.xml");
  const indexXml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origins.public}/sitemap/part.xml</loc></sitemap></sitemapindex>`;
  const parts = await run(t, f, (url) =>
    url.endsWith("/sitemap.xml")
      ? response(indexXml)
      : url.endsWith("/sitemap/part.xml")
        ? response(sitemap(f.expectations.sitemap.entries))
        : undefined,
  );
  assert.equal(parts.report.technicalStatus, "PASS");
  const hostile = await run(t, f, (url) =>
    url.endsWith("/sitemap.xml")
      ? response(indexXml.replace(origins.public, "https://evil.example"))
      : url.endsWith("/sitemap/part.xml")
        ? response(sitemap(f.expectations.sitemap.entries))
        : undefined,
  );
  assert(failed(hostile.report, "sitemap_parts_exact"));
  assert(!hostile.calls.some((c) => c.url.includes("evil.example")));
});

test("R07 no page scripts, XML entities, remote resources or JSON-LD contexts execute", async (t) => {
  const f = await fixture(1);
  f.expectations.urls[0].jsonLd[0]["@context"] = "https://unreachable.invalid/context";
  const { report, calls } = await run(t, f, (url) =>
    url.endsWith("/bg/example-0")
      ? response(
          html(f.expectations.urls[0])
            .replace(
              "</head>",
              '<script>throw new Error("must not execute")</script><script src="https://unreachable.invalid/script"></script></head>',
            )
            .replace("</body>", "<svg><title>Accessible icon</title></svg></body>"),
        )
      : undefined,
  );
  assert.equal(report.technicalStatus, "PASS");
  assert(calls.every((c) => new URL(c.url).hostname.endsWith("makler-realty.com")));
  const entity = await run(t, f, (url) =>
    url.endsWith("/sitemap.xml")
      ? response(
          '<!DOCTYPE foo [<!ENTITY x SYSTEM "https://unreachable.invalid">]><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">&x;</urlset>',
        )
      : undefined,
  );
  assert(failed(entity.report, "sitemap_parse_or_capture"));
});

test("R07 credentials, cookies and Access challenge queries never survive capture or exceptions", async (t) => {
  const f = await fixture(1);
  const token = "challenge-value-do-not-retain";
  const { report, outputDir, calls } = await run(t, f, (url, init) => {
    if (!init.headers["CF-Access-Client-Secret"])
      return response(null, 302, {
        location: `https://example.cloudflareaccess.com/cdn-cgi/access/login/staging?token=${token}`,
        "set-cookie": `CF_Authorization=${token}`,
      });
    if (url.endsWith("/bg/example-0"))
      return response(`${html(f.expectations.urls[0])} ${credentials.clientSecret}`, 200, {
        "set-cookie": `session=${token}`,
        authorization: credentials.clientSecret,
      });
    return undefined;
  });
  assert.equal(report.captureComplete, false);
  assert(blocked(report, "incomplete_response"));
  assert(!calls.some((c) => c.url.includes("cloudflareaccess")));
  const capture = await readCapture(outputDir);
  for (const bytes of capture.files.values())
    for (const secret of [credentials.clientId, credentials.clientSecret, token])
      assert(!bytes.includes(Buffer.from(secret)));
  const thrown = await run(t, f, (url) => {
    if (url.endsWith("/bg/example-0"))
      throw new Error(`Bearer ${credentials.clientSecret}; cookie=${token}`);
  });
  for (const bytes of (await readCapture(thrown.outputDir)).files.values())
    assert(
      !bytes.includes(Buffer.from(token)) && !bytes.includes(Buffer.from(credentials.clientSecret)),
    );
  assert.equal(
    classifyLocation(
      `https://example.cloudflareaccess.com/cdn-cgi/access/login/x?token=${token}`,
      origins.public,
    ).value,
    null,
  );
});

test("R07 timeout, truncation, body/header bounds and denied Access keep failed partial receipts", async (t) => {
  const f = await fixture(1);
  const variants = [
    () => response("short", 200, { "content-length": "999" }),
    () => response("x".repeat(limits.htmlBytes + 1)),
    () => response("x", 200, { "x-extra": "x".repeat(limits.headerBytes + 1) }),
    () => response("Private login form", 403),
    () => new Promise(() => {}),
    () =>
      response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.from("partial body"));
          },
        }),
      ),
  ];
  for (const [variant, makeResponse] of variants.entries()) {
    const { report, outputDir } = await run(
      t,
      f,
      (url) => (url.endsWith("/bg/example-0") ? makeResponse() : undefined),
      { testTiming: { pacingMs: 0, requestMs: 40, captureMs: 5000 } },
    );
    assert.equal(report.captureComplete, false);
    const files = (await readCapture(outputDir)).files,
      index = parseJson(files.get("raw-index.json"));
    const member = index.members.find((m) => m.id === f.plan.urls[0].id);
    const decoded = decodeMember(
      files.get(member.shard).subarray(member.offset, member.offset + member.length),
    );
    assert.equal(decoded.metadata.fullResponseSha256, null);
    assert(decoded.metadata.failure);
    if (variant === variants.length - 1) assert.equal(decoded.body.toString(), "partial body");
    assert(parseJson(files.get("failure-journal.json")).length > 0);
  }
  const never = await run(t, f, undefined, {
    transport: async () => {
      throw new Error("network unavailable");
    },
  });
  assert.equal(never.report.captureComplete, false);
  assert.notEqual(never.report.status, "PASS");
});

test("R10 offline verifier rejects wrong hashes, missing/undeclared shards, internal lengths and failure journal tampering", async (t) => {
  const f = await fixture(1),
    { outputDir } = await run(t, f);
  const base = await readCapture(outputDir),
    JSDOM = await loadParser(f.plan);
  const verify = (files, refs = base.supportingFiles) =>
    verifyCapture({ files, supportingFiles: refs, JSDOM });
  const shard = [...base.files.keys()].find((p) => p.endsWith(".bin") && p.startsWith("raw-"));
  const missing = new Map(base.files);
  missing.delete(shard);
  assert(failed(verify(missing), "capture_contract_or_integrity"));
  const undeclared = new Map(base.files);
  undeclared.set("raw-9999.bin", Buffer.from("extra"));
  assert(failed(verify(undeclared), "capture_contract_or_integrity"));
  const corrupt = new Map(base.files),
    bad = Buffer.from(corrupt.get(shard));
  bad[bad.length - 1] ^= 1;
  corrupt.set(shard, bad);
  const revisedRefs = base.supportingFiles.map((r) =>
    r.path === shard ? { ...r, sha256: sha256(bad) } : r,
  );
  assert.equal(verify(corrupt, revisedRefs).integrityError, "member_hash_mismatch");
  const missingJournal = new Map(base.files),
    journal = jsonBytes([{ id: f.plan.urls[0].id, code: "transport_failure" }]);
  missingJournal.set("failure-journal.json", journal);
  const journalRefs = base.supportingFiles.map((r) =>
    r.path === "failure-journal.json"
      ? { ...r, sha256: sha256(journal), bytes: journal.length }
      : r,
  );
  assert.equal(verify(missingJournal, journalRefs).integrityError, "failure_event_reconciliation");
  const encoded = encodeMember({ id: "test" }, Buffer.from("body"));
  encoded.writeUInt32BE(3, 4);
  assert.throws(() => decodeMember(encoded), /member_length_mismatch/);
  await writeFile(resolve(outputDir, "raw-9999.bin"), "undeclared");
  await assert.rejects(verifyDirectory(outputDir), /undeclared_capture_file/);
  await rm(resolve(outputDir, "raw-9999.bin"));
  await writeFile(resolve(outputDir, shard), bad);
  await assert.rejects(verifyDirectory(outputDir), /supporting_file_hash_mismatch/);
});

test("R07 captures 1257 pending snapshots in deterministic bounded shards without per-response R10 entries", async (t) => {
  const f = await fixture(1257);
  for (const e of f.expectations.urls) e.state = "pending";
  f.plan.currentDelta = "pending";
  const { report, outputDir } = await run(t, f);
  assert.equal(report.captureComplete, true);
  assert.equal(report.coverage.pendingSnapshotReviews, 1257);
  assert.equal(report.technicalStatus, "BLOCKED");
  const files = (await readCapture(outputDir)).files;
  const raw = [...files].filter(([name]) => /^raw-\d+\.bin$/.test(name));
  assert(raw.length > 0 && raw.length < 1024);
  assert(raw.every(([, bytes]) => bytes.length <= limits.shardBytes));
  assert.equal(parseJson(files.get("raw-index.json")).members.length, requestPlan(f.plan).length);
  assert.equal((await verifyDirectory(outputDir)).captureComplete, true);
});

test("R10 package excess never raises limits or drops captured bytes", () => {
  const tooMany = new Map(
    Array.from({ length: 1025 }, (_, i) => [`raw-${i}.bin`, Buffer.alloc(0)]),
  );
  assert(packageBudget(tooMany).violations.includes("r10_entry_limit"));
  assert(
    packageBudget(new Map([["raw.bin", Buffer.alloc(limits.fileBytes + 1)]])).violations.includes(
      "r10_file_limit",
    ),
  );
  assert(
    packageBudget(
      new Map([["parsed.json", Buffer.alloc(limits.jsonBytes + 1)]]),
    ).violations.includes("r10_json_limit"),
  );
  // Shared bytes avoid allocating 272 MiB just to test the complete-package sum.
  const bytes = Buffer.alloc(limits.fileBytes),
    payload = new Map(Array.from({ length: 17 }, (_, i) => [`part-${i}.bin`, bytes]));
  assert(packageBudget(payload).violations.includes("r10_payload_limit"));
  assert.equal(packageBudget(payload).packageAdmission, false);
  assert.equal(payload.size, 17);
  assert.equal(limits.entries, 1024);
});

test("R10 oversized packaging input preserves the entire capture and blocks admission", async (t) => {
  const f = await fixture(1),
    bytes = Buffer.alloc(limits.fileBytes + 1);
  f.inputFiles.set("inputs/oversize.bin", bytes);
  f.plan.files.push({ path: "inputs/oversize.bin", bytes: bytes.length, sha256: sha256(bytes) });
  const { report, outputDir } = await run(t, f);
  assert.equal(report.captureComplete, true);
  assert.equal(report.technicalStatus, "BLOCKED");
  assert(blocked(report, "r10_file_limit"));
  assert.equal(report.package.packageAdmission, false);
  assert.equal((await readFile(resolve(outputDir, "inputs/oversize.bin"))).length, bytes.length);
  assert.equal((await verifyDirectory(outputDir)).captureComplete, true);
});

test("R07 anonymous bypass, missing response noindex and an ineligible alternate fail", async (t) => {
  const f = await fixture(1);
  const bypass = await run(t, f, (_url, init) =>
    !init.headers["CF-Access-Client-Secret"] ? response(null, 200) : undefined,
  );
  assert(failed(bypass.report, "protected_noindex"));
  const missingNoindex = await run(t, f, (url) => {
    if (!url.endsWith("/bg/example-0")) return undefined;
    const r = response(html(f.expectations.urls[0]));
    r.headers.delete("x-robots-tag");
    return r;
  });
  assert(failed(missingNoindex.report, "response_noindex"));
  f.expectations.urls[0].alternates.push({
    locale: "en",
    url: "https://makler-realty.com/en/held",
  });
  const ineligible = await run(t, f);
  assert(failed(ineligible.report, "hreflang_eligible_reciprocal"));
});

test("R07 immutable output refuses overwrite; invalid caller approvals retain only a safe failure", async (t) => {
  const f = await fixture(1),
    result = await run(t, f);
  const before = await readFile(resolve(result.outputDir, "staging-url-seo-sitemap-parity.json"));
  await assert.rejects(collectCapture({ outputDir: result.outputDir }));
  assert.deepEqual(
    await readFile(resolve(result.outputDir, "staging-url-seo-sitemap-parity.json")),
    before,
  );
  const out = resolve(result.parent, "invalid");
  await assert.rejects(
    collectCapture({
      planBytes: jsonBytes({ ...f.plan, approved: true, secret: credentials.clientSecret }),
      expectationBytes: jsonBytes(f.expectations),
      outputDir: out,
      transport: () => assert.fail("must not request"),
    }),
    /capture_setup_or_persistence_failed/,
  );
  for (const name of await readdir(out))
    assert(!(await readFile(resolve(out, name))).includes(Buffer.from(credentials.clientSecret)));
});

test("R07 F1 excludes an explicitly hidden selected element or ancestor from the DOM text projection", async (t) => {
  const f = await fixture(1),
    original = html(f.expectations.urls[0]);
  for (const body of [
    original.replace("<main>", "<main hidden>"),
    original.replace("<main>", '<main aria-hidden="true">'),
    original
      .replace("<main>", '<section aria-hidden="true"><main>')
      .replace("</main>", "</main></section>"),
    original.replace("<body>", "<body hidden>"),
    original
      .replace("<main>", '<section aria-hidden="TRUE"><main aria-hidden="false">')
      .replace("</main>", "</main></section>"),
  ]) {
    const { report } = await run(t, f, (url) =>
      url.endsWith("/bg/example-0") ? response(body) : undefined,
    );
    assert(failed(report, "visible_exact_projection"));
    assert.equal(report.technicalStatus, "FAIL");
    assert.equal(report.captureComplete, true);
  }
  const visible = original.replace(
    "Example 0 Price unknown</main>",
    'Example 0 Price unknown<span hidden>not visible</span><span aria-hidden="TRUE">also hidden</span></main>',
  );
  const good = await run(t, f, (url) =>
    url.endsWith("/bg/example-0") ? response(visible) : undefined,
  );
  assert.equal(good.report.technicalStatus, "PASS");
});

test("R07 F2 requires both nonempty producer source files even with a refreshed unsigned inventory", async (t) => {
  const f = await fixture(1),
    capture = await run(t, f),
    JSDOM = await loadParser(f.plan);
  for (const [index, names] of [
    ["collector-source.mjs"],
    ["verifier-source.mjs"],
    ["collector-source.mjs", "verifier-source.mjs"],
  ].entries()) {
    const { files } = await readCapture(capture.outputDir);
    for (const name of names) files.delete(name);
    const report = verifyCapture({ files, supportingFiles: references(files), JSDOM });
    assert.equal(report.integrityError, "missing_producer_source");
    assert.equal(report.technicalStatus, "FAIL");
    const directory = resolve(capture.parent, `missing-source-${index}`);
    await writeEnvelope(directory, files, report);
    assert.equal((await verifyDirectory(directory)).integrityError, "missing_producer_source");
  }
  const { files } = await readCapture(capture.outputDir);
  files.set("collector-source.mjs", Buffer.alloc(0));
  assert.equal(
    verifyCapture({ files, supportingFiles: references(files), JSDOM }).integrityError,
    "missing_producer_source",
  );
  assert.equal(capture.report.producerSourcesAuthenticated, false);
});

test("R07 F3 enforces physical received/retained counters through pure and public offline verification", async (t) => {
  const f = await fixture(1),
    capture = await run(t, f),
    JSDOM = await loadParser(f.plan);
  const cases = [
    {
      id: f.plan.urls[0].id,
      error: "complete_body_byte_counts",
      mutate: (m) => {
        m.receivedBytes = 0;
      },
    },
    {
      id: f.plan.urls[0].id,
      error: "complete_body_byte_counts",
      mutate: (m) => {
        m.receivedBytes = m.retainedBytes - 1;
      },
    },
    {
      id: f.plan.urls[0].id,
      error: "complete_body_byte_counts",
      mutate: (m) => {
        m.receivedBytes = m.retainedBytes + 1;
      },
    },
    {
      id: f.plan.urls[0].id,
      error: "partial_body_byte_counts",
      mutate: (m) => {
        m.bodyState = "partial";
        m.fullResponseSha256 = null;
        m.failure = "truncated_body";
        m.receivedBytes = m.retainedBytes - 1;
      },
    },
    {
      id: f.plan.urls[0].id,
      error: "redacted_body_byte_counts",
      mutate: (m) => {
        m.bodyState = "redacted";
        m.fullResponseSha256 = null;
        m.failure = "body_credentials_redacted";
        m.receivedBytes = 0;
      },
    },
    {
      id: f.plan.urls[0].id,
      error: "omitted_body_byte_counts",
      mutate: (m) => {
        m.bodyState = "omitted";
        m.fullResponseSha256 = null;
        m.failure = "access_denied";
      },
    },
    {
      id: "anonymous:public",
      error: "head_body_byte_counts",
      mutate: (m) => {
        m.receivedBytes = 1;
      },
    },
  ];
  for (const [index, c] of cases.entries()) {
    const { files } = await readCapture(capture.outputDir);
    rewriteMember(files, c.id, c.mutate);
    const report = verifyCapture({ files, supportingFiles: references(files), JSDOM });
    assert.equal(report.integrityError, c.error);
    const directory = resolve(capture.parent, `byte-counters-${index}`);
    await writeEnvelope(directory, files, report);
    assert.equal((await verifyDirectory(directory)).integrityError, c.error);
  }
  const expanded = await run(
    t,
    f,
    (url) =>
      url.endsWith("/bg/example-0") ? response(`${html(f.expectations.urls[0])}r7!`) : undefined,
    { credentials: { ...credentials, clientSecret: "r7!" } },
  );
  const expandedFiles = (await readCapture(expanded.outputDir)).files;
  const index = parseJson(expandedFiles.get("raw-index.json")),
    entry = index.members.find((r) => r.id === f.plan.urls[0].id);
  const record = decodeMember(
    expandedFiles.get(entry.shard).subarray(entry.offset, entry.offset + entry.length),
  );
  assert.equal(record.metadata.bodyState, "redacted");
  assert(record.metadata.retainedBytes > record.metadata.receivedBytes);
  assert.equal(expanded.report.integrityError, undefined);
  assert.equal((await verifyDirectory(expanded.outputDir)).captureComplete, false);
  const head = await run(t, f, (_url, init) =>
    init.method === "HEAD"
      ? response(null, init.headers["CF-Access-Client-Secret"] ? 200 : 403, {
          "content-length": "4000",
        })
      : undefined,
  );
  assert.equal(head.report.technicalStatus, "PASS");
});

test("R07 F4 every failed redirect member requires exactly one matching event in both journals", async (t) => {
  const f = await fixture(1),
    original = f.plan.urls[0],
    target = f.expectations.urls[0],
    alias = "https://makler-realty.ru/alias";
  f.plan.urls.push({
    ...original,
    id: urlId(alias),
    sourceUrl: alias,
    normalizedId: sourceIdentity(alias).id,
    followPath: "/bg/example-0",
  });
  f.expectations.urls.push({
    ...structuredClone(target),
    id: urlId(alias),
    disposition: { ...target.disposition, status: 301 },
  });
  const capture = await run(t, f, (url, init) => {
    if (url.endsWith("/alias"))
      return response("", 301, { location: `${origins.public}/bg/example-0` });
    if (url.endsWith("/bg/example-0") && !init.headers["x-msr-legacy-host"])
      throw new Error("synthetic hop failure");
    return undefined;
  });
  assert.equal(capture.report.integrityError, undefined);
  assert.equal(capture.report.captureComplete, false);
  const JSDOM = await loadParser(f.plan);
  for (const [index, entries] of [
    [],
    [{ id: `${urlId(alias)}:hop`, code: "request_timeout" }],
  ].entries()) {
    const { files } = await readCapture(capture.outputDir);
    files.set("failure-journal.json", jsonBytes(entries));
    files.set("failure-events.jsonl", Buffer.concat(entries.map(jsonBytes)));
    const report = verifyCapture({ files, supportingFiles: references(files), JSDOM });
    assert.equal(report.integrityError, "missing_failure_journal_entry");
    const directory = resolve(capture.parent, `hop-journal-${index}`);
    await writeEnvelope(directory, files, report);
    assert.equal(
      (await verifyDirectory(directory)).integrityError,
      "missing_failure_journal_entry",
    );
  }
});

test("AT57 F5 preserves a trailing query delimiter through plan, capture and Node transport", async (t) => {
  const f = await fixture(1),
    old = f.plan.urls[0],
    source = `${old.sourceUrl}?`;
  f.plan.urls[0] = {
    ...old,
    sourceUrl: source,
    id: urlId(source),
    normalizedId: sourceIdentity(source).id,
  };
  f.expectations.urls[0].id = urlId(source);
  assert.equal(sourceIdentity(source).pathAndQuery, "/bg/example-0?");
  assert.equal(sourceIdentity(source).id, sourceIdentity(old.sourceUrl).id);
  assert.equal(
    sourceIdentity("https://makler-realty.com/bg/%D0%B8%D0%BC%D0%BE%D1%82?s=O%27Neill")
      .pathAndQuery,
    "/bg/%D0%B8%D0%BC%D0%BE%D1%82?s=O%27Neill",
  );
  for (const unsupported of [
    "https://makler-realty.com/bg/имот",
    "https://makler-realty.com/bg/unit?s=O'Neill",
  ])
    assert.throws(() => sourceIdentity(unsupported), /unsupported_source_serialization/);
  const capture = await run(t, f);
  assert(capture.calls.some((r) => r.url === `${origins.public}/bg/example-0?`));
  assert.equal(capture.report.technicalStatus, "PASS");
  const seen = [],
    server = createServer((request, response) => {
      seen.push(request.url);
      response.end("synthetic loopback only");
    });
  t.after(
    () =>
      new Promise((done) => {
        server.close(done);
        server.closeAllConnections();
      }),
  );
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(3296, "127.0.0.1", done);
  });
  const result = await fetch(`http://127.0.0.1:3296${sourceIdentity(source).pathAndQuery}`, {
    redirect: "manual",
  });
  await result.arrayBuffer();
  assert.deepEqual(seen, ["/bg/example-0?"]);
  assert.equal(result.url, "http://127.0.0.1:3296/bg/example-0?");
});

test("R07 F6 preserves unverified declared transport class on early failures and uses null for unknown", async (t) => {
  const f = await fixture(1),
    capture = await run(t, f),
    JSDOM = await loadParser(f.plan);
  for (const declaredClass of ["live", "not-an-evidence-class"]) {
    const { files } = await readCapture(capture.outputDir),
      index = parseJson(files.get("raw-index.json"));
    index.evidenceClass = declaredClass;
    files.set("raw-index.json", jsonBytes(index));
    const report = verifyCapture({ files, supportingFiles: references(files), JSDOM });
    assert.equal(report.technicalStatus, "FAIL");
    assert.equal(report.evidenceClass, declaredClass === "live" ? "live" : null);
    assert.equal(report.evidenceClassAuthenticated, false);
    assert.equal(report.identityAuthenticated, false);
  }
  const { files } = await readCapture(capture.outputDir);
  files.delete("raw-index.json");
  const missing = verifyCapture({ files, supportingFiles: references(files), JSDOM });
  assert.equal(missing.evidenceClass, null);
  assert.equal(missing.technicalStatus, "FAIL");
});
