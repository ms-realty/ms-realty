// A disclosure supplement reuses an existing purpose-reviewed private file, never a new
// download grant. Restricted compliance documents and unrestricted case files are ineligible.
import "server-only";
import { and, eq } from "drizzle-orm";
import { caseParticipants, documentRequests, grants } from "@/db/schema";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import { liveParticipation } from "../cases/shared";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { documentAccess } from "../files/access";
import { privateDownload } from "../files/download";
import type { FileStorage } from "../files/storage";

export interface DisclosureSupplementSource {
  versionId: string;
  documentVersion: number;
  fileVersion: number;
  sha256: string;
  byteSize: number;
  requestVersion: number;
}
export interface DisclosureSupplement {
  category:
    | "private_files"
    | "joint_records_and_received_communications"
    | "restricted_material_and_security_credentials";
  source: DisclosureSupplementSource;
  contentType: string;
  fileName: string;
  bytesBase64: string;
}
const noteFor = (requestId: string) => `privacy-export:${requestId}`;

export async function collectDisclosureSupplement(
  db: Executor,
  storage: FileStorage,
  session: Session,
  subject: { requestId: string; partyId: string; recipientId: string },
  versionId: string,
): Promise<Omit<DisclosureSupplement, "category">> {
  const row = await documentAccess(db, session, versionId);
  if (
    row.document.purpose !== "client_requested" ||
    row.document.classification !== "other" ||
    row.document.audience !== "case_participants" ||
    row.file.versionNumber !== row.document.currentVersionNumber ||
    row.file.state !== "reviewed" ||
    row.file.reviewType !== "accepted_for_purpose" ||
    !row.file.reviewedAt ||
    row.file.reviewNote !== noteFor(subject.requestId) ||
    !row.file.sha256 ||
    !row.file.byteSize ||
    row.file.byteSize > 512 * 1024
  )
    throw new AppError("not_found");
  const [request] = await db
    .select()
    .from(documentRequests)
    .where(
      and(
        eq(documentRequests.documentId, row.document.id),
        eq(documentRequests.recipientId, subject.recipientId),
      ),
    );
  const now = new Date();
  if (!request || request.cancelledAt || request.expiresAt <= now) throw new AppError("not_found");
  const [participant] = await db
    .select({ id: caseParticipants.id })
    .from(caseParticipants)
    .where(
      and(
        eq(caseParticipants.id, request.recipientParticipantId),
        eq(caseParticipants.caseId, request.caseId),
        eq(caseParticipants.partyId, subject.partyId),
        liveParticipation(now),
      ),
    );
  const [grant] = await db.select().from(grants).where(eq(grants.id, request.grantId));
  const actor = { kind: "client" as const, id: subject.recipientId };
  if (
    !participant ||
    !grant ||
    grant.principalId !== subject.recipientId ||
    grant.capability !== "portal.document.upload" ||
    grant.recordType !== "document" ||
    grant.recordId !== row.document.id ||
    grant.revokedAt ||
    (grant.expiresAt && grant.expiresAt <= now) ||
    !(await can(db, actor, "portal.document.upload", {
      type: "document",
      id: row.document.id,
      audience: row.document.audience,
    })) ||
    !(await can(db, actor, "portal.document.upload", {
      type: "case",
      id: request.caseId,
      audience: "case_participants",
    }))
  )
    throw new AppError("not_found");
  const file = await privateDownload(db, storage, session, "document", versionId);
  if (file.bytes.length !== row.file.byteSize) throw new AppError("not_found");
  return {
    source: {
      versionId,
      documentVersion: row.document.version,
      fileVersion: row.file.version,
      sha256: row.file.sha256,
      byteSize: file.bytes.length,
      requestVersion: request.version,
    },
    contentType: file.contentType,
    fileName: "reviewed-redacted-supplement",
    bytesBase64: file.bytes.toString("base64"),
  };
}

export async function verifyDeliveredSupplement(
  db: Executor,
  session: Session,
  requestId: string,
  source: DisclosureSupplementSource,
) {
  const row = await documentAccess(db, session, source.versionId);
  const [request] = await db
    .select({ version: documentRequests.version })
    .from(documentRequests)
    .where(eq(documentRequests.documentId, row.document.id));
  if (
    row.document.purpose !== "client_requested" ||
    row.document.classification !== "other" ||
    row.document.version !== source.documentVersion ||
    row.file.version !== source.fileVersion ||
    row.file.versionNumber !== row.document.currentVersionNumber ||
    row.file.state !== "reviewed" ||
    row.file.reviewType !== "accepted_for_purpose" ||
    row.file.reviewNote !== noteFor(requestId) ||
    row.file.sha256 !== source.sha256 ||
    row.file.byteSize !== source.byteSize ||
    request?.version !== source.requestVersion
  )
    throw new AppError("not_found");
}
