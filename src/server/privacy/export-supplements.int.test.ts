// AT43/AT45: a scanned, purpose-reviewed redacted client file retains its original grants.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { documents, documentVersions, grants, privacyExports } from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { documentRequestFixture } from "../documents/request-testing";
import { digestOf, LocalFileStorage } from "../files/storage";
import {
  attachPrivacyExportSupplement,
  issuePrivacyExport,
  preparePrivacyExport,
  privacyExportDownload,
} from "./exports";
import { reviewPrivacyRequest, submitPrivacyRequest } from "./requests";

let t: TestDatabase, root: string, storage: LocalFileStorage;
beforeAll(async () => {
  t = await createTestDatabase();
  root = await mkdtemp(join(tmpdir(), "msr-privacy-supplement-"));
  storage = new LocalFileStorage(root);
});
afterAll(async () => {
  await t?.drop();
  if (root) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const f = await documentRequestFixture(t.db);
  await t.db.insert(grants).values({
    principalId: f.staff.id,
    capability: "privacy.manage",
    reason: "Explicit synthetic privacy reviewer",
  });
  const submitted = await submitPrivacyRequest(t.db, f.client.session, {
    operationId: randomUUID(),
    kind: "export",
    description: "Synthetic own record and reviewed redacted document request",
    confirmed: true,
  });
  const requestId = submitted.outcome.id;
  for (const [expectedVersion, to] of [
    [1, "verifying"],
    [2, "in_progress"],
  ] as const) {
    await reviewPrivacyRequest(t.db, f.staff.session, {
      operationId: randomUUID(),
      id: requestId,
      expectedVersion,
      to,
      responsibleId: f.staff.id,
      policyReference: "Synthetic policy reference only",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      identityReviewed: true,
      legalHoldReason: "",
      legalHoldDisposition: "Synthetic boundary reviewed",
      holdResolved: false,
      completionEvidence: "",
      rejectionReason: "",
      confirmed: true,
    });
  }
  const bytes = Buffer.from("%PDF-1.4\nSynthetic redacted own-person supplement only\n%%EOF"),
    sha256 = digestOf(bytes),
    sealedKey = `sealed/${randomUUID()}.pdf`;
  await storage.writeImmutable(sealedKey, bytes);
  await t.db
    .update(documents)
    .set({ classification: "other", currentVersionNumber: 1 })
    .where(eq(documents.id, f.request.documentId));
  const [file] = await t.db
    .insert(documentVersions)
    .values({
      documentId: f.request.documentId,
      versionNumber: 1,
      state: "reviewed",
      sealedKey,
      sha256,
      scannedSha256: sha256,
      fileName: "synthetic-copy.pdf",
      contentType: "application/pdf",
      byteSize: bytes.length,
      uploadedByKind: "client",
      uploadedById: f.client.id,
      scan: "clean",
      scannedAt: new Date(),
      scannerVersion: "fixture-not-a-real-scan",
      reviewType: "accepted_for_purpose",
      reviewedById: f.staff.id,
      reviewedAt: new Date(),
      reviewNote: `privacy-export:${requestId}`,
    })
    .returning();
  if (!file) throw new Error("Missing synthetic reviewed file");
  const prepared = await preparePrivacyExport(t.db, f.staff.session, {
    operationId: randomUUID(),
    requestId,
    expectedVersion: 3,
    recipientId: f.client.id,
    confirmed: true,
  });
  const attach = {
    operationId: randomUUID(),
    requestId,
    expectedVersion: 3,
    exportId: prepared.outcome.id,
    exportVersion: 1,
    digest: prepared.outcome.sha256,
    documentVersionId: file.id,
    category: "private_files",
    reviewedRedaction: true,
  };
  return { ...f, requestId, bytes, file, prepared, attach };
}

describe("controlled manual privacy supplement", () => {
  it("delivers exact reviewed bytes and source manifest, retains partial omissions and immediately follows source-grant revocation", async () => {
    const f = await fixture();
    const attached = await attachPrivacyExportSupplement(t.db, storage, f.staff.session, f.attach);
    expect(
      (await attachPrivacyExportSupplement(t.db, storage, f.staff.session, f.attach)).replayed,
    ).toBe(true);
    await issuePrivacyExport(
      t.db,
      f.staff.session,
      {
        operationId: randomUUID(),
        requestId: f.requestId,
        expectedVersion: 3,
        exportId: f.prepared.outcome.id,
        exportVersion: 2,
        digest: attached.outcome.sha256,
        expiresMinutes: 60,
        reviewed: true,
        partialAcknowledged: true,
      },
      storage,
    );
    const exported = await privacyExportDownload(t.db, f.client.session, f.prepared.outcome.id),
      dossier = JSON.parse(exported.bytes.toString());
    expect(Buffer.from(dossier.supplements[0].bytesBase64, "base64")).toEqual(f.bytes);
    expect(dossier.supplements[0].source).toMatchObject({
      versionId: f.file.id,
      sha256: f.file.sha256,
      fileVersion: f.file.version,
    });
    expect(dossier.fulfilment).toBe("partial");
    expect(
      dossier.omissions.some((x: { category: string }) => x.category === "private_files"),
    ).toBe(true);
    const [row] = await t.db
      .select()
      .from(privacyExports)
      .where(eq(privacyExports.id, f.prepared.outcome.id));
    expect(row?.encryptedPayload).not.toContain("Synthetic redacted");
    await t.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(
        eq(
          grants.id,
          (
            await t.db.query.documentRequests.findFirst({
              where: (r, { eq }) => eq(r.id, f.request.id),
            })
          )?.grantId ?? randomUUID(),
        ),
      );
    await expect(
      privacyExportDownload(t.db, f.client.session, f.prepared.outcome.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects unreviewed, stale, wrong-request or ungranted source files without exposing them", async () => {
    const f = await fixture();
    await t.db
      .update(documentVersions)
      .set({ reviewNote: "Generic review does not authorize privacy disclosure" })
      .where(eq(documentVersions.id, f.file.id));
    await expect(
      attachPrivacyExportSupplement(t.db, storage, f.staff.session, f.attach),
    ).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(documentVersions)
      .set({ reviewNote: `privacy-export:${f.requestId}` })
      .where(eq(documentVersions.id, f.file.id));
    const attached = await attachPrivacyExportSupplement(t.db, storage, f.staff.session, {
      ...f.attach,
      operationId: randomUUID(),
    });
    await t.db
      .update(documentVersions)
      .set({ version: f.file.version + 1 })
      .where(eq(documentVersions.id, f.file.id));
    await expect(
      issuePrivacyExport(
        t.db,
        f.staff.session,
        {
          operationId: randomUUID(),
          requestId: f.requestId,
          expectedVersion: 3,
          exportId: f.prepared.outcome.id,
          exportVersion: 2,
          digest: attached.outcome.sha256,
          expiresMinutes: 60,
          reviewed: true,
          partialAcknowledged: true,
        },
        storage,
      ),
    ).rejects.toMatchObject({ code: "version_conflict" });
    const other = await fixture();
    await expect(
      attachPrivacyExportSupplement(t.db, storage, f.staff.session, {
        ...f.attach,
        operationId: randomUUID(),
        exportVersion: 2,
        digest: attached.outcome.sha256,
        documentVersionId: other.file.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
