// Synthetic reviewed fixture only. Never constitutes a malware or human release report.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { documentRequests, documents, documentVersions } from "@/db/schema";
import type { Executor } from "../db";
import { documentRequestFixture } from "../documents/request-testing";
import { digestOf, type FileStorage } from "../files/storage";

export async function emailFileFixture(db: Executor, storage: FileStorage) {
  const f = await documentRequestFixture(db);
  const [request] = await db
    .select()
    .from(documentRequests)
    .where(eq(documentRequests.id, f.request.id));
  if (!request) throw new Error("Missing request");
  const bytes = Buffer.from("%PDF-1.4\nSynthetic client document; no personal information\n%%EOF");
  const sealedKey = `sealed/${randomUUID()}`;
  await storage.writeImmutable(sealedKey, bytes, "application/pdf");
  const [file] = await db
    .insert(documentVersions)
    .values({
      documentId: request.documentId,
      versionNumber: 1,
      state: "reviewed",
      sealedKey,
      sha256: digestOf(bytes),
      scannedSha256: digestOf(bytes),
      fileName: "synthetic-reviewed.pdf",
      contentType: "application/pdf",
      byteSize: bytes.length,
      uploadedByKind: "client",
      uploadedById: f.client.id,
      scan: "clean",
      scannedAt: new Date(),
      scannerVersion: "synthetic-only",
      reviewedById: f.staff.id,
      reviewedAt: new Date(),
      reviewType: "accepted_for_purpose",
    })
    .returning();
  if (!file) throw new Error("Missing file");
  await db
    .update(documents)
    .set({ currentVersionNumber: 1 })
    .where(eq(documents.id, request.documentId));
  await db
    .update(documentRequests)
    .set({ reviewedVersionId: file.id })
    .where(eq(documentRequests.id, request.id));
  return { ...f, file, documentRequest: request, bytes };
}
