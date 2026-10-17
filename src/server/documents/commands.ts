import "server-only";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { documentRequests, documents, documentVersions, fileUploads, listings } from "@/db/schema";
import { documentClassifications, documentReviewTypes } from "@/domain/document";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { documentAccess, fileSession } from "../files/access";
import { documentContentTypes } from "../files/inspect";
import { reserveUpload } from "../files/uploads";
import { expectVersion, type FileCommand, parseFileInput } from "../media/commands";
import { runOperation } from "../operations";
import { nextReference } from "../references";

const envelope = z.object({
  operationId: z.string().min(8).max(160),
  expectedRevision: z.int().nonnegative(),
});
export const uploadInput = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .refine((name) =>
      [...name].every(
        (char) =>
          char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127 && char !== "/" && char !== "\\",
      ),
    ),
  contentType: z.enum(documentContentTypes),
  payloadIdentity: z.string().max(128),
  purpose: z.enum(["seller_authority", "seller_instruction", "property_evidence", "other"]),
  classification: z.enum(documentClassifications),
});
async function listingAccess(db: Executor, session: Session, reference: string) {
  await fileSession(db, session, true);
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.reference, reference.toUpperCase()));
  if (
    !listing ||
    session.actor.kind !== "staff" ||
    !(await can(db, session.actor, "listing.read", {
      type: "listing",
      id: listing.id,
      propertyId: listing.propertyId,
    }))
  )
    throw new AppError("not_found");
  return listing;
}

export async function startDocumentUpload(
  db: Executor,
  command: FileCommand & { reference: string; documentId?: string; input: unknown },
) {
  parseFileInput(envelope, command);
  const input = parseFileInput(uploadInput, command.input);
  const listing = await listingAccess(db, command.session, command.reference);
  const resource = {
    type: "document",
    ...(command.documentId ? { id: command.documentId } : {}),
    audience: "internal" as const,
  };
  if (
    !(await can(db, command.session.actor, "document.read_restricted", resource)) ||
    (!command.documentId && !(await can(db, command.session.actor, "document.review", resource)))
  )
    throw new AppError("not_found");
  return runOperation(
    db,
    {
      actor: command.session.actor,
      type: "document.upload.start",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        reference: command.reference,
        documentId: command.documentId,
        input,
        expectedRevision: command.expectedRevision,
      }),
    },
    async ({ tx, operationId }) => {
      await listingAccess(tx, command.session, command.reference);
      if (
        !(await can(tx, command.session.actor, "document.read_restricted", resource)) ||
        (!command.documentId &&
          !(await can(tx, command.session.actor, "document.review", resource)))
      )
        throw new AppError("not_found");
      let document: typeof documents.$inferSelect;
      if (command.documentId) {
        const [existing] = await tx
          .select()
          .from(documents)
          .where(eq(documents.id, command.documentId))
          .for("update");
        if (
          !existing ||
          existing.propertyId !== listing.propertyId ||
          (existing.expiresAt && existing.expiresAt <= new Date())
        )
          throw new AppError("not_found");
        expectVersion(existing.version, command.expectedRevision);
        if (existing.purpose !== input.purpose || existing.classification !== input.classification)
          throw new AppError("validation_failed");
        document = existing;
      } else {
        expectVersion(0, command.expectedRevision);
        const [created] = await tx
          .insert(documents)
          .values({
            reference: await nextReference(tx, "document"),
            propertyId: listing.propertyId,
            purpose: input.purpose,
            classification: input.classification,
            audience: "internal",
          })
          .returning();
        if (!created) throw new Error("Document insert failed");
        document = created;
      }
      const stagingKey = `staging/${randomUUID()}`;
      const [version] = await tx
        .insert(documentVersions)
        .values({
          documentId: document.id,
          versionNumber: document.currentVersionNumber + 1,
          stagingKey,
          fileName: input.fileName,
          contentType: input.contentType,
          uploadedByKind: command.session.actor.kind,
          uploadedById: command.session.actor.id,
          state: "uploading",
        })
        .returning();
      if (!version) throw new Error("Document version insert failed");
      const older = await tx
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, document.id));
      for (const row of older)
        if (row.id !== version.id)
          await tx
            .update(documentVersions)
            .set({ state: "superseded", supersededByVersionId: version.id })
            .where(eq(documentVersions.id, row.id));
      await tx
        .update(documents)
        .set({ currentVersionNumber: version.versionNumber, version: document.version + 1 })
        .where(eq(documents.id, document.id));
      const uploadId = await reserveUpload(
        tx,
        command.session.actor,
        "document",
        version.id,
        stagingKey,
      );
      await recordAudit(tx, {
        actor: command.session.actor,
        action: "document.upload.reserved",
        recordType: "document",
        recordId: document.id,
        operationId,
        payload: { versionId: version.id, purpose: document.purpose },
      });
      return { uploadId, documentId: document.id, versionId: version.id };
    },
  );
}

export async function documentsForListing(db: Executor, session: Session, reference: string) {
  const listing = await listingAccess(db, session, reference);
  const found = await db
    .select()
    .from(documents)
    .where(eq(documents.propertyId, listing.propertyId))
    .orderBy(desc(documents.createdAt));
  const visible = [];
  for (const document of found) {
    if (
      !(await can(db, session.actor, "document.read_restricted", {
        type: "document",
        id: document.id,
        audience: document.audience,
      }))
    )
      continue;
    const versions = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, document.id))
      .orderBy(desc(documentVersions.versionNumber));
    const file = versions[0];
    if (!file) continue;
    const [upload] = await db.select().from(fileUploads).where(eq(fileUploads.targetId, file.id));
    visible.push({
      document,
      file,
      upload,
      mayReview: await can(db, session.actor, "document.review", {
        type: "document",
        id: document.id,
        audience: document.audience,
      }),
    });
  }
  return {
    listing,
    documents: visible,
    mayCreate:
      (await can(db, session.actor, "document.review")) &&
      (await can(db, session.actor, "document.read_restricted")),
  };
}

export async function reviewDocument(
  db: Executor,
  command: FileCommand & { versionId: string; input: unknown; requestId?: string },
) {
  parseFileInput(envelope, command);
  const input = parseFileInput(
    z.object({
      reviewType: z.enum(documentReviewTypes),
      note: z.string().trim().min(5).max(4000),
      confirmed: z.literal(true),
      expiresAt: z.iso.datetime().nullable(),
    }),
    command.input,
  );
  const access = await documentAccess(db, command.session, command.versionId, "review");
  // Requested evidence must be reviewed through its request: the recipient outcome and
  // owned task are committed together by reviewRequestedDocument. HTTP callers never
  // forward a requestId into this internal command.
  const [request] = await db
    .select({ id: documentRequests.id })
    .from(documentRequests)
    .where(eq(documentRequests.documentId, access.document.id));
  if (request && command.requestId !== request.id) throw new AppError("transition_denied");
  return runOperation(
    db,
    {
      actor: command.session.actor,
      type: "document.review",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        versionId: command.versionId,
        input,
        expectedRevision: command.expectedRevision,
      }),
    },
    async ({ tx, operationId }) => {
      const [file] = await tx
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, command.versionId))
        .for("update");
      if (!file) throw new AppError("not_found");
      const { document } = await documentAccess(tx, command.session, file.id, "review");
      expectVersion(file.version, command.expectedRevision);
      if (
        file.scan !== "clean" ||
        !file.sealedKey ||
        !file.sha256 ||
        file.scannedSha256 !== file.sha256 ||
        !file.scannerVersion ||
        !file.scannedAt ||
        !["ready_for_review", "reviewed"].includes(file.state)
      )
        throw new AppError("transition_denied");
      if (input.expiresAt && new Date(input.expiresAt) <= new Date())
        throw new AppError("validation_failed");
      await tx
        .update(documentVersions)
        .set({
          state: input.reviewType === "needs_replacement" ? "needs_replacement" : "reviewed",
          reviewType: input.reviewType,
          reviewNote: input.note,
          reviewedById: command.session.actor.id,
          reviewedAt: new Date(),
          version: file.version + 1,
        })
        .where(eq(documentVersions.id, file.id));
      await tx
        .update(documents)
        .set({
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          version: document.version + 1,
        })
        .where(eq(documents.id, document.id));
      await recordAudit(tx, {
        actor: command.session.actor,
        action: "document.reviewed",
        recordType: "document",
        recordId: document.id,
        operationId,
        payload: {
          versionId: file.id,
          sha256: file.sha256,
          reviewType: input.reviewType,
          purpose: document.purpose,
          note: input.note,
        },
      });
      return { versionId: file.id, version: file.version + 1, reviewType: input.reviewType };
    },
  );
}
