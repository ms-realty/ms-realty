// AT42: the upload capability reaches only staging; finalization copies and hashes server
// bytes under a new immutable key. A completion callback cannot supply scan/review evidence.
import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  cases,
  documentRequests,
  documents,
  documentVersions,
  fileUploads,
  mediaAssets,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { getEnv } from "../config/env";
import { keyedHash, sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { JobQueue } from "../jobs/queue";
import { type FileKind, targetAccess } from "./access";
import type { FileServices } from "./config";
import { inspectFile } from "./inspect";
import { digestOf, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES } from "./storage";

const tokenFor = (id: string) => keyedHash(getEnv().authSecret, `file-upload:${id}`);
/** Case access mutations lock the Case first. Keep a transfer/finalization within that
 * boundary so a revocation either precedes the authorization check or follows the write. */
async function lockUploadCase(db: Executor, session: Session, uploadId: string) {
  const [upload] = await db.select().from(fileUploads).where(eq(fileUploads.id, uploadId));
  if (!upload || upload.actorKind !== session.actor.kind || upload.actorId !== session.actor.id)
    throw new AppError("not_found");
  if (upload.targetType !== "document") return;
  const [document] = await db
    .select({ caseId: documents.caseId })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(eq(documentVersions.id, upload.targetId));
  if (document?.caseId)
    await db
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.id, document.caseId))
      .for("update");
}
async function requestedLimits(
  db: Executor,
  kind: FileKind,
  targetId: string,
  measured?: { byteSize: number; contentType: string },
) {
  if (kind !== "document") return MAX_IMAGE_BYTES;
  const [request] = await db
    .select({ maxBytes: documentRequests.maxBytes, allowed: documentRequests.allowedContentTypes })
    .from(documentRequests)
    .innerJoin(documentVersions, eq(documentVersions.documentId, documentRequests.documentId))
    .where(eq(documentVersions.id, targetId));
  if (
    request &&
    measured &&
    (measured.byteSize > request.maxBytes || !request.allowed.includes(measured.contentType))
  )
    throw new AppError("validation_failed", {
      fieldErrors: { file: ["File does not match this request's type or size limit."] },
    });
  return request?.maxBytes ?? MAX_DOCUMENT_BYTES;
}
export async function reserveUpload(
  db: Executor,
  actor: Actor,
  targetType: FileKind,
  targetId: string,
  stagingKey: string,
) {
  const id = randomUUID();
  const token = tokenFor(id);
  await db.insert(fileUploads).values({
    id,
    actorKind: actor.kind,
    actorId: actor.id,
    targetType,
    targetId,
    stagingKey,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + 15 * 60_000),
  });
  return id;
}

export async function uploadAuthorization(db: Executor, session: Session, uploadId: string) {
  const [upload] = await db.select().from(fileUploads).where(eq(fileUploads.id, uploadId));
  if (!upload || upload.actorKind !== session.actor.kind || upload.actorId !== session.actor.id)
    throw new AppError("not_found");
  await targetAccess(db, session, upload.targetType as FileKind, upload.targetId);
  if (upload.completedAt || upload.expiresAt <= new Date()) throw new AppError("transition_denied");
  return { uploadId, token: tokenFor(upload.id), expiresAt: upload.expiresAt.toISOString() };
}

function tokenMatches(token: string, hash: string) {
  const expected = Buffer.from(hash);
  const received = Buffer.from(sha256Hex(token));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Refuse unauthorized uploads before a transport buffers the request body. Rechecked in
 * receiveUpload under a row lock because grants/expiry can change while bytes arrive. */
export async function verifyUploadRequest(
  db: Executor,
  session: Session,
  uploadId: string,
  token: string,
) {
  const [upload] = await db.select().from(fileUploads).where(eq(fileUploads.id, uploadId));
  if (
    !upload ||
    upload.actorKind !== session.actor.kind ||
    upload.actorId !== session.actor.id ||
    !tokenMatches(token, upload.tokenHash)
  )
    throw new AppError("not_found");
  await targetAccess(db, session, upload.targetType as FileKind, upload.targetId);
  if (upload.completedAt || upload.expiresAt <= new Date()) throw new AppError("transition_denied");
  return { maxBytes: await requestedLimits(db, upload.targetType as FileKind, upload.targetId) };
}

export async function receiveUpload(
  db: Executor,
  services: FileServices,
  session: Session,
  input: { uploadId: string; token: string; bytes: Buffer },
) {
  return db.transaction(async (tx) => {
    await lockUploadCase(tx, session, input.uploadId);
    const [upload] = await tx
      .select()
      .from(fileUploads)
      .where(eq(fileUploads.id, input.uploadId))
      .for("update");
    if (
      !upload ||
      upload.actorKind !== session.actor.kind ||
      upload.actorId !== session.actor.id ||
      !tokenMatches(input.token, upload.tokenHash)
    )
      throw new AppError("not_found");
    await targetAccess(tx, session, upload.targetType as FileKind, upload.targetId);
    if (upload.completedAt || upload.expiresAt <= new Date())
      throw new AppError("transition_denied");
    const measured = await inspectFile(input.bytes, upload.targetType as FileKind);
    await requestedLimits(tx, upload.targetType as FileKind, upload.targetId, measured);
    await services.storage.writeStaging(upload.stagingKey, input.bytes);
    await tx
      .update(fileUploads)
      .set({ byteSize: measured.byteSize, contentType: measured.contentType })
      .where(eq(fileUploads.id, upload.id));
    if (upload.targetType === "document")
      await tx
        .update(documentVersions)
        .set({ state: "uploaded" })
        .where(eq(documentVersions.id, upload.targetId));
    return { byteSize: measured.byteSize, contentType: measured.contentType };
  });
}

export async function finalizeUpload(
  db: Executor,
  services: FileServices,
  session: Session,
  uploadId: string,
  queue?: JobQueue,
) {
  return db.transaction(async (tx) => {
    await lockUploadCase(tx, session, uploadId);
    const [upload] = await tx
      .select()
      .from(fileUploads)
      .where(eq(fileUploads.id, uploadId))
      .for("update");
    if (!upload || upload.actorKind !== session.actor.kind || upload.actorId !== session.actor.id)
      throw new AppError("not_found");
    const kind = upload.targetType as FileKind;
    const target = await targetAccess(tx, session, kind, upload.targetId);
    if (upload.expiresAt <= new Date()) throw new AppError("transition_denied");
    // Check current authorization before returning even an idempotent completed result.
    if (upload.completedAt && target.sealedKey && target.sha256)
      return { kind, id: target.id, sha256: target.sha256 };
    if (!upload.byteSize) throw new AppError("transition_denied");
    const staged = await services.storage.read(
      upload.stagingKey,
      kind === "media" ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES,
    );
    const measured = await inspectFile(staged, kind);
    await requestedLimits(tx, kind, upload.targetId, measured);
    if (measured.byteSize !== upload.byteSize || measured.contentType !== upload.contentType)
      throw new AppError("validation_failed");
    const sha256 = digestOf(staged);
    const sealedKey = `sealed/${randomUUID()}/${sha256}`;
    await services.storage.writeImmutable(sealedKey, staged, measured.contentType);
    const sealed = await services.storage.read(sealedKey);
    if (digestOf(sealed) !== sha256 || sealed.length !== staged.length)
      throw new AppError("unavailable");
    if (kind === "media") {
      await tx
        .update(mediaAssets)
        .set({ ...measured, sealedKey, sha256, version: target.version + 1 })
        .where(eq(mediaAssets.id, target.id));
    } else {
      await tx
        .update(documentVersions)
        .set({
          contentType: measured.contentType,
          byteSize: measured.byteSize,
          sealedKey,
          sha256,
          state: "sealed",
          version: target.version + 1,
        })
        .where(eq(documentVersions.id, target.id));
    }
    await tx
      .update(fileUploads)
      .set({ completedAt: new Date() })
      .where(eq(fileUploads.id, upload.id));
    await recordAudit(tx, {
      actor: session.actor,
      action: "file.sealed",
      recordType: kind,
      recordId: target.id,
      payload: { sha256, byteSize: measured.byteSize },
    });
    if (queue)
      await queue.send(
        "files.process",
        { kind, id: target.id },
        { db: tx, singletonKey: `${kind}:${target.id}` },
      );
    return { kind, id: target.id, sha256 };
  });
}
