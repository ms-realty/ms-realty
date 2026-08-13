import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assertProductionRecoveryReport } from "./production-recovery.mjs";

export const R2_RECOVERY_SCHEMA_VERSION = 1;
export const R2_RECOVERY_BUCKET = "ms-realty-production-backups-eu";
export const R2_RECOVERY_JURISDICTION = "eu";
export const R2_RECOVERY_COMPONENTS = Object.freeze(["payload_postgres", "runtime_data", "runtime_evidence"]);

const SAFE_BACKUP_ID = /^[a-z0-9][a-z0-9._-]{7,95}$/i;
const SAFE_TABLE = /^(?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*$/;
const SHA256 = /^[a-f0-9]{64}$/;

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

export function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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
    if (entry.uncovered_sources.length === 0 && entry.tables.length === 0) {
      throw new Error(`Recovery component ${component} cannot be covered without a mapped PostgreSQL table`);
    }
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

export function componentCoverage(map, tableCounts) {
  const tables = mappedTableNames(map);
  assertCounts(tableCounts, tables, "Source");
  return Object.fromEntries(R2_RECOVERY_COMPONENTS.map((component) => {
    const entry = map.components[component];
    const mappedTables = entry.tables.map((mapping) => assertSafeTableName(mapping.name));
    const uncoveredSources = [...entry.uncovered_sources];
    return [component, {
      status: uncoveredSources.length === 0 ? "covered" : "uncovered",
      mapped_tables: Object.fromEntries(mappedTables.map((table) => [table, tableCounts[table]])),
      mapped_sources: Object.fromEntries(entry.tables.map((mapping) => [
        assertSafeTableName(mapping.name),
        [...mapping.sources],
      ])),
      uncovered_sources: uncoveredSources,
    }];
  }));
}

export function createR2RecoveryManifest({
  backupId,
  completedAt,
  encryptedFile,
  plaintextFile,
  componentMap,
  tableCounts,
  latestMigration,
  prefix = "backups",
}) {
  const safeBackupId = assertSafeBackupId(backupId);
  const safePrefix = requiredText(prefix, "object prefix").replace(/^\/+|\/+$/g, "");
  if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(safePrefix) || safePrefix.split("/").includes("..")) {
    throw new Error("object prefix must be a safe R2 key prefix");
  }
  const coverage = componentCoverage(componentMap, tableCounts);
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
    encryption: { format: "age-v1", encrypted_before_upload: true },
    artifact: {
      object_key: `${objectRoot}/neon-postgres.dump.age`,
      bytes: encryptedStat.size,
      sha256: sha256File(encryptedFile),
      plaintext_sha256: sha256File(plaintextFile),
    },
    manifest_object_key: `${objectRoot}/manifest.json`,
    component_coverage: coverage,
  };
}

export function assertR2RecoveryManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Recovery manifest must be an object");
  const backupId = assertSafeBackupId(manifest.backup_id);
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
    manifest.artifact.object_key !== `${expectedRoot}/neon-postgres.dump.age` ||
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
  for (const component of R2_RECOVERY_COMPONENTS) {
    const coverage = manifest.component_coverage?.[component];
    if (!coverage || !["covered", "uncovered"].includes(coverage.status)) {
      throw new Error(`Recovery manifest is missing component coverage for ${component}`);
    }
    if (!Array.isArray(coverage.uncovered_sources)) throw new Error(`Recovery coverage ${component} is invalid`);
    if ((coverage.status === "covered") !== (coverage.uncovered_sources.length === 0)) {
      throw new Error(`Recovery coverage ${component} contradicts uncovered sources`);
    }
    for (const [table, count] of Object.entries(coverage.mapped_tables || {})) {
      assertSafeTableName(table);
      if (tableCounts[table] !== count) throw new Error(`Recovery component count mismatch: ${component}/${table}`);
      if (!Array.isArray(coverage.mapped_sources?.[table]) || coverage.mapped_sources[table].length === 0) {
        throw new Error(`Recovery component source mapping is missing: ${component}/${table}`);
      }
    }
  }
  return true;
}

export function buildRestoreDrillResult({
  manifest,
  restoredTableCounts,
  restoredLatestMigration,
  completedAt,
  operator,
  checksumVerified,
  cleanupVerified,
}) {
  assertR2RecoveryManifest(manifest);
  const sourceCounts = manifest.database.table_counts;
  assertCounts(restoredTableCounts, Object.keys(sourceCounts), "Restored");
  const mismatchedTables = Object.keys(sourceCounts).filter((table) => sourceCounts[table] !== restoredTableCounts[table]);
  const uncoveredComponents = R2_RECOVERY_COMPONENTS.filter(
    (component) => manifest.component_coverage[component].status !== "covered",
  );
  const migrationMatches = requiredText(restoredLatestMigration, "restored latest migration") === manifest.database.latest_migration;
  const blockers = [
    ...uncoveredComponents.map((component) => ({ id: `uncovered_component:${component}`, component })),
    ...mismatchedTables.map((table) => ({ id: `row_count_mismatch:${table}`, table })),
    ...(!migrationMatches ? [{ id: "latest_migration_mismatch" }] : []),
    ...(checksumVerified ? [] : [{ id: "checksum_not_verified" }]),
    ...(cleanupVerified ? [] : [{ id: "isolated_target_cleanup_not_verified" }]),
  ];
  const verifiedComponents = R2_RECOVERY_COMPONENTS.filter((component) => !uncoveredComponents.includes(component));

  return {
    schema_version: 1,
    environment: "production",
    backup_id: manifest.backup_id,
    completed_at: timestamp(completedAt, "restore completed_at"),
    status: blockers.length === 0 ? "pass" : "blocked",
    target: "isolated-postgresql-18",
    operator: requiredText(operator, "restore operator"),
    checksum_verified: checksumVerified === true,
    cleanup_verified: cleanupVerified === true,
    rollback_procedure_verified: cleanupVerified === true,
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

export function assertRestoreDrillResult(drill, manifest) {
  assertR2RecoveryManifest(manifest);
  if (!drill || typeof drill !== "object" || Array.isArray(drill)) throw new Error("Restore drill result must be an object");
  if (
    drill.schema_version !== 1 ||
    drill.environment !== "production" ||
    drill.backup_id !== manifest.backup_id ||
    drill.target !== "isolated-postgresql-18" ||
    drill.status !== "pass"
  ) {
    throw new Error("Restore drill must be a passing isolated PostgreSQL 18 result for the cited backup");
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

export function buildProductionRecoveryReport({ manifest, drill, reviewer, approvedAt, generatedAt = new Date().toISOString() }) {
  assertRestoreDrillResult(drill, manifest);
  const report = {
    schema_version: 1,
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
      components_verified: [...drill.components_verified],
      operator: drill.operator,
    },
    approval: {
      status: "approved",
      reviewer: requiredText(reviewer, "recovery reviewer"),
      approved_at: timestamp(approvedAt, "approved_at"),
    },
  };
  assertProductionRecoveryReport(report);
  return report;
}

export function writePrivateJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(temporaryPath, filePath);
  fs.chmodSync(filePath, 0o600);
  return filePath;
}
