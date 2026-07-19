import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LOCAL_BACKUP_COMPONENTS,
  assertSafeArchiveEntries,
  createLocalBackupManifest,
  validateLocalBackup,
  writeLocalBackupManifest,
} from "../lib/local-backup.mjs";

const env = Object.freeze({
  PAYLOAD_SECRET: "payload-secret-for-tests",
  MS_REALTY_LEAD_CONTACT_KEY: "contact-key-for-tests",
});

function fixture() {
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-backup-"));
  for (const [name, component] of Object.entries(LOCAL_BACKUP_COMPONENTS)) {
    fs.writeFileSync(path.join(backupDir, component.file), `${name}\n`, { mode: 0o600 });
  }
  const manifest = createLocalBackupManifest({
    backupDir,
    backupId: "backup-20260719t120000z",
    createdAt: "2026-07-19T12:00:00.000Z",
    env,
  });
  writeLocalBackupManifest({ backupDir, manifest });
  return { backupDir, manifest };
}

test("local recovery manifest contains checksums but never runtime secrets", (t) => {
  const { backupDir, manifest } = fixture();
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));

  const serialized = JSON.stringify(manifest);
  assert.equal(manifest.scope, "local_preview");
  assert.equal(manifest.production_evidence, false);
  assert.equal(manifest.contains_personal_data, true);
  assert.doesNotMatch(serialized, /payload-secret-for-tests|contact-key-for-tests/);
  assert.equal(validateLocalBackup({ backupDir, env }).manifest.backup_id, manifest.backup_id);
});

test("local recovery validation fails closed on tampering and secret drift", (t) => {
  const { backupDir } = fixture();
  t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));

  assert.throws(
    () => validateLocalBackup({ backupDir, env: { ...env, MS_REALTY_LEAD_CONTACT_KEY: "wrong-key" } }),
    /does not match the backup/,
  );

  fs.appendFileSync(path.join(backupDir, LOCAL_BACKUP_COMPONENTS.runtime_data.file), "tampered");
  assert.throws(() => validateLocalBackup({ backupDir, env }), /checksum mismatch: runtime_data/);
});

test("local recovery rejects archive traversal paths", () => {
  assert.doesNotThrow(() => assertSafeArchiveEntries(["./", "./lead-ledger.jsonl", "nested/report.json"], "runtime data"));
  assert.throws(() => assertSafeArchiveEntries(["../outside"], "runtime data"), /unsafe archive path/);
  assert.throws(() => assertSafeArchiveEntries(["/absolute/path"], "runtime data"), /unsafe archive path/);
});
