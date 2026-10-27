// Synthetic fixture preparation only. These records are never human policy or legal proof.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { documents, documentVersions, grants, privacyExports } from "@/db/schema";
import {
  type PrivacyExportCategory,
  type PrivacyExportInventory,
  privacyExportCategories,
} from "@/domain/privacy-export";
import type { Executor } from "../db";
import { documentRequestFixture } from "../documents/request-testing";
import { digestOf, type FileStorage } from "../files/storage";
import {
  attachPrivacyExportSupplement,
  capturePrivacyExportManifest,
  issuePrivacyExport,
  preparePrivacyExport,
  reviewPrivacyExportCategory,
  staffPrivacyExports,
} from "./exports";
import { reviewPrivacyRequest, submitPrivacyRequest } from "./requests";

export async function privacyExportCoverageFixture(
  db: Executor,
  storage: FileStorage,
  exportScope: "listed_categories" | "additional_material" = "listed_categories",
  beforePrepare?: (source: Awaited<ReturnType<typeof documentRequestFixture>>) => Promise<void>,
) {
  const f = await documentRequestFixture(db);
  await db.insert(grants).values({
    principalId: f.staff.id,
    capability: "privacy.manage",
    reason: "Synthetic privacy review fixture only",
  });
  const submitted = await submitPrivacyRequest(db, f.client.session, {
    operationId: randomUUID(),
    kind: "export",
    exportScope,
    description: "Synthetic declared source categories; no outside material requested",
    confirmed: true,
  });
  const requestId = submitted.outcome.id;
  const policyReference = "Synthetic policy reference; not actual legal acceptance";
  for (const [expectedVersion, to] of [
    [1, "verifying"],
    [2, "in_progress"],
  ] as const)
    await reviewPrivacyRequest(db, f.staff.session, {
      operationId: randomUUID(),
      id: requestId,
      expectedVersion,
      to,
      responsibleId: f.staff.id,
      policyReference,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      identityReviewed: true,
      legalHoldReason: "",
      legalHoldDisposition: "Synthetic reviewed boundary only",
      holdResolved: false,
      completionEvidence: "",
      rejectionReason: "",
      confirmed: true,
    });
  const bytes = Buffer.from(
    "%PDF-1.4\nSynthetic reviewed own-person copy and generic withholding notice; no original or other-party data.\n%%EOF",
  );
  const sha256 = digestOf(bytes),
    sealedKey = `sealed/${randomUUID()}.pdf`;
  await storage.writeImmutable(sealedKey, bytes, "application/pdf");
  await db
    .update(documents)
    .set({ classification: "other", currentVersionNumber: 1 })
    .where(eq(documents.id, f.request.documentId));
  const [file] = await db
    .insert(documentVersions)
    .values({
      documentId: f.request.documentId,
      versionNumber: 1,
      state: "reviewed",
      sealedKey,
      sha256,
      scannedSha256: sha256,
      fileName: "synthetic-redacted-copy.pdf",
      contentType: "application/pdf",
      byteSize: bytes.length,
      uploadedByKind: "client",
      uploadedById: f.client.id,
      scan: "clean",
      scannedAt: new Date(),
      scannerVersion: "synthetic-not-a-real-scan",
      reviewType: "accepted_for_purpose",
      reviewedById: f.staff.id,
      reviewedAt: new Date(),
      reviewNote: `privacy-export:${requestId}`,
    })
    .returning();
  if (!file) throw new Error("Missing synthetic reviewed version");
  await beforePrepare?.(f);
  const prepared = await preparePrivacyExport(db, f.staff.session, {
    operationId: randomUUID(),
    requestId,
    expectedVersion: 3,
    recipientId: f.client.id,
    confirmed: true,
  });
  const exportId = prepared.outcome.id;
  for (const category of [
    "private_files",
    "joint_records_and_received_communications",
    "restricted_material_and_security_credentials",
  ] as const) {
    const row = await exportCoverageRow(db, exportId);
    await attachPrivacyExportSupplement(db, storage, f.staff.session, {
      operationId: randomUUID(),
      requestId,
      expectedVersion: 3,
      exportId,
      exportVersion: row.version,
      digest: row.sha256,
      documentVersionId: file.id,
      category,
      reviewedRedaction: true,
    });
  }
  return { ...f, db, storage, requestId, exportId, file, bytes, policyReference };
}
export async function exportCoverageRow(db: Executor, exportId: string) {
  const [row] = await db.select().from(privacyExports).where(eq(privacyExports.id, exportId));
  if (!row) throw new Error("Missing synthetic export");
  return row;
}
type Fixture = Awaited<ReturnType<typeof privacyExportCoverageFixture>>;
function envelopeFromRow(f: Fixture, row: Awaited<ReturnType<typeof exportCoverageRow>>) {
  return {
    operationId: randomUUID(),
    requestId: f.requestId,
    expectedVersion: row.requestVersion,
    exportId: f.exportId,
    exportVersion: row.version,
    digest: row.sha256,
  };
}
export async function coverageEnvelope(f: Fixture) {
  return envelopeFromRow(f, await exportCoverageRow(f.db, f.exportId));
}
export async function captureCoverage(f: Fixture) {
  return capturePrivacyExportManifest(f.db, f.staff.session, await coverageEnvelope(f));
}
export async function categoryDecision(f: Fixture, category: PrivacyExportCategory) {
  const work = await staffPrivacyExports(f.db, f.staff.session, f.requestId, f.storage),
    row = work.exports.find((row) => row.id === f.exportId);
  if (!row?.review || !row.reviewSha256) throw new Error("Missing current synthetic review");
  return {
    ...(await coverageEnvelope(f)),
    reviewDigest: row.reviewSha256,
    ...categoryInput(f, category, row.review.inventory),
  };
}
function categoryInput(
  f: Fixture,
  category: PrivacyExportCategory,
  inventory: PrivacyExportInventory,
) {
  const bucket = inventory.categories.find((row) => row.category === category);
  if (!bucket) throw new Error("Missing synthetic category");
  const disposition = bucket.blocked
    ? "unsupported"
    : !bucket.sources.length
      ? "none"
      : category === "restricted_material_and_security_credentials"
        ? "withheld"
        : "disclosed";
  return {
    category,
    disposition,
    sourceKeys: bucket.sources.map((row) => row.key),
    evidence:
      category !== "personal_activity"
        ? bucket.sources.map((row) => ({ sourceKey: row.key, documentVersionId: f.file.id }))
        : [],
    basis:
      disposition === "withheld"
        ? "security_boundary"
        : disposition === "disclosed"
          ? "reviewed_disclosure"
          : disposition === "none"
            ? "no_sources"
            : "pending_review",
    policyReference: f.policyReference,
    evidenceReference: "Synthetic exact source review evidence; never a live decision",
    confirmed: true,
  };
}
export async function resolveCoverage(f: Fixture) {
  await captureCoverage(f);
  const work = await staffPrivacyExports(f.db, f.staff.session, f.requestId, f.storage),
    captured = work.exports.find((row) => row.id === f.exportId);
  if (!captured?.review) throw new Error("Missing current synthetic review");
  // The captured source keys are proposed human input only. Each real command below
  // rechecks current source/reviewer authority; its version and review digest are freshly read.
  for (const category of privacyExportCategories) {
    const row = await exportCoverageRow(f.db, f.exportId);
    if (!row.reviewSha256) throw new Error("Missing current synthetic review digest");
    await reviewPrivacyExportCategory(f.db, f.staff.session, {
      ...envelopeFromRow(f, row),
      reviewDigest: row.reviewSha256,
      ...categoryInput(f, category, captured.review.inventory),
    });
  }
}
export async function issueCoverage(f: Fixture) {
  return issuePrivacyExport(
    f.db,
    f.staff.session,
    {
      ...(await coverageEnvelope(f)),
      expiresMinutes: 60,
      reviewed: true,
      partialAcknowledged: true,
    },
    f.storage,
  );
}
