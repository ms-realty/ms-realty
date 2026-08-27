import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_MEDIA_INVENTORY_PATH, loadMediaInventory } from "./cms-seed.mjs";
import { imageUrlFromMediaItem } from "./media.mjs";
import { evidenceFreshness } from "./evidence-freshness.mjs";
import { fromRoot, repoRelativePath } from "./paths.mjs";

export const R2_MEDIA_COVERAGE_SOURCE = "r2_media_coverage";
export const R2_MEDIA_COVERAGE_SCHEMA_VERSION = 1;
export const DEFAULT_R2_MEDIA_COVERAGE_REPORT = fromRoot("production", "data", "r2-media-coverage-report.json");
export const DEFAULT_R2_MEDIA_COVERAGE_INPUT = fromRoot("production", "data", "r2-media-list-objects.json");
export const CANONICAL_MEDIA_INVENTORY_PATH = "migration/artifacts/20260704-211155/media-inventory.csv";
export const CANONICAL_MEDIA_INVENTORY_CONTENT_SHA256 =
  "79b4633951c057252ddd7cdc42ab6f709c91b2d98957bcc1589b5908b01f8b13";
export const CANONICAL_MEDIA_INVENTORY_BLOB_SHA1 = "3597e3638dd36e823339c732a6ac052051cd2f25";
export const CANONICAL_MEDIA_INVENTORY_ROWS = 11859;
export const RUNTIME_MEDIA_REFERENCE_COUNT = 5442;
export const EXPECTED_RUNTIME_R2_MEDIA_COUNT = 1725;
export const EXPECTED_RUNTIME_R2_MEDIA_DIGEST =
  "ada013ef6b48892b877a58490799f2b029b0b13856121529aecbfa2b599d4b28";
export const EXPECTED_RUNTIME_R2_MEDIA_BY_HOST = Object.freeze({
  "makler-realty.com": 1246,
  "makler-realty.ru": 479,
});
export const R2_MEDIA_COVERAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const R2_MEDIA_COVERAGE_NEXT_ACTIONS = Object.freeze([
  "Backfill every public missing key from the credential-free R2 listing, including the page/post assets, then rerun npm run r2:media:coverage.",
  "Mount the resulting report at MS_REALTY_R2_MEDIA_COVERAGE_REPORT_PATH and rerun npm run launch:preflight for the exact workers.dev release SHA.",
]);

const ALLOWED_HOSTS = new Set(Object.keys(EXPECTED_RUNTIME_R2_MEDIA_BY_HOST));
const COMMIT_SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const BLOB_SHA1_PATTERN = /^[a-f0-9]{40}$/;
const SOURCE_RELATIVE_PATH_PATTERN = /^migration\/artifacts\/20260704-211155\/media-inventory\.csv$/;
const UPLOAD_PREFIX = "/wp-content/uploads/";
const SECRET_FIELD_PATTERN = /(authorization|password|secret|token|api(?:access)?key|accesskey|privatekey)/i;
const SECRET_TEXT_PATTERN = /Bearer\s+\S+|:\/\/[^/@\s]+:[^/@\s]+@/i;
const AWS_LIST_KEYS = new Set(["Contents", "IsTruncated", "KeyCount", "MaxKeys", "Name", "NextContinuationToken", "Prefix"]);

function requiredText(value, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} must be a non-empty string`);
  return text;
}

function normalizedCommitSha(value, label = "releaseSha") {
  const sha = requiredText(value, label).toLowerCase();
  if (!COMMIT_SHA_PATTERN.test(sha)) throw new Error(`${label} must be a full Git SHA`);
  return sha;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitBlobSha1(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function sortedDigest(values) {
  return sha256(`${[...values].sort().join("\n")}\n`);
}

function countByHost(values) {
  const counts = Object.fromEntries(Object.keys(EXPECTED_RUNTIME_R2_MEDIA_BY_HOST).map((host) => [host, 0]));
  for (const value of values) {
    const host = value.split("/", 1)[0];
    counts[host] = (counts[host] || 0) + 1;
  }
  return counts;
}

function isSafeUploadPath(pathname) {
  if (!pathname.startsWith(UPLOAD_PREFIX) || pathname.includes("\\")) return false;
  const parts = pathname.slice(1).split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

export function r2KeyFromMediaUrl(value, label = "media URL") {
  let parsed;
  try {
    parsed = new URL(requiredText(value, label));
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname) || !isSafeUploadPath(parsed.pathname)) {
    throw new Error(`${label} must target an allowed uploads URL`);
  }
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    throw new Error(`${label} has an invalid encoded path`);
  }
  if (!isSafeUploadPath(pathname)) throw new Error(`${label} has an unsafe uploads path`);
  return `${parsed.hostname}${pathname}`;
}

function runtimeExpectedKeys(rows) {
  const accepted = rows.map((row) => imageUrlFromMediaItem(row)).filter(Boolean);
  const keys = new Set(accepted.map((url) => r2KeyFromMediaUrl(url, "runtime media URL")));
  if (rows.length !== CANONICAL_MEDIA_INVENTORY_ROWS) {
    throw new Error(`Canonical media inventory must contain ${CANONICAL_MEDIA_INVENTORY_ROWS} rows`);
  }
  if (accepted.length !== RUNTIME_MEDIA_REFERENCE_COUNT) {
    throw new Error(`Runtime media helper must accept ${RUNTIME_MEDIA_REFERENCE_COUNT} references`);
  }
  if (keys.size !== EXPECTED_RUNTIME_R2_MEDIA_COUNT) {
    throw new Error(`Runtime media helper must resolve ${EXPECTED_RUNTIME_R2_MEDIA_COUNT} unique R2 keys`);
  }
  if (JSON.stringify(countByHost(keys)) !== JSON.stringify(EXPECTED_RUNTIME_R2_MEDIA_BY_HOST)) {
    throw new Error("Runtime media helper resolved unexpected per-host R2 key counts");
  }
  if (sortedDigest(keys) !== EXPECTED_RUNTIME_R2_MEDIA_DIGEST) {
    throw new Error("Runtime media helper resolved an unexpected R2 key digest");
  }
  return { keys, acceptedReferenceCount: accepted.length };
}

export function expectedRuntimeR2Media({ inventoryPath = DEFAULT_MEDIA_INVENTORY_PATH } = {}) {
  const absolutePath = path.resolve(inventoryPath);
  const bytes = fs.readFileSync(absolutePath);
  const contentSha256 = sha256(bytes);
  const blobSha1 = gitBlobSha1(bytes);
  if (repoRelativePath(absolutePath) !== CANONICAL_MEDIA_INVENTORY_PATH) {
    throw new Error(`R2 media coverage requires the pinned canonical inventory at ${CANONICAL_MEDIA_INVENTORY_PATH}`);
  }
  if (contentSha256 !== CANONICAL_MEDIA_INVENTORY_CONTENT_SHA256 || blobSha1 !== CANONICAL_MEDIA_INVENTORY_BLOB_SHA1) {
    throw new Error("Canonical media inventory hash does not match the pinned source artifact");
  }
  const { keys, acceptedReferenceCount } = runtimeExpectedKeys(loadMediaInventory(absolutePath));
  return {
    artifact: {
      path: CANONICAL_MEDIA_INVENTORY_PATH,
      blob_sha1: blobSha1,
      content_sha256: contentSha256,
      rows: CANONICAL_MEDIA_INVENTORY_ROWS,
    },
    runtime: {
      accepted_reference_count: acceptedReferenceCount,
      expected_count: keys.size,
      expected_digest: sortedDigest(keys),
      by_host: countByHost(keys),
      helper_contract: [
        "production/lib/cms-seed.mjs#loadMediaInventory",
        "production/lib/media.mjs#imageUrlFromMediaItem",
      ],
    },
    keys,
  };
}

function assertNoSecrets(value, label) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${label}[${index}]`));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_FIELD_PATTERN.test(key)) throw new Error(`${label} contains a credential-bearing field`);
    assertNoSecrets(nested, `${label}.${key}`);
  }
  if (SECRET_TEXT_PATTERN.test(JSON.stringify(value))) throw new Error(`${label} must be credential-free`);
}

function listingContents(input) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") throw new Error("R2 listing input must be a JSON array or Contents response");
  const keys = Object.keys(input);
  if (!keys.includes("Contents") || keys.some((key) => !AWS_LIST_KEYS.has(key))) {
    throw new Error("R2 listing input must be a flattened array or a simple AWS Contents response");
  }
  if (!Array.isArray(input.Contents)) throw new Error("R2 listing Contents must be an array");
  return input.Contents;
}

function keyFromListingItem(item, index) {
  const value = typeof item === "string" ? item : item && typeof item === "object" ? item.Key ?? item.key : null;
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`R2 listing item ${index} must include one exact key string`);
  }
  if (typeof item === "object" && item !== null && !Array.isArray(item)) {
    const presentKeyFields = ["Key", "key"].filter((field) => Object.prototype.hasOwnProperty.call(item, field));
    if (presentKeyFields.length !== 1) throw new Error(`R2 listing item ${index} must include exactly one key field`);
  }
  if (value.startsWith("/") || value.includes("?") || value.includes("#") || value.includes("\\")) {
    throw new Error(`R2 listing item ${index} has an unsafe key`);
  }
  const slash = value.indexOf("/");
  if (slash < 1) throw new Error(`R2 listing item ${index} must use host/path key form`);
  const host = value.slice(0, slash).toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) throw new Error(`R2 listing item ${index} uses an unsupported host`);
  let pathname;
  try {
    pathname = decodeURIComponent(value.slice(slash));
  } catch {
    throw new Error(`R2 listing item ${index} has an invalid encoded path`);
  }
  if (!isSafeUploadPath(pathname)) throw new Error(`R2 listing item ${index} must target an uploads key`);
  return `${host}${pathname}`;
}

export function parseR2Listing(input) {
  assertNoSecrets(input, "R2 listing input");
  const contents = listingContents(input);
  const keys = new Set();
  const objects = [];
  contents.forEach((item, index) => {
    const key = keyFromListingItem(item, index);
    if (keys.has(key)) throw new Error(`R2 listing input contains duplicate key: ${key}`);
    keys.add(key);
    objects.push({ key, ...(item && typeof item === "object" && !Array.isArray(item) ? { size: item.Size ?? item.size ?? null } : {}) });
  });
  return { keys, objects };
}

function normalizeListingPath(inputPath) {
  return repoRelativePath(path.resolve(inputPath));
}

function listingArtifact(inputPath) {
  const absolutePath = path.resolve(requiredText(inputPath, "listingPath"));
  const bytes = fs.readFileSync(absolutePath);
  return {
    path: normalizeListingPath(absolutePath),
    content_sha256: sha256(bytes),
    bytes: bytes.length,
  };
}

function missingContext(rows, expectedKeys, listedKeys) {
  const contexts = new Map();
  for (const row of rows) {
    const url = imageUrlFromMediaItem(row);
    if (!url) continue;
    const key = r2KeyFromMediaUrl(url, "runtime media URL");
    if (listedKeys.has(key) || !expectedKeys.has(key)) continue;
    const context = contexts.get(key) || { key, page_types: new Set(), source_pages: new Set() };
    if (row.page_type) context.page_types.add(row.page_type);
    if (row.page_url) context.source_pages.add(row.page_url);
    contexts.set(key, context);
  }
  return [...contexts.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((item) => ({
      key: item.key,
      page_types: [...item.page_types].sort(),
      source_pages: [...item.source_pages].sort(),
    }));
}

function sourceContract(expected) {
  return {
    canonical_artifact_path: expected.artifact.path,
    canonical_artifact_blob_sha1: expected.artifact.blob_sha1,
    canonical_artifact_content_sha256: expected.artifact.content_sha256,
    canonical_inventory_rows: expected.artifact.rows,
    runtime_helper_contract: expected.runtime.helper_contract,
    runtime_accepted_reference_count: expected.runtime.accepted_reference_count,
    runtime_expected_count: expected.runtime.expected_count,
    runtime_expected_digest: expected.runtime.expected_digest,
  };
}

function reportNextActions(status) {
  return status === "pass"
    ? ["Mount this report for the exact workers.dev release SHA, then rerun npm run launch:preflight."]
    : [...R2_MEDIA_COVERAGE_NEXT_ACTIONS];
}

export function buildR2MediaCoverageReport({
  listingPath,
  inventoryPath = DEFAULT_MEDIA_INVENTORY_PATH,
  releaseSha,
  generatedAt = new Date().toISOString(),
} = {}) {
  const expected = expectedRuntimeR2Media({ inventoryPath });
  const commitSha = normalizedCommitSha(releaseSha);
  const generated = new Date(generatedAt);
  if (Number.isNaN(generated.getTime()) || generated.toISOString() !== generatedAt) {
    throw new Error("generatedAt must be an ISO-8601 UTC timestamp");
  }
  const sourcePath = requiredText(listingPath, "listingPath");
  const inputBytes = fs.readFileSync(sourcePath);
  const input = JSON.parse(inputBytes.toString("utf8"));
  const listing = parseR2Listing(input);
  const listedKeys = listing.keys;
  const presentKeys = new Set([...expected.keys].filter((key) => listedKeys.has(key)));
  const missingKeys = [...expected.keys].filter((key) => !listedKeys.has(key)).sort();
  const unexpectedKeys = [...listedKeys].filter((key) => !expected.keys.has(key)).sort();
  const status = missingKeys.length === 0 ? "pass" : "blocked";
  const artifact = listingArtifact(sourcePath);
  const listedBytes = listing.objects.reduce((sum, item) => (Number.isFinite(Number(item.size)) ? sum + Number(item.size) : sum), 0);
  return {
    schema_version: R2_MEDIA_COVERAGE_SCHEMA_VERSION,
    kind: R2_MEDIA_COVERAGE_SOURCE,
    environment: "production",
    generated_at: generatedAt,
    release_sha: commitSha,
    source_contract: sourceContract(expected),
    canonical_artifact: expected.artifact,
    listing_artifact: artifact,
    expected_count: expected.keys.size,
    listed_count: listedKeys.size,
    present_count: presentKeys.size,
    missing_count: missingKeys.length,
    unexpected_count: unexpectedKeys.length,
    expected_digest: sortedDigest(expected.keys),
    listing_digest: sortedDigest(listedKeys),
    expected_by_host: countByHost(expected.keys),
    listed_by_host: countByHost(listedKeys),
    present_by_host: countByHost(presentKeys),
    missing_by_host: countByHost(missingKeys),
    unexpected_by_host: countByHost(unexpectedKeys),
    listed_bytes: listedBytes,
    missing_keys: missingKeys,
    unexpected_keys: unexpectedKeys,
    missing_context: missingContext(loadMediaInventory(inventoryPath), expected.keys, listedKeys),
    previous_mirror_plan: {
      listed_count: listedKeys.size,
      present_count: presentKeys.size,
      missing_count: missingKeys.length,
      unexpected_count: unexpectedKeys.length,
      runtime_delta_count: Math.max(0, expected.keys.size - listedKeys.size),
    },
    status,
    pass: status === "pass",
    next_actions: reportNextActions(status),
  };
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
}

function assertCount(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
}

function assertHostCounts(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a host count object`);
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`${label} must contain exactly the supported media hosts`);
  }
  for (const host of expectedKeys) {
    if (!Number.isInteger(value[host]) || value[host] < 0) throw new Error(`${label}.${host} must be a non-negative integer`);
  }
}

export function assertR2MediaCoverageReport(report, { expectedReleaseSha } = {}) {
  assertNoSecrets(report, "R2 media coverage report");
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("R2 media coverage report must be an object");
  if (report.schema_version !== R2_MEDIA_COVERAGE_SCHEMA_VERSION || report.kind !== R2_MEDIA_COVERAGE_SOURCE) {
    throw new Error("R2 media coverage report schema is unsupported");
  }
  if (report.environment !== "production") throw new Error("R2 media coverage report environment must be production");
  if (typeof report.generated_at !== "string" || new Date(report.generated_at).toISOString() !== report.generated_at) {
    throw new Error("R2 media coverage report must include an ISO-8601 UTC generated_at");
  }
  const releaseSha = normalizedCommitSha(report.release_sha, "report.release_sha");
  if (expectedReleaseSha !== undefined && releaseSha !== normalizedCommitSha(expectedReleaseSha, "expectedReleaseSha")) {
    throw new Error("R2 media coverage report release SHA does not match the expected workers.dev release");
  }
  assertHostCounts(report.expected_by_host, EXPECTED_RUNTIME_R2_MEDIA_BY_HOST, "expected_by_host");
  for (const [field, value] of Object.entries({
    expected_count: report.expected_count,
    listed_count: report.listed_count,
    present_count: report.present_count,
    missing_count: report.missing_count,
    unexpected_count: report.unexpected_count,
  })) assertCount(value, field);
  if (report.expected_count !== EXPECTED_RUNTIME_R2_MEDIA_COUNT) throw new Error("R2 media coverage expected_count is not canonical");
  for (const [field, value] of Object.entries({
    expected_by_host: report.expected_by_host,
    listed_by_host: report.listed_by_host,
    present_by_host: report.present_by_host,
    missing_by_host: report.missing_by_host,
    unexpected_by_host: report.unexpected_by_host,
  })) {
    assertHostCounts(value, EXPECTED_RUNTIME_R2_MEDIA_BY_HOST, field);
  }
  if (Object.values(report.expected_by_host).reduce((sum, count) => sum + count, 0) !== report.expected_count) throw new Error("R2 expected host counts must sum to expected_count");
  if (Object.values(report.listed_by_host).reduce((sum, count) => sum + count, 0) !== report.listed_count) throw new Error("R2 listed host counts must sum to listed_count");
  if (Object.values(report.present_by_host).reduce((sum, count) => sum + count, 0) !== report.present_count) throw new Error("R2 present host counts must sum to present_count");
  if (Object.values(report.missing_by_host).reduce((sum, count) => sum + count, 0) !== report.missing_count) throw new Error("R2 missing host counts must sum to missing_count");
  if (Object.values(report.unexpected_by_host).reduce((sum, count) => sum + count, 0) !== report.unexpected_count) throw new Error("R2 unexpected host counts must sum to unexpected_count");
  if (report.present_count + report.missing_count !== report.expected_count) throw new Error("R2 present and missing counts must cover expected assets");
  assertDigest(report.expected_digest, "expected_digest");
  assertDigest(report.listing_digest, "listing_digest");
  if (report.expected_digest !== EXPECTED_RUNTIME_R2_MEDIA_DIGEST) throw new Error("R2 expected_digest is not canonical");
  if (!Array.isArray(report.missing_keys) || report.missing_keys.length !== report.missing_count) throw new Error("R2 missing_keys must match missing_count");
  if (!Array.isArray(report.unexpected_keys) || report.unexpected_keys.length !== report.unexpected_count) throw new Error("R2 unexpected_keys must match unexpected_count");
  if (new Set(report.missing_keys).size !== report.missing_keys.length || new Set(report.unexpected_keys).size !== report.unexpected_keys.length) {
    throw new Error("R2 missing and unexpected keys must be unique");
  }
  if ([...report.missing_keys].some((key) => typeof key !== "string" || !key.includes("/wp-content/uploads/"))) throw new Error("R2 missing keys must be public uploads keys");
  if ([...report.unexpected_keys].some((key) => typeof key !== "string" || !key.includes("/wp-content/uploads/"))) throw new Error("R2 unexpected keys must be uploads keys");
  if (report.status !== (report.missing_count === 0 ? "pass" : "blocked") || report.pass !== (report.status === "pass")) {
    throw new Error("R2 media coverage pass status must match missing_count");
  }
  if (!Array.isArray(report.next_actions) || report.next_actions.length === 0) throw new Error("R2 media coverage report must include next actions");
  if (report.status === "blocked" && !report.next_actions.some((action) => action.includes("r2:media:coverage"))) {
    throw new Error("R2 media coverage blocked report must point to r2:media:coverage");
  }
  const expected = report.source_contract;
  if (
    !expected ||
    expected.canonical_artifact_path !== CANONICAL_MEDIA_INVENTORY_PATH ||
    expected.canonical_artifact_blob_sha1 !== CANONICAL_MEDIA_INVENTORY_BLOB_SHA1 ||
    expected.canonical_artifact_content_sha256 !== CANONICAL_MEDIA_INVENTORY_CONTENT_SHA256 ||
    expected.canonical_inventory_rows !== CANONICAL_MEDIA_INVENTORY_ROWS ||
    expected.runtime_helper_contract?.join("|") !==
      ["production/lib/cms-seed.mjs#loadMediaInventory", "production/lib/media.mjs#imageUrlFromMediaItem"].join("|") ||
    expected.runtime_accepted_reference_count !== RUNTIME_MEDIA_REFERENCE_COUNT ||
    expected.runtime_expected_count !== EXPECTED_RUNTIME_R2_MEDIA_COUNT ||
    expected.runtime_expected_digest !== EXPECTED_RUNTIME_R2_MEDIA_DIGEST
  ) {
    throw new Error("R2 media coverage source contract does not match the pinned runtime inventory");
  }
  if (!report.canonical_artifact || report.canonical_artifact.path !== CANONICAL_MEDIA_INVENTORY_PATH || report.canonical_artifact.blob_sha1 !== CANONICAL_MEDIA_INVENTORY_BLOB_SHA1 || report.canonical_artifact.content_sha256 !== CANONICAL_MEDIA_INVENTORY_CONTENT_SHA256) {
    throw new Error("R2 media coverage canonical artifact binding is invalid");
  }
  return true;
}

export function r2MediaCoverageState(reportPath = DEFAULT_R2_MEDIA_COVERAGE_REPORT, { now = Date.now(), expectedReleaseSha } = {}) {
  const normalizedPath = reportPath ? repoRelativePath(path.resolve(reportPath)) : null;
  if (!reportPath || !fs.existsSync(reportPath)) {
    return { status: "missing_report", path: normalizedPath, next_actions: [...R2_MEDIA_COVERAGE_NEXT_ACTIONS] };
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assertR2MediaCoverageReport(report, { expectedReleaseSha });
    const freshness = evidenceFreshness(R2_MEDIA_COVERAGE_SOURCE, report.generated_at, { now: typeof now === "number" ? now : Date.parse(now) });
    if (freshness.status !== "fresh") {
      return { status: freshness.status === "stale" ? "expired_report" : "invalid_report", path: normalizedPath, generated_at: report.generated_at, freshness, report, next_actions: [...R2_MEDIA_COVERAGE_NEXT_ACTIONS] };
    }
    return {
      status: report.status === "pass" ? "pass" : "blocked_report",
      path: normalizedPath,
      generated_at: report.generated_at,
      freshness,
      report,
      summary: {
        expected_count: report.expected_count,
        listed_count: report.listed_count,
        present_count: report.present_count,
        missing_count: report.missing_count,
        unexpected_count: report.unexpected_count,
        missing_keys: report.missing_keys,
        unexpected_keys: report.unexpected_keys,
        expected_digest: report.expected_digest,
        listing_digest: report.listing_digest,
      },
      next_actions: report.next_actions,
    };
  } catch (error) {
    return { status: "invalid_report", path: normalizedPath, error: error.message, next_actions: [...R2_MEDIA_COVERAGE_NEXT_ACTIONS] };
  }
}
