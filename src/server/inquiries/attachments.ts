// F10/AT42: optional owner photos attach only to an already durable, receipt-owned inquiry.
import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { inquiryAttachments } from "@/db/schema/inquiry-attachments";
import { inquiries } from "@/db/schema/work";
import type { Actor } from "@/domain/capabilities";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { assertCan, can } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { fileSession } from "../files/access";
import type { FileServices } from "../files/config";
import { inspectFile } from "../files/inspect";
import { digestOf } from "../files/storage";
import type { JobQueue } from "../jobs/queue";
import { enforceRateLimit } from "../rate-limit";
import { assertRecoveryOpen } from "../recovery/quarantine";
import { isIssuedSubmissionKey, readInquiryReceipt, validReceiptSession } from "./intake";

export const maxInquiryPhotoBytes = 8 * 1024 * 1024;
export const maxInquiryPhotos = 3;
async function privateStorage<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    throw new AppError("unavailable", { cause });
  }
}
type Photo = typeof inquiryAttachments.$inferSelect;
export type InquiryPhotoStage =
  | "upload_incomplete"
  | "scanning"
  | "available_for_review"
  | "held"
  | "removed";
export function inquiryPhotoReceipt(photo: Photo) {
  const clean =
    photo.state === "sealed" &&
    photo.scan === "clean" &&
    photo.scannedSha256 === photo.sha256 &&
    Boolean(photo.scannedAt && photo.scannerVersion);
  const stage: InquiryPhotoStage =
    photo.state === "erased"
      ? "removed"
      : photo.state !== "sealed"
        ? "upload_incomplete"
        : clean
          ? "available_for_review"
          : photo.scan === "pending"
            ? "scanning"
            : "held";
  return {
    id: photo.id,
    operationId: photo.operationId,
    byteSize: photo.byteSize,
    contentType: photo.contentType,
    stage,
  };
}
type Owner = { submissionKey: string; receiptSession: string | null };

/** Recheck the canonical receipt capability under the inquiry lock before every write. */
export async function ownerPhotoInquiry(db: Executor, owner: Owner, forUpload = false) {
  await assertRecoveryOpen(db);
  if (
    !validReceiptSession(owner.receiptSession ?? undefined) ||
    !isIssuedSubmissionKey(owner.submissionKey)
  )
    throw new AppError("not_found");
  const [inquiry] = await db
    .select()
    .from(inquiries)
    .where(eq(inquiries.submissionKey, owner.submissionKey))
    .for("update");
  if (!inquiry) throw new AppError("not_found");
  const receipt = await readInquiryReceipt(db, owner);
  if (
    !receipt.ownerInput ||
    !["seller_consultation", "landlord_consultation"].includes(inquiry.purpose)
  )
    throw new AppError("not_found");
  if (
    forUpload &&
    (inquiry.caseId || !["received", "assigned", "awaiting_client"].includes(inquiry.state))
  )
    throw new AppError("transition_denied");
  return inquiry;
}

export async function ownerInquiryPhotos(db: Executor, owner: Owner) {
  const inquiry = await ownerPhotoInquiry(db, owner);
  const rows = await db
    .select()
    .from(inquiryAttachments)
    .where(
      and(eq(inquiryAttachments.inquiryId, inquiry.id), ne(inquiryAttachments.state, "erased")),
    )
    .orderBy(asc(inquiryAttachments.createdAt), asc(inquiryAttachments.id))
    .limit(maxInquiryPhotos + 1);
  if (rows.length > maxInquiryPhotos) throw new AppError("unavailable");
  return {
    canUpload:
      !inquiry.caseId && ["received", "assigned", "awaiting_client"].includes(inquiry.state),
    photos: rows.map(inquiryPhotoReceipt),
  };
}

/** Ordinary inquiry scope plus a current staff file session; no receipt or Case widening. */
export async function staffInquiryPhotos(db: Executor, session: Session, inquiryId: string) {
  await assertRecoveryOpen(db);
  const live = await fileSession(db, session);
  if (live.actor.kind !== "staff") throw new AppError("not_found");
  await assertCan(db, live.actor, "inquiry.read", { type: "inquiry", id: inquiryId });
  const [inquiry] = await db
    .select({ id: inquiries.id })
    .from(inquiries)
    .where(eq(inquiries.id, inquiryId));
  if (!inquiry) throw new AppError("not_found");
  const photos = await db
    .select()
    .from(inquiryAttachments)
    .where(and(eq(inquiryAttachments.inquiryId, inquiryId), ne(inquiryAttachments.state, "erased")))
    .orderBy(asc(inquiryAttachments.createdAt), asc(inquiryAttachments.id))
    .limit(maxInquiryPhotos + 1);
  if (photos.length > maxInquiryPhotos) throw new AppError("unavailable");
  return photos.map(inquiryPhotoReceipt);
}

function sameSource(
  photo: Photo,
  measured: {
    sha256: string;
    contentType: string;
    byteSize: number;
    width: number;
    height: number;
  },
) {
  return (
    photo.sha256 === measured.sha256 &&
    photo.byteSize === measured.byteSize &&
    photo.contentType === measured.contentType &&
    photo.width === measured.width &&
    photo.height === measured.height
  );
}

export async function receiveInquiryPhoto(
  db: Executor,
  services: FileServices,
  queue: Pick<JobQueue, "send">,
  input: Owner & { operationId: string; bytes: Buffer; sharedForInquiry: boolean },
) {
  await assertRecoveryOpen(db);
  if (
    !z.uuid().safeParse(input.operationId).success ||
    !input.sharedForInquiry ||
    input.bytes.length > maxInquiryPhotoBytes
  )
    throw new AppError("validation_failed");
  await ownerPhotoInquiry(db, input, true);
  const inspected = await inspectFile(input.bytes, "media");
  if (!inspected.width || !inspected.height) throw new AppError("validation_failed");
  const measured = {
    ...inspected,
    width: inspected.width,
    height: inspected.height,
    sha256: digestOf(input.bytes),
  };
  const reservation = await db.transaction(async (tx) => {
    const inquiry = await ownerPhotoInquiry(tx, input, true);
    const [existing] = await tx
      .select()
      .from(inquiryAttachments)
      .where(
        and(
          eq(inquiryAttachments.inquiryId, inquiry.id),
          eq(inquiryAttachments.operationId, input.operationId),
        ),
      )
      .for("update");
    if (existing) {
      if (!sameSource(existing, measured) || existing.state === "erased")
        throw new AppError("idempotency_key_reused");
      return existing;
    }
    const [count] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(inquiryAttachments)
      .where(
        and(eq(inquiryAttachments.inquiryId, inquiry.id), ne(inquiryAttachments.state, "erased")),
      );
    if (!count || count.value >= maxInquiryPhotos) throw new AppError("validation_failed");
    await enforceRateLimit(tx, "inquiry_photo.receipt", inquiry.id);
    const id = randomUUID();
    const [photo] = await tx
      .insert(inquiryAttachments)
      .values({
        id,
        inquiryId: inquiry.id,
        operationId: input.operationId,
        stagingKey: `staging/inquiry-photos/${inquiry.id}/${id}`,
        sealedKey: `sealed/inquiry-photos/${inquiry.id}/${id}/${measured.sha256}`,
        ...measured,
      })
      .returning();
    if (!photo) throw new AppError("unavailable");
    await recordAudit(tx, {
      actor: { kind: "visitor", id: `inquiry:${inquiry.id}` },
      action: "inquiry_photo.reserved",
      recordType: "inquiry_attachment",
      recordId: id,
      payload: {
        sha256: photo.sha256,
        operationId: input.operationId,
        purpose: "owner_assessment",
        selfDeclaredPermission: true,
        publicationAllowed: false,
      },
    });
    return photo;
  });
  if (reservation.state === "sealed") return inquiryPhotoReceipt(reservation);
  // The reserved record survives a storage interruption and keeps the same retry identity.
  await privateStorage(() => services.storage.writeStaging(reservation.stagingKey, input.bytes));
  const staged = await privateStorage(() =>
    services.storage.read(reservation.stagingKey, maxInquiryPhotoBytes),
  );
  const actual = await inspectFile(staged, "media");
  if (
    !sameSource(reservation, {
      ...actual,
      width: actual.width ?? 0,
      height: actual.height ?? 0,
      sha256: digestOf(staged),
    })
  )
    throw new AppError("unavailable");
  await privateStorage(() =>
    services.storage.writeImmutable(reservation.sealedKey, staged, actual.contentType),
  );
  const sealed = await privateStorage(() =>
    services.storage.read(reservation.sealedKey, maxInquiryPhotoBytes),
  );
  if (digestOf(sealed) !== reservation.sha256 || sealed.length !== reservation.byteSize)
    throw new AppError("unavailable");
  return db.transaction(async (tx) => {
    await ownerPhotoInquiry(tx, input, true);
    const [current] = await tx
      .select()
      .from(inquiryAttachments)
      .where(eq(inquiryAttachments.id, reservation.id))
      .for("update");
    if (!current || !sameSource(current, measured) || current.state === "erased")
      throw new AppError("idempotency_key_reused");
    if (current.state === "sealed") return inquiryPhotoReceipt(current);
    const [photo] = await tx
      .update(inquiryAttachments)
      .set({ state: "sealed" })
      .where(eq(inquiryAttachments.id, current.id))
      .returning();
    if (!photo) throw new AppError("unavailable");
    await queue.send(
      "files.process",
      { kind: "inquiry_attachment", id: photo.id },
      { db: tx, singletonKey: `inquiry-photo:${photo.id}` },
    );
    await recordAudit(tx, {
      actor: { kind: "visitor", id: `inquiry:${photo.inquiryId}` },
      action: "inquiry_photo.sealed",
      recordType: "inquiry_attachment",
      recordId: photo.id,
      payload: { sha256: photo.sha256, byteSize: photo.byteSize },
    });
    return inquiryPhotoReceipt(photo);
  });
}

/** A trusted scanner can record evidence, never a human review or publication decision. */
export async function processInquiryPhoto(
  db: Executor,
  services: FileServices,
  actor: Actor,
  id: string,
) {
  await assertRecoveryOpen(db);
  if (actor.kind !== "system" || actor.id !== "file-scanner") throw new AppError("forbidden");
  await assertCan(db, actor, "document.review", { type: "inquiry_attachment", id });
  const result = await db.transaction(async (tx) => {
    const [photo] = await tx
      .select()
      .from(inquiryAttachments)
      .where(eq(inquiryAttachments.id, id))
      .for("update");
    if (photo?.state !== "sealed" || photo.erasedAt) throw new AppError("not_found");
    let evidence: {
      scan: "clean" | "infected" | "failed";
      scannedAt: Date | null;
      scannerVersion: string | null;
      scannedSha256: string | null;
    } = { scan: "failed", scannedAt: null, scannerVersion: null, scannedSha256: null };
    try {
      const bytes = await services.storage.read(photo.sealedKey, maxInquiryPhotoBytes);
      const actual = await inspectFile(bytes, "media");
      if (
        !sameSource(photo, {
          ...actual,
          width: actual.width ?? 0,
          height: actual.height ?? 0,
          sha256: digestOf(bytes),
        })
      )
        throw new AppError("unavailable");
      if (inquiryPhotoReceipt(photo).stage === "available_for_review") return "clean" as const;
      if (!services.scanner) {
        await recordAudit(tx, {
          actor,
          action: "inquiry_photo.scan.deferred",
          recordType: "inquiry_attachment",
          recordId: id,
          payload: { reason: "staging_scanner_disabled", sha256: photo.sha256 },
        });
        return "unverified" as const;
      }
      const scan = await services.scanner.scan(bytes);
      if (
        scan.sha256 !== photo.sha256 ||
        !scan.scannerVersion?.trim() ||
        !Number.isFinite(scan.scannedAt.getTime()) ||
        Math.abs(Date.now() - scan.scannedAt.getTime()) > 5 * 60_000
      )
        throw new AppError("unavailable");
      evidence = {
        scan: scan.state,
        scannedAt: scan.scannedAt,
        scannerVersion: scan.scannerVersion,
        scannedSha256: scan.sha256,
      };
    } catch {
      /* A failed/unattested scan stays private and can be retried by the queue. */
    }
    await tx.update(inquiryAttachments).set(evidence).where(eq(inquiryAttachments.id, id));
    await recordAudit(tx, {
      actor,
      action: "inquiry_photo.scan.completed",
      recordType: "inquiry_attachment",
      recordId: id,
      payload: {
        sha256: photo.sha256,
        scan: evidence.scan,
        scannerVersion: evidence.scannerVersion,
      },
    });
    return evidence.scan;
  });
  if (result === "failed") throw new AppError("unavailable");
  return { id, state: result };
}

/** Staff-only: the receipt never becomes a byte-download or Case-access capability. */
export async function readInquiryPhoto(
  db: Executor,
  services: FileServices,
  session: Session,
  id: string,
) {
  await assertRecoveryOpen(db);
  const live = await fileSession(db, session);
  if (live.actor.kind !== "staff") throw new AppError("not_found");
  return db.transaction(async (tx) => {
    const [photo] = await tx
      .select()
      .from(inquiryAttachments)
      .where(eq(inquiryAttachments.id, id))
      .for("share");
    if (
      !photo ||
      inquiryPhotoReceipt(photo).stage !== "available_for_review" ||
      !(await can(tx, live.actor, "inquiry.read", { type: "inquiry", id: photo.inquiryId }))
    )
      throw new AppError("not_found");
    const bytes = await services.storage.read(photo.sealedKey, maxInquiryPhotoBytes);
    if (bytes.length !== photo.byteSize || digestOf(bytes) !== photo.sha256)
      throw new AppError("unavailable");
    await fileSession(tx, live);
    if (!(await can(tx, live.actor, "inquiry.read", { type: "inquiry", id: photo.inquiryId })))
      throw new AppError("not_found");
    return { bytes, contentType: photo.contentType };
  });
}
