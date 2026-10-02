import "server-only";
import { and, eq } from "drizzle-orm";
import {
  caseParticipants,
  documentRequests,
  documents,
  documentVersions,
  grants,
  principals,
} from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { can } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { caseDocumentPurposes } from "../documents/purposes";
import { AppError } from "../errors";
import { digestOf, type FileStorage } from "../files/storage";
import { type EmailFile, emailFile, emailFiles } from "./email-files-contract";
import { liveParticipation } from "./shared";

// A case membership is not permission to disclose another participant's documents.
// Only an explicitly granted, current requested document can become an email attachment.
export async function eligibleEmailFile(
  db: Executor,
  actor: Actor,
  caseId: string,
  partyId: string,
  versionId: string,
  lock = false,
) {
  const query = db
    .select({
      document: documents,
      file: documentVersions,
      request: documentRequests,
      recipient: principals,
      grant: grants,
      participant: caseParticipants,
    })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .innerJoin(documentRequests, eq(documentRequests.documentId, documents.id))
    .innerJoin(principals, eq(principals.id, documentRequests.recipientId))
    .innerJoin(grants, eq(grants.id, documentRequests.grantId))
    .innerJoin(caseParticipants, eq(caseParticipants.id, documentRequests.recipientParticipantId))
    .where(
      and(
        eq(documentVersions.id, versionId),
        eq(documents.caseId, caseId),
        eq(documentRequests.caseId, caseId),
        eq(caseParticipants.caseId, caseId),
        eq(caseParticipants.partyId, partyId),
        liveParticipation(),
      ),
    );
  const [row] = await (lock ? query.for("share") : query);
  if (!row) return null;
  const { document, file, request, recipient, grant } = row,
    now = new Date();
  if (
    document.audience !== "case_participants" ||
    (caseDocumentPurposes as readonly string[]).includes(document.purpose) ||
    (document.expiresAt && document.expiresAt <= now) ||
    file.versionNumber !== document.currentVersionNumber ||
    file.supersededByVersionId ||
    file.state !== "reviewed" ||
    file.reviewType !== "accepted_for_purpose" ||
    !file.reviewedAt ||
    !file.reviewedById ||
    request.reviewedVersionId !== file.id ||
    file.scan !== "clean" ||
    !file.sealedKey ||
    !file.sha256 ||
    file.scannedSha256 !== file.sha256 ||
    !file.scannerVersion ||
    !file.scannedAt ||
    request.cancelledAt ||
    request.expiresAt <= now ||
    recipient.kind !== "client" ||
    recipient.status !== "active" ||
    recipient.partyId !== partyId ||
    grant.principalId !== recipient.id ||
    grant.capability !== "portal.document.upload" ||
    grant.recordType !== "document" ||
    grant.recordId !== document.id ||
    grant.revokedAt ||
    (grant.expiresAt && grant.expiresAt <= now)
  )
    return null;
  // Freeze recipient grants against revocation during the provider handoff as well.
  if (lock)
    await db
      .select({ id: grants.id })
      .from(grants)
      .where(eq(grants.principalId, recipient.id))
      .orderBy(grants.id)
      .for("share");
  const resource = { type: "document", id: document.id, audience: document.audience };
  if (
    !(await can(db, actor, "document.read_restricted", resource)) ||
    !(await can(db, { kind: "client", id: recipient.id }, "portal.document.upload", resource)) ||
    !(await can(db, { kind: "client", id: recipient.id }, "portal.document.upload", {
      type: "case",
      id: caseId,
      audience: "case_participants",
    }))
  )
    return null;
  const parsed = emailFile.safeParse({
    kind: "document",
    documentId: document.id,
    versionId: file.id,
    requestId: request.id,
    recipientId: recipient.id,
    versionNumber: file.versionNumber,
    sha256: file.sha256,
    fileName: file.fileName,
    contentType: file.contentType,
    byteSize: file.byteSize,
  });
  return parsed.success ? { snapshot: parsed.data, sealedKey: file.sealedKey } : null;
}

export async function freezeEmailFiles(
  db: Executor,
  actor: Actor,
  caseId: string,
  partyId: string,
  versionIds: string[],
) {
  const snapshots: EmailFile[] = [];
  for (const id of [...versionIds].sort()) {
    const file = await eligibleEmailFile(db, actor, caseId, partyId, id, true);
    if (!file) throw new AppError("transition_denied");
    snapshots.push(file.snapshot);
  }
  const parsed = emailFiles.safeParse(snapshots);
  if (!parsed.success)
    throw new AppError("validation_failed", {
      fieldErrors: { documentVersionIds: ["Choose up to five files totalling at most 10 MiB"] },
    });
  return parsed.data;
}

export async function currentEmailFiles(
  db: Executor,
  actor: Actor,
  caseId: string,
  partyId: string,
  files: EmailFile[],
) {
  for (const snapshot of files) {
    const current = await eligibleEmailFile(db, actor, caseId, partyId, snapshot.versionId, true);
    if (!current || hashRequest(current.snapshot) !== hashRequest(snapshot)) return false;
  }
  return true;
}

export async function loadEmailFiles(
  db: Executor,
  storage: FileStorage,
  actor: Actor,
  caseId: string,
  partyId: string,
  files: EmailFile[],
) {
  const result = [];
  for (const snapshot of files) {
    const current = await eligibleEmailFile(db, actor, caseId, partyId, snapshot.versionId, true);
    if (!current || hashRequest(current.snapshot) !== hashRequest(snapshot))
      throw new AppError("transition_denied");
    const bytes = await storage.read(current.sealedKey, snapshot.byteSize);
    if (bytes.length !== snapshot.byteSize || digestOf(bytes) !== snapshot.sha256)
      throw new AppError("transition_denied");
    result.push({ versionId: snapshot.versionId, bytes });
  }
  return result;
}

export async function listEmailFiles(
  db: Executor,
  actor: Actor,
  caseId: string,
  partyIds: string[],
) {
  const candidates = await db
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(and(eq(documents.caseId, caseId), eq(documentVersions.state, "reviewed")))
    .orderBy(documentVersions.id)
    .limit(100);
  const result = [];
  for (const candidate of candidates) {
    for (const partyId of [...new Set(partyIds)]) {
      const file = await eligibleEmailFile(db, actor, caseId, partyId, candidate.id);
      if (file) {
        result.push({ ...file.snapshot, partyId });
        break;
      }
    }
  }
  return result;
}
