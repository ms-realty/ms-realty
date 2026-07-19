import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const LOCAL_BACKUP_SCHEMA_VERSION = 1;

export const LOCAL_BACKUP_COMPONENTS = Object.freeze({
  payload_postgres: Object.freeze({ file: "payload-postgres.dump", format: "postgres-custom" }),
  runtime_data: Object.freeze({ file: "runtime-data.tar.gz", format: "tar-gzip" }),
  runtime_evidence: Object.freeze({ file: "runtime-evidence.tar.gz", format: "tar-gzip" }),
});

const REQUIRED_SECRET_KEYS = Object.freeze(["PAYLOAD_SECRET", "MS_REALTY_LEAD_CONTACT_KEY"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertSafeBackupId(value) {
  const backupId = String(value || "");
  if (!/^[a-z0-9][a-z0-9._-]{7,95}$/i.test(backupId)) {
    throw new Error("backup_id must be 8-96 safe filename characters");
  }
  return backupId;
}

function secretFingerprints(env) {
  return Object.fromEntries(
    REQUIRED_SECRET_KEYS.map((key) => {
      const value = String(env[key] || "");
      if (!value) throw new Error(`${key} is required to bind a backup to its encryption/runtime secrets`);
      return [key.toLowerCase(), sha256(`ms-realty-local-backup:v1:${key}:${value}`)];
    }),
  );
}

function componentPath(backupDir, component) {
  const resolvedRoot = path.resolve(backupDir);
  const resolvedFile = path.resolve(resolvedRoot, component.file);
  if (path.dirname(resolvedFile) !== resolvedRoot) throw new Error(`Unsafe backup component path: ${component.file}`);
  return resolvedFile;
}

function regularFileMetadata(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Backup component must be a regular file: ${filePath}`);
  return {
    bytes: stat.size,
    sha256: sha256(fs.readFileSync(filePath)),
  };
}

export function createLocalBackupManifest({ backupDir, backupId, createdAt = new Date().toISOString(), env }) {
  const safeBackupId = assertSafeBackupId(backupId);
  const created = new Date(createdAt);
  if (Number.isNaN(created.valueOf())) throw new Error("created_at must be an ISO date");

  const components = Object.fromEntries(
    Object.entries(LOCAL_BACKUP_COMPONENTS).map(([name, component]) => [
      name,
      {
        file: component.file,
        format: component.format,
        ...regularFileMetadata(componentPath(backupDir, component)),
      },
    ]),
  );

  return {
    schema_version: LOCAL_BACKUP_SCHEMA_VERSION,
    backup_id: safeBackupId,
    created_at: created.toISOString(),
    scope: "local_preview",
    contains_personal_data: true,
    redistributable: false,
    secret_fingerprints: secretFingerprints(env),
    components,
    rebuild_after_restore: ["typesense", "meilisearch", "local_runtime_reports"],
    production_evidence: false,
  };
}

export function writeLocalBackupManifest({ backupDir, manifest }) {
  const manifestPath = path.join(path.resolve(backupDir), "manifest.json");
  const temporaryPath = `${manifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(temporaryPath, manifestPath);
  fs.chmodSync(manifestPath, 0o600);
  return manifestPath;
}

function readManifest(backupDir) {
  const manifestPath = path.join(path.resolve(backupDir), "manifest.json");
  const stat = fs.lstatSync(manifestPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Backup manifest must be a regular file");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function validateLocalBackup({ backupDir, env }) {
  const root = path.resolve(backupDir);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Backup path must be a real directory");

  const manifest = readManifest(root);
  if (manifest.schema_version !== LOCAL_BACKUP_SCHEMA_VERSION) throw new Error("Unsupported local backup schema version");
  assertSafeBackupId(manifest.backup_id);
  if (manifest.scope !== "local_preview" || manifest.production_evidence !== false) {
    throw new Error("Backup manifest is not a local-preview recovery artifact");
  }

  const expectedFingerprints = secretFingerprints(env);
  for (const [key, fingerprint] of Object.entries(expectedFingerprints)) {
    if (manifest.secret_fingerprints?.[key] !== fingerprint) {
      throw new Error(`Current ${key.toUpperCase()} does not match the backup; refusing an unreadable restore`);
    }
  }

  for (const [name, expected] of Object.entries(LOCAL_BACKUP_COMPONENTS)) {
    const actual = manifest.components?.[name];
    if (!actual || actual.file !== expected.file || actual.format !== expected.format) {
      throw new Error(`Backup component contract mismatch: ${name}`);
    }
    const metadata = regularFileMetadata(componentPath(root, expected));
    if (actual.bytes !== metadata.bytes || actual.sha256 !== metadata.sha256) {
      throw new Error(`Backup component checksum mismatch: ${name}`);
    }
  }

  return { backupDir: root, manifest };
}

export function assertSafeArchiveEntries(entries, label) {
  for (const rawEntry of entries) {
    const entry = String(rawEntry || "").trim();
    if (!entry || entry === ".") continue;
    if (entry.startsWith("/") || entry.split("/").includes("..")) {
      throw new Error(`${label} contains an unsafe archive path: ${entry}`);
    }
  }
}
