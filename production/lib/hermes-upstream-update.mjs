import fs from "node:fs";
import path from "node:path";
import { fromRoot, repoRelativePath } from "./paths.mjs";

export const HERMES_UPSTREAM_REPOSITORY = "NousResearch/hermes-agent";
export const HERMES_UPSTREAM_DOCKER_REPOSITORY = "nousresearch/hermes-agent";
export const HERMES_UPSTREAM_RELEASES_URL = `https://api.github.com/repos/${HERMES_UPSTREAM_REPOSITORY}/releases?per_page=100`;
export const HERMES_UPSTREAM_RELEASE_URL = `https://github.com/${HERMES_UPSTREAM_REPOSITORY}/releases/tag`;
export const HERMES_UPSTREAM_REGISTRY = "registry-1.docker.io";
export const HERMES_UPSTREAM_PROVENANCE_PATH = fromRoot(
  "production",
  "data",
  "hermes-upstream-provenance.json",
);
export const HERMES_UPSTREAM_PIN_FILE_PATHS = Object.freeze([
  "production/docker-compose.local-production.yml",
  "production/lib/hermes-provider-provisioning.mjs",
  "SOURCE_OF_TRUTH.md",
]);

const RELEASE_TAG_PATTERN = /^v(20\d{2})\.([1-9]|1[0-2])\.([1-9]|[12]\d|3[01])(?:\.(\d+))?$/;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;
const IMAGE_PATTERN = new RegExp(
  `^${HERMES_UPSTREAM_DOCKER_REPOSITORY.replace("/", "\\/")}:(?<tag>v20\\d{2}\\.(?:[1-9]|1[0-2])\\.(?:[1-9]|[12]\\d|3[01])(?:\\.\\d+)?)(?:@(?<digest>sha256:[a-f0-9]{64}))?$`,
);
const SOURCE_IMAGE_PATTERN = new RegExp(`${HERMES_UPSTREAM_DOCKER_REPOSITORY.replace("/", "\\/")}:v[^\\s"'\\x60]+`, "g");
const REGISTRY_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");
const API_HEADERS = Object.freeze({
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "ms-realty-hermes-updater",
});

function objectInput(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function releaseTagParts(tag) {
  const match = RELEASE_TAG_PATTERN.exec(String(tag || "").trim());
  if (!match) throw new Error(`Hermes release tag is malformed: ${tag || "missing"}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] || 0)];
}

function assertCommitSha(value) {
  const sha = String(value || "").trim().toLowerCase();
  if (!COMMIT_SHA_PATTERN.test(sha)) throw new Error("Hermes upstream commit must be a full 40-character SHA");
  return sha;
}

export function assertHermesManifestDigest(value) {
  const digest = String(value || "").trim().toLowerCase();
  if (!DIGEST_PATTERN.test(digest)) throw new Error("Hermes Docker manifest digest must be sha256 plus 64 hex characters");
  return digest;
}

export function parseStableHermesRelease(release) {
  objectInput(release, "Hermes release");
  if (release.draft === true) throw new Error("Hermes release is a draft");
  if (release.prerelease === true) throw new Error("Hermes release is a prerelease");
  const tag = String(release.tag_name || release.tag || "").trim();
  const version = releaseTagParts(tag);
  const publishedAt = String(release.published_at || "").trim();
  if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) {
    throw new Error("Hermes stable release must include a valid published_at timestamp");
  }
  const releaseUrl = `${HERMES_UPSTREAM_RELEASE_URL}/${encodeURIComponent(tag)}`;
  if (release.html_url && release.html_url !== releaseUrl) {
    throw new Error("Hermes release URL must point to the official upstream repository");
  }
  return {
    id: release.id ?? null,
    tag,
    version,
    published_at: publishedAt,
    name: String(release.name || tag),
    url: releaseUrl,
  };
}

export function compareHermesReleaseVersions(left, right) {
  const a = Array.isArray(left?.version) ? left.version : releaseTagParts(left?.tag || left);
  const b = Array.isArray(right?.version) ? right.version : releaseTagParts(right?.tag || right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = Number(a[index] || 0) - Number(b[index] || 0);
    if (delta) return delta;
  }
  return 0;
}

export function selectLatestStableHermesRelease(releases) {
  if (!Array.isArray(releases)) throw new Error("Hermes releases API response must be an array");
  const stable = [];
  for (const release of releases) {
    if (release?.draft === true || release?.prerelease === true) continue;
    try {
      stable.push(parseStableHermesRelease(release));
    } catch {
      // Malformed stable-looking releases are rejected and never become an image pin.
    }
  }
  if (!stable.length) throw new Error("No valid stable Hermes Agent release was found");
  stable.sort((left, right) => {
    const versionDelta = compareHermesReleaseVersions(right, left);
    if (versionDelta) return versionDelta;
    return Date.parse(right.published_at) - Date.parse(left.published_at);
  });
  return stable[0];
}

export function hermesImageForRelease(tag, digest) {
  const parsedTag = String(tag || "").trim();
  releaseTagParts(parsedTag);
  return `${HERMES_UPSTREAM_DOCKER_REPOSITORY}:${parsedTag}@${assertHermesManifestDigest(digest)}`;
}

export function parseHermesImageReference(image, { requireDigest = false } = {}) {
  const value = String(image || "").trim();
  const match = IMAGE_PATTERN.exec(value);
  if (!match) throw new Error(`Hermes image reference is not an official immutable image: ${value || "missing"}`);
  const digest = match.groups.digest ? assertHermesManifestDigest(match.groups.digest) : null;
  if (requireDigest && !digest) throw new Error("Hermes image reference must include a manifest digest");
  return { image: value, repository: HERMES_UPSTREAM_DOCKER_REPOSITORY, tag: match.groups.tag, digest };
}

function withGithubToken(headers, token) {
  const value = String(token || "").trim();
  return value ? { ...headers, authorization: `Bearer ${value}` } : headers;
}

async function jsonResponse(fetchImpl, url, options, label) {
  if (typeof fetchImpl !== "function") throw new Error("Hermes updater requires fetch");
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    throw new Error(`${label} request failed: ${error.message}`);
  }
  if (!response?.ok) throw new Error(`${label} request returned HTTP ${response?.status || "unknown"}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} response was not valid JSON`);
  }
}

export async function fetchOfficialHermesReleases({ fetchImpl = globalThis.fetch, githubToken } = {}) {
  return jsonResponse(
    fetchImpl,
    HERMES_UPSTREAM_RELEASES_URL,
    { headers: withGithubToken(API_HEADERS, githubToken) },
    "Hermes releases",
  );
}

export async function resolveOfficialHermesTagCommit(tag, { fetchImpl = globalThis.fetch, githubToken } = {}) {
  const parsedTag = String(tag || "").trim();
  releaseTagParts(parsedTag);
  const url = `https://api.github.com/repos/${HERMES_UPSTREAM_REPOSITORY}/commits/${encodeURIComponent(parsedTag)}`;
  const payload = await jsonResponse(
    fetchImpl,
    url,
    { headers: withGithubToken(API_HEADERS, githubToken) },
    "Hermes release commit",
  );
  const sha = assertCommitSha(payload?.sha);
  return {
    sha,
    url: `https://github.com/${HERMES_UPSTREAM_REPOSITORY}/commit/${sha}`,
  };
}

function headerValue(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name);
  const lower = name.toLowerCase();
  return headers?.[name] || headers?.[lower] || null;
}

export async function resolveHermesDockerManifestDigest(tag, { fetchImpl = globalThis.fetch } = {}) {
  const parsedTag = String(tag || "").trim();
  releaseTagParts(parsedTag);
  const tokenUrl = new URL("https://auth.docker.io/token");
  tokenUrl.searchParams.set("service", "registry.docker.io");
  tokenUrl.searchParams.set("scope", `repository:${HERMES_UPSTREAM_DOCKER_REPOSITORY}:pull`);
  const tokenPayload = await jsonResponse(
    fetchImpl,
    tokenUrl.href,
    { headers: { accept: "application/json", "user-agent": "ms-realty-hermes-updater" } },
    "Docker registry token",
  );
  const token = String(tokenPayload?.token || tokenPayload?.access_token || "").trim();
  if (!token) throw new Error("Docker registry token response did not include a token");

  const manifestUrl = `https://${HERMES_UPSTREAM_REGISTRY}/v2/${HERMES_UPSTREAM_DOCKER_REPOSITORY}/manifests/${encodeURIComponent(parsedTag)}`;
  if (typeof fetchImpl !== "function") throw new Error("Hermes updater requires fetch");
  let response;
  try {
    response = await fetchImpl(manifestUrl, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: REGISTRY_ACCEPT,
        "user-agent": "ms-realty-hermes-updater",
      },
    });
  } catch (error) {
    throw new Error(`Docker manifest request failed: ${error.message}`);
  }
  if (!response?.ok) throw new Error(`Docker manifest request returned HTTP ${response?.status || "unknown"}`);
  const digest = assertHermesManifestDigest(headerValue(response.headers, "docker-content-digest"));
  return {
    digest,
    registry: HERMES_UPSTREAM_REGISTRY,
    url: manifestUrl,
    media_type: headerValue(response.headers, "content-type") || null,
  };
}

export function readHermesImagePin(filePaths = HERMES_UPSTREAM_PIN_FILE_PATHS) {
  const files = filePaths.map((filePath) => (path.isAbsolute(filePath) ? filePath : fromRoot(filePath)));
  const pins = files.map((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    const matches = [...source.matchAll(SOURCE_IMAGE_PATTERN)].map(([match]) => match);
    if (matches.length !== 1) {
      throw new Error(`${repoRelativePath(filePath)} must contain exactly one Hermes image pin; found ${matches.length}`);
    }
    return { filePath, image: matches[0] };
  });
  const unique = new Set(pins.map(({ image }) => image));
  if (unique.size !== 1) throw new Error("Hermes source-of-truth image pins are out of sync");
  return pins[0].image;
}

export function synchronizeHermesImagePins(image, filePaths = HERMES_UPSTREAM_PIN_FILE_PATHS) {
  const parsed = parseHermesImageReference(image, { requireDigest: true });
  const files = filePaths.map((filePath) => (path.isAbsolute(filePath) ? filePath : fromRoot(filePath)));
  const changed = [];
  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    const matches = [...source.matchAll(SOURCE_IMAGE_PATTERN)];
    if (matches.length !== 1) {
      throw new Error(`${repoRelativePath(filePath)} must contain exactly one Hermes image pin; found ${matches.length}`);
    }
    if (matches[0][0] === parsed.image) continue;
    fs.writeFileSync(filePath, source.replace(SOURCE_IMAGE_PATTERN, parsed.image));
    changed.push(repoRelativePath(filePath));
  }
  return { image: parsed.image, changed, files: files.map(repoRelativePath) };
}

export function buildHermesUpstreamProvenance({ release, commit, docker, generatedAt = new Date().toISOString() } = {}) {
  const parsedRelease = release?.tag ? parseStableHermesRelease(release) : parseStableHermesRelease(release || {});
  const commitSha = assertCommitSha(commit?.sha || commit);
  const digest = assertHermesManifestDigest(docker?.digest || docker);
  const image = hermesImageForRelease(parsedRelease.tag, digest);
  const provenance = {
    schema_version: 1,
    kind: "hermes_upstream_provenance",
    generated_at: generatedAt,
    upstream: {
      repository: HERMES_UPSTREAM_REPOSITORY,
      release: {
        id: parsedRelease.id,
        tag: parsedRelease.tag,
        name: parsedRelease.name,
        published_at: parsedRelease.published_at,
        url: parsedRelease.url,
      },
      commit: {
        sha: commitSha,
        url: `https://github.com/${HERMES_UPSTREAM_REPOSITORY}/commit/${commitSha}`,
      },
      docker: {
        repository: HERMES_UPSTREAM_DOCKER_REPOSITORY,
        registry: HERMES_UPSTREAM_REGISTRY,
        tag: parsedRelease.tag,
        digest,
        manifest_url: docker?.url || `https://${HERMES_UPSTREAM_REGISTRY}/v2/${HERMES_UPSTREAM_DOCKER_REPOSITORY}/manifests/${encodeURIComponent(parsedRelease.tag)}`,
        media_type: docker?.media_type || null,
      },
    },
    managed_image: image,
    pins: {
      files: [...HERMES_UPSTREAM_PIN_FILE_PATHS],
      image,
    },
    safety: {
      draft_only: true,
      human_approval_required: true,
      managed_tool_access: "none",
      persistent_memory: false,
      production_deployment_requires_exact_main_sha: true,
    },
  };
  assertHermesUpstreamProvenance(provenance);
  return provenance;
}

export function assertHermesUpstreamProvenance(provenance) {
  objectInput(provenance, "Hermes upstream provenance");
  if (provenance.schema_version !== 1 || provenance.kind !== "hermes_upstream_provenance") {
    throw new Error("Hermes upstream provenance schema is invalid");
  }
  if (!provenance.generated_at || Number.isNaN(Date.parse(provenance.generated_at))) {
    throw new Error("Hermes upstream provenance must include valid generated_at");
  }
  if (provenance.upstream?.repository !== HERMES_UPSTREAM_REPOSITORY) {
    throw new Error("Hermes upstream provenance must identify the official GitHub repository");
  }
  const release = parseStableHermesRelease(provenance.upstream.release);
  const commitSha = assertCommitSha(provenance.upstream?.commit?.sha);
  const docker = provenance.upstream?.docker;
  if (docker?.repository !== HERMES_UPSTREAM_DOCKER_REPOSITORY || docker?.registry !== HERMES_UPSTREAM_REGISTRY) {
    throw new Error("Hermes upstream provenance must identify the official Docker repository");
  }
  if (docker.tag !== release.tag) throw new Error("Hermes upstream Docker tag must match the GitHub release tag");
  const digest = assertHermesManifestDigest(docker.digest);
  const image = hermesImageForRelease(release.tag, digest);
  const expectedReleaseUrl = `${HERMES_UPSTREAM_RELEASE_URL}/${encodeURIComponent(release.tag)}`;
  const expectedManifestUrl = `https://${HERMES_UPSTREAM_REGISTRY}/v2/${HERMES_UPSTREAM_DOCKER_REPOSITORY}/manifests/${encodeURIComponent(release.tag)}`;
  if (provenance.upstream.release.url !== expectedReleaseUrl) {
    throw new Error("Hermes upstream provenance release URL is invalid");
  }
  if (docker.manifest_url !== expectedManifestUrl) {
    throw new Error("Hermes upstream provenance manifest URL is invalid");
  }
  if (provenance.managed_image !== image || provenance.pins?.image !== image) {
    throw new Error("Hermes upstream provenance image does not match release and digest");
  }
  if (JSON.stringify(provenance.pins?.files) !== JSON.stringify([...HERMES_UPSTREAM_PIN_FILE_PATHS])) {
    throw new Error("Hermes upstream provenance pin file list is invalid");
  }
  if (
    provenance.safety?.draft_only !== true ||
    provenance.safety?.human_approval_required !== true ||
    provenance.safety?.managed_tool_access !== "none" ||
    provenance.safety?.persistent_memory !== false ||
    provenance.safety?.production_deployment_requires_exact_main_sha !== true
  ) {
    throw new Error("Hermes upstream provenance safety fence is invalid");
  }
  if (provenance.upstream.commit.url !== `https://github.com/${HERMES_UPSTREAM_REPOSITORY}/commit/${commitSha}`) {
    throw new Error("Hermes upstream provenance commit URL is invalid");
  }
  if (/Bearer\s+|sk-[A-Za-z0-9_-]+|:\/\/[^\s/@]+:[^\s/@]+@/i.test(JSON.stringify(provenance))) {
    throw new Error("Hermes upstream provenance must not contain credentials");
  }
  return true;
}

export function writeHermesUpstreamProvenance(provenance, filePath = HERMES_UPSTREAM_PROVENANCE_PATH) {
  assertHermesUpstreamProvenance(provenance);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(provenance, null, 2)}\n`);
  return filePath;
}
