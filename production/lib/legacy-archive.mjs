import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readThroughCached } from "./file-cache.mjs";
import { fromRoot } from "./paths.mjs";

export const DEFAULT_LEGACY_ARCHIVE_SOURCE = fromRoot(
  "migration",
  "content-evidence",
  "20260729-legacy-content-review",
  "content-inventory.jsonl",
);
export const DEFAULT_LEGACY_ARCHIVE_OUTPUT = fromRoot("production", "data", "legacy-archive.json");
export const LEGACY_ARCHIVE_ID_PATTERN = /^[a-f0-9]{64}$/;

const ARCHIVE_SOURCE_TYPES = new Set(["page", "post"]);
const ARCHIVE_SOURCE_DOMAINS = new Set(["makler-realty.com", "makler-realty.ru"]);

export function archiveIdForUrl(url) {
  return createHash("sha256").update(url).digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isSafeArchiveSourceUrl(sourceUrl, sourceDomain) {
  try {
    const parsed = new URL(sourceUrl);
    return parsed.protocol === "https:" && parsed.hostname === sourceDomain && ARCHIVE_SOURCE_DOMAINS.has(sourceDomain);
  } catch {
    return false;
  }
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

export function legacyArchiveIdFromPath(pathname) {
  const match = String(pathname || "").match(/^\/archive\/([a-f0-9]{64})$/);
  return match?.[1] || null;
}

export function isValidLegacyArchiveEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (!LEGACY_ARCHIVE_ID_PATTERN.test(entry.archive_id || "")) return false;
  if (!ARCHIVE_SOURCE_TYPES.has(entry.source_type)) return false;
  if (typeof entry.content_scope !== "string" || !entry.content_scope.startsWith("class:post_content")) return false;
  if (!isSafeArchiveSourceUrl(entry.source_url, entry.source_domain)) return false;
  if (entry.archive_id !== archiveIdForUrl(entry.source_url)) return false;
  if (!LEGACY_ARCHIVE_ID_PATTERN.test(entry.text_sha256 || "") || !LEGACY_ARCHIVE_ID_PATTERN.test(entry.response_sha256 || "")) return false;
  if (typeof entry.extracted_body_text !== "string" || !entry.extracted_body_text.trim()) return false;
  if (entry.text_sha256 !== sha256(entry.extracted_body_text)) return false;
  return typeof entry.captured_at_utc === "string" && Number.isFinite(Date.parse(entry.captured_at_utc));
}

export function validateLegacyArchive(archive) {
  if (!archive || archive.schema_version !== 1 || !Array.isArray(archive.entries)) {
    throw new Error("Legacy archive must contain schema version 1 entries");
  }
  if (archive.summary?.archive_rows !== archive.entries.length) {
    throw new Error("Legacy archive summary must match entry count");
  }

  const entriesById = new Map();
  for (const entry of archive.entries) {
    if (!isValidLegacyArchiveEntry(entry)) throw new Error("Legacy archive contains an invalid or untrusted entry");
    if (entriesById.has(entry.archive_id)) throw new Error("Legacy archive contains duplicate archive IDs");
    entriesById.set(entry.archive_id, entry);
  }
  return { ...archive, entriesById };
}

export function loadLegacyArchive(filePath = DEFAULT_LEGACY_ARCHIVE_OUTPUT) {
  return readThroughCached(filePath, () => validateLegacyArchive(JSON.parse(fs.readFileSync(filePath, "utf8"))));
}

export function legacyArchiveEntryForPath(pathname, filePath = DEFAULT_LEGACY_ARCHIVE_OUTPUT) {
  const archiveId = legacyArchiveIdFromPath(pathname);
  return archiveId ? loadLegacyArchive(filePath).entriesById.get(archiveId) || null : null;
}
