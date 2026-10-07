import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  caseParticipants,
  documentRequests,
  documentVersions,
  processPolicies,
  tasks,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { createSession } from "../auth/sessions";
import { hasPrivacyRetentionHold } from "../compliance/retention";
import { documentAccess } from "../files/access";
import { privateDownload } from "../files/download";
import { processFileWorker } from "../files/process";
import { ClamAvScanner, type MalwareScanner } from "../files/scan";
import { digestOf, LocalFileStorage } from "../files/storage";
import { finalizeUpload, receiveUpload, uploadAuthorization } from "../files/uploads";
import { createClient } from "../testing";
import { reviewDocument } from "./commands";
import { documentRequestFixture } from "./request-testing";
import {
  cancelDocumentRequest,
  createDocumentRequest,
  documentRequestWorkbench,
  reviewRequestedDocument,
  startRequestedDocumentUpload,
} from "./requests";

let t: TestDatabase, storage: LocalFileStorage, directory: string;
beforeAll(async () => {
  t = await createTestDatabase();
  directory = await mkdtemp(join(tmpdir(), "msr-request-files-"));
  storage = new LocalFileStorage(directory);
});
afterAll(async () => {
  await t?.drop();
  if (directory) await rm(directory, { recursive: true });
});
const pdf = Buffer.from("%PDF-1.4\nSynthetic requested document with no personal data\n%%EOF");
const scanner: MalwareScanner = {
  scan: async (bytes) => ({
    state: "clean",
    sha256: digestOf(bytes),
    scannedAt: new Date(),
    scannerVersion: "injected-test-scanner",
  }),
};
async function reserve(
  f: Awaited<ReturnType<typeof documentRequestFixture>>,
  expectedRevision = 1,
) {
  const command = {
    session: f.client.session,
    requestId: f.request.id,
    expectedRevision,
    operationId: randomUUID(),
    input: {
      fileName: "synthetic.pdf",
      contentType: "application/pdf",
      byteSize: pdf.length,
      payloadIdentity: digestOf(pdf),
    },
  };
  const result = await startRequestedDocumentUpload(t.db, command);
  return { ...result.outcome, command };
}
async function transfer(
  f: Awaited<ReturnType<typeof documentRequestFixture>>,
  reserved: Awaited<ReturnType<typeof reserve>>,
  engine = scanner,
) {
  const auth = await uploadAuthorization(t.db, f.client.session, reserved.uploadId);
  await receiveUpload(t.db, { storage, scanner: engine }, f.client.session, {
    uploadId: reserved.uploadId,
    token: auth.token,
    bytes: pdf,
  });
  await finalizeUpload(t.db, { storage, scanner: engine }, f.client.session, reserved.uploadId);
  await expect(
    privateDownload(t.db, storage, f.client.session, "document", reserved.versionId),
  ).rejects.toMatchObject({ code: "not_found" });
  await processFileWorker(
    t.db,
    { storage, scanner: engine },
    { kind: "system", id: "file-scanner" },
    "document",
    reserved.versionId,
  );
}
it("completes purpose-bound transfer, scan, private replacement and scoped human review", async () => {
  const f = await documentRequestFixture(t.db),
    first = await reserve(f);
  expect((await startRequestedDocumentUpload(t.db, first.command)).replayed).toBe(true);
  await transfer(f, first);
  const [file] = await t.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.id, first.versionId));
  if (!file) throw new Error("Missing initial file fixture");
  await reviewRequestedDocument(t.db, f.staff.session, {
    requestId: f.request.id,
    expectedVersion: 2,
    expectedRevision: file.version,
    versionId: first.versionId,
    operationId: randomUUID(),
    reviewType: "needs_replacement",
    note: "PRIVATE reviewer observation",
    clientOutcome: "Please upload a clearer copy",
    confirmed: true,
    expiresAt: null,
  });
  const view = await documentRequestWorkbench(t.db, f.client.session, { id: f.request.id });
  expect(view.requests[0]).toMatchObject({
    clientOutcome: "Please upload a clearer copy",
    canUpload: true,
  });
  expect(JSON.stringify(view)).not.toContain("PRIVATE");
  const second = await reserve(f, 3);
  await transfer(f, second);
  const [newFile] = await t.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.id, second.versionId));
  if (!newFile) throw new Error("Missing replacement file fixture");
  await reviewRequestedDocument(t.db, f.staff.session, {
    requestId: f.request.id,
    expectedVersion: 4,
    expectedRevision: newFile.version,
    versionId: second.versionId,
    operationId: randomUUID(),
    reviewType: "accepted_for_purpose",
    note: "PRIVATE acceptance observation",
    clientOutcome: "Accepted for the requested property review",
    confirmed: true,
    expiresAt: null,
  });
  expect(
    (await privateDownload(t.db, storage, f.client.session, "document", second.versionId)).bytes,
  ).toEqual(pdf);
  await expect(
    privateDownload(t.db, storage, f.client.session, "document", first.versionId),
  ).rejects.toMatchObject({ code: "not_found" });
  const [request] = await t.db
    .select()
    .from(documentRequests)
    .where(eq(documentRequests.id, f.request.id));
  if (!request) throw new Error("Missing request fixture");
  const [task] = await t.db.select().from(tasks).where(eq(tasks.id, request.taskId));
  expect(task?.state).toBe("done");
  expect(await hasPrivacyRetentionHold(t.db, f.client.partyId)).toBe(true);
});
it("denies another recipient and revoked participation before replay", async () => {
  const f = await documentRequestFixture(t.db),
    first = await reserve(f);
  const other = await createClient(t.db),
    signed = await createSession(t.db, { kind: "client", id: other.id });
  await expect(
    documentRequestWorkbench(t.db, signed.session, { id: f.request.id }),
  ).rejects.toMatchObject({ code: "not_found" });
  await t.db
    .update(caseParticipants)
    .set({ revokedAt: new Date() })
    .where(eq(caseParticipants.id, f.participant.id));
  await expect(startRequestedDocumentUpload(t.db, first.command)).rejects.toMatchObject({
    code: "not_found",
  });
  await expect(uploadAuthorization(t.db, f.client.session, first.uploadId)).rejects.toMatchObject({
    code: "not_found",
  });
});
it.each(["cancelled", "expired"] as const)(
  "retains a safe %s request receipt without file metadata or access",
  async (mode) => {
    const f = await documentRequestFixture(t.db),
      first = await reserve(f);
    await transfer(f, first);
    if (mode === "cancelled")
      await cancelDocumentRequest(t.db, f.staff.session, {
        requestId: f.request.id,
        expectedVersion: 2,
        operationId: randomUUID(),
        clientOutcome: "This request is no longer needed",
      });
    else
      await t.db
        .update(documentRequests)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(documentRequests.id, f.request.id));
    const view = await documentRequestWorkbench(t.db, f.client.session, { id: f.request.id });
    expect(view.requests[0]).toMatchObject({ file: null, canUpload: false });
    expect(JSON.stringify(view)).not.toContain("synthetic.pdf");
    await expect(
      privateDownload(t.db, storage, f.client.session, "document", first.versionId),
    ).rejects.toMatchObject({ code: "not_found" });
  },
);
it("enforces measured request byte limits even when reservation declarations fit", async () => {
  const f = await documentRequestFixture(t.db);
  await t.db
    .update(documentRequests)
    .set({ maxBytes: 20 })
    .where(eq(documentRequests.id, f.request.id));
  const result = await startRequestedDocumentUpload(t.db, {
    session: f.client.session,
    requestId: f.request.id,
    expectedRevision: 1,
    operationId: randomUUID(),
    input: {
      fileName: "synthetic.pdf",
      contentType: "application/pdf",
      byteSize: 10,
      payloadIdentity: "forged",
    },
  });
  const auth = await uploadAuthorization(t.db, f.client.session, result.outcome.uploadId);
  await expect(
    receiveUpload(t.db, { storage, scanner }, f.client.session, {
      uploadId: auth.uploadId,
      token: auth.token,
      bytes: pdf,
    }),
  ).rejects.toMatchObject({ code: "validation_failed" });
});
it("blocks writes after policy revocation and rejects stale versions", async () => {
  const f = await documentRequestFixture(t.db);
  await expect(reserve(f, 42)).rejects.toMatchObject({ code: "version_conflict" });
  await t.db
    .update(processPolicies)
    .set({ revokedAt: new Date(), revocationReason: "Synthetic withdrawal" })
    .where(eq(processPolicies.id, f.policyId));
  await expect(reserve(f)).rejects.toMatchObject({ code: "transition_denied" });
  expect(
    (await documentRequestWorkbench(t.db, f.client.session, { id: f.request.id })).requests[0]
      ?.canUpload,
  ).toBe(false);
});
it("does not request sensitive identity evidence during initial buyer browsing", async () => {
  const f = await documentRequestFixture(t.db);
  await expect(
    createDocumentRequest(t.db, f.staff.session, {
      ...f.input,
      operationId: randomUUID(),
      expectedVersion: 2,
      classification: "identity",
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
});
it.skipIf(!process.env.REAL_CLAMAV_PORT)(
  "scans real immutable requested bytes through ClamAV before allowing private download",
  async () => {
    const f = await documentRequestFixture(t.db),
      first = await reserve(f);
    const real = new ClamAvScanner({
      host: "127.0.0.1",
      port: Number(process.env.REAL_CLAMAV_PORT),
      maxSignatureAgeHours: 48,
    });
    await transfer(f, first, real);
    expect(
      (await documentAccess(t.db, f.client.session, first.versionId)).file.scannerVersion,
    ).toMatch(/^ClamAV /);
    expect(
      (await privateDownload(t.db, storage, f.client.session, "document", first.versionId)).bytes,
    ).toEqual(pdf);
  },
);

it("rejects the generic review path that would omit the request outcome and owned task", async () => {
  const f = await documentRequestFixture(t.db),
    reserved = await reserve(f);
  await transfer(f, reserved);
  const [file] = await t.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.id, reserved.versionId));
  if (!file) throw new Error("Missing synthetic file");
  await expect(
    reviewDocument(t.db, {
      session: f.staff.session,
      versionId: file.id,
      expectedRevision: file.version,
      operationId: randomUUID(),
      input: {
        reviewType: "accepted_for_purpose",
        note: "Direct generic review must not bypass the request",
        confirmed: true,
        expiresAt: null,
      },
    }),
  ).rejects.toMatchObject({ code: "transition_denied" });
  const [request] = await t.db
    .select()
    .from(documentRequests)
    .where(eq(documentRequests.id, f.request.id));
  expect(request?.clientOutcome).toBeNull();
  expect(
    (await t.db.select().from(documentVersions).where(eq(documentVersions.id, file.id)))[0]
      ?.reviewType,
  ).toBeNull();
});
