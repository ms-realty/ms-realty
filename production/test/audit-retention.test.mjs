import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  DEFAULT_AUDIT_RETENTION_DAYS,
  MIN_AUDIT_RETENTION_DAYS,
  NEVER_PRUNE_ACTIONS,
  assertAuditRetentionPlan,
  auditRetentionDays,
  auditRetentionPlan,
  backupAuditLog,
  collectProtectedAuditReferences,
  defaultProtectedArtifactPaths,
} from "../lib/audit-retention.mjs";
import { appendAuditLog, createAuditLogEntry, readAuditLog, replaceAuditLog, resetAuditLog } from "../lib/audit-log.mjs";
import { fromRoot } from "../lib/paths.mjs";

const NOW = "2026-08-23T12:00:00.000Z";
const SCRIPT = fromRoot("production", "scripts", "run-audit-retention.mjs");

function daysBefore(days) {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

function tempAuditLog(rows = []) {
  const filePath = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-audit-retention-`)}/audit-log.jsonl`;
  resetAuditLog(filePath);
  for (const row of rows) appendAuditLog(createAuditLogEntry(row.input, row.recordedAt), { filePath });
  return filePath;
}

function artifact(directory, name, value) {
  const filePath = path.join(directory, name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(filePath, name.endsWith(".jsonl") ? `${JSON.stringify(value)}\n` : JSON.stringify(value, null, 2));
  return filePath;
}

const ROWS = [
  { input: { action: "listing_edited", actor: "editor_bg", objectType: "listing", objectId: "MS-00815" }, recordedAt: daysBefore(1) },
  { input: { action: "listing_edited", actor: "editor_bg", objectType: "listing", objectId: "MS-CRAWL-9999" }, recordedAt: daysBefore(4000) },
  { input: { action: "lead_created", actor: "broker_ru", objectType: "lead", objectId: "lead-referenced" }, recordedAt: daysBefore(4000) },
  { input: { action: "consent_withdrawn", actor: "ivan", objectType: "consent", objectId: "consent-1" }, recordedAt: daysBefore(4000) },
  { input: { action: "tour_approved", actor: "ivan", objectType: "listing_tour", objectId: "tour-1" }, recordedAt: daysBefore(4000) },
];

function protectedArtifacts(directory) {
  return [
    { path: artifact(directory, "launch-readiness.json", { gates: [{ id: "leads", evidence: { sampled: ["lead-referenced"] } }] }), required: true },
  ];
}

test("the documented default window is seven years and a shorter one is refused", () => {
  assert.equal(DEFAULT_AUDIT_RETENTION_DAYS, 2555);
  assert.equal(auditRetentionDays({}), 2555);
  assert.equal(auditRetentionDays({ MS_REALTY_AUDIT_RETENTION_DAYS: "3650" }), 3650);
  // A typo cannot shrink the accountability record.
  assert.throws(() => auditRetentionDays({ MS_REALTY_AUDIT_RETENTION_DAYS: "30" }), /at least 365 days/);
  assert.throws(() => auditRetentionDays({ MS_REALTY_AUDIT_RETENTION_DAYS: "0" }), /at least 365 days/);
  assert.throws(() => auditRetentionDays({ MS_REALTY_AUDIT_RETENTION_DAYS: "-1" }), /whole number of days/);
  assert.throws(() => auditRetentionDays({ MS_REALTY_AUDIT_RETENTION_DAYS: "forever" }), /whole number of days/);
  assert.throws(() => auditRetentionDays({ MS_REALTY_AUDIT_RETENTION_DAYS: "99999999" }), /at most/);
  assert.throws(
    () => auditRetentionPlan([], { now: NOW, retentionDays: 10, references: new Set() }),
    new RegExp(`at least ${MIN_AUDIT_RETENTION_DAYS} days`),
  );
});

test("the plan keeps approval records and rows a launch artifact still references", () => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-retention-artifacts-`);
  const filePath = tempAuditLog(ROWS);
  const plan = auditRetentionPlan(readAuditLog(filePath), {
    now: NOW,
    retentionDays: 2555,
    artifacts: protectedArtifacts(directory),
  });
  assert.equal(assertAuditRetentionPlan(plan), true);
  assert.equal(plan.total, 5);
  assert.equal(plan.prunable, 1);
  assert.deepEqual(plan.prunable_rows.map((row) => row.object_id), ["MS-CRAWL-9999"]);

  const protectedBy = Object.fromEntries(plan.protected_rows.map((row) => [row.object_id, row.protected_by]));
  assert.equal(protectedBy["lead-referenced"], "referenced_by_launch_evidence");
  assert.equal(protectedBy["consent-1"], "approval_record");
  assert.equal(protectedBy["tour-1"], "approval_record");
  assert.equal(plan.protected_beyond_window, 3);
  // Rows inside the window are retained without being listed as "protected".
  assert.equal(plan.retained, 4);

  // Consent withdrawals and every approval-bearing action are never prunable.
  assert.ok(NEVER_PRUNE_ACTIONS.includes("consent_withdrawn"));
  assert.ok(NEVER_PRUNE_ACTIONS.includes("audit_log_pruned"));
  assert.ok(NEVER_PRUNE_ACTIONS.includes("redirect_approval_created"));
});

test("an unreadable or missing protected artifact refuses the whole plan", () => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-retention-missing-`);
  assert.throws(
    () => collectProtectedAuditReferences([{ path: path.join(directory, "absent.json"), required: true }]),
    /cannot verify protected references/,
  );
  const broken = artifact(directory, "launch-readiness.json", {});
  fs.writeFileSync(broken, "{ not json");
  assert.throws(() => collectProtectedAuditReferences([{ path: broken, required: true }]), /cannot read/);
  // The shipped default set points at artifacts that really exist.
  const collected = collectProtectedAuditReferences(defaultProtectedArtifactPaths({}));
  assert.equal(collected.scanned.length, 6);
  assert.ok(collected.references.size > 100);
});

test("a row with an unparsable timestamp is retained rather than guessed at", () => {
  const plan = auditRetentionPlan(
    [{ recorded_at: "not-a-date", action: "listing_edited", actor: "x", object_type: "listing", object_id: "MS-00907" }],
    { now: NOW, retentionDays: 2555, references: new Set() },
  );
  assert.equal(plan.prunable, 0);
  assert.equal(plan.protected_rows[0].protected_by, "unparsable_timestamp");
});

test("backup refuses to overwrite and always precedes a rewrite", () => {
  const filePath = tempAuditLog(ROWS);
  const backupPath = backupAuditLog(filePath, { now: NOW });
  assert.equal(fs.readFileSync(backupPath, "utf8"), fs.readFileSync(filePath, "utf8"));
  assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600);
  assert.throws(() => backupAuditLog(filePath, { now: NOW }), /already exists/);
  assert.throws(() => backupAuditLog(`${filePath}.absent`, { now: NOW }), /does not exist/);

  // replaceAuditLog is the only writer that shrinks the ledger, and it still
  // validates every surviving row.
  const rows = readAuditLog(filePath);
  assert.equal(replaceAuditLog(rows.slice(0, 2), { filePath }), 2);
  assert.equal(readAuditLog(filePath).length, 2);
  assert.throws(() => replaceAuditLog([{ action: "nonsense" }], { filePath }), /missing routing data/);
});

test("the maintenance command is dry by default and refuses --apply without an operator", () => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-retention-cli-`);
  const filePath = tempAuditLog(ROWS);
  const env = {
    ...process.env,
    MS_REALTY_AUDIT_LOG_PATH: filePath,
    MS_REALTY_AUDIT_RETENTION_AT: NOW,
    MS_REALTY_AUDIT_RETENTION_EXTRA_ARTIFACTS: artifact(directory, "extra.json", { referenced: ["lead-referenced"] }),
  };
  delete env.MS_REALTY_AUDIT_RETENTION_ACTOR;

  const dry = JSON.parse(execFileSync(process.execPath, [SCRIPT], { env, encoding: "utf8" }).split("Re-run")[0]);
  assert.equal(dry.mode, "dry_run");
  assert.equal(dry.prunable, 1);
  assert.equal(dry.retention_days, 2555);
  assert.equal(readAuditLog(filePath).length, 5, "a dry run must not touch the ledger");

  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, "--apply"], { env, encoding: "utf8", stdio: "pipe" }),
    (error) => /AUDIT RETENTION REFUSED/.test(String(error.stderr)) && /stable operator ID/.test(String(error.stderr)),
  );
  assert.equal(readAuditLog(filePath).length, 5, "a refused apply must not touch the ledger");
});

test("the maintenance command prunes, backs up, and records the prune it performed", () => {
  const directory = fs.mkdtempSync(`${os.tmpdir()}/ms-realty-retention-apply-`);
  const filePath = tempAuditLog(ROWS);
  const env = {
    ...process.env,
    MS_REALTY_AUDIT_LOG_PATH: filePath,
    MS_REALTY_AUDIT_RETENTION_AT: NOW,
    MS_REALTY_AUDIT_RETENTION_EXTRA_ARTIFACTS: artifact(directory, "extra.json", { referenced: ["lead-referenced"] }),
  };

  const applied = JSON.parse(execFileSync(process.execPath, [SCRIPT, "--apply", "--actor=ivan"], { env, encoding: "utf8" }));
  assert.equal(applied.mode, "apply");
  assert.equal(applied.pruned, 1);
  assert.ok(applied.backup_path);

  const rows = readAuditLog(filePath);
  // Four survivors plus the record of the prune itself.
  assert.equal(rows.length, 5);
  assert.equal(rows.some((row) => row.object_id === "MS-CRAWL-9999"), false);
  assert.equal(rows.some((row) => row.object_id === "lead-referenced"), true);
  assert.equal(rows.some((row) => row.object_id === "consent-1"), true);

  const prune = rows.at(-1);
  assert.equal(prune.action, "audit_log_pruned");
  assert.equal(prune.actor, "ivan");
  assert.equal(prune.metadata.pruned, 1);
  assert.equal(prune.metadata.retention_days, 2555);
  assert.ok(prune.metadata.backup_path);

  // The backup still holds every original row.
  const backupFile = fs
    .readdirSync(path.join(path.dirname(filePath), "audit-log-backups"))
    .map((name) => path.join(path.dirname(filePath), "audit-log-backups", name))[0];
  assert.equal(fs.readFileSync(backupFile, "utf8").trim().split("\n").length, 5);

  // A second run has nothing left to do and stays a no-op.
  const again = JSON.parse(execFileSync(process.execPath, [SCRIPT, "--apply", "--actor=ivan"], { env, encoding: "utf8" }));
  assert.equal(again.pruned, 0);
  assert.equal(readAuditLog(filePath).length, 5);
});

test("the command refuses when a protected artifact cannot be read", () => {
  const filePath = tempAuditLog(ROWS);
  assert.throws(
    () =>
      execFileSync(process.execPath, [SCRIPT, "--apply", "--actor=ivan"], {
        env: {
          ...process.env,
          MS_REALTY_AUDIT_LOG_PATH: filePath,
          MS_REALTY_AUDIT_RETENTION_AT: NOW,
          MS_REALTY_AUDIT_RETENTION_EXTRA_ARTIFACTS: "/nonexistent/launch-evidence.json",
        },
        encoding: "utf8",
        stdio: "pipe",
      }),
    (error) => /cannot verify protected references/.test(String(error.stderr)),
  );
  assert.equal(readAuditLog(filePath).length, 5);
});
