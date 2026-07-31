import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const LAUNCH_EVIDENCE_SCHEMA_VERSION = 1;
export const PRODUCTION_ENVIRONMENT = "production";
export const REQUIRED_LAUNCH_EVIDENCE_ARTIFACT_IDS = Object.freeze([
  "deployable_redirects",
  "seo_evidence",
  "listing_quality_review",
  "live_service_provisioning",
  "search_sync",
  "search_query",
  "hermes_worker",
  "monitoring_rollback",
  "payload_runtime",
  "production_recovery",
]);

const COMMIT_SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const ARTIFACT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const SECRET_FIELD_PATTERN = /(authorization|password|secret|token|api(?:access)?key|accesskey|privatekey)/i;
const SECRET_TEXT_PATTERN = /Bearer\s+\S+|:\/\/[^/@\s]+:[^/@\s]+@/i;

function requiredText(value, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} must be a non-empty string`);
  return text;
}

function timestamp(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function signingKey(value) {
  if (!(typeof value === "string" || Buffer.isBuffer(value)) || value.length === 0) {
    throw new Error("signingKey must be a non-empty string or Buffer");
  }
  return value;
}

function normalizedCommitSha(value, label) {
  const commitSha = requiredText(value, label).toLowerCase();
  if (!COMMIT_SHA_PATTERN.test(commitSha)) throw new Error(`${label} must be a full Git SHA`);
  return commitSha;
}

function sha256File(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`Artifact path must be a file: ${filePath}`);
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function artifactEntries(artifactPaths) {
  if (!artifactPaths || typeof artifactPaths !== "object" || Array.isArray(artifactPaths)) {
    throw new Error("artifactPaths must be a non-empty object of artifact IDs to file paths");
  }
  const entries = Object.entries(artifactPaths);
  if (!entries.length) throw new Error("artifactPaths must include at least one artifact");
  return entries
    .map(([id, filePath]) => {
      if (!ARTIFACT_ID_PATTERN.test(id)) throw new Error(`Invalid artifact ID: ${id}`);
      const resolvedPath = path.resolve(requiredText(filePath, `Artifact ${id} path`));
      return { id, path: resolvedPath, sha256: sha256File(resolvedPath) };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function unsignedBundle(bundle) {
  return {
    schema_version: bundle.schema_version,
    environment: bundle.environment,
    issuer: bundle.issuer,
    commit_sha: bundle.commit_sha,
    issued_at: bundle.issued_at,
    expires_at: bundle.expires_at,
    artifacts: bundle.artifacts.map(({ id, path: artifactPath, sha256 }) => ({ id, path: artifactPath, sha256 })),
  };
}

function signatureFor(bundle, key) {
  return createHmac("sha256", key).update(JSON.stringify(unsignedBundle(bundle))).digest("hex");
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unsupported or missing fields`);
  }
}

function assertBundleShape(bundle) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw new Error("Launch evidence bundle must be an object");
  }
  assertExactKeys(
    bundle,
    ["artifacts", "commit_sha", "environment", "expires_at", "issued_at", "issuer", "schema_version", "signature"],
    "Launch evidence bundle",
  );
  if (bundle.schema_version !== LAUNCH_EVIDENCE_SCHEMA_VERSION) {
    throw new Error("Launch evidence bundle schema version is unsupported");
  }
  if (bundle.environment !== PRODUCTION_ENVIRONMENT) {
    throw new Error("Launch evidence bundle environment must be production");
  }
  requiredText(bundle.issuer, "issuer");
  if (typeof bundle.commit_sha !== "string" || !COMMIT_SHA_PATTERN.test(bundle.commit_sha)) {
    throw new Error("commit_sha must be a full lowercase Git SHA");
  }
  if (timestamp(bundle.issued_at, "issued_at") !== bundle.issued_at) {
    throw new Error("issued_at must be an ISO-8601 UTC timestamp");
  }
  if (timestamp(bundle.expires_at, "expires_at") !== bundle.expires_at) {
    throw new Error("expires_at must be an ISO-8601 UTC timestamp");
  }
  if (Date.parse(bundle.expires_at) <= Date.parse(bundle.issued_at)) {
    throw new Error("expires_at must be after issued_at");
  }
  if (typeof bundle.signature !== "string" || !DIGEST_PATTERN.test(bundle.signature)) {
    throw new Error("signature must be a lowercase HMAC-SHA256 digest");
  }
  if (!Array.isArray(bundle.artifacts) || bundle.artifacts.length === 0) {
    throw new Error("Launch evidence bundle must include artifacts");
  }

  const artifactIds = new Set();
  for (const artifact of bundle.artifacts) {
    if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
      throw new Error("Launch evidence artifact must be an object");
    }
    assertExactKeys(artifact, ["id", "path", "sha256"], "Launch evidence artifact");
    if (typeof artifact.id !== "string" || !ARTIFACT_ID_PATTERN.test(artifact.id) || artifactIds.has(artifact.id)) {
      throw new Error("Launch evidence artifact IDs must be unique and valid");
    }
    artifactIds.add(artifact.id);
    if (typeof artifact.path !== "string" || path.resolve(artifact.path) !== artifact.path) {
      throw new Error(`Artifact ${artifact.id} path must be absolute`);
    }
    if (typeof artifact.sha256 !== "string" || !DIGEST_PATTERN.test(artifact.sha256)) {
      throw new Error(`Artifact ${artifact.id} sha256 must be a lowercase SHA-256 digest`);
    }
  }
}

function assertRequiredArtifactIds(requiredArtifactIds, artifacts) {
  if (requiredArtifactIds === undefined) return;
  if (!Array.isArray(requiredArtifactIds)) throw new Error("requiredArtifactIds must be an array");
  const artifactIds = new Set(artifacts.map((artifact) => artifact.id));
  for (const id of requiredArtifactIds) {
    if (typeof id !== "string" || !artifactIds.has(id)) throw new Error(`Required artifact is missing: ${id}`);
  }
}

function hasSecretField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasSecretField);
  return Object.entries(value).some(([key, nested]) => SECRET_FIELD_PATTERN.test(key) || hasSecretField(nested));
}

export function assertNoSecretLaunchEvidenceBundle(bundle) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw new Error("Launch evidence bundle must be an object");
  }
  if (hasSecretField(bundle) || SECRET_TEXT_PATTERN.test(JSON.stringify(bundle))) {
    throw new Error("Launch evidence bundle must not contain secrets");
  }
  return true;
}

export function buildLaunchEvidenceBundle({ artifactPaths, signingKey: key, issuer, commitSha: commit, generatedAt, expiresAt }) {
  const issuedAt = timestamp(generatedAt, "generatedAt");
  const expiry = timestamp(expiresAt, "expiresAt");
  const commitSha = normalizedCommitSha(commit, "commitSha");
  if (Date.parse(expiry) <= Date.parse(issuedAt)) throw new Error("expiresAt must be after generatedAt");

  const bundle = {
    schema_version: LAUNCH_EVIDENCE_SCHEMA_VERSION,
    environment: PRODUCTION_ENVIRONMENT,
    issuer: requiredText(issuer, "issuer"),
    commit_sha: commitSha,
    issued_at: issuedAt,
    expires_at: expiry,
    artifacts: artifactEntries(artifactPaths),
  };
  bundle.signature = signatureFor(bundle, signingKey(key));
  assertNoSecretLaunchEvidenceBundle(bundle);
  return bundle;
}

export function assertLaunchEvidenceBundle(bundle, { signingKey: key, now = new Date(), requiredArtifactIds, expectedCommitSha } = {}) {
  assertNoSecretLaunchEvidenceBundle(bundle);
  assertBundleShape(bundle);
  const expectedSignature = Buffer.from(signatureFor(bundle, signingKey(key)), "hex");
  const actualSignature = Buffer.from(bundle.signature, "hex");
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    throw new Error("Launch evidence bundle signature is invalid");
  }
  if (Date.parse(timestamp(now, "now")) >= Date.parse(bundle.expires_at)) {
    throw new Error("Launch evidence bundle has expired");
  }
  if (expectedCommitSha !== undefined && bundle.commit_sha !== normalizedCommitSha(expectedCommitSha, "expectedCommitSha")) {
    throw new Error("Launch evidence bundle commit does not match expected release SHA");
  }
  assertRequiredArtifactIds(requiredArtifactIds, bundle.artifacts);
  for (const artifact of bundle.artifacts) {
    if (sha256File(artifact.path) !== artifact.sha256) {
      throw new Error(`Artifact content digest does not match: ${artifact.id}`);
    }
  }
  return true;
}

export function readLaunchEvidenceBundle(filePath) {
  const bundle = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assertNoSecretLaunchEvidenceBundle(bundle);
  assertBundleShape(bundle);
  return bundle;
}

export function writeLaunchEvidenceBundle(bundle, outPath) {
  assertNoSecretLaunchEvidenceBundle(bundle);
  assertBundleShape(bundle);
  const destination = path.resolve(requiredText(outPath, "outPath"));
  const temporaryPath = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, destination);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
  return destination;
}
