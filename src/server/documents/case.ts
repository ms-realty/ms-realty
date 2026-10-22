import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { documents, documentVersions, fileUploads } from "@/db/schema";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import { caseFor } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { documentAccess, fileSession } from "../files/access";
import { reserveUpload } from "../files/uploads";
import { expectVersion, type FileCommand, parseFileInput } from "../media/commands";
import { runOperation } from "../operations";
import { nextReference } from "../references";
import { uploadInput } from "./commands";
import { caseDocumentPurposes } from "./purposes";

export { caseDocumentPurposes } from "./purposes";
export async function caseDocumentAccess(db: Executor, session: Session, caseId: string) {
  await fileSession(db, session, true);
  if (session.actor.kind !== "staff") throw new AppError("not_found");
  const { row } = await caseFor(db, session, caseId, "compliance.review");
  return row;
}
export async function startCaseDocumentUpload(
  db: Executor,
  command: FileCommand & { caseId: string; documentId?: string; input: unknown },
) {
  parseFileInput(
    z.object({ operationId: z.uuid(), expectedRevision: z.int().nonnegative() }),
    command,
  );
  const input = parseFileInput(
    uploadInput.extend({ purpose: z.enum(caseDocumentPurposes) }),
    command.input,
  );
  await caseDocumentAccess(db, command.session, command.caseId);
  const authorize = async (tx: Executor) => {
    await caseDocumentAccess(tx, command.session, command.caseId);
    for (const capability of ["document.read_restricted", "document.review"] as const)
      if (
        !(await can(tx, command.session.actor, capability, {
          type: "document",
          ...(command.documentId ? { id: command.documentId } : {}),
          audience: "internal",
        }))
      )
        throw new AppError("not_found");
  };
  await authorize(db);
  return runOperation(
    db,
    {
      actor: command.session.actor,
      type: "document.case.upload",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        caseId: command.caseId,
        documentId: command.documentId,
        expectedRevision: command.expectedRevision,
        input,
      }),
    },
    async ({ tx, operationId }) => {
      await authorize(tx);
      let record: typeof documents.$inferSelect;
      if (command.documentId) {
        const [existing] = await tx
          .select()
          .from(documents)
          .where(eq(documents.id, command.documentId))
          .for("update");
        if (
          !existing ||
          existing.caseId !== command.caseId ||
          existing.audience !== "internal" ||
          existing.purpose !== input.purpose ||
          existing.classification !== input.classification ||
          (existing.expiresAt && existing.expiresAt <= new Date())
        )
          throw new AppError("not_found");
        expectVersion(existing.version, command.expectedRevision);
        record = existing;
      } else {
        expectVersion(0, command.expectedRevision);
        const [created] = await tx
          .insert(documents)
          .values({
            reference: await nextReference(tx, "document"),
            caseId: command.caseId,
            purpose: input.purpose,
            classification: input.classification,
            audience: "internal",
          })
          .returning();
        if (!created) throw new Error("Document insert failed");
        record = created;
      }
      const stagingKey = `staging/${randomUUID()}`;
      const [file] = await tx
        .insert(documentVersions)
        .values({
          documentId: record.id,
          versionNumber: record.currentVersionNumber + 1,
          stagingKey,
          fileName: input.fileName,
          contentType: input.contentType,
          uploadedByKind: "staff",
          uploadedById: command.session.actor.id,
          state: "uploading",
        })
        .returning();
      if (!file) throw new Error("Document version insert failed");
      await tx
        .update(documentVersions)
        .set({ state: "superseded", supersededByVersionId: file.id })
        .where(and(eq(documentVersions.documentId, record.id), ne(documentVersions.id, file.id)));
      await tx
        .update(documents)
        .set({ version: record.version + 1, currentVersionNumber: file.versionNumber })
        .where(eq(documents.id, record.id));
      const uploadId = await reserveUpload(
        tx,
        command.session.actor,
        "document",
        file.id,
        stagingKey,
      );
      await recordAudit(tx, {
        actor: command.session.actor,
        action: "document.case.upload.reserved",
        capability: "compliance.review",
        recordType: "document",
        recordId: record.id,
        operationId,
        payload: { caseId: command.caseId, versionId: file.id, purpose: record.purpose },
      });
      return { uploadId, documentId: record.id, versionId: file.id };
    },
  );
}

export async function listCaseDocuments(db: Executor, session: Session, caseId: string) {
  const record = await caseDocumentAccess(db, session, caseId);
  const found = await db
    .select({ document: documents, file: documentVersions })
    .from(documents)
    .innerJoin(
      documentVersions,
      and(
        eq(documentVersions.documentId, documents.id),
        eq(documentVersions.versionNumber, documents.currentVersionNumber),
      ),
    )
    .where(eq(documents.caseId, caseId))
    .orderBy(desc(documents.createdAt));
  const visible = [];
  for (const row of found) {
    try {
      await documentAccess(db, session, row.file.id);
      const [upload] = await db
        .select()
        .from(fileUploads)
        .where(eq(fileUploads.targetId, row.file.id));
      visible.push({
        ...row,
        upload,
        mayReview: await can(db, session.actor, "document.review", {
          type: "document",
          id: row.document.id,
          audience: "internal",
        }),
      });
    } catch (error) {
      if (!isAppError(error) || error.code !== "not_found") throw error;
    }
  }
  return {
    case: record,
    documents: visible,
    mayCreate:
      (await can(db, session.actor, "document.review")) &&
      (await can(db, session.actor, "document.read_restricted")),
  };
}
