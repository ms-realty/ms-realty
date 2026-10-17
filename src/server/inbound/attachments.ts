import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  caseParticipants,
  documentVersions,
  inboundAttachmentImports,
  inboundEmails,
  parties,
} from "@/db/schema";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import { bumpCase, caseEvent, caseFor, liveParticipation } from "../cases/shared";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { caseDocumentAccess, startCaseDocumentUpload } from "../documents/case";
import { uploadInput } from "../documents/commands";
import { caseDocumentPurposes } from "../documents/purposes";
import { AppError } from "../errors";
import type { FileServices } from "../files/config";
import { inspectFile } from "../files/inspect";
import { finalizeUpload, receiveUpload, uploadAuthorization } from "../files/uploads";
import type { JobQueue } from "../jobs/queue";
import type { AttachmentProvider } from "../jobs/resend-attachment";
import type { ReceivedEmail } from "../jobs/resend-receiving";
import { runOperation } from "../operations";
import { parseInput, version } from "../work/shared";
import { readInboundEmail } from "./service";

export const attachmentImportScope = "inbound.attachment.import";
const inputSchema = z.object({
  operationId: z.string().min(16).max(160),
  id: z.uuid(),
  attachmentId: z.uuid(),
  caseId: z.uuid(),
  expectedVersion: z.int().positive(),
  caseVersion: z.int().positive(),
  fileName: uploadInput.shape.fileName,
  purpose: z.enum(caseDocumentPurposes),
  classification: uploadInput.shape.classification,
  reviewed: z.literal(true),
  reason: z.string().trim().min(10).max(500),
});
async function authority(db: Executor, session: Session, id: string, caseId: string) {
  const row = await readInboundEmail(db, session, id);
  if (row.state !== "assigned" || row.caseId !== caseId || !row.senderPartyId || !row.messageId)
    throw new AppError("not_found");
  const record = await caseDocumentAccess(db, session, caseId);
  for (const capability of ["document.read_restricted", "document.review"] as const)
    if (!(await can(db, session.actor, capability, { type: "document", audience: "internal" })))
      throw new AppError("not_found");
  return { row, record };
}
async function participant(db: Executor, row: typeof inboundEmails.$inferSelect, lock = false) {
  const query = db
    .select({ id: caseParticipants.id, merged: parties.mergedIntoPartyId })
    .from(caseParticipants)
    .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
    .where(
      and(
        eq(caseParticipants.caseId, row.caseId ?? ""),
        eq(caseParticipants.partyId, row.senderPartyId ?? ""),
        liveParticipation(),
      ),
    );
  const found = await (lock ? query.for("share") : query);
  if (!found.some((p) => !p.merged)) throw new AppError("transition_denied");
}
export async function readInboundAttachments(
  db: Executor,
  session: Session,
  id: string,
  caseId: string,
) {
  const context = await authority(db, session, id, caseId);
  const imports = await db
    .select({ link: inboundAttachmentImports, file: documentVersions })
    .from(inboundAttachmentImports)
    .innerJoin(
      documentVersions,
      eq(documentVersions.id, inboundAttachmentImports.documentVersionId),
    )
    .where(
      and(
        eq(inboundAttachmentImports.inboundEmailId, id),
        eq(inboundAttachmentImports.caseId, caseId),
      ),
    );
  return { ...context, imports };
}
export async function importInboundAttachment(
  db: Executor,
  session: Session,
  raw: unknown,
  services: { provider: AttachmentProvider; files: FileServices; queue: JobQueue },
) {
  const input = parseInput(inputSchema, raw);
  // Current authorization precedes receipt replay as well as provider access.
  const initial = await authority(db, session, input.id, input.caseId);
  return runOperation(
    db,
    {
      actor: session.actor,
      type: attachmentImportScope,
      idempotencyKey: input.operationId,
      requestHash: hashRequest(input),
    },
    async (ctx) => {
      const before = await authority(ctx.tx, session, input.id, input.caseId);
      if (before.record.disposition === "closed") throw new AppError("transition_denied");
      version(before.row, input.expectedVersion);
      version(before.record, input.caseVersion);
      await participant(ctx.tx, before.row);
      const selected = (before.row.attachments as ReceivedEmail["attachments"]).find(
        (a) => a.id === input.attachmentId,
      );
      if (!selected || before.row.provider !== services.provider.name)
        throw new AppError("validation_failed");
      let attachment: Awaited<ReturnType<AttachmentProvider["retrieveAttachment"]>>;
      try {
        attachment = await services.provider.retrieveAttachment(
          before.row.providerEmailId,
          selected.id,
        );
      } catch {
        throw new AppError("unavailable");
      }
      if (
        attachment.emailId !== before.row.providerEmailId ||
        attachment.id !== selected.id ||
        attachment.fileName !== selected.filename ||
        attachment.contentType !== selected.contentType ||
        (selected.size !== null && attachment.bytes.length !== selected.size)
      )
        throw new AppError("validation_failed");
      const measured = await inspectFile(attachment.bytes, "document");
      // Network work holds no Case/inbound row lock. Recheck identity, scope and source afterwards.
      const context = await caseFor(ctx.tx, session, input.caseId, "compliance.review", true);
      const [locked] = await ctx.tx
        .select()
        .from(inboundEmails)
        .where(eq(inboundEmails.id, input.id))
        .for("update");
      await authority(ctx.tx, session, input.id, input.caseId);
      if (
        !locked ||
        locked.sourceDigest !== initial.row.sourceDigest ||
        locked.sourceDigest !== before.row.sourceDigest
      )
        throw new AppError("version_conflict");
      version(locked, input.expectedVersion);
      version(context.row, input.caseVersion);
      if (context.row.disposition === "closed") throw new AppError("transition_denied");
      await participant(ctx.tx, locked, true);
      const [existing] = await ctx.tx
        .select()
        .from(inboundAttachmentImports)
        .where(
          and(
            eq(inboundAttachmentImports.inboundEmailId, input.id),
            eq(inboundAttachmentImports.attachmentId, input.attachmentId),
          ),
        );
      if (existing) throw new AppError("transition_denied");
      const reserved = await startCaseDocumentUpload(ctx.tx, {
        session,
        operationId: randomUUID(),
        caseId: input.caseId,
        expectedRevision: 0,
        input: {
          fileName: input.fileName,
          purpose: input.purpose,
          classification: input.classification,
          contentType: measured.contentType,
          payloadIdentity: hashRequest({
            sourceDigest: locked.sourceDigest,
            attachmentId: input.attachmentId,
          }),
        },
      });
      const { uploadId, documentId, versionId } = reserved.outcome;
      const upload = await uploadAuthorization(ctx.tx, session, uploadId);
      await receiveUpload(ctx.tx, services.files, session, {
        uploadId,
        token: upload.token,
        bytes: attachment.bytes,
      });
      const sealed = await finalizeUpload(
        ctx.tx,
        services.files,
        session,
        uploadId,
        services.queue,
      );
      await ctx.tx.insert(inboundAttachmentImports).values({
        inboundEmailId: locked.id,
        attachmentId: input.attachmentId,
        sourceDigest: locked.sourceDigest,
        caseId: input.caseId,
        senderPartyId: locked.senderPartyId as string,
        documentVersionId: versionId,
        sha256: sealed.sha256,
        importedById: session.actor.id,
        reason: input.reason,
      });
      await ctx.tx
        .update(inboundEmails)
        .set({ version: locked.version + 1 })
        .where(eq(inboundEmails.id, locked.id));
      await bumpCase(ctx.tx, context.row.id, context.row.version);
      await caseEvent(
        ctx,
        "case",
        input.caseId,
        "case.inbound_attachment_imported",
        "compliance.review",
        {
          inboundId: locked.id,
          attachmentId: input.attachmentId,
          documentId,
          versionId,
          sha256: sealed.sha256,
        },
      );
      return {
        id: locked.id,
        attachmentId: input.attachmentId,
        caseId: input.caseId,
        documentId,
        versionId,
        sha256: sealed.sha256,
      };
    },
  );
}
