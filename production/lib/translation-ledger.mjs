import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_TRANSLATION_LEDGER_PATH = fromRoot("production", "data", "translation-tasks.jsonl");

export function resetTranslationLedger(filePath = DEFAULT_TRANSLATION_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

export function appendTranslationTask(task, { filePath = DEFAULT_TRANSLATION_LEDGER_PATH } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(task)}\n`);
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
