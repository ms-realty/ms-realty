import crypto from "node:crypto";
import { REALTY_RULE_SOURCES } from "./realty-cases.mjs";

export const REGULATORY_SOURCE_SNAPSHOT_VERSION = "2026-07-30.v1";
export const DEFAULT_REGULATORY_SOURCE_MAX_AGE_DAYS = 30;

const RECEIPT_FIELDS = new Set(["sourceId", "status", "receiptRef", "contentDigest", "fetchedAt", "failureCode"]);
const SNAPSHOT_FIELDS = new Set(["schema_version", "snapshot_id", "captured_at", "sources", "source_digest", "approval"]);
const SOURCE_FIELDS = new Set([
  "source_id",
  "jurisdiction",
  "authority",
  "url",
  "catalog_checked_on",
  "status",
  "receipt_ref",
  "content_digest",
  "fetched_at",
  "failure_code",
]);
const APPROVAL_FIELDS = new Set(["status", "professional_ref", "evidence_ref", "approved_at"]);
const RECEIPT_STATUSES = new Set(["ok", "failed"]);

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function assertAllowedFields(value, fields, label) {
  const unknown = Object.keys(value).filter((key) => !fields.has(key));
  if (unknown.length) throw new Error(`${label} contains unsupported field(s): ${unknown.sort().join(", ")}`);
}

function assertReference(value, label) {
  if (typeof value !== "string" || !value.trim() || value.trim() !== value) {
    throw new Error(`${label} must be a non-empty reference`);
  }
  return value;
}

function assertOpaqueReference(value, label) {
  const reference = assertReference(value, label);
  if (reference.length > 512 || !/^[A-Za-z0-9][A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]*$/.test(reference)) {
    throw new Error(`${label} must be an opaque reference, not fetched material`);
  }
  return reference;
}

function assertFailureCode(value, label) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_.:-]{0,127}$/i.test(value)) {
    throw new Error(`${label} must be a short code`);
  }
  return value;
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== "string" || !value.includes("T")) throw new Error(`${label} must be an ISO timestamp`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be an ISO timestamp`);
  return date.toISOString();
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`${label} must be a sha256 digest`);
  }
  return value.toLowerCase();
}

function jurisdictionForSource(sourceId) {
  if (sourceId.startsWith("bg_")) return "BG";
  if (sourceId.startsWith("gr_")) return "GR";
  throw new Error(`Regulatory source ${sourceId} has no supported jurisdiction`);
}

function assertSourceId(sourceId) {
  if (typeof sourceId !== "string" || !Object.hasOwn(REALTY_RULE_SOURCES, sourceId)) {
    throw new Error(`Unknown regulatory source: ${sourceId}`);
  }
  return sourceId;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function digest(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function normalizedSourceIds(sourceIds) {
  if (!Array.isArray(sourceIds) || !sourceIds.length) throw new Error("Regulatory snapshot requires at least one source id");
  const ids = sourceIds.map(assertSourceId).sort();
  if (new Set(ids).size !== ids.length) throw new Error("Regulatory snapshot source ids must be unique");
  return ids;
}

function normalizeReceipt(receipt) {
  assertRecord(receipt, "Regulatory source receipt");
  assertAllowedFields(receipt, RECEIPT_FIELDS, "Regulatory source receipt");
  const sourceId = assertSourceId(receipt.sourceId);
  const status = receipt.status || "ok";
  if (!RECEIPT_STATUSES.has(status)) throw new Error(`Regulatory source receipt ${sourceId} has unsupported status`);
  const normalized = {
    source_id: sourceId,
    status,
    receipt_ref: assertOpaqueReference(receipt.receiptRef, `Regulatory source receipt ${sourceId} receiptRef`),
    fetched_at: assertIsoTimestamp(receipt.fetchedAt, `Regulatory source receipt ${sourceId} fetchedAt`),
  };
  if (status === "ok") {
    normalized.content_digest = assertDigest(receipt.contentDigest, `Regulatory source receipt ${sourceId} contentDigest`);
    normalized.failure_code = null;
  } else {
    if (receipt.contentDigest !== undefined && receipt.contentDigest !== null) {
      throw new Error(`Failed regulatory source receipt ${sourceId} cannot include contentDigest`);
    }
    if (receipt.failureCode !== undefined) assertFailureCode(receipt.failureCode, `Failed regulatory source receipt ${sourceId} failureCode`);
    normalized.content_digest = null;
    normalized.failure_code = receipt.failureCode || "fetch_failed";
  }
  return normalized;
}

function sourceRecord(sourceId, receipt) {
  const source = REALTY_RULE_SOURCES[sourceId];
  const base = {
    source_id: sourceId,
    jurisdiction: jurisdictionForSource(sourceId),
    authority: source.authority,
    url: source.url,
    catalog_checked_on: source.checked_on,
  };
  if (!receipt) {
    return {
      ...base,
      status: "failed",
      receipt_ref: null,
      content_digest: null,
      fetched_at: null,
      failure_code: "missing_receipt",
    };
  }
  return { ...base, ...receipt };
}

function sourceDigestPayload(snapshot) {
  return {
    schema_version: snapshot.schema_version,
    captured_at: snapshot.captured_at,
    sources: snapshot.sources,
  };
}

function expectedSnapshotId(sourceDigest) {
  return `regulatory-source-${sourceDigest.slice("sha256:".length, "sha256:".length + 16)}`;
}

function validateSourceRecord(record) {
  assertRecord(record, "Regulatory snapshot source");
  assertAllowedFields(record, SOURCE_FIELDS, "Regulatory snapshot source");
  const sourceId = assertSourceId(record.source_id);
  if (record.jurisdiction !== jurisdictionForSource(sourceId)) {
    throw new Error(`Regulatory snapshot source ${sourceId} has an invalid jurisdiction`);
  }
  for (const field of ["authority", "url", "catalog_checked_on"]) assertReference(record[field], `Regulatory snapshot source ${sourceId} ${field}`);
  if (!RECEIPT_STATUSES.has(record.status)) throw new Error(`Regulatory snapshot source ${sourceId} has unsupported status`);
  if (record.status === "ok") {
    assertOpaqueReference(record.receipt_ref, `Regulatory snapshot source ${sourceId} receipt_ref`);
    assertDigest(record.content_digest, `Regulatory snapshot source ${sourceId} content_digest`);
    assertIsoTimestamp(record.fetched_at, `Regulatory snapshot source ${sourceId} fetched_at`);
    if (record.failure_code !== null) throw new Error(`Regulatory snapshot source ${sourceId} cannot have a failure code`);
  } else {
    if (record.receipt_ref !== null) assertOpaqueReference(record.receipt_ref, `Regulatory snapshot source ${sourceId} receipt_ref`);
    if (record.content_digest !== null) throw new Error(`Failed regulatory snapshot source ${sourceId} cannot contain fetched content`);
    if (record.fetched_at !== null) assertIsoTimestamp(record.fetched_at, `Regulatory snapshot source ${sourceId} fetched_at`);
    assertFailureCode(record.failure_code, `Regulatory snapshot source ${sourceId} failure_code`);
  }
  return record;
}

function validateApproval(approval) {
  assertRecord(approval, "Regulatory snapshot approval");
  assertAllowedFields(approval, APPROVAL_FIELDS, "Regulatory snapshot approval");
  if (approval.status !== "approved") throw new Error("Regulatory snapshot approval must be approved");
  assertOpaqueReference(approval.professional_ref, "Regulatory snapshot approval professional_ref");
  assertOpaqueReference(approval.evidence_ref, "Regulatory snapshot approval evidence_ref");
  assertIsoTimestamp(approval.approved_at, "Regulatory snapshot approval approved_at");
  return approval;
}

function validateSnapshot(snapshot, { requireApproval = false } = {}) {
  assertRecord(snapshot, "Regulatory snapshot");
  assertAllowedFields(snapshot, SNAPSHOT_FIELDS, "Regulatory snapshot");
  if (snapshot.schema_version !== REGULATORY_SOURCE_SNAPSHOT_VERSION) {
    throw new Error("Regulatory snapshot schema version is unsupported");
  }
  assertIsoTimestamp(snapshot.captured_at, "Regulatory snapshot captured_at");
  if (!Array.isArray(snapshot.sources) || !snapshot.sources.length) throw new Error("Regulatory snapshot requires sources");
  snapshot.sources.forEach(validateSourceRecord);
  const sourceIds = snapshot.sources.map((source) => source.source_id);
  if (new Set(sourceIds).size !== sourceIds.length || sourceIds.join("|") !== [...sourceIds].sort().join("|")) {
    throw new Error("Regulatory snapshot sources must be unique and sorted");
  }
  const sourceDigest = digest(sourceDigestPayload(snapshot));
  if (snapshot.source_digest !== sourceDigest || snapshot.snapshot_id !== expectedSnapshotId(sourceDigest)) {
    throw new Error("Regulatory snapshot digest does not match its sources");
  }
  if (snapshot.approval !== null) validateApproval(snapshot.approval);
  if (requireApproval && snapshot.approval === null) {
    throw new Error("Approved regulatory snapshot requires professional approval reference and evidence");
  }
  return snapshot;
}

function sourceFingerprint(source) {
  if (!source) return null;
  return canonicalJson({
    source_id: source.source_id,
    jurisdiction: source.jurisdiction,
    authority: source.authority,
    url: source.url,
    catalog_checked_on: source.catalog_checked_on,
    status: source.status,
    content_digest: source.content_digest,
  });
}

export function buildRegulatorySourceSnapshot({ receipts = [], capturedAt, sourceIds = Object.keys(REALTY_RULE_SOURCES) } = {}) {
  const normalizedCapturedAt = assertIsoTimestamp(capturedAt, "Regulatory snapshot capturedAt");
  const ids = normalizedSourceIds(sourceIds);
  if (!Array.isArray(receipts)) throw new Error("Regulatory snapshot receipts must be an array");
  const receiptsBySource = new Map();
  for (const receipt of receipts) {
    const normalized = normalizeReceipt(receipt);
    if (!ids.includes(normalized.source_id)) throw new Error(`Regulatory source receipt ${normalized.source_id} is not selected`);
    if (receiptsBySource.has(normalized.source_id)) throw new Error(`Regulatory source receipt ${normalized.source_id} is duplicated`);
    receiptsBySource.set(normalized.source_id, normalized);
  }
  const snapshot = {
    schema_version: REGULATORY_SOURCE_SNAPSHOT_VERSION,
    captured_at: normalizedCapturedAt,
    sources: ids.map((sourceId) => sourceRecord(sourceId, receiptsBySource.get(sourceId))),
    approval: null,
  };
  snapshot.source_digest = digest(sourceDigestPayload(snapshot));
  snapshot.snapshot_id = expectedSnapshotId(snapshot.source_digest);
  return snapshot;
}

export function approveRegulatorySourceSnapshot(snapshot, { professionalRef, evidenceRef, approvedAt } = {}) {
  validateSnapshot(snapshot);
  if (snapshot.approval !== null) throw new Error("Regulatory snapshot is already approved");
  const failedSources = snapshot.sources.filter((source) => source.status !== "ok").map((source) => source.source_id);
  if (failedSources.length) {
    throw new Error(`Regulatory snapshot with failed sources cannot be approved: ${failedSources.join(", ")}`);
  }
  return {
    ...snapshot,
    approval: {
      status: "approved",
      professional_ref: assertOpaqueReference(professionalRef, "Professional approval reference"),
      evidence_ref: assertOpaqueReference(evidenceRef, "Professional approval evidence reference"),
      approved_at: assertIsoTimestamp(approvedAt, "Professional approval timestamp"),
    },
  };
}

export function compareRegulatorySourceSnapshots({
  approvedSnapshot,
  currentSnapshot,
  now,
  maxAgeDays = DEFAULT_REGULATORY_SOURCE_MAX_AGE_DAYS,
} = {}) {
  validateSnapshot(approvedSnapshot, { requireApproval: true });
  validateSnapshot(currentSnapshot);
  const comparedAt = assertIsoTimestamp(now, "Regulatory source comparison now");
  if (!Number.isSafeInteger(maxAgeDays) || maxAgeDays < 0) {
    throw new Error("Regulatory source comparison maxAgeDays must be a non-negative integer");
  }
  const staleBefore = new Date(new Date(comparedAt).getTime() - maxAgeDays * 24 * 60 * 60 * 1000).getTime();
  const approvedById = new Map(approvedSnapshot.sources.map((source) => [source.source_id, source]));
  const currentById = new Map(currentSnapshot.sources.map((source) => [source.source_id, source]));
  const sources = [...new Set([...approvedById.keys(), ...currentById.keys()])]
    .sort()
    .map((sourceId) => {
      const approved = approvedById.get(sourceId) || null;
      const current = currentById.get(sourceId) || null;
      const failed = !current || current.status !== "ok";
      const stale = Boolean(current?.status === "ok" && new Date(current.fetched_at).getTime() < staleBefore);
      const changed = !approved || !current || sourceFingerprint(approved) !== sourceFingerprint(current);
      const reasons = [];
      if (!approved) reasons.push("new_source");
      if (!current) reasons.push("missing_current_source");
      else if (current.status !== "ok") reasons.push(current.failure_code || "fetch_failed");
      if (changed && approved && current && current.status === "ok") reasons.push("source_content_changed");
      if (stale) reasons.push("stale_receipt");
      return {
        source_id: sourceId,
        jurisdiction: current?.jurisdiction || approved?.jurisdiction || jurisdictionForSource(sourceId),
        changed,
        failed,
        stale,
        reasons,
      };
    });
  const changedSourceIds = sources.filter((source) => source.changed).map((source) => source.source_id);
  const failedSourceIds = sources.filter((source) => source.failed).map((source) => source.source_id);
  const staleSourceIds = sources.filter((source) => source.stale).map((source) => source.source_id);
  const affectedJurisdictions = [...new Set(sources.filter((source) => source.changed || source.failed || source.stale).map((source) => source.jurisdiction))].sort();
  return {
    compared_at: comparedAt,
    max_age_days: maxAgeDays,
    approved_snapshot_id: approvedSnapshot.snapshot_id,
    approved_source_digest: approvedSnapshot.source_digest,
    current_snapshot_id: currentSnapshot.snapshot_id,
    current_source_digest: currentSnapshot.source_digest,
    sources,
    changed_source_ids: changedSourceIds,
    failed_source_ids: failedSourceIds,
    stale_source_ids: staleSourceIds,
    affected_jurisdictions: affectedJurisdictions,
    requires_professional_review: affectedJurisdictions.length > 0,
  };
}
