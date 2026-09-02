import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  HERMES_UPSTREAM_DOCKER_REPOSITORY,
  HERMES_UPSTREAM_REPOSITORY,
  HERMES_UPSTREAM_PIN_FILE_PATHS,
  assertHermesManifestDigest,
  assertHermesUpstreamProvenance,
  buildHermesUpstreamProvenance,
  fetchOfficialHermesReleases,
  hermesImageForRelease,
  parseHermesImageReference,
  parseStableHermesRelease,
  readHermesImagePin,
  resolveHermesDockerManifestDigest,
  resolveOfficialHermesTagCommit,
  selectLatestStableHermesRelease,
  synchronizeHermesImagePins,
} from "../lib/hermes-upstream-update.mjs";
import {
  HERMES_COMPATIBILITY_CONFIG_MOUNT,
  HERMES_COMPATIBILITY_REQUIRED_CONFIG_MARKERS,
  buildHermesCompatibilityPlan,
} from "../lib/hermes-agent-compatibility.mjs";
import { fromRoot } from "../lib/paths.mjs";

const RELEASE_TAG = "v2026.8.31";
const RELEASE_COMMIT = "29112bef099274229cadff79cdff7bf7b99c4b77";
const MANIFEST_DIGEST = "sha256:64923faeae267792bf9bf87fe3b4c4869e35004e360c7df01730ad801b74d524";
const IMAGE = hermesImageForRelease(RELEASE_TAG, MANIFEST_DIGEST);

test("Hermes release selection accepts only official stable semver-like tags", () => {
  const stable = parseStableHermesRelease({
    id: 31,
    tag_name: RELEASE_TAG,
    name: "Hermes Agent",
    published_at: "2026-08-31T19:29:49Z",
    html_url: `https://github.com/${HERMES_UPSTREAM_REPOSITORY}/releases/tag/${RELEASE_TAG}`,
  });
  assert.equal(stable.tag, RELEASE_TAG);
  assert.deepEqual(stable.version, [2026, 8, 31, 0]);
  assert.throws(() => parseStableHermesRelease({ ...stable, draft: true }), /draft/);
  assert.throws(() => parseStableHermesRelease({ ...stable, prerelease: true }), /prerelease/);
  assert.throws(() => parseStableHermesRelease({ ...stable, tag_name: "latest" }), /malformed/);
  assert.throws(() => parseStableHermesRelease({ ...stable, tag_name: "v2026.13.1" }), /malformed/);

  const selected = selectLatestStableHermesRelease([
    { ...stable, tag_name: "v2026.8.30" },
    { ...stable, tag_name: RELEASE_TAG, prerelease: true },
    { ...stable, tag_name: "v2026.8.31.2" },
    { ...stable, tag_name: "not-a-release" },
  ]);
  assert.equal(selected.tag, "v2026.8.31.2");
});

test("Hermes provenance resolves the release commit and Docker manifest digest", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/releases?")) {
      return { ok: true, status: 200, json: async () => [{ tag_name: RELEASE_TAG, published_at: "2026-08-31T19:29:49Z" }] };
    }
    if (String(url).includes("auth.docker.io/token")) {
      return { ok: true, status: 200, json: async () => ({ token: "registry-test-token" }) };
    }
    if (String(url).includes(`/commits/${RELEASE_TAG}`)) {
      return { ok: true, status: 200, json: async () => ({ sha: RELEASE_COMMIT }) };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({
        "docker-content-digest": MANIFEST_DIGEST,
        "content-type": "application/vnd.oci.image.index.v1+json",
      }),
    };
  };

  const releases = await fetchOfficialHermesReleases({ fetchImpl, githubToken: "github-test-token" });
  assert.equal(selectLatestStableHermesRelease(releases).tag, RELEASE_TAG);
  const commit = await resolveOfficialHermesTagCommit(RELEASE_TAG, { fetchImpl, githubToken: "github-test-token" });
  const docker = await resolveHermesDockerManifestDigest(RELEASE_TAG, { fetchImpl });
  const provenance = buildHermesUpstreamProvenance({
    release: parseStableHermesRelease({ tag_name: RELEASE_TAG, published_at: "2026-08-31T19:29:49Z" }),
    commit,
    docker,
    generatedAt: "2026-09-01T00:00:00Z",
  });

  assert.equal(commit.sha, RELEASE_COMMIT);
  assert.equal(docker.digest, MANIFEST_DIGEST);
  assert.equal(provenance.managed_image, IMAGE);
  assert.equal(assertHermesUpstreamProvenance(provenance), true);
  assert.throws(
    () => assertHermesUpstreamProvenance({ ...provenance, upstream: { ...provenance.upstream, release: { ...provenance.upstream.release, url: "https://example.invalid/release" } } }),
    /release URL/,
  );
  assert.throws(
    () => assertHermesUpstreamProvenance({ ...provenance, upstream: { ...provenance.upstream, docker: { ...provenance.upstream.docker, manifest_url: "https://example.invalid/manifest" } } }),
    /manifest URL/,
  );
  assert.equal(JSON.stringify(provenance).includes("github-test-token"), false);
  assert.equal(JSON.stringify(provenance).includes("registry-test-token"), false);
  assert.equal(calls.find(({ url }) => url.includes("/commits/"))?.options.headers.authorization, "Bearer github-test-token");
  assert.equal(calls.find(({ url }) => url.includes("/manifests/"))?.options.headers.authorization, "Bearer registry-test-token");
  assert.equal(assertHermesManifestDigest(MANIFEST_DIGEST), MANIFEST_DIGEST);
  assert.throws(() => assertHermesManifestDigest("sha256:bad"), /digest/);
  assert.throws(() => parseHermesImageReference(`${HERMES_UPSTREAM_DOCKER_REPOSITORY}:${RELEASE_TAG}`.replace("@", ""), { requireDigest: true }), /digest/);
});

test("all Hermes source-of-truth pins update together and reject drift", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-hermes-pins-"));
  const files = HERMES_UPSTREAM_PIN_FILE_PATHS.map((name, index) => {
    const filePath = path.join(directory, `pin-${index}.txt`);
    fs.writeFileSync(filePath, `prefix ${HERMES_UPSTREAM_DOCKER_REPOSITORY}:v2026.7.7.2 suffix\n`);
    return filePath;
  });

  const result = synchronizeHermesImagePins(IMAGE, files);
  assert.deepEqual(result.changed, files);
  assert.equal(readHermesImagePin(files), IMAGE);
  assert.deepEqual(parseHermesImageReference(IMAGE, { requireDigest: true }), {
    image: IMAGE,
    repository: HERMES_UPSTREAM_DOCKER_REPOSITORY,
    tag: RELEASE_TAG,
    digest: MANIFEST_DIGEST,
  });

  fs.writeFileSync(files[0], `${fs.readFileSync(files[0], "utf8")}${IMAGE}\n`);
  assert.throws(() => readHermesImagePin(files), /exactly one Hermes image pin/);
  fs.writeFileSync(files[0], `prefix ${HERMES_UPSTREAM_DOCKER_REPOSITORY}:v2026.7.7.2 suffix\n`);
  fs.writeFileSync(files[1], `prefix ${HERMES_UPSTREAM_DOCKER_REPOSITORY}:v2026.7.7.2 suffix\n`);
  fs.writeFileSync(files[2], `prefix ${HERMES_UPSTREAM_DOCKER_REPOSITORY}:v2026.8.30 suffix\n`);
  assert.throws(() => readHermesImagePin(files), /out of sync/);
});

test("compatibility smoke plan is immutable, read-only, no-network, and safety-configured", () => {
  const plan = buildHermesCompatibilityPlan(IMAGE);
  assert.equal(plan.image, IMAGE);
  assert.deepEqual(plan.pull, ["pull", IMAGE]);
  for (const command of [plan.version, plan.help, plan.config, plan.start]) {
    assert.ok(command.includes("--read-only"));
    assert.ok(command.includes("--network") && command.includes("none"));
    assert.ok(command.includes(IMAGE));
  }
  const configCommand = plan.config.join(" ");
  assert.ok(configCommand.includes("memory_enabled: false"));
  assert.ok(configCommand.includes("- browser"));
  assert.ok(configCommand.includes("- terminal"));
  assert.ok(configCommand.includes("- web"));
  assert.ok(plan.start.includes("API_SERVER_ENABLED=true"));
  assert.ok(plan.start.includes("API_SERVER_KEY=ms-realty-compatibility-smoke-only"));
  const startCommand = plan.start.join(" ");
  assert.match(startCommand, /--tmpfs \/run:rw,nosuid,size=16m/);
  assert.doesNotMatch(startCommand, /\/run:rw,noexec/);
  assert.match(startCommand, /--tmpfs \/opt\/data:rw,noexec,nosuid,size=64m/);
  assert.match(startCommand, /--tmpfs \/tmp:rw,noexec,nosuid,size=64m/);
  assert.throws(() => buildHermesCompatibilityPlan(`${HERMES_UPSTREAM_DOCKER_REPOSITORY}:${RELEASE_TAG}`), /digest/);
});

test("Hermes compatibility config check exits successfully only with every safety marker", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-hermes-config-check-"));
  const configPath = path.join(directory, "config.yaml");
  const snippet = buildHermesCompatibilityPlan(IMAGE, { configPath }).config.at(-1);
  const runCheck = (contents) => {
    fs.writeFileSync(configPath, contents);
    return spawnSync("python3", ["-c", snippet.replaceAll(HERMES_COMPATIBILITY_CONFIG_MOUNT, configPath)], {
      encoding: "utf8",
    });
  };

  try {
    const valid = runCheck(HERMES_COMPATIBILITY_REQUIRED_CONFIG_MARKERS.join("\n"));
    assert.equal(valid.error, undefined);
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /config: pass/);

    const missingMarker = HERMES_COMPATIBILITY_REQUIRED_CONFIG_MARKERS.at(-1);
    const invalid = runCheck(HERMES_COMPATIBILITY_REQUIRED_CONFIG_MARKERS.slice(0, -1).join("\n"));
    assert.equal(invalid.error, undefined);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, new RegExp(`missing Hermes safety config: .*${missingMarker}`));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Hermes compatibility retries only the immutable pull three times", () => {
  const smoke = fs.readFileSync(fromRoot("production", "scripts", "hermes-agent-compatibility-smoke.mjs"), "utf8");
  const pullRetryStart = smoke.indexOf("for (let attempt = 1; attempt <= 3; attempt += 1) {");
  const versionRun = smoke.indexOf("run(plan.version);");
  const pullRetry = smoke.slice(pullRetryStart, versionRun);

  assert.ok(pullRetryStart >= 0);
  assert.ok(versionRun > pullRetryStart);
  assert.equal((smoke.match(/run\(plan\.pull\)/g) || []).length, 1);
  assert.match(pullRetry, /run\(plan\.pull\);\s+break;/);
  assert.match(pullRetry, /if \(attempt === 3\) throw error;/);
  assert.match(pullRetry, /await new Promise\(\(resolve\) => setTimeout\(resolve, 1000\)\)/);
  assert.doesNotMatch(pullRetry, /plan\.(version|help|config|start|health|stop)/);
  assert.ok(pullRetry.indexOf("run(plan.pull)") < pullRetry.indexOf("setTimeout"));
  assert.ok(versionRun > pullRetry.indexOf("setTimeout"));
  for (const command of ["version", "help", "config", "start"]) {
    assert.ok(smoke.indexOf(`run(plan.${command}`) >= versionRun);
  }
  assert.ok(smoke.indexOf("let healthy = false;") > versionRun);
  assert.ok(smoke.indexOf("} finally {") > versionRun);
});

test("Hermes updater fences every dirty path before staging and commits as the Actions bot", () => {
  const updater = fs.readFileSync(fromRoot(".github", "workflows", "hermes-upstream-update.yml"), "utf8");
  const updateStepStart = updater.indexOf("name: Resolve official release, digest, and synchronized pins");
  const updateStepEnd = updater.indexOf("name: Push updater branch with a lease");
  const updateStep = updater.slice(updateStepStart, updateStepEnd);
  const generatorsEnd = updateStep.indexOf("npm run hermes:provisioning");
  const dirtyFence = updateStep.indexOf("git ls-files --others --exclude-standard");
  const firstStage = updateStep.indexOf("git add --");
  const firstEarlyExit = updateStep.indexOf("exit 0");
  const commit = updateStep.indexOf('git commit -m "chore: update Hermes Agent upstream pin"');

  assert.ok(generatorsEnd >= 0);
  assert.match(updateStep, /git diff --name-only --no-renames/);
  assert.match(updateStep, /git diff --cached --name-only --no-renames/);
  assert.match(updateStep, /git ls-files --others --exclude-standard/);
  assert.match(updateStep, /Updater generated a disallowed path/);
  assert.ok(dirtyFence > generatorsEnd);
  assert.ok(dirtyFence < firstStage);
  assert.ok(dirtyFence < firstEarlyExit);
  assert.ok(updateStep.indexOf("git diff --check") > dirtyFence);
  assert.match(updateStep, /git config user\.name "github-actions\[bot\]"/);
  assert.match(updateStep, /git config user\.email "41898282\+github-actions\[bot\]@users\.noreply\.github\.com"/);
  assert.ok(updateStep.indexOf('git config user.name "github-actions[bot]"') < commit);
  assert.ok(updateStep.indexOf('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"') < commit);
  assert.doesNotMatch(updateStep.slice(0, dirtyFence), /git add --/);
});

test("auto-merge fences the reserved Hermes branch to dispatches from github-actions[bot]", () => {
  const autoMerge = fs.readFileSync(fromRoot(".github", "workflows", "auto-merge.yml"), "utf8");
  const reservedBranchGuard = autoMerge.indexOf(
    'pull.head.ref === "automation/hermes-agent-updater" &&\n              (!isHermesUpdaterRun || pull.user?.login !== "github-actions[bot]")',
  );
  const merge = autoMerge.indexOf("github.rest.pulls.merge");

  assert.ok(reservedBranchGuard >= 0);
  assert.match(autoMerge, /workflowRun\.event === "workflow_dispatch"/);
  assert.match(autoMerge, /!isHermesUpdaterRun \|\| pull\.user\?\.login !== "github-actions\[bot\]"/);
  assert.ok(reservedBranchGuard < merge);
  assert.doesNotMatch(autoMerge.slice(reservedBranchGuard, merge), /github\.rest\.pulls\.merge/);
  assert.match(autoMerge, /github\.event\.workflow_run\.event == 'pull_request'/);
  assert.match(autoMerge, /!trustedUpdaterBot && !\["OWNER", "MEMBER", "COLLABORATOR"\]/);
});

test("workflow fences official updater provenance, full CI dispatch, and compatibility-gated auto-merge", () => {
  const updater = fs.readFileSync(fromRoot(".github", "workflows", "hermes-upstream-update.yml"), "utf8");
  const ci = fs.readFileSync(fromRoot(".github", "workflows", "ci.yml"), "utf8");
  const autoMerge = fs.readFileSync(fromRoot(".github", "workflows", "auto-merge.yml"), "utf8");

  assert.match(updater, /cron: "17 \* \* \* \*"/);
  assert.match(updater, /workflow_dispatch:/);
  assert.match(updater, /NousResearch\/hermes-agent/);
  assert.match(updater, /actions\.createWorkflowDispatch/);
  assert.match(updater, /hermes_update: "true"/);
  assert.match(updater, /expected_head_sha: process\.env\.HERMES_HEAD_SHA/);
  assert.match(updater, /pull_request_number: String\(pull\.number\)/);
  assert.match(updater, /git push --force-with-lease/);
  assert.match(updater, /remote_exists=true/);
  assert.match(updater, /remote_exists=false/);
  assert.match(updater, /Updater branch contains a disallowed path/);
  assert.match(updater, /git diff --name-only origin\/main\.\.\."origin\/\$\{HERMES_UPDATE_BRANCH\}"/);
  assert.match(updater, /git switch --create "\$\{HERMES_UPDATE_BRANCH\}" --force origin\/main/);
  assert.doesNotMatch(updater, /git switch --create "\$\{HERMES_UPDATE_BRANCH\}" --force "origin\/\$\{HERMES_UPDATE_BRANCH\}"/);
  assert.ok(
    updater.indexOf('git switch --create "${HERMES_UPDATE_BRANCH}" --force origin/main') <
      updater.indexOf("npm run hermes:upstream:update"),
  );
  assert.match(updater, /git merge-base --is-ancestor origin\/main "origin\/\$\{HERMES_UPDATE_BRANCH\}"/);
  assert.match(updater, /git diff --quiet "origin\/\$\{HERMES_UPDATE_BRANCH\}" -- "\$\{tracked_paths\[@\]\}"/);
  assert.match(updater, /ms-realty:hermes-upstream-update/);
  assert.doesNotMatch(updater, /nousresearch\/hermes-agent:latest/);

  assert.match(ci, /workflow_dispatch:/);
  assert.match(ci, /hermes_update:/);
  assert.match(ci, /expected_head_sha:/);
  assert.match(ci, /test "\$HERMES_EXPECTED_HEAD_SHA" = "\$GITHUB_SHA"/);
  assert.match(ci, /git merge-base --is-ancestor origin\/main HEAD/);
  assert.match(ci, /git diff --name-status --no-renames origin\/main\.\.\.HEAD/);
  assert.match(ci, /test "\$\{#changed_entries\[@\]\}" -eq "\$\{#expected_paths\[@\]\}"/);
  assert.match(ci, /test "\$status" = "M"/);
  assert.match(ci, /name: Hermes compatibility smoke/);
  assert.match(ci, /needs: check/);
  assert.match(ci, /npm run hermes:compatibility/);
  assert.match(ci, /github\.head_ref == 'automation\/hermes-agent-updater'/);
  assert.doesNotMatch(ci, /nousresearch\/hermes-agent:latest/);

  assert.match(autoMerge, /workflow_run:/);
  assert.match(autoMerge, /actions: read/);
  assert.match(autoMerge, /workflowRun\.event === "workflow_dispatch"/);
  assert.match(autoMerge, /ms-realty:hermes-upstream-update/);
  assert.match(autoMerge, /listJobsForWorkflowRun/);
  assert.match(autoMerge, /Hermes compatibility smoke/);
  assert.match(autoMerge, /workflowRun\.head_sha/);
  assert.match(autoMerge, /trustedUpdaterBot/);
  assert.match(autoMerge, /pull\.user\?\.login === "github-actions\[bot\]"/);
  assert.match(autoMerge, /!trustedUpdaterBot && !\["OWNER", "MEMBER", "COLLABORATOR"\]/);
  assert.match(autoMerge, /compareCommitsWithBasehead/);
  assert.match(autoMerge, /comparison\.status === "ahead"/);
  assert.match(autoMerge, /changedFiles\.every\(\(\{ status, previous_filename: previousFilename \}\)/);
  assert.match(autoMerge, /pulls\.merge/);
  assert.match(autoMerge, /auto_merge_deploy/);

  const expectedPaths = [
    "SOURCE_OF_TRUTH.md",
    "production/data/hermes-provider-provisioning-report.json",
    "production/data/hermes-upstream-provenance.json",
    "production/docker-compose.local-production.yml",
    "production/lib/hermes-provider-provisioning.mjs",
  ];
  const ciPaths = [...ci.match(/expected_paths=\(\n([\s\S]*?)\n\s*\)/)[1].matchAll(/^\s+([^\s]+)$/gm)].map(([, file]) => file);
  const autoMergePaths = [
    ...autoMerge.match(/const allowedHermesUpdaterPaths = \[\n([\s\S]*?)\n\s*\];/)[1].matchAll(/"([^"]+)"/g),
  ].map(([, file]) => file);
  const acceptsExactDiff = (allowed, actual) =>
    actual.length === allowed.length && [...actual].sort().every((file, index) => file === allowed[index]);
  for (const allowed of [ciPaths, autoMergePaths]) {
    assert.deepEqual(allowed, expectedPaths);
    assert.equal(acceptsExactDiff(allowed, expectedPaths), true);
    assert.equal(acceptsExactDiff(allowed, [...expectedPaths, ".github/workflows/ci.yml"]), false);
    assert.equal(acceptsExactDiff(allowed, [...expectedPaths, "production/lib/http.mjs"]), false);
  }
});
