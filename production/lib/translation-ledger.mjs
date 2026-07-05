import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_TRANSLATION_LEDGER_PATH = fromRoot("production", "data", "translation-tasks.jsonl");
export const DEFAULT_HERMES_AUDIT_LEDGER_PATH = fromRoot("production", "data", "hermes-audit.jsonl");

function auditPathFor(filePath, auditPath) {
  return (
    auditPath ||
    (filePath === DEFAULT_TRANSLATION_LEDGER_PATH
      ? DEFAULT_HERMES_AUDIT_LEDGER_PATH
      : path.join(path.dirname(filePath), "hermes-audit.jsonl"))
  );
}

function hermesAuditRow(task, recordedAt) {
  return {
    recorded_at: recordedAt,
    task_id: task.id,
    object_type: task.object_type,
    object_id: task.object_id,
    source_locale: task.source_locale,
    target_locale: task.target_locale,
    status: task.status,
    provider_mode: task.provider_mode,
    source_hash: task.source_hash,
    draft_hash: task.draft_hash,
    has_output: Boolean(task.hermes?.output),
    public_indexable: task.public_indexable === true,
    human_approved: task.human_approved === true,
    can_publish: task.hermes?.can_publish === true,
    can_mark_indexable: task.hermes?.can_mark_indexable === true,
  };
}

export function resetTranslationLedger(filePath = DEFAULT_TRANSLATION_LEDGER_PATH, { auditPath } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
  fs.writeFileSync(auditPathFor(filePath, auditPath), "");
}

export function appendTranslationTask(
  task,
  { filePath = DEFAULT_TRANSLATION_LEDGER_PATH, auditPath, recordedAt = "2026-07-05T00:00:00Z" } = {},
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(task)}\n`);
  if (task.hermes) {
    fs.appendFileSync(auditPathFor(filePath, auditPath), `${JSON.stringify(hermesAuditRow(task, recordedAt))}\n`);
  }
  return task;
}

export function readTranslationLedger(filePath = DEFAULT_TRANSLATION_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function readHermesAuditLedger(filePath = DEFAULT_HERMES_AUDIT_LEDGER_PATH) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function latestTranslationTasks(rows) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

export function assertTranslationLedger(rows) {
  if (!rows.length) throw new Error("Translation ledger must contain at least one row");
  if (!rows.some((row) => row.status === "hermes_drafted" && row.public_indexable === false)) {
    throw new Error("Translation ledger must preserve Hermes draft as non-indexable");
  }
  if (!rows.some((row) => row.status === "published" && row.human_approved === true && row.public_indexable === true)) {
    throw new Error("Translation ledger must contain a human-approved published row");
  }
  return true;
}

export function assertHermesAuditLedger(rows) {
  if (!rows.length) throw new Error("Hermes audit ledger must contain at least one row");
  for (const row of rows) {
    if (!row.task_id || !row.source_hash || !row.target_locale || !row.provider_mode) {
      throw new Error("Hermes audit row is missing routing data");
    }
    if (row.can_publish || row.can_mark_indexable) throw new Error("Hermes audit row must preserve draft-only action limits");
    if ("sourceText" in row || "prompt" in row || "body" in row || "title" in row) {
      throw new Error("Hermes audit row must not store raw prompt or translation text");
    }
  }
  return true;
}
