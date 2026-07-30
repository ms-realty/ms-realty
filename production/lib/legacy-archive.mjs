import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LEGACY_ARCHIVE_SOURCE = fromRoot(
  "migration",
  "content-evidence",
  "20260729-legacy-content-review",
  "content-inventory.jsonl",
);
export const DEFAULT_LEGACY_ARCHIVE_OUTPUT = fromRoot("production", "data", "legacy-archive.json");

export function archiveIdForUrl(url) {
  return createHash("sha256").update(url).digest("hex");
}

export function isArchiveableLegacyContent(row) {
  return (
    row?.status === 200 &&
    (row.url_type === "page" || row.url_type === "post") &&
    typeof row.content_scope === "string" &&
    row.content_scope.startsWith("class:post_content")
  );
}

function archiveEntry(row) {
  for (const field of [
    "url",
    "source_domain",
    "url_type",
    "content_scope",
    "text_sha256",
    "response_sha256",
    "captured_at_utc",
    "extracted_body_text",
  ]) {
    if (typeof row[field] !== "string") throw new Error("Legacy archive row is missing " + field);
  }

  return {
    archive_id: archiveIdForUrl(row.url),
    source_url: row.url,
    source_domain: row.source_domain,
    source_type: row.url_type,
    content_scope: row.content_scope,
    text_sha256: row.text_sha256,
    response_sha256: row.response_sha256,
    captured_at_utc: row.captured_at_utc,
    extracted_body_text: row.extracted_body_text,
  };
}

export function readLegacyArchiveSource(sourcePath = DEFAULT_LEGACY_ARCHIVE_SOURCE) {
  return fs
    .readFileSync(sourcePath, "utf8")
    .split(/\r?\n/)
    .flatMap((line, index) => {
      if (!line.trim()) return [];
      try {
        return [JSON.parse(line)];
      } catch {
        throw new Error("Invalid legacy archive source row " + (index + 1));
      }
    });
}

export function buildLegacyArchive(rows) {
  if (!Array.isArray(rows)) throw new Error("Legacy archive source must be an array");

  const entriesByUrl = new Map();
  let eligibleRows = 0;
  for (const row of rows) {
    if (!isArchiveableLegacyContent(row)) continue;
    eligibleRows += 1;
    if (!entriesByUrl.has(row.url)) entriesByUrl.set(row.url, archiveEntry(row));
  }

  const entries = [...entriesByUrl.values()].sort((left, right) =>
    left.source_url < right.source_url ? -1 : left.source_url > right.source_url ? 1 : 0,
  );
  return {
    schema_version: 1,
    summary: {
      source_rows: rows.length,
      eligible_rows: eligibleRows,
      archive_rows: entries.length,
      excluded_rows: rows.length - eligibleRows,
      duplicate_url_rows: eligibleRows - entries.length,
    },
    entries,
  };
}

export function buildLegacyArchiveFromFile(sourcePath = DEFAULT_LEGACY_ARCHIVE_SOURCE) {
  return buildLegacyArchive(readLegacyArchiveSource(sourcePath));
}

export function writeLegacyArchive(archive, outPath = DEFAULT_LEGACY_ARCHIVE_OUTPUT) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(archive, null, 2) + "\n");
  return { outPath, summary: archive.summary };
}
