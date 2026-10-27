// R07/R08: observe one existing staging deployment. No deployment, migration, send or booking.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const accountId = "921d0224dcd595c87b7928d2b3c479d1";
export const zoneId = "f0ac7af0721419e8129e5d10ff547372";
export const origins = Object.freeze({
  public: "https://staging.makler-realty.com",
  client: "https://staging-my.makler-realty.com",
  staff: "https://staging-app.makler-realty.com",
});
export const protocol = Object.freeze({
  workersPerSweep: 6,
  pacingMs: 334,
  routeDeadlineMs: 20_000,
  mediaHeaderDeadlineMs: 30_000,
  smallMediaTotalDeadlineMs: 30_000,
  largeMediaThresholdBytes: 1_048_576,
  largeMediaBodyDeadlineMs: 120_000,
  observationDeadlineMs: 45 * 60_000,
  observationIntervalMs: 10_000,
  minimumObservationRounds: 20,
});
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hex = (n) => new RegExp(`^[a-f0-9]{${n}}$`);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const save = (path, data) => writeFile(path, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx" });

export function validateDispatch(env, run) {
  assert.equal(env.GITHUB_REPOSITORY, "ms-realty/ms-realty");
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(env.GITHUB_REF, "refs/heads/codex/msr-staging");
  assert.equal(env.STAGING_ENVIRONMENT_CONFIGURED, "true");
  assert.equal(env.CLOUDFLARE_ACCOUNT_ID, accountId);
  assert(hex(40).test(env.EXPECTED_SOURCE ?? ""));
  assert.equal(env.GITHUB_SHA, env.EXPECTED_SOURCE);
  assert.equal(env.GITHUB_WORKFLOW_SHA, env.EXPECTED_SOURCE);
  assert.equal(
    env.GITHUB_WORKFLOW_REF,
    "ms-realty/ms-realty/.github/workflows/staging-http-qualification.yml@refs/heads/codex/msr-staging",
  );
  assert.equal(env.STAGING_SOURCE_QUALIFIED_SHA, env.EXPECTED_SOURCE);
  assert(["transport", "full"].includes(env.QUALIFICATION_MODE));
  assert(/^[1-9][0-9]*$/.test(env.DEPLOYMENT_RUN_ID ?? ""));
  assert.equal(String(run.id), env.DEPLOYMENT_RUN_ID);
  assert.equal(run.repository?.full_name, "ms-realty/ms-realty");
  assert.equal(run.path, ".github/workflows/staging.yml");
  assert.equal(run.head_branch, "codex/msr-staging");
  assert.equal(run.head_sha, env.EXPECTED_SOURCE);
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
  return {
    source: env.EXPECTED_SOURCE,
    runId: env.DEPLOYMENT_RUN_ID,
    attempt: run.run_attempt,
    mode: env.QUALIFICATION_MODE,
  };
}

export function validateExactCheckout(sourceDir, expectedSource) {
  assert(hex(40).test(expectedSource ?? ""));
  const git = (...args) => execFileSync("git", args, { cwd: sourceDir, encoding: "utf8" }).trim();
  assert.equal(git("rev-parse", "HEAD"), expectedSource);
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "");
  const sourceTree = git("rev-parse", "--verify", `${expectedSource}^{tree}`);
  assert(hex(40).test(sourceTree));
  return { sourceCommit: expectedSource, sourceTree };
}

const sourceBindingFields = [
  "schemaVersion",
  "sourceCommit",
  "sourceTree",
  "reviewedMainCommit",
  "reviewedMainTree",
  "proofMode",
  "sourceInMainHistory",
  "exactTreeMatch",
];

export function validateSourceCheckout(sourceDir, expectedSource, expectedMain) {
  const { sourceCommit, sourceTree } = validateExactCheckout(sourceDir, expectedSource);
  const git = (...args) => execFileSync("git", args, { cwd: sourceDir, encoding: "utf8" }).trim();
  // Resolve the mutable ref once, then use only this immutable commit for the proof.
  const reviewedMainCommit = git("rev-parse", "--verify", "refs/remotes/origin/main^{commit}");
  assert(hex(40).test(reviewedMainCommit));
  if (expectedMain !== undefined) {
    assert(hex(40).test(expectedMain));
    assert.equal(
      reviewedMainCommit,
      expectedMain,
      "Reviewed main changed between qualification jobs",
    );
  }
  const reviewedMainTree = git("rev-parse", "--verify", `${reviewedMainCommit}^{tree}`);
  assert(hex(40).test(reviewedMainTree));
  let sourceInMainHistory = false;
  try {
    git("merge-base", "--is-ancestor", sourceCommit, reviewedMainCommit);
    sourceInMainHistory = true;
  } catch (error) {
    // Exit 1 means non-ancestor; missing objects, broken refs and other Git failures are fatal.
    if (error.status !== 1) throw error;
  }
  const exactTreeMatch = sourceTree === reviewedMainTree;
  assert(
    sourceInMainHistory || exactTreeMatch,
    "Qualified source is neither an ancestor nor an exact whole-tree match of reviewed main",
  );
  const proof = {
    schemaVersion: 1,
    sourceCommit,
    sourceTree,
    reviewedMainCommit,
    reviewedMainTree,
    proofMode: sourceInMainHistory ? "ancestry" : "exact_tree_squash",
    sourceInMainHistory,
    exactTreeMatch,
  };
  return Object.freeze({ ...proof, sha256: digest(JSON.stringify(proof)) });
}

export function bindSourceReport(report, binding, expected) {
  assert(binding && Object.getPrototypeOf(binding) === Object.prototype);
  assert.deepEqual(Object.keys(binding).sort(), [...sourceBindingFields, "sha256"].sort());
  const core = Object.fromEntries(sourceBindingFields.map((field) => [field, binding[field]]));
  assert.equal(core.schemaVersion, 1);
  for (const field of ["sourceCommit", "sourceTree", "reviewedMainCommit", "reviewedMainTree"])
    assert(hex(40).test(core[field]));
  assert.equal(core.sourceCommit, expected.source);
  assert.equal(report.source, expected.source);
  assert.equal(core.reviewedMainCommit, expected.reviewedMain);
  assert.equal(typeof core.sourceInMainHistory, "boolean");
  assert.equal(core.exactTreeMatch, core.sourceTree === core.reviewedMainTree);
  assert.equal(core.proofMode, core.sourceInMainHistory ? "ancestry" : "exact_tree_squash");
  assert(core.sourceInMainHistory || core.exactTreeMatch);
  assert.equal(binding.sha256, digest(JSON.stringify(core)));
  return {
    ...report,
    sourceBinding: { ...core, sha256: binding.sha256 },
    sourceBindingVerified: false,
    fullHttpQualificationPassed: false,
  };
}

export function validateCandidate(candidate, expectedSource) {
  assert(hex(40).test(expectedSource ?? ""));
  assert.equal(candidate.environment, "staging");
  assert.equal(candidate.runtime, "containers");
  assert.equal(candidate.accountId, accountId);
  assert.equal(candidate.zoneId, zoneId);
  assert.equal(candidate.workerName, "ms-realty-staging");
  assert.equal(candidate.sourceCommit, expectedSource);
  assert.deepEqual(candidate.origins, origins);
  assert(
    new RegExp(
      `^registry\\.cloudflare\\.com/${accountId}/ms-realty-staging@sha256:[a-f0-9]{64}$`,
    ).test(candidate.image),
  );
  assert(typeof candidate.access?.serviceClientId === "string" && candidate.access.serviceClientId);
  assert(!/[\r\n]/.test(candidate.access.serviceClientId));
  for (const key of ["routes", "routeManifest", "media"]) {
    assert(typeof candidate.artifacts?.[key] === "string");
    assert(candidate.artifacts[key].startsWith("data/legacy/migration/"));
    assert(
      !isAbsolute(candidate.artifacts[key]) && !candidate.artifacts[key].split("/").includes(".."),
    );
    assert(hex(64).test(candidate.artifacts[`${key}Sha256`] ?? ""));
  }
  return candidate;
}

export function stagingUrl(path, origin = origins.public) {
  assert(Object.values(origins).includes(origin));
  const url = new URL(path, origin);
  assert.equal(
    url.origin,
    origin,
    "Staging credentials must stay on the selected protected origin",
  );
  assert(!url.username && !url.password && !url.hash);
  return url.href;
}

export function validateProviderRead(url, init = {}) {
  const target = new URL(url);
  assert.equal(target.origin, "https://api.cloudflare.com");
  assert(!init.method || init.method === "GET");
  assert(
    target.pathname.startsWith(`/client/v4/accounts/${accountId}/`) ||
      target.pathname === `/client/v4/zones/${zoneId}` ||
      target.pathname.startsWith(`/client/v4/zones/${zoneId}/`),
  );
  assert(!target.username && !target.password);
  return target.href;
}

export function validateMediaProof(proof, media, mediaIndexSha256) {
  assert.equal(proof.schemaVersion, 1);
  assert.equal(proof.scope, "protected_staging_source_media_byte_parity");
  assert.equal(proof.productionAllowed, false);
  assert.equal(proof.humanRightsApproved, false);
  assert.equal(proof.publicationApproved, false);
  assert.equal(proof.mediaIndexSha256, mediaIndexSha256);
  assert(hex(64).test(proof.sourceProofPlanSha256));
  assert(Array.isArray(proof.objects) && proof.objects.length === media.length);
  const selected = new Map();
  for (const row of media) {
    assert(["makler-realty.com", "makler-realty.ru"].includes(row.host));
    assert(row.path.startsWith("/wp-content/uploads/") && !/[\\\r\n?#%]/.test(row.path));
    assert(!row.path.split("/").some((part) => part === "." || part === ".."));
    assert.equal(row.key, `${row.host}${row.path}`);
    assert(!selected.has(row.key));
    selected.set(row.key, row);
  }
  const objects = new Map();
  for (const row of proof.objects) {
    assert(selected.has(row.key) && !objects.has(row.key));
    assert(Number.isSafeInteger(row.bytes) && row.bytes > 0 && row.bytes <= 25 * 1024 * 1024);
    assert(hex(64).test(row.sha256) && hex(64).test(row.sourceReceiptSha256));
    objects.set(row.key, row);
  }
  return objects;
}

export function qualificationPassed({
  initialHealth,
  before,
  after,
  routes,
  media,
  availability,
  anonymous,
}) {
  return (
    initialHealth.length === 3 &&
    initialHealth.every((r) => r.passed) &&
    before?.passed === true &&
    after?.passed === true &&
    routes?.passed === true &&
    media?.passed === true &&
    availability?.passed === true &&
    anonymous.length === 3 &&
    anonymous.every((r) => r.denied)
  );
}

export function sourcePageChecks(document, page, view) {
  assert(
    view &&
      typeof view.bodyText === "string" &&
      Array.isArray(view.facts) &&
      Array.isArray(view.contentLinks),
  );
  const article = document.querySelector("article"),
    bodies = document.querySelectorAll("[data-legacy-source-body]"),
    body = bodies[0],
    factGroups = document.querySelectorAll("[data-legacy-source-facts]"),
    factRows = [...(factGroups[0]?.children ?? [])],
    facts = factRows.map((row) => ({
      label: row.querySelector("dt")?.textContent,
      value: row.querySelector("dd")?.textContent,
    })),
    linkHeadings = document.querySelectorAll("#archive-links"),
    links = [...(linkHeadings[0]?.closest("section")?.querySelectorAll("li a") ?? [])].map(
      (link) => ({ url: link.getAttribute("href"), text: link.textContent }),
    ),
    images = [...document.querySelectorAll("article img")],
    expectedSources = page.media.map((photo) => {
      const source = new URL(photo.url);
      assert(/^https?:$/.test(source.protocol));
      assert(["makler-realty.com", "makler-realty.ru"].includes(source.hostname));
      assert(
        !source.username && !source.password && !source.port && !source.search && !source.hash,
      );
      assert(source.pathname.startsWith("/wp-content/uploads/"));
      assert(!/%2f|%5c/i.test(source.pathname));
      return `/legacy-media/${source.hostname}${source.pathname}`;
    });
  return {
    // P21 keeps the captured bytes in the inventory and presents a reviewed reading
    // view. Check both identities and every extracted field; never drop the body check.
    sourceEvidence:
      hex(64).test(page.sourceHash ?? "") &&
      digest(page.bodyText) === page.sourceHash &&
      article?.getAttribute("data-legacy-source-hash") === page.sourceHash,
    sourceBody: bodies.length === 1 && body.textContent === view.bodyText.replace(/\r\n?/g, "\n"),
    sourceFacts:
      factGroups.length === (view.facts.length ? 1 : 0) &&
      factRows.every(
        (row) => row.querySelectorAll("dt").length === 1 && row.querySelectorAll("dd").length === 1,
      ) &&
      JSON.stringify(facts) === JSON.stringify(view.facts),
    sourceLinks:
      linkHeadings.length === (view.contentLinks.length ? 1 : 0) &&
      JSON.stringify(links) === JSON.stringify(view.contentLinks),
    title: document.querySelector("article h1")?.textContent === page.title,
    locale: document.querySelector("article")?.getAttribute("lang") === page.locale,
    noSourceScriptsOrForms: document.querySelectorAll("article script,article form").length === 0,
    galleryCount: images.length === expectedSources.length,
    stagingImages: images.every((image) => {
      const src = image.getAttribute("src");
      return (
        src?.startsWith("/legacy-media/") || src?.startsWith(`${origins.public}/legacy-media/`)
      );
    }),
    gallerySourcesInOrder:
      images.length === expectedSources.length &&
      images.every((image, index) => {
        const src = image.getAttribute("src"),
          expected = expectedSources[index];
        return src === expected || src === `${origins.public}${expected}`;
      }),
  };
}

export function qualificationCoverage(candidate) {
  return {
    sourceBindingVerified: false,
    fullHttpQualificationPassed: false,
    fullLegacyParityQualified: false,
    seoQualified: false,
    sitemapConsistencyQualified: false,
    requiredSeparateEvidence: {
      artifact: "staging-url-seo-sitemap-parity.json",
      contract: "docs/delivery/staging-http-qualification.md",
      status: "required_separate_candidate_bound_evidence",
      environment: "staging",
      expectedSource: candidate.sourceCommit,
      expectedImage: candidate.image,
      assertions: [
        "canonical_and_exact_redirect_mapping",
        "locale_hreflang_and_approved_translation_eligibility",
        "titles_descriptions_and_structured_data_match_visible_eligible_content",
        "sitemap_metadata_and_public_projection_revision_consistency",
        "protected_staging_noindex_and_unapproved_locale_holds_preserved",
      ],
    },
  };
}

export function errorEvidence(error, secrets = [], depth = 0) {
  if (depth > 4) return { name: "NestedError" };
  const redact = (value) =>
    secrets
      .filter(Boolean)
      .reduce((text, secret) => text.split(secret).join("[REDACTED]"), String(value));
  const result = {
    name: error?.name ?? "Error",
    message: redact(error?.message ?? error).slice(0, 1000),
  };
  if (typeof error?.code === "string") result.code = error.code;
  if (error?.cause) result.cause = errorEvidence(error.cause, secrets, depth + 1);
  if (Array.isArray(error?.errors))
    result.errors = error.errors.map((e) => errorEvidence(e, secrets, depth + 1));
  return result;
}

export async function readBoundedBody(response, maximum) {
  const parts = [];
  let bytes = 0;
  try {
    for await (const part of response.body ?? []) {
      bytes += part.byteLength;
      assert(bytes <= maximum, "Response exceeds the selected source byte bound");
      parts.push(Buffer.from(part));
    }
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(parts);
}

export function createPacer({ now = Date.now, sleep = wait } = {}) {
  let next = now();
  return async () => {
    const at = Math.max(now(), next);
    next = at + protocol.pacingMs;
    await sleep(Math.max(0, at - now()));
  };
}

export async function observeTransport(candidate, secret, { fetcher = fetch } = {}) {
  assert(typeof secret === "string" && secret.trim() && !/[\r\n]/.test(secret));
  const access = {
    "CF-Access-Client-Id": candidate.access.serviceClientId,
    "CF-Access-Client-Secret": secret,
  };
  const get = (path, origin, headers = access) =>
    fetcher(stagingUrl(path, origin), {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(protocol.routeDeadlineMs),
    });
  const report = {
    scope: "bounded protected staging transport and unauthenticated staff access",
    ...qualificationCoverage(candidate),
    source: candidate.sourceCommit,
    configuredImage: candidate.image,
    imageDigestIndependentlyObserved: false,
    mode: "transport",
    passed: false,
    ownerAcceptance: false,
    managerSessionVerified: false,
    deploymentPerformed: false,
    productionQualified: false,
    perRequestRetries: 0,
    health: [],
    anonymous: [],
  };
  report.health = await Promise.all(
    Object.entries(origins).map(async ([role, origin]) => {
      const row = { role, status: null, passed: false },
        start = Date.now();
      try {
        const response = await get("/api/health", origin);
        row.status = response.status;
        row.noindex = response.headers.get("x-robots-tag")?.includes("noindex") === true;
        if (response.status !== 200) {
          await response.body?.cancel();
          return row;
        }
        const body = JSON.parse((await readBoundedBody(response, 4096)).toString());
        row.source = body.build;
        row.passed = body.status === "ok" && body.build === candidate.sourceCommit && row.noindex;
      } catch (error) {
        row.error = errorEvidence(error, [secret]);
      } finally {
        row.elapsedMs = Date.now() - start;
      }
      return row;
    }),
  );
  for (const [key, path] of [
    ["staffAccess", "/bg/access"],
    ["caseSessionGate", "/bg/cases"],
  ]) {
    const row = { path, status: null, passed: false, staffSessionSupplied: false },
      start = Date.now();
    try {
      const response = await get(path, origins.staff);
      row.status = response.status;
      row.noindex = response.headers.get("x-robots-tag")?.includes("noindex") === true;
      if (key === "staffAccess") {
        row.bytes = (await readBoundedBody(response, 5_000_000)).length;
        row.passed =
          response.status === 200 &&
          row.noindex &&
          row.bytes > 0 &&
          response.headers.get("content-type")?.includes("text/html") === true;
      } else {
        const location = new URL(response.headers.get("location") ?? origins.staff, origins.staff);
        await response.body?.cancel();
        row.locationPath = location.origin === origins.staff ? location.pathname : null;
        row.passed =
          ([302, 303, 307].includes(response.status) &&
            location.origin === origins.staff &&
            location.pathname === "/bg/access") ||
          [401, 403].includes(response.status);
      }
    } catch (error) {
      row.error = errorEvidence(error, [secret]);
    } finally {
      row.elapsedMs = Date.now() - start;
    }
    report[key] = row;
  }
  report.anonymous = await Promise.all(
    Object.entries(origins).map(async ([role, origin]) => {
      const row = { role, status: null, denied: false };
      try {
        const response = await get("/api/health", origin, {});
        const location = new URL(response.headers.get("location") ?? origin, origin);
        await response.body?.cancel();
        row.status = response.status;
        row.denied =
          response.status === 302 &&
          location.protocol === "https:" &&
          location.hostname.endsWith(".cloudflareaccess.com");
      } catch (error) {
        row.error = errorEvidence(error);
      }
      return row;
    }),
  );
  report.passed =
    report.health.every((row) => row.passed) &&
    report.staffAccess.passed &&
    report.caseSessionGate.passed &&
    report.anonymous.every((row) => row.denied);
  report.observedAt = new Date().toISOString();
  return report;
}

async function sourceFile(root, path) {
  assert(!isAbsolute(path) && !path.split("/").includes(".."));
  const selected = await realpath(resolve(root, path));
  assert(!relative(await realpath(root), selected).startsWith(".."));
  return readFile(selected);
}

export async function loadSourcePresentation(sourceDir) {
  const path = "src/server/legacy/presentation.ts";
  const bytes = await sourceFile(sourceDir, path);
  // Guard and transport mode must remain dependency-free. Full mode resolves the
  // already pinned loader from the installed qualified source, never the verifier.
  const { tsImport } = await import(
    pathToFileURL(createRequire(resolve(sourceDir, "package.json")).resolve("tsx/esm/api"))
  );
  const { presentLegacyPage } = await tsImport(pathToFileURL(resolve(sourceDir, path)).href, {
    parentURL: pathToFileURL(resolve(sourceDir, "package.json")).href,
    tsconfig: false,
  });
  assert.equal(typeof presentLegacyPage, "function");
  return { presentLegacyPage, receipt: { path, sha256: digest(bytes), fromQualifiedSource: true } };
}

export async function loadCorpus(sourceDir, candidate, byteProof) {
  const bytes = {};
  for (const key of ["routes", "routeManifest", "media"]) {
    bytes[key] = await sourceFile(sourceDir, candidate.artifacts[key]);
    assert.equal(digest(bytes[key]), candidate.artifacts[`${key}Sha256`]);
  }
  const routes = JSON.parse(bytes.routes),
    manifest = JSON.parse(bytes.routeManifest),
    media = JSON.parse(bytes.media);
  const pageBytes = await sourceFile(sourceDir, "data/legacy/migration/source-pages.json");
  const pages = JSON.parse(pageBytes).pages;
  assert(Array.isArray(routes) && routes.length > 0 && routes.length <= 20_000);
  assert(Array.isArray(media) && media.length > 0 && media.length <= 20_000);
  assert.equal(manifest.routeArtifactSha256, digest(bytes.routes));
  const pageMap = new Map();
  for (const page of pages) {
    assert(!pageMap.has(page.canonicalPath));
    assert.equal(digest(page.bodyText), page.sourceHash);
    pageMap.set(page.canonicalPath, page);
  }
  assert(
    manifest.reviews.every(
      (r) => pageMap.get(r.targetPath.split("?")[0])?.sourceHash === r.sourceBodyHash,
    ),
  );
  for (const route of routes) {
    assert(["makler-realty.com", "makler-realty.ru"].includes(route.host));
    assert([200, 301].includes(route.status));
    stagingUrl(route.path + route.query);
    stagingUrl(route.targetPath);
    assert(pageMap.has(route.targetPath.split("?")[0]));
  }
  return {
    routes,
    media,
    manifest,
    pageMap,
    mediaProof: validateMediaProof(byteProof, media, digest(bytes.media)),
    hashes: {
      routes: digest(bytes.routes),
      routeManifest: digest(bytes.routeManifest),
      media: digest(bytes.media),
      sourcePages: digest(pageBytes),
    },
  };
}

async function sweep(items, check, journal) {
  let next = 0,
    stop = false,
    consecutiveFailures = 0;
  const rows = [];
  await Promise.all(
    Array.from({ length: protocol.workersPerSweep }, async () => {
      while (!stop) {
        const index = next++;
        if (index >= items.length) return;
        const row = await check(items[index]);
        rows.push(row);
        await appendFile(journal, `${JSON.stringify(row)}\n`);
        consecutiveFailures = row.passed ? 0 : consecutiveFailures + 1;
        if (row.status === 401 || row.status === 403 || consecutiveFailures >= 5) stop = true;
        if (rows.length % 100 === 0)
          console.log(
            JSON.stringify({
              sweep: journal.split("/").at(-1),
              checked: rows.length,
              failed: rows.filter((r) => !r.passed).length,
            }),
          );
      }
    }),
  );
  return {
    passed: rows.length === items.length && rows.every((r) => r.passed),
    expected: items.length,
    checked: rows.length,
    succeeded: rows.filter((r) => r.passed).length,
    failed: rows.filter((r) => !r.passed).length,
    notAttempted: items.length - rows.length,
  };
}

async function qualify(context) {
  const { candidate, corpus, output, sourceDir, env } = context;
  const secrets = [
    env.STAGING_ACCESS_SERVICE_CLIENT_SECRET,
    env.STAGING_CONTROL_SECRET,
    env.STAGING_CLOUDFLARE_READ_TOKEN,
  ];
  for (const value of secrets)
    assert(typeof value === "string" && value.trim() && !/[\r\n]/.test(value));
  const access = {
    "CF-Access-Client-Id": candidate.access.serviceClientId,
    "CF-Access-Client-Secret": secrets[0],
  };
  const request = (
    path,
    origin = origins.public,
    headers = access,
    deadline = protocol.routeDeadlineMs,
  ) =>
    fetch(stagingUrl(path, origin), {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(deadline),
    });
  const evidenceError = (e) => errorEvidence(e, secrets);
  const health = async (role, origin) => {
    const start = Date.now(),
      row = { role, status: null, passed: false };
    try {
      const response = await request("/api/health", origin);
      row.status = response.status;
      row.noindex = response.headers.get("x-robots-tag")?.includes("noindex") === true;
      row.cfRay = response.headers.get("cf-ray");
      if (response.status !== 200) {
        await response.body?.cancel();
        return row;
      }
      const body = JSON.parse((await readBoundedBody(response, 4096)).toString());
      row.source = body.build;
      row.passed = body.status === "ok" && body.build === candidate.sourceCommit && row.noindex;
    } catch (error) {
      row.error = evidenceError(error);
    } finally {
      row.elapsedMs = Date.now() - start;
    }
    return row;
  };
  const report = {
    scope: "R07/R08 read-only exact staging HTTP qualification",
    ...qualificationCoverage(candidate),
    source: candidate.sourceCommit,
    image: candidate.image,
    protocol,
    passed: false,
    productionQualified: false,
    ownerAcceptance: false,
    applicationLatencyQualified: false,
    deploymentPerformed: false,
    sourceHashes: corpus.hashes,
    initialHealth: [],
    anonymous: [],
  };
  report.initialHealth = await Promise.all(
    Object.entries(origins).map(([role, origin]) => health(role, origin)),
  );
  await save(resolve(output, "initial-health.json"), report.initialHealth);
  const { providerPreflight, cloudflareReader } = await import(
    pathToFileURL(resolve(sourceDir, "scripts/staging-preflight.mjs"))
  );
  const { prepareRuntimeRollout } = await import(
    pathToFileURL(resolve(sourceDir, "scripts/staging-rollout-proof.mjs"))
  );
  const { waitForStagingWebHealth } = await import(
    pathToFileURL(resolve(sourceDir, "scripts/staging-web-health.mjs"))
  );
  const providerTransport = (url, init) => {
    return fetch(validateProviderRead(url, init), init);
  };
  const privateCall = async (path, method) => {
    assert(
      (path === "runtime" && method === "POST") ||
        (path === "migrate?reconcile=1" && method === "GET"),
    );
    const r = await fetch(stagingUrl(`/__staging/${path}`), {
      method,
      headers: { ...access, Authorization: `Bearer ${secrets[1]}` },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(r.status, 200);
    assert(r.headers.get("x-robots-tag")?.includes("noindex"));
    return JSON.parse((await readBoundedBody(r, 2_000_000)).toString());
  };
  const observe = async () => {
    const observation = {
      passed: false,
      source: candidate.sourceCommit,
      image: candidate.image,
      preparationAttempts: 0,
    };
    observation.health = await waitForStagingWebHealth(candidate, access);
    observation.migration = await privateCall("migrate?reconcile=1", "GET");
    assert.equal(observation.migration.status, "completed");
    assert.equal(observation.migration.sourceCommit, candidate.sourceCommit);
    assert.equal(observation.migration.configuredDigest, candidate.image.split("@")[1]);
    Object.assign(
      observation,
      await prepareRuntimeRollout(
        candidate,
        () => {
          observation.preparationAttempts++;
          return privateCall("runtime", "POST");
        },
        secrets[2],
        { transport: providerTransport, retry: { ms: 180_000 } },
      ),
    );
    observation.prerequisites = await providerPreflight(
      candidate,
      cloudflareReader(secrets[2], providerTransport),
    );
    assert.equal(observation.prerequisites.status, "PASS");
    observation.passed = true;
    return observation;
  };
  try {
    report.before = await observe();
    await save(resolve(output, "runtime-before.json"), report.before);
    const { JSDOM } = await import(
      pathToFileURL(createRequire(resolve(sourceDir, "package.json")).resolve("jsdom"))
    );
    const { presentLegacyPage, receipt } = await loadSourcePresentation(sourceDir);
    report.sourcePresentation = receipt;
    const routePace = createPacer(),
      mediaPace = createPacer(),
      completed = {};
    const routeCheck = async (route) => {
      const row = {
        sourceHost: route.host,
        sourcePath: route.path,
        targetPath: route.targetPath,
        passed: false,
        checks: {},
      };
      const page = corpus.pageMap.get(route.targetPath.split("?")[0]);
      try {
        await routePace();
        let response = await request(route.path + route.query, origins.public, {
          ...access,
          "x-msr-legacy-host": route.host,
        });
        row.status = response.status;
        row.checks.initialStatus = response.status === route.status;
        row.checks.initialNoindex =
          response.headers.get("x-robots-tag")?.includes("noindex") === true;
        if (route.status === 301) {
          const target = new URL(response.headers.get("location") ?? "/", origins.public).href;
          await response.body?.cancel();
          assert.equal(
            target,
            stagingUrl(route.targetPath),
            "Redirect differs from pinned map; refused to follow",
          );
          await routePace();
          response = await request(target);
        }
        row.checks.final200 = response.status === 200;
        row.checks.finalNoindex =
          response.headers.get("x-robots-tag")?.includes("noindex") === true;
        if (response.status !== 200) {
          await response.body?.cancel();
          return row;
        }
        const dom = new JSDOM((await readBoundedBody(response, 5_000_000)).toString());
        try {
          Object.assign(
            row.checks,
            sourcePageChecks(dom.window.document, page, presentLegacyPage(page)),
          );
        } finally {
          dom.window.close();
        }
        row.passed = Object.values(row.checks).every(Boolean);
      } catch (error) {
        row.error = evidenceError(error);
      }
      return row;
    };
    const mediaCheck = async (media) => {
      const expected = corpus.mediaProof.get(media.key),
        row = {
          key: media.key,
          expectedBytes: expected.bytes,
          expectedSha256: expected.sha256,
          passed: false,
          checks: {},
        };
      let timer,
        phase = "headers";
      const controller = new AbortController();
      try {
        await mediaPace();
        const start = Date.now();
        timer = setTimeout(() => controller.abort(), protocol.mediaHeaderDeadlineMs);
        const url = stagingUrl(
          `/legacy-media/${media.host}${media.path.split("/").map(encodeURIComponent).join("/")}`,
        );
        const response = await fetch(url, {
          headers: access,
          redirect: "manual",
          signal: controller.signal,
        });
        clearTimeout(timer);
        row.status = response.status;
        row.cfRay = response.headers.get("cf-ray");
        phase = "body";
        timer = setTimeout(
          () => controller.abort(),
          expected.bytes > protocol.largeMediaThresholdBytes
            ? protocol.largeMediaBodyDeadlineMs
            : Math.max(1, protocol.smallMediaTotalDeadlineMs - (Date.now() - start)),
        );
        row.checks.http200 = response.status === 200;
        row.checks.noindex = response.headers.get("x-robots-tag")?.includes("noindex") === true;
        row.checks.privateNoStore =
          /private/.test(response.headers.get("cache-control") ?? "") &&
          /no-store/.test(response.headers.get("cache-control") ?? "");
        row.checks.nosniff = response.headers.get("x-content-type-options") === "nosniff";
        if (response.status !== 200) {
          await response.body?.cancel();
          return row;
        }
        const bytes = await readBoundedBody(response, expected.bytes);
        row.bytes = bytes.length;
        row.sha256 = digest(bytes);
        row.checks.bytes = bytes.length === expected.bytes;
        row.checks.sha256 = row.sha256 === expected.sha256;
        const types = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          webp: "image/webp",
        };
        row.checks.contentType =
          response.headers.get("content-type") === types[media.key.split(".").at(-1).toLowerCase()];
        row.passed = Object.values(row.checks).every(Boolean);
      } catch (error) {
        row.errorPhase = phase;
        row.error = evidenceError(error);
      } finally {
        clearTimeout(timer);
      }
      return row;
    };
    const runSweep = async (key, items, check) => {
      const journal = resolve(output, `${key}.jsonl`);
      await writeFile(journal, "", { flag: "wx" });
      const result = {
        ...(await sweep(items, check, journal)),
        source: candidate.sourceCommit,
        image: candidate.image,
        finishedAt: Date.now(),
      };
      const stable = await health("public", origins.public);
      result.sourceStable = stable.passed;
      result.passed &&= stable.passed;
      await save(resolve(output, `${key}.json`), result);
      completed[key] = result;
      return result;
    };
    const monitor = async () => {
      const start = Date.now(),
        rows = [],
        journal = resolve(output, "availability.jsonl");
      await writeFile(journal, "", { flag: "wx" });
      const result = {
        passed: false,
        source: candidate.sourceCommit,
        image: candidate.image,
        rounds: 0,
        requests: 0,
        startedAt: start,
      };
      try {
        while (Date.now() - start < protocol.observationDeadlineMs) {
          result.rounds++;
          for (const [role, origin] of Object.entries(origins)) {
            const row = await health(role, origin);
            rows.push(row);
            await appendFile(journal, `${JSON.stringify(row)}\n`);
            assert(row.passed, `${role} health failed during full parity`);
          }
          const response = await request("/bg/access", origins.staff),
            body = await readBoundedBody(response, 5_000_000);
          const row = {
            role: "staff-access",
            status: response.status,
            noindex: response.headers.get("x-robots-tag")?.includes("noindex") === true,
            bytes: body.length,
          };
          rows.push(row);
          await appendFile(journal, `${JSON.stringify(row)}\n`);
          assert(row.status === 200 && row.noindex && row.bytes > 0);
          if (completed.routes && completed.media) {
            assert(completed.routes.passed && completed.media.passed, "Complete parity failed");
            if (result.rounds >= protocol.minimumObservationRounds) {
              result.passed = true;
              result.fullSweepsCompletedDuringObservation = true;
              break;
            }
          }
          await wait(protocol.observationIntervalMs);
        }
        assert(result.passed, "Observation ended before complete passing sweeps");
      } catch (error) {
        result.failure = evidenceError(error);
      }
      result.requests = rows.length;
      result.finishedAt = Date.now();
      await save(resolve(output, "availability.json"), result);
      return result;
    };
    const results = await Promise.allSettled([
      monitor(),
      runSweep("routes", corpus.routes, routeCheck),
      runSweep("media", corpus.media, mediaCheck),
    ]);
    for (const [index, key] of ["availability", "routes", "media"].entries()) {
      report[key] =
        results[index].status === "fulfilled"
          ? results[index].value
          : { passed: false, failure: evidenceError(results[index].reason) };
    }
    report.after = await observe();
    await save(resolve(output, "runtime-after.json"), report.after);
    report.anonymous = await Promise.all(
      Object.entries(origins).map(async ([role, origin]) => {
        const response = await request("/api/health", origin, {}),
          location = new URL(response.headers.get("location") ?? origin);
        await response.body?.cancel();
        return {
          role,
          status: response.status,
          denied:
            response.status === 302 &&
            location.protocol === "https:" &&
            location.hostname.endsWith(".cloudflareaccess.com"),
        };
      }),
    );
    report.passed = qualificationPassed(report);
  } catch (error) {
    report.failure = evidenceError(error);
  }
  report.observedAt = new Date().toISOString();
  return report;
}

async function main() {
  if (process.argv[2] === "guard") {
    const result = validateDispatch(process.env, await json(process.argv[3]));
    const sourceBinding = validateSourceCheckout(process.cwd(), result.source);
    if (process.env.GITHUB_OUTPUT)
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `source=${result.source}\nrun_id=${result.runId}\nattempt=${result.attempt}\nmode=${result.mode}\nreviewed_main_sha=${sourceBinding.reviewedMainCommit}\n`,
      );
    console.log(JSON.stringify({ ...result, sourceBinding }));
    return;
  }
  assert.equal(process.argv[2], "run");
  const [sourceDir, artifactDir, output, expectedSource, mode] = process.argv.slice(3);
  assert(output && sourceDir && artifactDir && hex(40).test(expectedSource ?? ""));
  assert(["transport", "full"].includes(mode));
  await mkdir(output, { recursive: false });
  let report = {
    ...qualificationCoverage({ sourceCommit: expectedSource, image: null }),
    mode,
    passed: false,
    source: expectedSource,
    productionQualified: false,
    ownerAcceptance: false,
    deploymentPerformed: false,
  };
  const secrets = [
    process.env.STAGING_ACCESS_SERVICE_CLIENT_SECRET,
    process.env.STAGING_CONTROL_SECRET,
    process.env.STAGING_CLOUDFLARE_READ_TOKEN,
  ];
  let phase = "candidate_and_checkout";
  try {
    const candidate = validateCandidate(
      await json(resolve(artifactDir, "staging-candidate.generated.json")),
      expectedSource,
    );
    Object.assign(report, qualificationCoverage(candidate));
    assert.equal(process.env.GITHUB_REPOSITORY, "ms-realty/ms-realty");
    assert.equal(process.env.GITHUB_EVENT_NAME, "workflow_dispatch");
    assert.equal(process.env.GITHUB_REF, "refs/heads/codex/msr-staging");
    assert.equal(process.env.GITHUB_SHA, expectedSource);
    assert.equal(process.env.GITHUB_WORKFLOW_SHA, expectedSource);
    assert.equal(process.env.STAGING_SOURCE_QUALIFIED_SHA, expectedSource);
    assert(hex(40).test(process.env.REVIEWED_MAIN_SHA ?? ""));
    phase = "source_binding_before";
    const verifierDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const sourceBinding = validateSourceCheckout(
      verifierDir,
      expectedSource,
      process.env.REVIEWED_MAIN_SHA,
    );
    const sourceCheckout = validateExactCheckout(sourceDir, expectedSource);
    assert.equal(sourceCheckout.sourceTree, sourceBinding.sourceTree);
    const bindingExpected = { source: expectedSource, reviewedMain: process.env.REVIEWED_MAIN_SHA };
    report = bindSourceReport(report, sourceBinding, bindingExpected);
    await save(resolve(output, "source-binding-before.json"), sourceBinding);
    const artifactHashes = {};
    for (const name of [
      "candidate",
      "runtime",
      "isolation",
      "connectivity",
      "provenance",
      "provider",
    ]) {
      const file = `staging-${name}.generated.json`;
      artifactHashes[file] = digest(await readFile(resolve(artifactDir, file)));
    }
    phase = "http_observations";
    let byteProofSha256;
    if (mode === "full") {
      const proofPath = resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../data/legacy/migration/source-media-byte-proof.json",
      );
      const proofBytes = await readFile(proofPath);
      const corpus = await loadCorpus(sourceDir, candidate, JSON.parse(proofBytes.toString()));
      byteProofSha256 = digest(proofBytes);
      report = await qualify({ candidate, corpus, sourceDir, output, env: process.env });
    } else {
      report = await observeTransport(candidate, process.env.STAGING_ACCESS_SERVICE_CLIENT_SECRET);
    }
    // Both observation branches return a new object. Reapply the checked provenance
    // before any further work so partial/failing qualification also retains it.
    report = bindSourceReport(report, sourceBinding, bindingExpected);
    if (byteProofSha256) report.byteProofSha256 = byteProofSha256;
    report.mode = mode;
    report.sourcePackageLockSha256 = digest(await sourceFile(sourceDir, "package-lock.json"));
    report.nodeVersion = process.versions.node;
    report.verifierCommit = process.env.GITHUB_SHA ?? null;
    report.deploymentArtifactFileSha256 = artifactHashes;
    report.humanSourceEquivalenceApproved = false;
    report.publicationApproved = false;
    phase = "source_binding_after";
    const afterBinding = validateSourceCheckout(
      verifierDir,
      expectedSource,
      sourceBinding.reviewedMainCommit,
    );
    assert.deepEqual(afterBinding, sourceBinding);
    assert.deepEqual(validateExactCheckout(sourceDir, expectedSource), sourceCheckout);
    await save(resolve(output, "source-binding-after.json"), afterBinding);
    report.sourceBindingVerified = true;
    report.fullHttpQualificationPassed = mode === "full" && report.passed;
  } catch (error) {
    report.passed = false;
    report.fullHttpQualificationPassed = false;
    report.sourceBindingVerified = false;
    const failure = errorEvidence(error, secrets);
    if (report.failure) report.additionalFailures = [{ phase, failure }];
    else report.failure = failure;
    report.failedPhase = phase;
  }
  await save(resolve(output, "qualification.json"), report);
  console.log(
    JSON.stringify({
      source: report.source,
      sourceBinding: report.sourceBinding,
      sourceBindingVerified: report.sourceBindingVerified,
      passed: report.passed,
      initialAccessPassed: report.initialHealth?.every((r) => r.passed),
      routes: report.routes,
      media: report.media,
      availability: report.availability,
      productionQualified: false,
    }),
  );
  if (!report.passed) process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(errorEvidence(error));
    process.exitCode = 2;
  });
}
