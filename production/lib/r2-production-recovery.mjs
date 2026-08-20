import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertMonitoringRollbackReport } from "./monitoring-rollback.mjs";
import { assertProductionRecoveryReport, signProductionRecoveryReport } from "./production-recovery.mjs";

export const R2_RECOVERY_SCHEMA_VERSION = 2;
export const R2_RECOVERY_BUCKET = "ms-realty-production-backups-eu";
export const R2_RECOVERY_JURISDICTION = "eu";
export const R2_RECOVERY_COMPONENTS = Object.freeze(["payload_postgres", "runtime_data", "runtime_evidence"]);
const REQUIRED_RUNTIME_DATA_TABLES = Object.freeze([
  "public.admins",
  "public.consent_events",
  "public.lead_contacts",
  "public.listing_tours",
  "public.listing_translations",
  "public.listings",
  "public.locales",
  "public.media_assets",
  "public.public_leads",
  "public.realty_case_conditions",
  "public.realty_case_condition_events",
  "public.realty_case_evidence",
  "public.realty_case_events",
  "public.realty_case_mandate_versions",
  "public.realty_case_outbox",
  "public.realty_cases",
  "public.seller_pipeline_events",
]);
const RUNTIME_DATA_AUTHORITY_ENV = "MS_REALTY_RUNTIME_DATA_AUTHORITY";
const RUNTIME_DATA_AUTHORITY_VALUE = "payload";
const RUNTIME_DATA_AUTHORITY_MISSING = "release-bound Cloudflare Payload runtime authority proof";
const TRUSTED_WORKER_SOURCE = new URL("../../workers/index.js", import.meta.url);
const REQUIRED_RUNTIME_DATA_AUTHORITIES = Object.freeze({
  payload_admins: {
    routes: ["/admin/login", "/admin/logout", "/api/admin/team"],
    tables: ["public.admins"],
  },
  public_lead_intake: {
    routes: ["/api/leads"],
    tables: ["public.public_leads", "public.lead_contacts", "public.consent_events", "public.seller_pipeline_events"],
  },
  listing_authority: {
    routes: ["/api/admin/listings/edit", "/api/admin/listings/status", "/mcp"],
    tables: ["public.listings", "public.listing_translations", "public.media_assets", "public.listing_tours", "public.locales"],
  },
  realty_case_authority: {
    routes: ["/api/admin/cases", "/api/admin/cases/actions", "/api/admin/cases/conditions", "/api/admin/cases/conditions/actions"],
    tables: [
      "public.realty_cases",
      "public.realty_case_events",
      "public.realty_case_mandate_versions",
      "public.realty_case_evidence",
      "public.realty_case_outbox",
      "public.realty_case_conditions",
      "public.realty_case_condition_events",
    ],
  },
});

const SAFE_BACKUP_ID = /^[a-z0-9][a-z0-9._-]{7,95}$/i;
const SAFE_TABLE = /^(?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const RELEASE_SHA = /^[a-f0-9]{40}$/;
const RECOVERY_COMMAND_ENV_KEYS = Object.freeze([
  "PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TERM",
  "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY",
  "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "XDG_CONFIG_HOME",
]);

function requiredText(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function timestamp(value, label) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

export function assertSafeBackupId(value) {
  const backupId = requiredText(value, "backup_id");
  if (!SAFE_BACKUP_ID.test(backupId)) throw new Error("backup_id must be 8-96 safe filename characters");
  return backupId;
}

export function assertSafeTableName(value) {
  const table = requiredText(value, "table name");
  if (!SAFE_TABLE.test(table)) throw new Error(`Unsafe PostgreSQL table name: ${table}`);
  return table.includes(".") ? table : `public.${table}`;
}

export function assertRecoveryReleaseId(value) {
  const releaseId = requiredText(value, "release_id");
  if (!RELEASE_SHA.test(releaseId)) throw new Error("release_id must be an exact lowercase 40-character release SHA");
  return releaseId;
}

export function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function buildRuntimeAuthorityEvidence({ releaseId, workerSource = null } = {}) {
  const source = workerSource ?? fs.readFileSync(TRUSTED_WORKER_SOURCE, "utf8");
  if (!new RegExp(`${RUNTIME_DATA_AUTHORITY_ENV}:\\s*["']${RUNTIME_DATA_AUTHORITY_VALUE}["']`).test(source)) {
    throw new Error(`Worker source must set ${RUNTIME_DATA_AUTHORITY_ENV}=${RUNTIME_DATA_AUTHORITY_VALUE}`);
  }
  return {
    schema_version: 1,
    release_id: assertRecoveryReleaseId(releaseId),
    environment_variable: RUNTIME_DATA_AUTHORITY_ENV,
    required_value: RUNTIME_DATA_AUTHORITY_VALUE,
    worker_source_sha256: crypto.createHash("sha256").update(source).digest("hex"),
  };
}

export function assertRuntimeAuthorityEvidence(evidence, releaseId, { workerSource = null } = {}) {
  const source = workerSource ?? fs.readFileSync(TRUSTED_WORKER_SOURCE, "utf8");
  const trustedWorkerSourceSha256 = crypto.createHash("sha256").update(source).digest("hex");
  if (
    evidence?.schema_version !== 1 ||
    evidence?.release_id !== assertRecoveryReleaseId(releaseId) ||
    evidence?.environment_variable !== RUNTIME_DATA_AUTHORITY_ENV ||
    evidence?.required_value !== RUNTIME_DATA_AUTHORITY_VALUE ||
    !SHA256.test(evidence?.worker_source_sha256 || "") ||
    evidence.worker_source_sha256 !== trustedWorkerSourceSha256
  ) {
    throw new Error("Recovery manifest requires release-bound Cloudflare Payload runtime authority proof");
  }
  return true;
}

export function assertFileSha256(filePath, expected, label = "Recovery artifact") {
  if (!SHA256.test(expected || "") || sha256File(filePath) !== expected) {
    throw new Error(`${label} SHA-256 digest does not match trusted evidence`);
  }
  return true;
}

export function recoveryCommandEnvironment(env = process.env) {
  return Object.fromEntries(
    RECOVERY_COMMAND_ENV_KEYS.flatMap((key) => typeof env[key] === "string" ? [[key, env[key]]] : []),
  );
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

export function componentMapDigest(map) {
  assertRecoveryComponentMap(map);
  return crypto.createHash("sha256").update(canonicalJson(map)).digest("hex");
}

export function readImmutableJson(filePath, label = "Recovery receipt") {
  const resolved = path.resolve(requiredText(filePath, `${label} path`));
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  if ((stat.mode & 0o222) !== 0) throw new Error(`${label} must be read-only before it can be trusted`);
  if (stat.size > 1024 * 1024) throw new Error(`${label} is unexpectedly large`);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

export function trustedManifestDigest({ localManifestPath, recoveryReportPath = null, backupId, publicKey }) {
  const requestedBackupId = assertSafeBackupId(backupId);
  if (fs.existsSync(localManifestPath)) {
    const manifest = readImmutableJson(localManifestPath, "Local recovery manifest");
    if (manifest.backup_id !== requestedBackupId) {
      throw new Error("Local recovery manifest backup_id does not match the requested backup");
    }
    return sha256File(localManifestPath);
  }
  if (!recoveryReportPath) {
    throw new Error("Restore requires the read-only local manifest or an immutable approved recovery report");
  }
  const report = readImmutableJson(recoveryReportPath, "Approved recovery report");
  assertProductionRecoveryReport(report, { publicKey });
  if (report.backup?.backup_id !== requestedBackupId) {
    throw new Error("Approved recovery report does not match backup_id");
  }
  const digest = report.approval?.manifest_sha256;
  if (!SHA256.test(digest || "")) throw new Error("Approved recovery report has no trusted manifest digest");
  return digest;
}

export async function withPlaintextCleanup(filePath, operation) {
  try {
    return await operation();
  } finally {
    fs.rmSync(filePath, { force: true });
  }
}

export function readRecoveryComponentMap(filePath) {
  const map = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assertRecoveryComponentMap(map);
  return map;
}

export function assertRecoveryComponentMap(map) {
  if (!map || typeof map !== "object" || Array.isArray(map) || map.schema_version !== 1) {
    throw new Error("Recovery component map must use schema_version 1");
  }
  if (map.environment !== "production") throw new Error("Recovery component map must target production");

  for (const component of R2_RECOVERY_COMPONENTS) {
    const entry = map.components?.[component];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Recovery component map is missing ${component}`);
    }
    if (!Array.isArray(entry.tables) || !Array.isArray(entry.uncovered_sources)) {
      throw new Error(`Recovery component map ${component} requires tables and uncovered_sources arrays`);
    }
    for (const field of ["deterministic_sources", "unreachable_sources"]) {
      if (entry[field] !== undefined && !Array.isArray(entry[field])) {
        throw new Error(`Recovery component map ${component} ${field} must be an array`);
      }
    }
    const seenTables = new Set();
    for (const mapping of entry.tables) {
      const table = assertSafeTableName(mapping?.name);
      if (!Array.isArray(mapping?.sources) || mapping.sources.length === 0) {
        throw new Error(`Recovery table mapping ${table} requires at least one source`);
      }
      for (const source of mapping.sources) requiredText(source, `${table} source`);
      if (seenTables.has(table)) throw new Error(`Duplicate recovery table mapping: ${table}`);
      seenTables.add(table);
    }
    for (const source of entry.uncovered_sources) requiredText(source, `${component} uncovered source`);
    for (const field of ["deterministic_sources", "unreachable_sources"]) {
      for (const source of entry[field] || []) requiredText(source, `${component} ${field} source`);
    }
    const classifiedSources = [
      ...entry.tables.flatMap((mapping) => mapping.sources),
      ...entry.uncovered_sources,
      ...(entry.deterministic_sources || []),
      ...(entry.unreachable_sources || []),
    ];
    if (new Set(classifiedSources).size !== classifiedSources.length) {
      throw new Error(`Recovery component ${component} classifies a source more than once`);
    }
    if (
      entry.uncovered_sources.length === 0 &&
      entry.tables.length === 0 &&
      (entry.deterministic_sources || []).length === 0
    ) {
      throw new Error(`Recovery component ${component} cannot be covered without a mapped PostgreSQL table or deterministic source`);
    }
  }
  const runtimeTables = new Set(map.components.runtime_data.tables.map((mapping) => mapping.name));
  for (const table of REQUIRED_RUNTIME_DATA_TABLES) {
    if (!runtimeTables.has(table)) throw new Error(`Recovery runtime_data map is missing required durable table ${table}`);
  }
  const authorityGate = map.components.runtime_data.authority_gate;
  if (
    authorityGate?.environment_variable !== RUNTIME_DATA_AUTHORITY_ENV ||
    authorityGate?.required_value !== RUNTIME_DATA_AUTHORITY_VALUE ||
    authorityGate?.worker_source !== "workers/index.js" ||
    !Array.isArray(authorityGate?.authorities)
  ) {
    throw new Error("Recovery runtime_data map requires the strict Cloudflare Payload authority gate");
  }
  const authorities = new Map(authorityGate.authorities.map((authority) => [authority?.id, authority]));
  if (authorities.size !== authorityGate.authorities.length) {
    throw new Error("Recovery runtime_data map has duplicate authority ids");
  }
  for (const [id, required] of Object.entries(REQUIRED_RUNTIME_DATA_AUTHORITIES)) {
    const authority = authorities.get(id);
    if (!authority || !sameJson(authority.routes, required.routes) || !sameJson(authority.tables, required.tables)) {
      throw new Error(`Recovery runtime_data map has incomplete ${id} route/table authority`);
    }
    for (const table of authority.tables) {
      if (!runtimeTables.has(table)) throw new Error(`Recovery runtime_data authority ${id} references unmapped table ${table}`);
    }
  }
  if (authorities.size !== Object.keys(REQUIRED_RUNTIME_DATA_AUTHORITIES).length) {
    throw new Error("Recovery runtime_data map contains an unknown production authority");
  }
  return true;
}

export function mappedTableNames(map) {
  assertRecoveryComponentMap(map);
  return [...new Set(
    R2_RECOVERY_COMPONENTS.flatMap((component) =>
      map.components[component].tables.map((mapping) => assertSafeTableName(mapping.name)),
    ),
  )].sort();
}

function assertCounts(counts, tables, label) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) throw new Error(`${label} counts are required`);
  for (const table of tables) {
    if (!Number.isSafeInteger(counts[table]) || counts[table] < 0) {
      throw new Error(`${label} count is missing or invalid for ${table}`);
    }
  }
}

export function componentCoverage(map, tableCounts, { runtimeAuthorityEvidence = null, releaseId = null } = {}) {
  const tables = mappedTableNames(map);
  assertCounts(tableCounts, tables, "Source");
  const runtimeAuthorityVerified = runtimeAuthorityEvidence
    ? assertRuntimeAuthorityEvidence(runtimeAuthorityEvidence, releaseId)
    : false;
  return Object.fromEntries(R2_RECOVERY_COMPONENTS.map((component) => {
    const entry = map.components[component];
    const mappedTables = entry.tables.map((mapping) => assertSafeTableName(mapping.name));
    const uncoveredSources = [
      ...entry.uncovered_sources,
      ...(component === "runtime_data" && !runtimeAuthorityVerified ? [RUNTIME_DATA_AUTHORITY_MISSING] : []),
    ];
    return [component, {
      status: uncoveredSources.length === 0 ? "covered" : "uncovered",
      mapped_tables: Object.fromEntries(mappedTables.map((table) => [table, tableCounts[table]])),
      mapped_sources: Object.fromEntries(entry.tables.map((mapping) => [
        assertSafeTableName(mapping.name),
        [...mapping.sources],
      ])),
      deterministic_sources: [...(entry.deterministic_sources || [])],
      uncovered_sources: uncoveredSources,
    }];
  }));
}

export function createR2RecoveryManifest({
  backupId,
  releaseId,
  completedAt,
  encryptedFile,
  plaintextFile,
  componentMap,
  tableCounts,
  latestMigration,
  runtimeAuthorityEvidence = null,
  prefix = "backups",
}) {
  const safeBackupId = assertSafeBackupId(backupId);
  const safeReleaseId = assertRecoveryReleaseId(releaseId);
  const safePrefix = requiredText(prefix, "object prefix").replace(/^\/+|\/+$/g, "");
  if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(safePrefix) || safePrefix.split("/").includes("..")) {
    throw new Error("object prefix must be a safe R2 key prefix");
  }
  const coverage = componentCoverage(componentMap, tableCounts, { runtimeAuthorityEvidence, releaseId: safeReleaseId });
  const encryptedStat = fs.lstatSync(encryptedFile);
  const plaintextStat = fs.lstatSync(plaintextFile);
  if (!encryptedStat.isFile() || encryptedStat.isSymbolicLink() || !plaintextStat.isFile() || plaintextStat.isSymbolicLink()) {
    throw new Error("Recovery artifacts must be regular files");
  }

  const objectRoot = `${safePrefix}/${safeBackupId}`;
  return {
    schema_version: R2_RECOVERY_SCHEMA_VERSION,
    environment: "production",
    backup_id: safeBackupId,
    release_id: safeReleaseId,
    completed_at: timestamp(completedAt, "completed_at"),
    provider: "Cloudflare R2 EU",
    bucket: R2_RECOVERY_BUCKET,
    jurisdiction: R2_RECOVERY_JURISDICTION,
    database: {
      engine: "postgresql",
      dump_client_major: 18,
      format: "custom",
      latest_migration: requiredText(latestMigration, "latest migration"),
      table_counts: Object.fromEntries(mappedTableNames(componentMap).map((table) => [table, tableCounts[table]])),
    },
    component_map_sha256: componentMapDigest(componentMap),
    runtime_authority: runtimeAuthorityEvidence,
    encryption: { format: "age-v1", encrypted_before_upload: true },
    artifact: {
      object_key: `${objectRoot}/staged/neon-postgres.dump.age`,
      bytes: encryptedStat.size,
      sha256: sha256File(encryptedFile),
      plaintext_sha256: sha256File(plaintextFile),
    },
    manifest_object_key: `${objectRoot}/manifest.json`,
    component_coverage: coverage,
  };
}

export function assertR2RecoveryManifest(manifest, trustedComponentMap, expectedBackupId = null) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Recovery manifest must be an object");
  if (!trustedComponentMap) throw new Error("Recovery manifest verification requires the trusted component map");
  assertRecoveryComponentMap(trustedComponentMap);
  const backupId = assertSafeBackupId(manifest.backup_id);
  assertRecoveryReleaseId(manifest.release_id);
  assertRuntimeAuthorityEvidence(manifest.runtime_authority, manifest.release_id);
  if (expectedBackupId !== null && backupId !== assertSafeBackupId(expectedBackupId)) {
    throw new Error("Recovery manifest backup_id does not match the requested backup");
  }
  if (manifest.schema_version !== R2_RECOVERY_SCHEMA_VERSION || manifest.environment !== "production") {
    throw new Error("Recovery manifest must use the production schema");
  }
  timestamp(manifest.completed_at, "completed_at");
  if (
    manifest.provider !== "Cloudflare R2 EU" ||
    manifest.bucket !== R2_RECOVERY_BUCKET ||
    manifest.jurisdiction !== R2_RECOVERY_JURISDICTION
  ) {
    throw new Error("Recovery manifest must target the approved private EU R2 bucket");
  }
  if (
    manifest.database?.engine !== "postgresql" ||
    manifest.database?.dump_client_major !== 18 ||
    manifest.database?.format !== "custom"
  ) {
    throw new Error("Recovery manifest must describe a PostgreSQL 18 custom-format dump");
  }
  requiredText(manifest.database?.latest_migration, "latest migration");
  if (manifest.encryption?.format !== "age-v1" || manifest.encryption?.encrypted_before_upload !== true) {
    throw new Error("Recovery manifest must describe pre-upload age encryption");
  }
  if (!Number.isSafeInteger(manifest.artifact?.bytes) || manifest.artifact.bytes <= 0) {
    throw new Error("Recovery manifest artifact size must be positive");
  }
  if (!SHA256.test(manifest.artifact?.sha256 || "") || !SHA256.test(manifest.artifact?.plaintext_sha256 || "")) {
    throw new Error("Recovery manifest checksums must be SHA-256 digests");
  }
  const expectedRoot = `backups/${backupId}`;
  if (
    manifest.artifact.object_key !== `${expectedRoot}/staged/neon-postgres.dump.age` ||
    manifest.manifest_object_key !== `${expectedRoot}/manifest.json`
  ) {
    throw new Error("Recovery manifest object keys do not match backup_id");
  }

  const tableCounts = manifest.database.table_counts;
  if (!tableCounts || typeof tableCounts !== "object" || Array.isArray(tableCounts)) {
    throw new Error("Recovery manifest table counts are required");
  }
  for (const [table, count] of Object.entries(tableCounts)) {
    assertSafeTableName(table);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Invalid recovery table count: ${table}`);
  }
  const expectedTables = mappedTableNames(trustedComponentMap);
  if (expectedTables.length === 0 || !sameJson(Object.keys(tableCounts).sort(), expectedTables)) {
    throw new Error("Recovery manifest table set does not match the trusted component map");
  }
  if (manifest.component_map_sha256 !== componentMapDigest(trustedComponentMap)) {
    throw new Error("Recovery manifest component map digest does not match the trusted component map");
  }
  const expectedCoverage = componentCoverage(trustedComponentMap, tableCounts, {
    runtimeAuthorityEvidence: manifest.runtime_authority,
    releaseId: manifest.release_id,
  });
  if (!sameJson(manifest.component_coverage, expectedCoverage)) {
    throw new Error("Recovery manifest coverage does not match the trusted component map");
  }
  for (const component of R2_RECOVERY_COMPONENTS) {
    const coverage = expectedCoverage[component];
    if (
      coverage.status === "covered" &&
      Object.keys(coverage.mapped_tables).length === 0 &&
      coverage.deterministic_sources.length === 0
    ) {
      throw new Error(`Recovery component ${component} cannot be covered by an empty mapping`);
    }
  }
  return true;
}

export function buildR2UploadPlan(manifest) {
  const backupId = assertSafeBackupId(manifest?.backup_id);
  const expectedRoot = `backups/${backupId}`;
  if (
    manifest?.artifact?.object_key !== `${expectedRoot}/staged/neon-postgres.dump.age` ||
    manifest?.manifest_object_key !== `${expectedRoot}/manifest.json`
  ) {
    throw new Error("Recovery upload plan requires staged ciphertext and a final manifest commit marker");
  }
  return {
    schema_version: 1,
    environment: "production",
    backup_id: backupId,
    status: "pending",
    staged_object_key: manifest.artifact.object_key,
    commit_marker_key: manifest.manifest_object_key,
    attempted_object_keys: [],
    uploaded_object_keys: [],
    cleanup: {
      strategy: "object-lock-retention-lifecycle",
      destructive_delete: false,
      note: "Uncommitted encrypted objects remain private and expire under the bucket lifecycle after object-lock retention.",
    },
  };
}

export function updateR2UploadPlan(plan, { event, objectKey = null, at = null, error = null }) {
  if (!plan || typeof plan !== "object" || plan.schema_version !== 1 || plan.environment !== "production") {
    throw new Error("R2 upload plan is invalid");
  }
  const next = structuredClone(plan);
  const allowedKeys = new Set([next.staged_object_key, next.commit_marker_key]);
  if (["attempted", "uploaded"].includes(event)) {
    if (!allowedKeys.has(objectKey)) throw new Error("R2 upload plan object key is invalid");
    const field = event === "attempted" ? "attempted_object_keys" : "uploaded_object_keys";
    if (!next[field].includes(objectKey)) next[field].push(objectKey);
  } else if (event === "partial") {
    next.status = "partial";
    next.failed_at = timestamp(at, "R2 upload failed_at");
    next.error = requiredText(error, "R2 upload error");
  } else if (event === "committed") {
    if (!allowedKeys.size || [...allowedKeys].some((key) => !next.uploaded_object_keys.includes(key))) {
      throw new Error("R2 upload cannot commit before both staged ciphertext and manifest are uploaded");
    }
    next.status = "committed";
    next.committed_at = timestamp(at, "R2 upload committed_at");
  } else {
    throw new Error("R2 upload plan event is invalid");
  }
  return next;
}

export function assertRecoveryMonitoringRollbackEvidence(report, { manifest, completedAt = null }) {
  assertMonitoringRollbackReport(report);
  if (report.release_id !== assertRecoveryReleaseId(manifest.release_id)) {
    throw new Error("Monitoring rollback release_id does not match the backup manifest release_id");
  }
  const generatedAt = timestamp(report.generated_at, "monitoring rollback generated_at");
  const verifiedAt = timestamp(report.rollback.drill.verified_at, "monitoring rollback verified_at");
  if (verifiedAt < timestamp(manifest.completed_at, "manifest completed_at")) {
    throw new Error("Monitoring rollback evidence must follow the bound backup");
  }
  if (completedAt !== null && generatedAt > timestamp(completedAt, "restore completed_at")) {
    throw new Error("Monitoring rollback evidence must precede restore completion");
  }
  return true;
}

export function buildRestoreDrillResult({
  manifest,
  componentMap,
  restoredTableCounts,
  restoredLatestMigration,
  completedAt,
  operator,
  checksumVerified,
  cleanupVerified,
  monitoringRollbackReport = null,
  monitoringRollbackReportSha256 = null,
  manifestSha256 = null,
}) {
  assertR2RecoveryManifest(manifest, componentMap);
  const sourceCounts = manifest.database.table_counts;
  assertCounts(restoredTableCounts, Object.keys(sourceCounts), "Restored");
  const mismatchedTables = Object.keys(sourceCounts).filter((table) => sourceCounts[table] !== restoredTableCounts[table]);
  const uncoveredComponents = R2_RECOVERY_COMPONENTS.filter(
    (component) => manifest.component_coverage[component].status !== "covered",
  );
  const migrationMatches = requiredText(restoredLatestMigration, "restored latest migration") === manifest.database.latest_migration;
  const rollbackVerified = monitoringRollbackReport !== null && monitoringRollbackReport !== undefined;
  const manifestDigestValid = SHA256.test(manifestSha256 || "");
  if (rollbackVerified) {
    if (!SHA256.test(monitoringRollbackReportSha256 || "")) throw new Error("Monitoring rollback report digest is invalid");
    assertRecoveryMonitoringRollbackEvidence(monitoringRollbackReport, { manifest, completedAt });
  }
  const blockers = [
    ...uncoveredComponents.map((component) => ({ id: `uncovered_component:${component}`, component })),
    ...mismatchedTables.map((table) => ({ id: `row_count_mismatch:${table}`, table })),
    ...(!migrationMatches ? [{ id: "latest_migration_mismatch" }] : []),
    ...(checksumVerified ? [] : [{ id: "checksum_not_verified" }]),
    ...(cleanupVerified ? [] : [{ id: "isolated_target_cleanup_not_verified" }]),
    ...(manifestDigestValid ? [] : [{ id: "manifest_digest_missing" }]),
    ...(rollbackVerified ? [] : [{ id: "monitoring_rollback_report_missing" }]),
  ];
  const verifiedComponents = R2_RECOVERY_COMPONENTS.filter((component) => !uncoveredComponents.includes(component));

  return {
    schema_version: 1,
    environment: "production",
    backup_id: manifest.backup_id,
    release_id: manifest.release_id,
    manifest_sha256: manifestDigestValid ? manifestSha256 : null,
    completed_at: timestamp(completedAt, "restore completed_at"),
    status: blockers.length === 0 ? "pass" : "blocked",
    target: "isolated-postgresql-18",
    operator: requiredText(operator, "restore operator"),
    checksum_verified: checksumVerified === true,
    cleanup_verified: cleanupVerified === true,
    rollback_procedure_verified: rollbackVerified,
    monitoring_rollback_report_sha256: rollbackVerified ? monitoringRollbackReportSha256 : null,
    monitoring_release_id: rollbackVerified ? monitoringRollbackReport.release_id : null,
    latest_migration_matches: migrationMatches,
    source_table_counts: sourceCounts,
    restored_table_counts: restoredTableCounts,
    mismatched_tables: mismatchedTables,
    components_verified: verifiedComponents,
    uncovered_components: uncoveredComponents,
    component_coverage: manifest.component_coverage,
    blockers,
  };
}

export function assertRestoreDrillResult(drill, manifest, componentMap, {
  monitoringRollbackReport,
  monitoringRollbackReportSha256,
  manifestSha256,
} = {}) {
  assertR2RecoveryManifest(manifest, componentMap);
  if (!drill || typeof drill !== "object" || Array.isArray(drill)) throw new Error("Restore drill result must be an object");
  if (
    drill.schema_version !== 1 ||
    drill.environment !== "production" ||
    drill.backup_id !== manifest.backup_id ||
    drill.release_id !== manifest.release_id ||
    drill.target !== "isolated-postgresql-18" ||
    drill.status !== "pass"
  ) {
    throw new Error("Restore drill must be a passing isolated PostgreSQL 18 result for the cited backup");
  }
  if (!SHA256.test(manifestSha256 || "") || drill.manifest_sha256 !== manifestSha256) {
    throw new Error("Restore drill is not bound to the trusted manifest digest");
  }
  assertRecoveryMonitoringRollbackEvidence(monitoringRollbackReport, { manifest, completedAt: drill.completed_at });
  if (
    !SHA256.test(monitoringRollbackReportSha256 || "") ||
    drill.monitoring_rollback_report_sha256 !== monitoringRollbackReportSha256 ||
    drill.monitoring_release_id !== monitoringRollbackReport.release_id
  ) {
    throw new Error("Restore drill is not bound to the immutable monitoring rollback report");
  }
  timestamp(drill.completed_at, "restore completed_at");
  requiredText(drill.operator, "restore operator");
  if (
    drill.checksum_verified !== true ||
    drill.cleanup_verified !== true ||
    drill.rollback_procedure_verified !== true ||
    drill.latest_migration_matches !== true
  ) {
    throw new Error("Restore drill must verify checksum, migration, cleanup, and rollback");
  }
  if (
    !Array.isArray(drill.blockers) || drill.blockers.length !== 0 ||
    !Array.isArray(drill.mismatched_tables) || drill.mismatched_tables.length !== 0 ||
    !Array.isArray(drill.uncovered_components) || drill.uncovered_components.length !== 0 ||
    !Array.isArray(drill.components_verified) ||
    R2_RECOVERY_COMPONENTS.some((component) => !drill.components_verified.includes(component))
  ) {
    throw new Error("Restore drill has blockers, mismatches, or unverified components");
  }
  const expectedCounts = manifest.database.table_counts;
  assertCounts(drill.source_table_counts, Object.keys(expectedCounts), "Drill source");
  assertCounts(drill.restored_table_counts, Object.keys(expectedCounts), "Drill restored");
  for (const [table, expected] of Object.entries(expectedCounts)) {
    if (drill.source_table_counts[table] !== expected || drill.restored_table_counts[table] !== expected) {
      throw new Error(`Restore drill count is not bound to the manifest: ${table}`);
    }
  }
  return true;
}

export function assertRecoveryApprovalArtifact(approval, {
  manifest,
  drill,
  manifestSha256,
  restoreDrillSha256,
}) {
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) throw new Error("Recovery approval artifact is required");
  if (approval.schema_version !== 1 || approval.environment !== "production" || approval.decision !== "approved") {
    throw new Error("Recovery approval artifact must be an approved production decision");
  }
  requiredText(approval.approval_id, "recovery approval_id");
  if (
    approval.manifest_reviewed !== true ||
    approval.restore_drill_reviewed !== true ||
    approval.monitoring_rollback_report_reviewed !== true
  ) {
    throw new Error("Recovery approval must explicitly review the manifest, restore drill, and monitoring rollback report");
  }
  if (approval.backup_id !== manifest.backup_id) throw new Error("Recovery approval backup_id does not match");
  if (approval.release_id !== manifest.release_id || drill.release_id !== manifest.release_id) {
    throw new Error("Recovery approval release_id is not bound to the backup manifest");
  }
  if (approval.ciphertext_sha256 !== manifest.artifact.sha256) throw new Error("Recovery approval backup digest does not match");
  if (!SHA256.test(manifestSha256 || "") || approval.manifest_sha256 !== manifestSha256) {
    throw new Error("Recovery approval manifest digest does not match");
  }
  if (!SHA256.test(restoreDrillSha256 || "") || approval.restore_drill_sha256 !== restoreDrillSha256) {
    throw new Error("Recovery approval restore digest does not match");
  }
  if (
    !SHA256.test(drill.monitoring_rollback_report_sha256 || "") ||
    approval.monitoring_rollback_report_sha256 !== drill.monitoring_rollback_report_sha256 ||
    approval.release_id !== drill.monitoring_release_id
  ) {
    throw new Error("Recovery approval monitoring rollback evidence does not match");
  }
  const operator = requiredText(approval.operator, "recovery approval operator");
  const reviewer = requiredText(approval.reviewer, "recovery approval reviewer");
  if (operator.toLowerCase() !== requiredText(drill.operator, "restore operator").toLowerCase()) {
    throw new Error("Recovery approval operator is not bound to the restore drill");
  }
  if (reviewer.toLowerCase() === operator.toLowerCase()) {
    throw new Error("Recovery approval reviewer must be distinct from the restore operator");
  }
  if (timestamp(approval.approved_at, "recovery approved_at") < timestamp(drill.completed_at, "restore completed_at")) {
    throw new Error("Recovery approval must follow the restore drill");
  }
  return true;
}

export function buildProductionRecoveryReport({
  manifest,
  componentMap,
  drill,
  monitoringRollbackReport,
  monitoringRollbackReportSha256,
  approval,
  manifestSha256,
  restoreDrillSha256,
  approvalArtifactSha256 = null,
  signingPrivateKey,
  generatedAt = new Date().toISOString(),
}) {
  if (!SHA256.test(approvalArtifactSha256 || "")) throw new Error("Recovery approval artifact digest is invalid");
  assertRestoreDrillResult(drill, manifest, componentMap, {
    monitoringRollbackReport,
    monitoringRollbackReportSha256,
    manifestSha256,
  });
  assertRecoveryApprovalArtifact(approval, { manifest, drill, manifestSha256, restoreDrillSha256 });
  const report = {
    schema_version: 2,
    generated_at: timestamp(generatedAt, "generated_at"),
    environment: "production",
    ready: true,
    policy: {
      provider: "Cloudflare R2 EU and Neon PostgreSQL",
      offsite: true,
      encrypted_at_rest: true,
      encrypted_in_transit: true,
      retention_days: 90,
      rpo_hours: 24,
      rto_hours: 8,
    },
    backup: {
      backup_id: manifest.backup_id,
      completed_at: manifest.completed_at,
      checksum_verified: true,
      ciphertext_sha256: manifest.artifact.sha256,
      manifest_sha256: manifestSha256,
      monitoring_rollback_report_sha256: monitoringRollbackReportSha256,
      release_id: manifest.release_id,
      components: [...R2_RECOVERY_COMPONENTS],
    },
    restore_drill: {
      drill_id: `restore-${manifest.backup_id}`,
      source_backup_id: manifest.backup_id,
      completed_at: drill.completed_at,
      target: "isolated",
      status: "pass",
      checksum_verified: drill.checksum_verified,
      rollback_procedure_verified: drill.rollback_procedure_verified,
      ciphertext_sha256: manifest.artifact.sha256,
      manifest_sha256: manifestSha256,
      result_sha256: restoreDrillSha256,
      monitoring_rollback_report_sha256: monitoringRollbackReportSha256,
      release_id: manifest.release_id,
      components_verified: [...drill.components_verified],
      operator: drill.operator,
    },
    approval: {
      status: "approved",
      approval_id: approval.approval_id,
      reviewer: approval.reviewer,
      approved_at: timestamp(approval.approved_at, "approved_at"),
      artifact_sha256: approvalArtifactSha256,
      ciphertext_sha256: manifest.artifact.sha256,
      manifest_sha256: manifestSha256,
      restore_drill_sha256: restoreDrillSha256,
      monitoring_rollback_report_sha256: monitoringRollbackReportSha256,
      release_id: manifest.release_id,
    },
  };
  return signProductionRecoveryReport(report, { privateKey: signingPrivateKey });
}

export function writePrivateJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(temporaryPath, filePath);
  fs.chmodSync(filePath, 0o600);
  return filePath;
}
