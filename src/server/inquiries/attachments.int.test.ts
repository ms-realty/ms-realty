// F10/AT42: synthetic bytes and disposable Postgres, never a live customer upload.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { grants, inquiries, recoveryControl, sessions } from "@/db/schema";
import { inquiryAttachments } from "@/db/schema/inquiry-attachments";
import { createTestDatabase, type TestDatabase } from "@/db/test-utils";
import { finishPasskeyRegistration, startPasskeyRegistration } from "../auth/passkeys";
import { createSession, type Session } from "../auth/sessions";
import { SoftAuthenticator } from "../auth/testing-authenticator";
import type { FileServices } from "../files/config";
import { digestOf, LocalFileStorage } from "../files/storage";
import { quarantineRestoredDatabase } from "../recovery/quarantine";
import { createStaff } from "../testing";
import {
  ownerInquiryPhotos,
  processInquiryPhoto,
  readInquiryPhoto,
  receiveInquiryPhoto,
} from "./attachments";
import { issueSubmissionKey, newReceiptSession, submitInquiry } from "./intake";

let t: TestDatabase;
let root: string;
let storage: LocalFileStorage;
let image: Buffer;
let otherImage: Buffer;
let session: Session;
let staffId: string;
let sequence = 0;
const scannerActor = { kind: "system", id: "file-scanner" } as const;
const queue = { send: vi.fn(async () => null) };
const services = (): FileServices => ({
  storage,
  scanner: {
    scan: async (bytes) => ({
      state: "clean",
      sha256: digestOf(bytes),
      scannedAt: new Date(),
      scannerVersion: "synthetic-scanner",
    }),
  },
});
beforeAll(async () => {
  t = await createTestDatabase();
  root = await mkdtemp(join(tmpdir(), "msr-inquiry-photos-"));
  storage = new LocalFileStorage(root);
  image = await sharp({ create: { width: 8, height: 6, channels: 3, background: "blue" } })
    .png()
    .toBuffer();
  otherImage = await sharp({ create: { width: 8, height: 6, channels: 3, background: "green" } })
    .png()
    .toBuffer();
  const staff = await createStaff(t.db, { grants: [{ capability: "inquiry.read" }] });
  staffId = staff.id;
  session = (await createSession(t.db, { kind: "staff", id: staff.id })).session;
  for (let i = 0; i < 2; i++) {
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

async function owner(purpose: "seller_consultation" | "question" = "seller_consultation") {
  const input = {
    submissionKey: issueSubmissionKey(),
    purpose,
    locale: "bg",
    name: "Synthetic owner",
    contact: { kind: "email", value: `owner-${++sequence}@example.test` },
    message: "Synthetic owner assessment request",
    privacyNotice: true,
    ...(purpose === "seller_consultation"
      ? { ownerInput: { version: 1, provenance: "self_declared", transaction: "sale" } }
      : {}),
  };
  const receiptSession = newReceiptSession();
  await submitInquiry(t.db, input, { ip: `198.51.100.${sequence}`, receiptSession });
  const [inquiry] = await t.db
    .select()
    .from(inquiries)
    .where(eq(inquiries.submissionKey, input.submissionKey));
  if (!inquiry) throw new Error("Missing synthetic inquiry");
  return { submissionKey: input.submissionKey, receiptSession, inquiry };
}
const attach = (bound: Awaited<ReturnType<typeof owner>>, overrides = {}) =>
  receiveInquiryPhoto(t.db, services(), queue, {
    ...bound,
    operationId: randomUUID(),
    bytes: image,
    sharedForInquiry: true,
    ...overrides,
  });
async function row(id: string) {
  const [photo] = await t.db.select().from(inquiryAttachments).where(eq(inquiryAttachments.id, id));
  if (!photo) throw new Error("Missing synthetic photo");
  return photo;
}

describe("F10/AT42 receipt-owned inquiry photo quarantine", () => {
  it("requires the existing receipt capability and owner purpose before reserving storage", async () => {
    const bound = await owner();
    const before = await t.db.select().from(inquiryAttachments);
    const write = vi.spyOn(storage, "writeStaging");
    await expect(attach(bound, { receiptSession: newReceiptSession() })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(attach(await owner("question"))).rejects.toMatchObject({ code: "not_found" });
    await expect(attach(bound, { sharedForInquiry: false })).rejects.toMatchObject({
      code: "validation_failed",
    });
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
    expect(await t.db.select().from(inquiryAttachments)).toHaveLength(before.length);
  });
  it("measures bytes, reserves one stable operation and never accepts a replacement on retry", async () => {
    const bound = await owner(),
      operationId = randomUUID();
    const photo = await attach(bound, { operationId });
    expect(photo).toMatchObject({
      stage: "scanning",
      contentType: "image/png",
      byteSize: image.length,
    });
    expect(JSON.stringify(photo)).not.toMatch(/sealed|staging|sha256/);
    expect(await attach(bound, { operationId })).toEqual(photo);
    await expect(attach(bound, { operationId, bytes: otherImage })).rejects.toMatchObject({
      code: "idempotency_key_reused",
    });
    expect((await row(photo.id)).sha256).toBe(digestOf(image));
    expect(queue.send).toHaveBeenCalledWith(
      "files.process",
      { kind: "inquiry_attachment", id: photo.id },
      expect.objectContaining({ singletonKey: `inquiry-photo:${photo.id}` }),
    );
  });
  it("retains a retryable reservation after interrupted storage and seals the same source", async () => {
    const bound = await owner(),
      operationId = randomUUID();
    await attach(bound);
    await attach(bound);
    const write = vi
      .spyOn(storage, "writeStaging")
      .mockRejectedValueOnce(new Error("synthetic interruption"));
    await expect(attach(bound, { operationId })).rejects.toMatchObject({ code: "unavailable" });
    write.mockRestore();
    const receipt = await ownerInquiryPhotos(t.db, bound);
    expect(receipt.photos).toHaveLength(3);
    const interrupted = receipt.photos.find((photo) => photo.operationId === operationId);
    expect(interrupted).toMatchObject({ operationId, stage: "upload_incomplete" });
    expect(await attach(bound, { operationId })).toMatchObject({
      id: interrupted?.id,
      stage: "scanning",
    });
  });
  it("bounds count, bytes and actual raster type without publishing or fabricating a property", async () => {
    const bound = await owner();
    await expect(
      attach(bound, { bytes: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    await expect(attach(bound, { bytes: Buffer.alloc(8 * 1024 * 1024 + 1) })).rejects.toMatchObject(
      { code: "validation_failed" },
    );
    for (let i = 0; i < 3; i++) await attach(bound);
    await expect(attach(bound)).rejects.toMatchObject({ code: "validation_failed" });
    expect((await ownerInquiryPhotos(t.db, bound)).photos).toHaveLength(3);
  });
  it("does not turn a receipt into post-Case or closed-inquiry upload authority", async () => {
    const bound = await owner();
    await t.db
      .update(inquiries)
      .set({ state: "resolved_without_case" })
      .where(eq(inquiries.id, bound.inquiry.id));
    expect((await ownerInquiryPhotos(t.db, bound)).canUpload).toBe(false);
    await expect(attach(bound)).rejects.toMatchObject({ code: "transition_denied" });
  });
  it("holds unscanned bytes and allows only live authorized staff after exact scan binding", async () => {
    const bound = await owner(),
      photo = await attach(bound);
    await expect(readInquiryPhoto(t.db, services(), session, photo.id)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(
      await processInquiryPhoto(t.db, { storage, scanner: null }, scannerActor, photo.id),
    ).toMatchObject({ state: "unverified" });
    expect((await row(photo.id)).scan).toBe("pending");
    await processInquiryPhoto(t.db, services(), scannerActor, photo.id);
    const download = await readInquiryPhoto(t.db, services(), session, photo.id);
    expect(download.contentType).toBe("image/png");
    expect(download.bytes).toEqual(image);
    expect((await ownerInquiryPhotos(t.db, bound)).photos[0]?.stage).toBe("available_for_review");
    const unauthorized = await createStaff(t.db);
    await expect(
      readInquiryPhoto(
        t.db,
        services(),
        (await createSession(t.db, { kind: "staff", id: unauthorized.id })).session,
        photo.id,
      ),
    ).rejects.toBeDefined();
    await expect(
      processInquiryPhoto(t.db, services(), { kind: "staff", id: staffId }, photo.id),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it.each(["different_digest", "stale_time", "missing_version", "infected"] as const)(
    "keeps %s scanner evidence private",
    async (problem) => {
      const bound = await owner(),
        photo = await attach(bound);
      const scanner: FileServices["scanner"] = {
        scan: async () => ({
          state: problem === "infected" ? "infected" : "clean",
          sha256: problem === "different_digest" ? "a".repeat(64) : digestOf(image),
          scannedAt: new Date(Date.now() - (problem === "stale_time" ? 60 * 60_000 : 0)),
          scannerVersion: problem === "missing_version" ? null : "synthetic-scanner",
        }),
      };
      if (problem === "infected")
        expect(
          await processInquiryPhoto(t.db, { storage, scanner }, scannerActor, photo.id),
        ).toMatchObject({ state: "infected" });
      else
        await expect(
          processInquiryPhoto(t.db, { storage, scanner }, scannerActor, photo.id),
        ).rejects.toMatchObject({ code: "unavailable" });
      expect((await ownerInquiryPhotos(t.db, bound)).photos[0]?.stage).toBe("held");
      await expect(readInquiryPhoto(t.db, services(), session, photo.id)).rejects.toMatchObject({
        code: "not_found",
      });
    },
  );
  it("rechecks sealed bytes even after an earlier clean scan", async () => {
    const photo = await attach(await owner());
    await processInquiryPhoto(t.db, services(), scannerActor, photo.id);
    await writeFile(join(root, (await row(photo.id)).sealedKey), otherImage);
    await expect(readInquiryPhoto(t.db, services(), session, photo.id)).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(
      processInquiryPhoto(t.db, services(), scannerActor, photo.id),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect((await row(photo.id)).scan).toBe("failed");
  });
  it("does not cache revoked grants or sessions", async () => {
    const photo = await attach(await owner());
    await processInquiryPhoto(t.db, services(), scannerActor, photo.id);
    await t.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.principalId, staffId));
    await expect(readInquiryPhoto(t.db, services(), session, photo.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await t.db.update(grants).set({ revokedAt: null }).where(eq(grants.principalId, staffId));
    await t.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
    await expect(readInquiryPhoto(t.db, services(), session, photo.id)).rejects.toBeDefined();
  });
  it("holds new upload, scanning and download in restored-destination quarantine", async () => {
    const bound = await owner(),
      photo = await attach(bound);
    await quarantineRestoredDatabase(t.db, {
      restoreId: randomUUID(),
      snapshotDigest: "a".repeat(64),
    });
    try {
      await expect(attach(bound)).rejects.toThrow("Recovery quarantine");
      await expect(processInquiryPhoto(t.db, services(), scannerActor, photo.id)).rejects.toThrow(
        "Recovery quarantine",
      );
      await expect(readInquiryPhoto(t.db, services(), session, photo.id)).rejects.toThrow(
        "Recovery quarantine",
      );
    } finally {
      await t.db
        .update(recoveryControl)
        .set({ state: "normal" })
        .where(eq(recoveryControl.key, "runtime"));
    }
  });
});
