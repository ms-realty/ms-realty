// C10/C11: explicit document grants, current versions, no inherited Case file access.
import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { documents, documentVersions } from "@/db/schema";
import { isDocumentExposable } from "@/domain/document";
import type { Session } from "../auth/sessions";
import { can, resolveGrants } from "../authz";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import { documentAccess, fileSession } from "../files/access";

async function clientSession(db: Executor, session: Session) {
  await fileSession(db, session, true);
  if (session.actor.kind !== "client") throw new AppError("not_found");
}

async function project(db: Executor, session: Session, versionId: string) {
  const { document, file } = await documentAccess(db, session, versionId);
  if (file.versionNumber !== document.currentVersionNumber) throw new AppError("not_found");
  const canDownload =
    isDocumentExposable(file.state, file.scan) &&
    Boolean(
      file.sealedKey &&
        file.sha256 &&
        file.scannedSha256 === file.sha256 &&
        file.scannerVersion &&
        file.scannedAt,
    );
  const downloadUnavailableReason = canDownload
    ? null
    : file.scan === "infected"
      ? ("unsafe" as const)
      : file.scan === "failed"
        ? ("scan_failed" as const)
        : file.scan === "pending"
          ? ("scan_pending" as const)
          : file.state === "needs_replacement"
            ? ("needs_replacement" as const)
            : ("unavailable" as const);
  return {
    id: document.id,
    reference: document.reference,
    purpose: document.purpose,
    classification: document.classification,
    expiresAt: document.expiresAt,
    caseId:
      document.caseId &&
      (await can(db, session.actor, "portal.case.read", { type: "case", id: document.caseId }))
        ? document.caseId
        : null,
    version: {
      id: file.id,
      number: file.versionNumber,
      fileName: file.fileName,
      contentType: file.contentType,
      byteSize: file.byteSize,
      state: file.state,
      scan: file.scan,
      reviewType: file.reviewType,
      professionalValidation: file.professionalValidation,
      canDownload,
      downloadUnavailableReason,
    },
  };
}

export type ClientDocument = Awaited<ReturnType<typeof project>>;

/** Requires a recent client authentication; callers handle step_up_required by sending
 * the client through /{locale}/access/reauth with a safe returnTo. No stale file metadata escapes. */
export async function listClientDocuments(
  db: Executor,
  session: Session,
): Promise<ClientDocument[]> {
  await clientSession(db, session);
  const grants = await resolveGrants(db, session.actor);
  const ids = [
    ...new Set(
      grants
        .filter(
          (grant) =>
            grant.capability === "portal.document.upload" && grant.scope?.recordType === "document",
        )
        .map((grant) => grant.scope?.recordId)
        .filter((id): id is string => z.uuid().safeParse(id).success),
    ),
  ];
  if (!ids.length) return [];
  const current = await db
    .select({ id: documentVersions.id })
    .from(documents)
    .innerJoin(
      documentVersions,
      and(
        eq(documentVersions.documentId, documents.id),
        eq(documentVersions.versionNumber, documents.currentVersionNumber),
      ),
    )
    .where(inArray(documents.id, ids))
    .orderBy(desc(documents.createdAt));
  const visible: ClientDocument[] = [];
  for (const row of current) {
    try {
      visible.push(await project(db, session, row.id));
    } catch (error) {
      if (!isAppError(error) || error.code !== "not_found") throw error;
    }
  }
  return visible;
}

export async function getClientDocument(
  db: Executor,
  session: Session,
  documentId: string,
): Promise<ClientDocument> {
  await clientSession(db, session);
  if (!z.uuid().safeParse(documentId).success) throw new AppError("not_found");
  const [current] = await db
    .select({ id: documentVersions.id })
    .from(documents)
    .innerJoin(
      documentVersions,
      and(
        eq(documentVersions.documentId, documents.id),
        eq(documentVersions.versionNumber, documents.currentVersionNumber),
      ),
    )
    .where(eq(documents.id, documentId));
  if (!current) throw new AppError("not_found");
  return project(db, session, current.id);
}
