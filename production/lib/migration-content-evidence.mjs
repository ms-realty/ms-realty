import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { DEFAULT_ARTIFACT_DIR } from "./migration.mjs";

export const CONTENT_EVIDENCE_ENV = "MS_REALTY_CONTENT_EVIDENCE_DIR";
export const DEFAULT_CONTENT_SOURCE_INVENTORY = path.join(DEFAULT_ARTIFACT_DIR, "url-inventory.csv");

const MANIFEST_FILE = "content-evidence-manifest.json";
const CONTENT_FILE = "content-inventory.jsonl";
const SKIPPED_FILE = "content-capture-skipped.csv";
const PRIVATE_CONTENT_BY_STORE = new WeakMap();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function safeText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) throw new Error("Content evidence must use numeric status fields");
  return number;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonLines(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSONL content evidence row ${index + 1}`);
      }
    });
}

function recordsByUrl(records) {
  if (!Array.isArray(records)) throw new Error("Migration content evidence requires migration records");
  const byUrl = new Map();
  for (const record of records) {
    const oldUrl = safeText(record?.old_url, 4096);
    if (!oldUrl || byUrl.has(oldUrl)) throw new Error("Migration records must have unique old_url values");
    byUrl.set(oldUrl, record);
  }
  return byUrl;
}

function assertMatchesRecords(rows, expectedByUrl, label, { requireExactCoverage = false } = {}) {
  const seen = new Set();
  for (const row of rows) {
    const url = safeText(row?.url, 4096);
    const record = expectedByUrl.get(url);
    if (!record) throw new Error(`${label} contains an unknown legacy URL`);
    if (seen.has(url)) throw new Error(`${label} contains duplicate legacy URLs`);
    if (safeText(row.source_domain, 255) !== record.source_domain || safeText(row.url_type, 80) !== record.url_type) {
      throw new Error(`${label} does not match migration record metadata`);
    }
    seen.add(url);
  }
  if (requireExactCoverage && seen.size !== expectedByUrl.size) throw new Error(`${label} does not cover every migration record`);
}

function assertManifestFile(manifest, name, contents) {
  const file = manifest?.files?.[name];
  if (!file || !isSha256(file.sha256) || !Number.isInteger(file.rows) || file.rows < 0) {
    throw new Error(`Content evidence manifest is missing valid ${name} metadata`);
  }
  if (sha256(contents) !== file.sha256) throw new Error(`Content evidence ${name} hash mismatch`);
  return file;
}

function assertManifest(manifest, sourceInventoryPath, expectedByUrl, contentText, skippedText, contents, skipped) {
  if (!manifest || manifest.schema_version !== 1 || !safeText(manifest.artifact_id, 160)) {
    throw new Error("Content evidence manifest is invalid");
  }
  if (!manifest.source_inventory || !isSha256(manifest.source_inventory.sha256)) {
    throw new Error("Content evidence manifest is missing a source inventory hash");
  }
  if (sha256File(sourceInventoryPath) !== manifest.source_inventory.sha256) {
    throw new Error("Content evidence source inventory hash mismatch");
  }
  const sourceRows = parseCsv(fs.readFileSync(sourceInventoryPath, "utf8"));
  assertMatchesRecords(sourceRows, expectedByUrl, "Content evidence source inventory", { requireExactCoverage: true });

  const contentFile = assertManifestFile(manifest, CONTENT_FILE, contentText);
  const skippedFile = assertManifestFile(manifest, SKIPPED_FILE, skippedText);
  if (contentFile.rows !== contents.length || skippedFile.rows !== skipped.length) {
    throw new Error("Content evidence manifest row counts do not match evidence files");
  }
  const counts = manifest.counts || {};
  if (
    counts.source_urls !== expectedByUrl.size ||
    counts.captured !== contents.length ||
    counts.skipped !== skipped.length ||
    contents.length + skipped.length !== expectedByUrl.size
  ) {
    throw new Error("Content evidence manifest counts do not match migration coverage");
  }
  if (!Array.isArray(manifest.robots)) throw new Error("Content evidence manifest is missing robots evidence");
}

function capturedMetadata(row, artifact) {
  const text = row?.extracted_body_text;
  if (typeof text !== "string" || !text || !isSha256(row.text_sha256) || sha256(text) !== row.text_sha256) {
    throw new Error("Captured content evidence has an invalid text hash");
  }
  if (!isSha256(row.response_sha256)) throw new Error("Captured content evidence has an invalid response hash");
  if (!safeText(row.extractor, 160) || !safeText(row.content_scope, 160)) {
    throw new Error("Captured content evidence is missing extractor metadata");
  }
  if (safeText(row.extractor, 160) !== artifact.extractor) {
    throw new Error("Captured content evidence extractor does not match its manifest");
  }
  return {
    state: "captured",
    artifact_id: artifact.artifact_id,
    captured_at_utc: safeText(row.captured_at_utc, 64),
    extractor: safeText(row.extractor, 160),
    status: safeNumber(row.status),
    final_url: safeText(row.final_url, 4096),
    content_scope: safeText(row.content_scope, 160),
    content_word_count: safeNumber(row.content_word_count),
    text_sha256: row.text_sha256,
    response_sha256: row.response_sha256,
  };
}

function skippedMetadata(row, artifact) {
  const reason = safeText(row?.reason, 160);
  if (!reason) throw new Error("Skipped content evidence requires a reason");
  return {
    state: "skipped",
    artifact_id: artifact.artifact_id,
    captured_at_utc: artifact.captured_at_utc,
    extractor: artifact.extractor,
    skip: {
      status: safeNumber(row.status),
      final_url: safeText(row.final_url, 4096),
      reason,
      detail: safeText(row.detail, 500),
    },
  };
}

function unavailableMetadata(reason) {
  return { state: "unavailable", reason };
}

function createStore({ artifact = null, metadataByUrl = new Map(), privateContentByUrl = new Map(), reason = null, state = "ready" }) {
  const summary = { captured: 0, skipped: 0, unavailable: 0 };
  for (const metadata of metadataByUrl.values()) summary[metadata.state] = (summary[metadata.state] || 0) + 1;
  const store = { artifact, reason, state, summary };
  Object.defineProperty(store, "metadataByUrl", { enumerable: false, value: metadataByUrl });
  PRIVATE_CONTENT_BY_STORE.set(store, privateContentByUrl);
  return store;
}

function unavailableStore(expectedByUrl, reason) {
  return createStore({
    metadataByUrl: new Map([...expectedByUrl.keys()].map((url) => [url, unavailableMetadata(reason)])),
    reason,
    state: "unavailable",
  });
}

export function contentEvidenceDirectoryFromEnv(env = process.env) {
  const value = String(env?.[CONTENT_EVIDENCE_ENV] || "").trim();
  return value || null;
}

export function loadMigrationContentEvidence(records, { evidenceDir = null, sourceInventoryPath = DEFAULT_CONTENT_SOURCE_INVENTORY } = {}) {
  let expectedByUrl;
  try {
    expectedByUrl = recordsByUrl(records);
  } catch {
    return createStore({ reason: "invalid_records", state: "unavailable" });
  }
  if (!evidenceDir) return unavailableStore(expectedByUrl, "not_configured");

  try {
    // Evidence is an operator-mounted runtime directory, not a deploy-time project dependency.
    const directory = path.resolve(/* turbopackIgnore: true */ evidenceDir);
    if (!fs.statSync(/* turbopackIgnore: true */ directory).isDirectory()) throw new Error("Content evidence directory is not a directory");
    const manifest = readJson(path.join(/* turbopackIgnore: true */ directory, MANIFEST_FILE));
    const contentPath = path.join(/* turbopackIgnore: true */ directory, CONTENT_FILE);
    const skippedPath = path.join(/* turbopackIgnore: true */ directory, SKIPPED_FILE);
    const contentText = fs.readFileSync(contentPath, "utf8");
    const skippedText = fs.readFileSync(skippedPath, "utf8");
    const contents = readJsonLines(contentPath);
    const skipped = parseCsv(skippedText);
    assertManifest(manifest, sourceInventoryPath, expectedByUrl, contentText, skippedText, contents, skipped);
    assertMatchesRecords(contents, expectedByUrl, "Captured content evidence");
    assertMatchesRecords(skipped, expectedByUrl, "Skipped content evidence");

    const allRows = [...contents, ...skipped];
    const allUrls = new Set(allRows.map((row) => row.url));
    if (allUrls.size !== allRows.length || allUrls.size !== expectedByUrl.size) {
      throw new Error("Content evidence files do not provide exact URL coverage");
    }

    const artifact = {
      artifact_id: safeText(manifest.artifact_id, 160),
      captured_at_utc: safeText(manifest.captured_at_utc, 64),
      extractor: safeText(manifest.extractor, 160),
      source_inventory_sha256: manifest.source_inventory.sha256,
    };
    const metadataByUrl = new Map();
    const privateContentByUrl = new Map();
    for (const row of contents) {
      const metadata = capturedMetadata(row, artifact);
      metadataByUrl.set(row.url, metadata);
      privateContentByUrl.set(row.url, row.extracted_body_text);
    }
    for (const row of skipped) metadataByUrl.set(row.url, skippedMetadata(row, artifact));
    return createStore({ artifact, metadataByUrl, privateContentByUrl });
  } catch {
    return unavailableStore(expectedByUrl, "invalid_evidence");
  }
}

export function contentEvidenceForOldUrl(evidence, oldUrl) {
  const metadata = evidence?.metadataByUrl?.get(oldUrl);
  if (!metadata) return unavailableMetadata(evidence?.reason || "not_configured");
  return metadata.skip ? { ...metadata, skip: { ...metadata.skip } } : { ...metadata };
}

// This is intentionally the only exported path to raw legacy source text. Do not
// attach its result to a queue, workbook, or public runtime payload.
export function contentForOldUrl(evidence, oldUrl) {
  const text = PRIVATE_CONTENT_BY_STORE.get(evidence)?.get(oldUrl);
  if (typeof text !== "string") return null;
  return { ...contentEvidenceForOldUrl(evidence, oldUrl), extracted_body_text: text };
}
