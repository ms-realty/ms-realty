import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  accountId,
  bindSourceReport,
  createPacer,
  errorEvidence,
  observeTransport,
  origins,
  protocol,
  qualificationCoverage,
  qualificationPassed,
  readBoundedBody,
  sourcePageChecks,
  stagingUrl,
  validateCandidate,
  validateDispatch,
  validateMediaProof,
  validateProviderRead,
  validateSourceCheckout,
  zoneId,
} from "./staging-http-qualification.mjs";

const source = "a".repeat(40),
  hash = "b".repeat(64);
const copy = (value) => structuredClone(value);
const env = {
  GITHUB_REPOSITORY: "ms-realty/ms-realty",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/codex/msr-staging",
  GITHUB_SHA: source,
  GITHUB_WORKFLOW_SHA: source,
  GITHUB_WORKFLOW_REF:
    "ms-realty/ms-realty/.github/workflows/staging-http-qualification.yml@refs/heads/codex/msr-staging",
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
  zoneId,
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

test("R07/R08 only the already-permitted staging ref at the exact deployed workflow commit resolves the environment", () => {
  assert.deepEqual(validateDispatch(env, run), { source, runId: "123", attempt: 2, mode: "full" });
  for (const change of [
    { GITHUB_REF: "refs/heads/untrusted" },
    { GITHUB_REF: "refs/heads/main" },
    { GITHUB_EVENT_NAME: "push" },
    { GITHUB_SHA: "c".repeat(40) },
    { GITHUB_WORKFLOW_SHA: "c".repeat(40) },
    {
      GITHUB_WORKFLOW_REF:
        "ms-realty/ms-realty/.github/workflows/staging.yml@refs/heads/codex/msr-staging",
    },
    {
      GITHUB_WORKFLOW_REF:
        "ms-realty/ms-realty/.github/workflows/staging-http-qualification.yml@refs/heads/main",
    },
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

test("R07/R08 the exact staging checkout must be clean and integrated in reviewed main", async () => {
  const directory = await mkdtemp(join(tmpdir(), "msr-http-source-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  const commit = (message) =>
    git(
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=Qualification fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--allow-empty",
      "--quiet",
      "-m",
      message,
    );
  try {
    git("init", "--quiet", "--initial-branch=main");
    await writeFile(join(directory, "source-proof.txt"), "reviewed\n");
    git("add", "source-proof.txt");
    commit("Reviewed source");
    const reviewed = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", reviewed);
    git("checkout", "--quiet", "-b", "codex/msr-staging");
    assert.doesNotThrow(() => validateSourceCheckout(directory, reviewed));
    await writeFile(join(directory, "source-proof.txt"), "different source\n");
    git("add", "source-proof.txt");
    commit("Unreviewed staging branch advance");
    const unreviewed = git("rev-parse", "HEAD");
    assert.throws(() => validateSourceCheckout(directory, reviewed));
    assert.throws(() => validateSourceCheckout(directory, unreviewed));
    git("update-ref", "refs/remotes/origin/main", unreviewed);
    assert.doesNotThrow(() => validateSourceCheckout(directory, unreviewed));
    await writeFile(join(directory, "source-proof.txt"), "unreviewed change\n");
    assert.throws(() => validateSourceCheckout(directory, unreviewed));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function withGitRepository(run) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "msr-http-binding-")));
  const prefix = [
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "user.name=Qualification fixture",
    "-c",
    "user.email=fixture@example.invalid",
  ];
  const git = (...args) =>
    execFileSync("git", [...prefix, ...args], { cwd: directory, encoding: "utf8" }).trim();
  const input = (value, ...args) =>
    execFileSync("git", [...prefix, ...args], {
      cwd: directory,
      encoding: "utf8",
      input: value,
    }).trim();
  try {
    git("init", "--quiet", "--initial-branch=main");
    await writeFile(join(directory, "source-proof.txt"), "base\n");
    git("add", "source-proof.txt");
    git("commit", "--quiet", "-m", "Reviewed base");
    const base = git("rev-parse", "HEAD");
    git("checkout", "--quiet", "-b", "codex/msr-staging");
    await run({ directory, git, input, base });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("R07 a nonancestor squash is accepted only for an exact whole Git tree", async () => {
  await withGitRepository(async ({ directory, git, input, base }) => {
    await writeFile(join(directory, "source-proof.txt"), "candidate\n");
    git("add", "source-proof.txt");
    git("commit", "--quiet", "-m", "Qualified source H");
    const head = git("rev-parse", "HEAD"),
      tree = git("rev-parse", "HEAD^{tree}");
    git("update-ref", "refs/remotes/origin/main", base);
    assert.throws(() => validateSourceCheckout(directory, head, base));
    const main = git("commit-tree", tree, "-p", base, "-m", "Reviewed squash S");
    git("update-ref", "refs/remotes/origin/main", main);
    const proof = validateSourceCheckout(directory, head, main);
    assert.equal(proof.proofMode, "exact_tree_squash");
    assert.equal(proof.sourceInMainHistory, false);
    assert.equal(proof.sourceCommit, head);
    assert.equal(proof.reviewedMainCommit, main);
    assert.equal(proof.sourceTree, proof.reviewedMainTree);
    assert.equal(proof.exactTreeMatch, true);
    const { sha256, ...core } = proof;
    assert.equal(sha256, createHash("sha256").update(JSON.stringify(core)).digest("hex"));
    // Same tree is insufficient when HEAD is not the exact approved H.
    assert.throws(() => validateSourceCheckout(directory, main, main));
    const movedMain = git("commit-tree", tree, "-p", base, "-m", "Another same-tree main revision");
    git("update-ref", "refs/remotes/origin/main", movedMain);
    assert.throws(() => validateSourceCheckout(directory, head, main));
    git("update-ref", "refs/remotes/origin/main", main);
    await writeFile(join(directory, "source-proof.txt"), "unstaged change\n");
    assert.throws(() => validateSourceCheckout(directory, head, main));
    git("add", "source-proof.txt");
    assert.throws(() => validateSourceCheckout(directory, head, main));
    git("restore", "--source", head, "--staged", "--worktree", "--", "source-proof.txt");
    const descendant = git(
      "commit-tree",
      `${base}^{tree}`,
      "-p",
      head,
      "-m",
      "Later reviewed main with another tree",
    );
    git("update-ref", "refs/remotes/origin/main", descendant);
    const ancestry = validateSourceCheckout(directory, head, descendant);
    assert.equal(ancestry.proofMode, "ancestry");
    assert.equal(ancestry.sourceInMainHistory, true);
    assert.equal(ancestry.exactTreeMatch, false);
    git("update-ref", "-d", "refs/remotes/origin/main");
    assert.throws(() => validateSourceCheckout(directory, head));
    const ref = join(directory, ".git/refs/remotes/origin/main");
    await mkdir(join(directory, ".git/refs/remotes/origin"), { recursive: true });
    await writeFile(ref, `${"f".repeat(40)}\n`);
    assert.throws(() => validateSourceCheckout(directory, head));
    await writeFile(ref, `${main}\n`);
    const broken = input(
      `tree ${tree}\nparent ${"f".repeat(40)}\nauthor Fixture <fixture@example.invalid> 0 +0000\ncommitter Fixture <fixture@example.invalid> 0 +0000\n\nMissing ancestry object\n`,
      "hash-object",
      "-t",
      "commit",
      "-w",
      "--stdin",
    );
    git("update-ref", "refs/remotes/origin/main", broken);
    // A Git error must not be treated as ordinary non-ancestry, even with equal trees.
    assert.throws(() => validateSourceCheckout(directory, head, broken));
  });
});

test("R07 source proof survives replacement HTTP reports and rejects altered H/main/fields", async () => {
  await withGitRepository(async ({ directory, git, base }) => {
    git("update-ref", "refs/remotes/origin/main", base);
    const proof = validateSourceCheckout(directory, base, base);
    const expected = { source: base, reviewedMain: base };
    for (const mode of ["transport", "full"]) {
      const observed = { source: base, mode, passed: true, ...qualificationCoverage(candidate) };
      const bound = bindSourceReport(observed, proof, expected);
      assert.deepEqual(bound.sourceBinding, proof);
      assert.equal(bound.sourceBindingVerified, false);
      assert.equal(bound.seoQualified, false);
      assert.equal(bound.sitemapConsistencyQualified, false);
      assert.equal(bound.fullLegacyParityQualified, false);
      for (const changed of [
        { sourceCommit: "c".repeat(40) },
        { reviewedMainCommit: "c".repeat(40) },
        { sourceTree: "c".repeat(40) },
        { proofMode: "exact_tree_squash" },
        { unexpectedQualifiedSource: base },
        { sha256: "f".repeat(64) },
      ])
        assert.throws(() => bindSourceReport(observed, { ...proof, ...changed }, expected));
      assert.throws(() =>
        bindSourceReport({ ...observed, source: "c".repeat(40) }, proof, expected),
      );
      assert.throws(() =>
        bindSourceReport(observed, proof, { source: "c".repeat(40), reviewedMain: base }),
      );
      assert.throws(() =>
        bindSourceReport(observed, proof, { source: base, reviewedMain: "c".repeat(40) }),
      );
    }
  });
});

test("R07 CLI uploads same-tree provenance after transport report replacement and fails on main drift", async () => {
  await withGitRepository(async ({ directory, git, base }) => {
    const artifacts = await mkdtemp(join(tmpdir(), "msr-http-artifacts-"));
    try {
      await mkdir(join(directory, "scripts"));
      await writeFile(
        join(directory, "scripts/staging-http-qualification.mjs"),
        await readFile(new URL("./staging-http-qualification.mjs", import.meta.url)),
      );
      await mkdir(join(directory, "src/server/legacy"), { recursive: true });
      await writeFile(
        join(directory, "src/server/legacy/presentation.ts"),
        await readFile(new URL("../src/server/legacy/presentation.ts", import.meta.url)),
      );
      await symlink(
        await realpath(new URL("../node_modules", import.meta.url)),
        join(directory, "node_modules"),
        "dir",
      );
      await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
      await writeFile(join(directory, "package-lock.json"), "{}\n");
      git(
        "add",
        "scripts/staging-http-qualification.mjs",
        "src",
        "package.json",
        "package-lock.json",
      );
      git("commit", "--quiet", "-m", "Qualified verifier and source H");
      const head = git("rev-parse", "HEAD"),
        tree = git("rev-parse", "HEAD^{tree}");
      const main = git("commit-tree", tree, "-p", base, "-m", "Reviewed squash S");
      const moved = git(
        "commit-tree",
        tree,
        "-p",
        base,
        "-m",
        "A different reviewed main revision",
      );
      git("update-ref", "refs/remotes/origin/main", main);
      const bundle = join(artifacts, "bundle");
      await mkdir(bundle);
      for (const name of [
        "candidate",
        "runtime",
        "isolation",
        "connectivity",
        "provenance",
        "provider",
      ])
        await writeFile(
          join(bundle, `staging-${name}.generated.json`),
          JSON.stringify(
            name === "candidate" ? { ...candidate, sourceCommit: head } : { synthetic: true },
          ),
        );
      const wrapper = `import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';import{pathToFileURL}from'node:url';
const args=process.argv.slice(1);let calls=0;globalThis.fetch=async(url,init)=>{calls++;assert(Object.values(${JSON.stringify(origins)}).includes(new URL(url).origin));assert.equal(init.redirect,'manual');
if(process.env.MSR_FAKE_MAIN_DRIFT&&calls===8)execFileSync('git',['update-ref','refs/remotes/origin/main',process.env.MSR_FAKE_MAIN_DRIFT]);
if(!init.headers['CF-Access-Client-Secret'])return new Response(null,{status:302,headers:{location:'https://fixture.cloudflareaccess.com/login'}});
const headers={'x-robots-tag':'noindex'};const path=new URL(url).pathname;
if(path==='/api/health')return Response.json({status:'ok',build:process.env.GITHUB_SHA},{headers});
if(path==='/bg/access')return new Response('<main>Saved-key sign-in</main>',{headers:{...headers,'content-type':'text/html'}});
assert.equal(path,'/bg/cases');return new Response(null,{status:307,headers:{...headers,location:'/bg/access'}})};
process.on('exit',()=>{if(calls!==8)process.exitCode=99});process.argv=[process.execPath,args[0],...args.slice(1)];await import(pathToFileURL(args[0]));`;
      for (const drift of [false, true]) {
        git("update-ref", "refs/remotes/origin/main", main);
        const output = join(artifacts, drift ? "drift" : "passing");
        let status = 0;
        let childOutput = "";
        try {
          execFileSync(
            process.execPath,
            [
              "--input-type=module",
              "-e",
              wrapper,
              join(directory, "scripts/staging-http-qualification.mjs"),
              "run",
              directory,
              bundle,
              output,
              head,
              "transport",
            ],
            {
              cwd: directory,
              encoding: "utf8",
              env: {
                ...process.env,
                ...env,
                GITHUB_SHA: head,
                GITHUB_WORKFLOW_SHA: head,
                STAGING_SOURCE_QUALIFIED_SHA: head,
                REVIEWED_MAIN_SHA: main,
                STAGING_ACCESS_SERVICE_CLIENT_SECRET: "synthetic-secret",
                MSR_FAKE_MAIN_DRIFT: drift ? moved : "",
              },
            },
          );
        } catch (error) {
          status = error.status;
          childOutput = `${error.stdout ?? ""}${error.stderr ?? ""}`;
        }
        assert.equal(status, drift ? 2 : 0, childOutput);
        const report = JSON.parse(await readFile(join(output, "qualification.json"), "utf8"));
        assert.equal(report.sourceBinding.sourceCommit, head);
        assert.equal(report.sourceBinding.reviewedMainCommit, main);
        assert.equal(report.sourceBinding.proofMode, "exact_tree_squash");
        assert.equal(report.sourceBinding.sourceInMainHistory, false);
        assert.equal(report.sourceBinding.exactTreeMatch, true);
        assert.equal(report.passed, !drift);
        assert.equal(report.sourceBindingVerified, !drift);
        assert.equal(report.seoQualified, false);
        assert.equal(report.sitemapConsistencyQualified, false);
        assert.equal(report.fullLegacyParityQualified, false);
        if (drift) assert.equal(report.failedPhase, "source_binding_after");
      }
    } finally {
      await rm(artifacts, { recursive: true, force: true });
    }
  });
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
  assert.equal(
    validateProviderRead(`https://api.cloudflare.com/client/v4/zones/${zoneId}`),
    `https://api.cloudflare.com/client/v4/zones/${zoneId}`,
  );
  assert.equal(
    validateProviderRead(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=staging.makler-realty.com`,
    ),
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=staging.makler-realty.com`,
  );
  for (const method of ["POST", "PUT", "PATCH", "DELETE"])
    assert.throws(() => validateProviderRead(url, { method }));
  assert.throws(() => validateProviderRead(url.replace(accountId, "0".repeat(32))));
  assert.throws(() =>
    validateProviderRead(
      `https://api.cloudflare.com/client/v4/zones/${"0".repeat(32)}/dns_records`,
    ),
  );
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

const sourcePage = {
  bodyText: "Retained source text",
  sourceHash: createHash("sha256").update("Retained source text").digest("hex"),
  title: "Source gallery",
  locale: "bg",
  media: [
    { url: "https://makler-realty.com/wp-content/uploads/first%20view.jpg" },
    { url: "https://makler-realty.ru/wp-content/uploads/second.png" },
  ],
};
const sourceGallery = [
  "/legacy-media/makler-realty.com/wp-content/uploads/first%20view.jpg",
  "/legacy-media/makler-realty.ru/wp-content/uploads/second.png",
];
function galleryChecks(sources, page = sourcePage) {
  const dom = new JSDOM(
    '<article lang="bg"><h1>Source gallery</h1><div data-legacy-source-body>Retained source text</div></article>',
  );
  try {
    dom.window.document
      .querySelector("article")
      .setAttribute("data-legacy-source-hash", page.sourceHash);
    for (const src of sources) {
      const image = dom.window.document.createElement("img");
      if (src !== null) image.setAttribute("src", src);
      dom.window.document.querySelector("article").append(image);
    }
    return sourcePageChecks(dom.window.document, page);
  } finally {
    dom.window.close();
  }
}

const readingPage = {
  ...sourcePage,
  media: [],
  bodyText:
    "No: SYN-12 Country: Recorded place Price: 120000 EUR\nSource gallery\nLiteral […] [unknown-plugin field='retain'] prose.\nTweet Name Email Phone Message Send",
  listing: {
    liveSourceFields: [
      { label: "No:", value: "SYN-12" },
      { label: "Country:", value: "Recorded place" },
      { label: "Price:", value: "120000 EUR" },
    ],
  },
  contentLinks: [
    { url: "https://example.test/item", text: "Recorded source" },
    { url: "https://example.test/details", text: "Recorded details" },
  ],
};
readingPage.sourceHash = createHash("sha256").update(readingPage.bodyText).digest("hex");

function readingChecks(mutate = () => {}, page = readingPage) {
  const dom = new JSDOM('<article lang="bg"><h1>Source gallery</h1></article>');
  const document = dom.window.document,
    article = document.querySelector("article");
  article.setAttribute("data-legacy-source-hash", readingPage.sourceHash);
  const body = document.createElement("div");
  body.setAttribute("data-legacy-source-body", "");
  body.textContent = "Source gallery\nLiteral […] [unknown-plugin field='retain'] prose.";
  article.append(body);
  const facts = document.createElement("dl");
  facts.setAttribute("data-legacy-source-facts", "");
  for (const field of readingPage.listing.liveSourceFields) {
    const row = document.createElement("div"),
      label = document.createElement("dt"),
      value = document.createElement("dd");
    label.textContent = field.label;
    value.textContent = field.value;
    row.append(label, value);
    facts.append(row);
  }
  article.append(facts);
  const section = document.createElement("section"),
    heading = document.createElement("h2");
  heading.id = "archive-links";
  section.append(heading);
  for (const link of readingPage.contentLinks) {
    const row = document.createElement("li"),
      anchor = document.createElement("a");
    anchor.setAttribute("href", link.url);
    anchor.textContent = link.text;
    row.append(anchor);
    section.append(row);
  }
  article.append(section);
  try {
    mutate(document);
    return sourcePageChecks(document, page);
  } finally {
    dom.window.close();
  }
}

test("P21/R07 verifies the exact reading view, source fact values and links while binding the unchanged raw capture", () => {
  assert(Object.values(readingChecks()).every(Boolean));
  assert.notEqual(
    readingPage.bodyText,
    "Source gallery\nLiteral […] [unknown-plugin field='retain'] prose.",
  );
});

test("P21/R07 missing, altered, extra or reordered fact labels and values fail", () => {
  for (const mutate of [
    (d) => {
      d.querySelector("dd").textContent = "SYN-13";
    },
    (d) => {
      d.querySelector("dt").textContent = "Inferred reference:";
    },
    (d) => {
      d
        .querySelector("[data-legacy-source-facts]")
        .lastElementChild.querySelector("dd").textContent = "1 USD";
    },
    (d) => {
      d.querySelector("[data-legacy-source-facts] > div").remove();
    },
    (d) => {
      const group = d.querySelector("[data-legacy-source-facts]");
      group.prepend(group.lastElementChild);
    },
    (d) => {
      const group = d.querySelector("[data-legacy-source-facts]");
      group.append(group.firstElementChild.cloneNode(true));
    },
    (d) => {
      const group = d.querySelector("[data-legacy-source-facts]");
      group.after(group.cloneNode(true));
    },
  ])
    assert.equal(readingChecks(mutate).sourceFacts, false);
});

test("P21/R07 changed narrative, lost editorial markup, duplicated bodies and wrong raw identity fail", () => {
  for (const mutate of [
    (d) => {
      d.querySelector("[data-legacy-source-body]").textContent = "Different property narrative.";
    },
    (d) => {
      const body = d.querySelector("[data-legacy-source-body]");
      body.textContent = body.textContent.replace("[unknown-plugin field='retain']", "");
    },
    (d) => {
      const body = d.querySelector("[data-legacy-source-body]");
      body.after(body.cloneNode(true));
    },
  ])
    assert.equal(readingChecks(mutate).sourceBody, false);
  assert.equal(
    readingChecks((d) => {
      d.querySelector("article").removeAttribute("data-legacy-source-hash");
    }).sourceEvidence,
    false,
  );
  assert.equal(
    readingChecks((d) => {
      d.querySelector("article").setAttribute("data-legacy-source-hash", "f".repeat(64));
    }).sourceEvidence,
    false,
  );
  assert.equal(
    readingChecks(() => {}, { ...readingPage, bodyText: `${readingPage.bodyText} ` })
      .sourceEvidence,
    false,
  );
});

test("P21/R07 source link destinations, labels, count and order remain exact", () => {
  for (const mutate of [
    (d) => {
      d.querySelector("li a").setAttribute("href", "https://example.test/different");
    },
    (d) => {
      d.querySelector("li a").textContent = "Unrecorded label";
    },
    (d) => {
      d.querySelector("li").remove();
    },
    (d) => {
      const section = d.querySelector("section");
      section.append(section.querySelector("li").cloneNode(true));
    },
    (d) => {
      const section = d.querySelector("section");
      section.append(section.querySelector("li"));
    },
    (d) => {
      const heading = d.querySelector("#archive-links");
      heading.after(heading.cloneNode(true));
    },
  ])
    assert.equal(readingChecks(mutate).sourceLinks, false);
});

test("R07 source galleries preserve each source host, encoded path and photo order", () => {
  for (const sources of [
    sourceGallery,
    sourceGallery.map((src) => `${origins.public}${src}`),
    [sourceGallery[0], `${origins.public}${sourceGallery[1]}`],
  ])
    assert(Object.values(galleryChecks(sources)).every(Boolean));
  assert(Object.values(galleryChecks([], { ...sourcePage, media: [] })).every(Boolean));
});

test("R07 same-count galleries from a different property fail exact source binding", () => {
  const checks = galleryChecks([
    "/legacy-media/makler-realty.com/wp-content/uploads/another-property.jpg",
    sourceGallery[1],
  ]);
  assert.equal(checks.galleryCount, true);
  assert.equal(checks.stagingImages, true);
  assert.equal(checks.gallerySourcesInOrder, false);
});

test("R07 same-count galleries with the correct photos in the wrong order fail", () => {
  const checks = galleryChecks([...sourceGallery].reverse());
  assert.equal(checks.galleryCount, true);
  assert.equal(checks.stagingImages, true);
  assert.equal(checks.gallerySourcesInOrder, false);
});

test("R07 gallery source binding rejects duplicates, wrong hosts and altered URLs", () => {
  for (const first of [
    sourceGallery[1],
    sourceGallery[0].replace("makler-realty.com", "makler-realty.ru"),
    sourceGallery[0].replace("%20", " "),
    `${sourceGallery[0]}?different=1`,
    `${sourceGallery[0]}#different`,
    `https://example.test${sourceGallery[0]}`,
    `//staging.makler-realty.com${sourceGallery[0]}`,
    null,
  ])
    assert.equal(galleryChecks([first, sourceGallery[1]]).gallerySourcesInOrder, false);
  assert.equal(galleryChecks(sourceGallery.slice(1)).gallerySourcesInOrder, false);
});

test("R07 passing HTTP content with an empty head leaves SEO and sitemap evidence unqualified", () => {
  assert(Object.values(galleryChecks(sourceGallery)).every(Boolean));
  const coverage = qualificationCoverage(candidate);
  assert.equal(coverage.fullLegacyParityQualified, false);
  assert.equal(coverage.seoQualified, false);
  assert.equal(coverage.sitemapConsistencyQualified, false);
  assert.equal(coverage.requiredSeparateEvidence.expectedSource, candidate.sourceCommit);
  assert.equal(coverage.requiredSeparateEvidence.expectedImage, candidate.image);
  assert.equal(coverage.requiredSeparateEvidence.artifact, "staging-url-seo-sitemap-parity.json");
  assert.equal(
    coverage.requiredSeparateEvidence.status,
    "required_separate_candidate_bound_evidence",
  );
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
  assert.equal(result.fullHttpQualificationPassed, false);
  assert.equal(result.fullLegacyParityQualified, false);
  assert.equal(result.seoQualified, false);
  assert.equal(result.sitemapConsistencyQualified, false);
  assert(!("fullQualificationPassed" in result));
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
  assert(workflow.includes('test "$GITHUB_REF" = refs/heads/codex/msr-staging'));
  assert(workflow.includes('test "$GITHUB_SHA" = "$EXPECTED_SOURCE"'));
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

test("R07 inventory evidence cannot advance the exact qualified staging ref", async () => {
  const inventory = await readFile(
    new URL("../.github/workflows/staging-cloudflare.yml", import.meta.url),
    "utf8",
  );
  assert(inventory.includes("contents: read"));
  assert(inventory.includes("persist-credentials: false"));
  assert(/ref: \$\{\{ github\.sha \}\}/u.test(inventory));
  assert(inventory.includes("actions/upload-artifact@"));
  assert(/ms-realty-cloudflare-inventory-\$\{\{ github\.run_id \}\}/u.test(inventory));
  for (const write of ["contents: write", "git push", "git commit", "git add"])
    assert(!inventory.includes(write), write);
});
