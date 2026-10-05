// biome-ignore-all lint/style/noNonNullAssertion: Missing isolated test fixture rows fail the test on dereference.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  auditEvents,
  currentPublications,
  documents,
  documentVersions,
  fileUploads,
  grants,
  listings,
  mediaAssets,
  sessions,
} from "@/db/schema";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { finishPasskeyRegistration, startPasskeyRegistration } from "../auth/passkeys";
import { createSession, type Session } from "../auth/sessions";
import { SoftAuthenticator } from "../auth/testing-authenticator";
import { listCaseDocuments, startCaseDocumentUpload } from "../documents/case";
import { getClientDocument, listClientDocuments } from "../documents/client";
import { reviewDocument, startDocumentUpload } from "../documents/commands";
import { reviewMedia, startMediaUpload } from "../media/commands";
import { mediaAssetEligible } from "../media/eligibility";
import { verifyPublicationMedia } from "../media/verify";
import {
  createListingFixture,
  publicationFixtureStorage,
  publishForTest,
} from "../publication/testing";
import { createCase, createClient, createProperty, createStaff, relate } from "../testing";
import type { FileServices } from "./config";
import { privateDownload, publicMediaDownload } from "./download";
import { processFile, processFileWorker } from "./process";
import { fileReceipt } from "./receipts";
import { ClamAvScanner, type MalwareScanner } from "./scan";
import { digestOf, LocalFileStorage } from "./storage";
import { finalizeUpload, receiveUpload, uploadAuthorization, verifyUploadRequest } from "./uploads";

let t: TestDatabase;
let root: string;
let store: LocalFileStorage;
let image: Buffer;
let session: Session;
let staffId: string;
// Injected adapters are confined to tests. Production always constructs ClamAvScanner.
const cleanScanner: MalwareScanner = {
  scan: async (bytes) => ({
    state: "clean",
    sha256: digestOf(bytes),
    scannedAt: new Date(),
    scannerVersion: "injected-test-scanner",
  }),
};
const services = (scanner: MalwareScanner = cleanScanner): FileServices => ({
  storage: store,
  scanner,
});
beforeAll(async () => {
  t = await createTestDatabase();
  root = await mkdtemp(join(tmpdir(), "msr-file-flow-"));
  store = new LocalFileStorage(root);
  image = await sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const staff = await createStaff(t.db, {
    roles: ["content_editor", "publishing_approver"],
    grants: [{ capability: "document.review" }, { capability: "document.read_restricted" }],
  });
  staffId = staff.id;
  session = (await createSession(t.db, { kind: "staff", id: staff.id })).session;
  for (let index = 0; index < 2; index++) {
    const options = await startPasskeyRegistration(t.db, session);
    await finishPasskeyRegistration(
      t.db,
      session,
      new SoftAuthenticator().register(options.challenge),
      { expectedChallenge: options.challenge },
    );
  }
});
afterAll(async () => {
  await t?.drop();
  if (root) await rm(root, { recursive: true, force: true });
});
async function listing() {
  const propertyId = await createProperty(t.db);
  const [row] = await t.db
    .insert(listings)
    .values({ reference: `MS-${randomUUID().toUpperCase()}`, propertyId, purpose: "sale" })
    .returning();
  if (!row) throw new Error("No listing");
  return row;
}
async function media() {
  const record = await listing();
  const started = await startMediaUpload(t.db, {
    session,
    operationId: randomUUID(),
    expectedRevision: record.version,
    reference: record.reference,
    input: { kind: "photo", contentType: "image/png", payloadIdentity: digestOf(image) },
  });
  const authority = await uploadAuthorization(t.db, session, started.outcome.uploadId);
  await receiveUpload(t.db, services(), session, { ...authority, bytes: image });
  return { ...started.outcome, listing: record };
}
async function document() {
  const record = await listing();
  const command = {
    session,
    operationId: randomUUID(),
    expectedRevision: 0,
    reference: record.reference,
    input: {
      fileName: "synthetic.png",
      contentType: "image/png",
      payloadIdentity: digestOf(image),
      purpose: "seller_instruction",
      classification: "contract",
    },
  };
  const started = await startDocumentUpload(t.db, command);
  const authority = await uploadAuthorization(t.db, session, started.outcome.uploadId);
  await receiveUpload(t.db, services(), session, { ...authority, bytes: image });
  await finalizeUpload(t.db, services(), session, authority.uploadId);
  return { ...started.outcome, listing: record, command };
}
const mediaReview = {
  decision: "approve",
  rightsHolder: "Synthetic owner",
  rightsReference: "test permission",
  caption: "Test image",
  altText: "Synthetic solid red rectangle",
  modification: "none",
  modificationDisclosure: "",
  privacyReviewed: true,
  rightsConfirmed: true,
};

describe("AT28/AT42 real storage workflow", () => {
  it("W10 unverified staging acknowledges receipt without a scan, review, download or publication grant", async () => {
    const unverified: FileServices = { storage: store, scanner: null };
    const uploaded = await media();
    await finalizeUpload(t.db, unverified, session, uploaded.uploadId);
    const read = vi.spyOn(store, "read");
    try {
      await expect(
        processFileWorker(
          t.db,
          unverified,
          { kind: "system", id: "file-scanner" },
          "media",
          uploaded.assetId,
        ),
      ).resolves.toEqual({ state: "unverified", id: uploaded.assetId });
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
    const [asset] = await t.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, uploaded.assetId));
    expect(asset).toMatchObject({
      scan: "pending",
      scannedAt: null,
      scannerVersion: null,
      scannedSha256: null,
      processing: "pending",
      derivativeKey: null,
      review: "pending",
      reviewedById: null,
    });
    expect(mediaAssetEligible(asset!)).toBe(false);
    await expect(
      reviewMedia(t.db, {
        session,
        operationId: randomUUID(),
        expectedRevision: asset!.version,
        id: asset!.id,
        input: mediaReview,
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await expect(privateDownload(t.db, store, session, "media", asset!.id)).rejects.toMatchObject({
      code: "not_found",
    });
    const audit = await t.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.recordId, uploaded.assetId));
    expect(audit.some((row) => row.action === "file.scan.completed")).toBe(false);
    expect(audit.find((row) => row.action === "file.scan.deferred")?.payload).toEqual({
      reason: "staging_scanner_disabled",
      sha256: digestOf(image),
    });

    const received = await document();
    await expect(
      processFile(t.db, unverified, session, "document", received.versionId),
    ).resolves.toEqual({ state: "unverified", id: received.versionId });
    const [file] = await t.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, received.versionId));
    expect(file).toMatchObject({
      scan: "pending",
      scannerVersion: null,
      scannedAt: null,
      scannedSha256: null,
      reviewedById: null,
      reviewType: null,
    });
    await expect(
      reviewDocument(t.db, {
        session,
        operationId: randomUUID(),
        expectedRevision: file!.version,
        versionId: file!.id,
        input: {
          reviewType: "accepted_for_purpose",
          confirmed: true,
          note: "Synthetic review",
          expiresAt: null,
        },
      }),
    ).rejects.toMatchObject({ code: "transition_denied" });
    await expect(privateDownload(t.db, store, session, "document", file!.id)).rejects.toMatchObject(
      {
        code: "not_found",
      },
    );
    await expect(
      processFileWorker(
        t.db,
        unverified,
        { kind: "system", id: "message-outbox" },
        "document",
        file!.id,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("case agreement intake requires scoped compliance authority throughout scan, review, private download and replay", async () => {
    const person = await createStaff(t.db, {
      grants: [{ capability: "document.read_restricted" }, { capability: "document.review" }],
    });
    const authenticated = (await createSession(t.db, { kind: "staff", id: person.id })).session;
    for (let index = 0; index < 2; index++) {
      const options = await startPasskeyRegistration(t.db, authenticated);
      await finishPasskeyRegistration(
        t.db,
        authenticated,
        new SoftAuthenticator().register(options.challenge),
        { expectedChallenge: options.challenge },
      );
    }
    const caseId = await createCase(t.db, person.id);
    await t.db.insert(grants).values({
      principalId: person.id,
      capability: "case.read",
      recordType: "case",
      recordId: caseId,
      reason: "Synthetic scoped case permission",
    });
    const command = {
      session: authenticated,
      operationId: randomUUID(),
      expectedRevision: 0,
      caseId,
      input: {
        fileName: "synthetic-agreement.png",
        contentType: "image/png",
        payloadIdentity: digestOf(image),
        purpose: "service_agreement",
        classification: "contract",
      },
    };
    await expect(startCaseDocumentUpload(t.db, command)).rejects.toMatchObject({
      code: "forbidden",
    });
    const [capability] = await t.db
      .insert(grants)
      .values({
        principalId: person.id,
        capability: "compliance.review",
        recordType: "case",
        recordId: caseId,
        reason: "Synthetic explicit compliance authority",
      })
      .returning();
    const created = await startCaseDocumentUpload(t.db, command);
    expect((await startCaseDocumentUpload(t.db, command)).outcome).toEqual(created.outcome);
    await expect(
      startCaseDocumentUpload(t.db, {
        ...command,
        operationId: randomUUID(),
        caseId: await createCase(t.db, person.id),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    const authority = await uploadAuthorization(t.db, authenticated, created.outcome.uploadId);
    expect(await fileReceipt(t.db, authenticated, "1")).toBeNull();
    expect(await fileReceipt(t.db, authenticated, randomUUID())).toBeNull();
    expect(await fileReceipt(t.db, authenticated, authority.uploadId)).toBeNull();
    await receiveUpload(t.db, services(), authenticated, { ...authority, bytes: image });
    await finalizeUpload(t.db, services(), authenticated, authority.uploadId);
    expect(await fileReceipt(t.db, authenticated, authority.uploadId)).toBe(authority.uploadId);
    expect(
      await fileReceipt(t.db, authenticated, authority.uploadId, [
        { kind: "document", id: created.outcome.versionId },
      ]),
    ).toBe(authority.uploadId);
    expect(
      await fileReceipt(t.db, authenticated, authority.uploadId, [
        { kind: "document", id: randomUUID() },
      ]),
    ).toBeNull();
    expect(
      await fileReceipt(t.db, authenticated, authority.uploadId, [
        { kind: "media", id: created.outcome.versionId },
      ]),
    ).toBeNull();
    expect(await fileReceipt(t.db, session, authority.uploadId)).toBeNull();
    await processFileWorker(
      t.db,
      services(),
      { kind: "system", id: "file-scanner" },
      "document",
      created.outcome.versionId,
    );
    const [file] = await t.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, created.outcome.versionId));
    await reviewDocument(t.db, {
      session: authenticated,
      operationId: randomUUID(),
      expectedRevision: file!.version,
      versionId: file!.id,
      input: {
        reviewType: "accepted_for_purpose",
        confirmed: true,
        note: "Synthetic agreement purpose review",
        expiresAt: null,
      },
    });
    const workbench = await listCaseDocuments(t.db, authenticated, caseId);
    expect(workbench.documents).toHaveLength(1);
    expect(workbench.documents[0]?.document).toMatchObject({
      caseId,
      purpose: "service_agreement",
      audience: "internal",
    });
    expect((await privateDownload(t.db, store, authenticated, "document", file!.id)).bytes).toEqual(
      image,
    );
    const client = await createClient(t.db);
    await t.db.insert(grants).values({
      principalId: client.id,
      capability: "portal.document.upload",
      recordType: "document",
      recordId: created.outcome.documentId,
      reason: "Synthetic direct grant cannot expose compliance evidence",
    });
    const clientSession = (await createSession(t.db, { kind: "client", id: client.id })).session;
    // A malformed audience update cannot turn a protected compliance purpose into portal data.
    await t.db
      .update(documents)
      .set({ audience: "case_participants" })
      .where(eq(documents.id, created.outcome.documentId));
    await expect(
      getClientDocument(t.db, clientSession, created.outcome.documentId),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      privateDownload(t.db, store, clientSession, "document", file!.id),
    ).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(documents)
      .set({ audience: "internal" })
      .where(eq(documents.id, created.outcome.documentId));
    await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, capability!.id));
    await expect(startCaseDocumentUpload(t.db, command)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      privateDownload(t.db, store, authenticated, "document", file!.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it.skipIf(!process.env.REAL_CLAMAV_PORT)(
    "actual ClamAV detects EICAR and scans sealed media and purpose-reviewed private documents",
    async () => {
      const scanner = new ClamAvScanner({
        host: "127.0.0.1",
        port: Number(process.env.REAL_CLAMAV_PORT),
        maxSignatureAgeHours: 48,
      });
      const actual = services(scanner);
      // Harmless standard antivirus test string, never stored or served by the application.
      const eicar = Buffer.from(
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
      );
      expect(await scanner.scan(eicar)).toMatchObject({
        state: "infected",
        sha256: digestOf(eicar),
        scannerVersion: expect.stringMatching(/^ClamAV /),
      });
      const started = await media();
      await finalizeUpload(t.db, actual, session, started.uploadId);
      await expect(
        processFileWorker(
          t.db,
          actual,
          { kind: "system", id: "file-scanner" },
          "media",
          started.assetId,
        ),
      ).resolves.toMatchObject({ state: "clean" });
      const [asset] = await t.db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, started.assetId));
      expect(asset).toMatchObject({
        scan: "clean",
        processing: "ready",
        review: "pending",
        scannedSha256: digestOf(image),
        scannerVersion: expect.stringMatching(/^ClamAV /),
      });
      expect(digestOf(await store.read(asset!.sealedKey!))).toBe(asset!.sha256);
      const safe = await store.read(asset!.derivativeKey!);
      expect(digestOf(safe)).toBe(asset!.derivativeSha256);
      expect(await sharp(safe).metadata()).toMatchObject({ format: "webp", width: 8, height: 6 });
      expect((await sharp(safe).metadata()).exif).toBeUndefined();
      expect(mediaAssetEligible(asset!)).toBe(false);
      await reviewMedia(t.db, {
        session,
        operationId: randomUUID(),
        expectedRevision: asset!.version,
        id: asset!.id,
        input: mediaReview,
      });
      const [reviewedMedia] = await t.db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, asset!.id));
      await verifyPublicationMedia([reviewedMedia!], store);
      expect(mediaAssetEligible(reviewedMedia!)).toBe(true);
      expect((await privateDownload(t.db, store, session, "media", asset!.id)).bytes).toEqual(
        image,
      );
      await expect(
        publicMediaDownload(t.db, store, asset!.id, asset!.derivativeSha256!),
      ).rejects.toMatchObject({ code: "not_found" });
      const doc = await document();
      await expect(
        processFileWorker(
          t.db,
          actual,
          { kind: "system", id: "file-scanner" },
          "document",
          doc.versionId,
        ),
      ).resolves.toMatchObject({ state: "clean" });
      const [version] = await t.db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, doc.versionId));
      expect(version).toMatchObject({
        state: "ready_for_review",
        scan: "clean",
        scannedSha256: digestOf(image),
        scannerVersion: expect.stringMatching(/^ClamAV /),
      });
      await reviewDocument(t.db, {
        session,
        operationId: randomUUID(),
        expectedRevision: version!.version,
        versionId: version!.id,
        input: {
          reviewType: "accepted_for_purpose",
          note: "Human test review of synthetic seller instruction",
          confirmed: true,
          expiresAt: null,
        },
      });
      const [reviewedDoc] = await t.db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, version!.id));
      expect(reviewedDoc).toMatchObject({
        state: "reviewed",
        reviewType: "accepted_for_purpose",
        professionalValidation: "not_requested",
      });
      expect((await privateDownload(t.db, store, session, "document", version!.id)).bytes).toEqual(
        image,
      );
    },
    60_000,
  );
  it("checks upload ownership, token and expiry before transport body consumption", async () => {
    const started = await media();
    const authority = await uploadAuthorization(t.db, session, started.uploadId);
    await expect(
      verifyUploadRequest(t.db, session, started.uploadId, authority.token),
    ).resolves.toMatchObject({ maxBytes: 25 * 1024 * 1024 });
    await expect(
      verifyUploadRequest(t.db, session, started.uploadId, "wrong-token"),
    ).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(fileUploads)
      .set({ createdAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() - 1000) })
      .where(eq(fileUploads.id, started.uploadId));
    await expect(
      verifyUploadRequest(t.db, session, started.uploadId, authority.token),
    ).rejects.toMatchObject({ code: "transition_denied" });
  });
  it("seals independently, replay does not alter bytes, and upload reuse cannot change a scanned asset", async () => {
    const started = await media();
    const first = await finalizeUpload(t.db, services(), session, started.uploadId);
    const replay = await finalizeUpload(t.db, services(), session, started.uploadId);
    expect(replay).toEqual(first);
    const [asset] = await t.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, started.assetId));
    expect(asset?.sha256).toBe(digestOf(image));
    await store.writeStaging(asset!.originalKey, Buffer.from("changed staging after sealing"));
    await processFile(t.db, services(), session, "media", started.assetId);
    expect(digestOf(await store.read(asset!.sealedKey!))).toBe(digestOf(image));
    await expect(uploadAuthorization(t.db, session, started.uploadId)).rejects.toMatchObject({
      code: "transition_denied",
    });
    const [processed] = await t.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, started.assetId));
    expect(processed?.scan).toBe("clean");
    expect(processed?.review).toBe("pending");
    expect(mediaAssetEligible(processed!)).toBe(false);
    expect(
      (await sharp(await store.read(processed!.derivativeKey!)).metadata()).exif,
    ).toBeUndefined();
    await reviewMedia(t.db, {
      session,
      operationId: randomUUID(),
      expectedRevision: processed!.version,
      id: started.assetId,
      input: mediaReview,
    });
    const [reviewed] = await t.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, started.assetId));
    expect(mediaAssetEligible(reviewed!)).toBe(true);
    await expect(verifyPublicationMedia([reviewed!], store)).resolves.toBeUndefined();
    await expect(
      verifyPublicationMedia([reviewed!], {
        ...services().storage,
        read: async () => Buffer.from("changed bytes"),
        writeStaging: store.writeStaging.bind(store),
        writeImmutable: store.writeImmutable.bind(store),
      }),
    ).rejects.toMatchObject({ code: "publication_ineligible" });
    await expect(
      verifyPublicationMedia([reviewed!], {
        read: async () => {
          throw new Error("missing object");
        },
        writeStaging: store.writeStaging.bind(store),
        writeImmutable: store.writeImmutable.bind(store),
      }),
    ).rejects.toMatchObject({ code: "publication_ineligible" });
    await expect(
      publicMediaDownload(t.db, store, reviewed!.id, reviewed!.derivativeSha256!),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("unavailable scanner, malware and mismatched scan digest never become reviewable", async () => {
    for (const failure of ["unavailable", "infected", "wrong_digest"] as const) {
      const started = await media();
      await finalizeUpload(t.db, services(), session, started.uploadId);
      const scanner: MalwareScanner = {
        scan: async (bytes) => {
          if (failure === "unavailable") throw new Error("offline");
          return {
            state: failure === "infected" ? "infected" : "clean",
            sha256: failure === "wrong_digest" ? "wrong" : digestOf(bytes),
            scannedAt: new Date(),
            scannerVersion: "injected-test-scanner",
          };
        },
      };
      const result = await processFile(t.db, services(scanner), session, "media", started.assetId);
      expect(result.state).toBe(failure === "infected" ? "infected" : "failed");
      const [asset] = await t.db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, started.assetId));
      await expect(
        reviewMedia(t.db, {
          session,
          operationId: randomUUID(),
          expectedRevision: asset!.version,
          id: asset!.id,
          input: mediaReview,
        }),
      ).rejects.toMatchObject({ code: "transition_denied" });
      await expect(privateDownload(t.db, store, session, "media", asset!.id)).rejects.toMatchObject(
        { code: "not_found" },
      );
    }
  });
  it("worker validates its service actor and persists quarantine before reporting retryable failure", async () => {
    const started = await media();
    await finalizeUpload(t.db, services(), session, started.uploadId);
    await expect(
      processFileWorker(
        t.db,
        services(),
        { kind: "system", id: "message-outbox" },
        "media",
        started.assetId,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    const scanner: MalwareScanner = {
      scan: async () => {
        throw new Error("offline");
      },
    };
    await expect(
      processFileWorker(
        t.db,
        services(scanner),
        { kind: "system", id: "file-scanner" },
        "media",
        started.assetId,
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
    const [failed] = await t.db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, started.assetId));
    expect(failed?.scan).toBe("failed");
    await expect(
      processFileWorker(
        t.db,
        services(),
        { kind: "system", id: "file-scanner" },
        "media",
        started.assetId,
      ),
    ).resolves.toMatchObject({ state: "clean" });
  });
  it("expired capability and revoked session cannot replay upload finalization", async () => {
    const started = await media();
    await finalizeUpload(t.db, services(), session, started.uploadId);
    await t.db
      .update(fileUploads)
      .set({ createdAt: new Date(Date.now() - 120_000), expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(fileUploads.id, started.uploadId));
    await expect(finalizeUpload(t.db, services(), session, started.uploadId)).rejects.toMatchObject(
      { code: "transition_denied" },
    );
    const separate = await createSession(t.db, { kind: "staff", id: staffId });
    const target = await media();
    await finalizeUpload(t.db, services(), session, target.uploadId);
    await t.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, separate.session.id));
    await expect(
      finalizeUpload(t.db, services(), separate.session, target.uploadId),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("documents record exact purpose review without implying professional validation; replacement invalidates previous version", async () => {
    const started = await document();
    await processFile(t.db, services(), session, "document", started.versionId);
    const [file] = await t.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, started.versionId));
    await reviewDocument(t.db, {
      session,
      operationId: randomUUID(),
      expectedRevision: file!.version,
      versionId: file!.id,
      input: {
        reviewType: "accepted_for_purpose",
        note: "Reviewed synthetic instruction for test purpose",
        confirmed: true,
        expiresAt: null,
      },
    });
    const [reviewed] = await t.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, file!.id));
    expect(reviewed).toMatchObject({
      state: "reviewed",
      reviewType: "accepted_for_purpose",
      professionalValidation: "not_requested",
      scannedSha256: digestOf(image),
    });
    expect((await privateDownload(t.db, store, session, "document", file!.id)).bytes).toEqual(
      image,
    );
    const [record] = await t.db
      .select()
      .from(documents)
      .where(eq(documents.id, started.documentId));
    const replacement = await startDocumentUpload(t.db, {
      ...started.command,
      operationId: randomUUID(),
      documentId: record!.id,
      expectedRevision: record!.version,
    });
    const [old] = await t.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, file!.id));
    expect(old).toMatchObject({
      state: "superseded",
      supersededByVersionId: replacement.outcome.versionId,
    });
    await expect(privateDownload(t.db, store, session, "document", file!.id)).rejects.toMatchObject(
      { code: "not_found" },
    );
  });
  it("case participation does not disclose another participant's document; explicit scope, revocation, expiry and freshness apply", async () => {
    const started = await document();
    await processFile(t.db, services(), session, "document", started.versionId);
    const client = await createClient(t.db);
    const caseId = await createCase(t.db);
    await relate(t.db, { partyId: client.partyId, caseId, role: "buyer" });
    await t.db
      .update(documents)
      .set({ caseId, audience: "case_participants" })
      .where(eq(documents.id, started.documentId));
    const signedIn = await createSession(t.db, { kind: "client", id: client.id });
    expect(await listClientDocuments(t.db, signedIn.session)).toEqual([]);
    await expect(
      getClientDocument(t.db, signedIn.session, started.documentId),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      privateDownload(t.db, store, signedIn.session, "document", started.versionId),
    ).rejects.toMatchObject({ code: "not_found" });
    const [grant] = await t.db
      .insert(grants)
      .values({
        principalId: client.id,
        capability: "portal.document.upload",
        recordType: "document",
        recordId: started.documentId,
        reason: "test explicit document request",
      })
      .returning();
    expect(
      (await privateDownload(t.db, store, signedIn.session, "document", started.versionId)).bytes,
    ).toEqual(image);
    const [visible] = await listClientDocuments(t.db, signedIn.session);
    expect(visible).toMatchObject({
      id: started.documentId,
      caseId,
      version: { id: started.versionId, canDownload: true, downloadUnavailableReason: null },
    });
    for (const key of ["sealedKey", "stagingKey", "sha256", "reviewNote"])
      expect(Object.keys(visible!.version)).not.toContain(key);
    await t.db
      .update(documents)
      .set({ audience: "internal" })
      .where(eq(documents.id, started.documentId));
    expect(await listClientDocuments(t.db, signedIn.session)).toEqual([]);
    await t.db
      .update(documents)
      .set({ audience: "case_participants" })
      .where(eq(documents.id, started.documentId));
    await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, grant!.id));
    expect(await listClientDocuments(t.db, signedIn.session)).toEqual([]);
    await expect(
      getClientDocument(t.db, signedIn.session, started.documentId),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      privateDownload(t.db, store, signedIn.session, "document", started.versionId),
    ).rejects.toMatchObject({ code: "not_found" });
    await t.db
      .update(documents)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(documents.id, started.documentId));
    await expect(
      privateDownload(t.db, store, session, "document", started.versionId),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("public derivatives require a current website manifest; original digest and withdrawn media never serve", async () => {
    const fixture = await createListingFixture(t.db, { reviewerId: staffId });
    const id = fixture.assetIds[0]!;
    const [asset] = await t.db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
    if (!asset?.derivativeKey || !asset.derivativeSha256)
      throw new Error("Missing derivative fixture");
    const digest = asset.derivativeSha256;
    const bytes = await publicationFixtureStorage.read(asset.derivativeKey);
    await expect(
      publicMediaDownload(t.db, publicationFixtureStorage, id, digest),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await publishForTest(t.db, session.actor, fixture);
    expect((await publicMediaDownload(t.db, publicationFixtureStorage, id, digest)).bytes).toEqual(
      bytes,
    );
    await expect(
      publicMediaDownload(t.db, publicationFixtureStorage, id, "0".repeat(64)),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await t.db
      .update(currentPublications)
      .set({ state: "restricted", reason: "Synthetic restriction", restrictedAt: new Date() })
      .where(eq(currentPublications.listingId, fixture.listingId));
    await expect(
      publicMediaDownload(t.db, publicationFixtureStorage, id, digest),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });
  it("missing or altered sealed objects cannot produce an accepted scan", async () => {
    const started = await media();
    await finalizeUpload(t.db, services(), session, started.uploadId);
    const badStore = {
      writeImmutable: store.writeImmutable.bind(store),
      writeStaging: store.writeStaging.bind(store),
      read: vi.fn(async () => Buffer.from("different bytes")),
    };
    expect(
      await processFile(
        t.db,
        { storage: badStore, scanner: cleanScanner },
        session,
        "media",
        started.assetId,
      ),
    ).toMatchObject({ state: "failed" });
  });
});
