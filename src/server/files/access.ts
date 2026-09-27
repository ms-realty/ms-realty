import "server-only";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import {
  caseParticipants,
  documents,
  documentVersions,
  listings,
  mediaAssets,
  mediaRelations,
  principals,
} from "@/db/schema";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { requireFreshAuth, requireLiveSession, type Session } from "../auth/sessions";
import { can } from "../authz";
import type { Executor } from "../db";
import { caseDocumentPurposes } from "../documents/purposes";
import { assertRequestedDocumentAccess } from "../documents/request-access";
import { AppError } from "../errors";

export type FileKind = "media" | "document";
export async function fileSession(db: Executor, session: Session, fresh = false): Promise<Session> {
  const live = await requireLiveSession(db, session);
  if (
    live.actor.kind === "staff" &&
    (await countActivePasskeys(db, live.actor.id)) < staffPasskeyMinimum
  )
    throw new AppError("forbidden");
  if (fresh) requireFreshAuth(live);
  return live;
}

export async function mediaAccess(db: Executor, session: Session, id: string) {
  await fileSession(db, session);
  if (session.actor.kind !== "staff") throw new AppError("not_found");
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
  if (!asset) throw new AppError("not_found");
  const placements = await db
    .select({ listing: listings })
    .from(mediaRelations)
    .innerJoin(listings, eq(listings.id, mediaRelations.listingId))
    .where(and(eq(mediaRelations.mediaAssetId, id), isNull(mediaRelations.removedAt)));
  for (const { listing } of placements) {
    if (
      await can(db, session.actor, "media.manage", {
        type: "listing",
        id: listing.id,
        propertyId: listing.propertyId,
      })
    )
      return asset;
  }
  throw new AppError("not_found");
}

export async function documentAccess(
  db: Executor,
  session: Session,
  versionId: string,
  action: "read" | "upload" | "review" = "read",
) {
  session = await fileSession(db, session, true);
  const [row] = await db
    .select({ document: documents, file: documentVersions })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(eq(documentVersions.id, versionId));
  if (!row || (row.document.expiresAt && row.document.expiresAt <= new Date()))
    throw new AppError("not_found");
  if ((caseDocumentPurposes as readonly string[]).includes(row.document.purpose)) {
    if (
      session.actor.kind !== "staff" ||
      row.document.audience !== "internal" ||
      !row.document.caseId ||
      !(await can(db, session.actor, "compliance.review", {
        type: "case",
        id: row.document.caseId,
        audience: "internal",
      })) ||
      !(await can(db, session.actor, "case.read", {
        type: "case",
        id: row.document.caseId,
        audience: "internal",
      }))
    )
      throw new AppError("not_found");
  }
  // General case/property access must never inherit another participant's documents.
  const resource = { type: "document", id: row.document.id, audience: row.document.audience };
  const capability =
    session.actor.kind === "staff"
      ? action === "review"
        ? "document.review"
        : "document.read_restricted"
      : "portal.document.upload";
  if (action === "review" && session.actor.kind !== "staff") throw new AppError("not_found");
  if (!(await can(db, session.actor, capability, resource))) throw new AppError("not_found");
  if (session.actor.kind === "client" && row.document.caseId) {
    const now = new Date();
    const [participation] = await db
      .select({ id: caseParticipants.id })
      .from(caseParticipants)
      .innerJoin(principals, eq(principals.partyId, caseParticipants.partyId))
      .where(
        and(
          eq(principals.id, session.actor.id),
          eq(caseParticipants.caseId, row.document.caseId),
          isNull(caseParticipants.revokedAt),
          lte(caseParticipants.validFrom, now),
          or(isNull(caseParticipants.expiresAt), gt(caseParticipants.expiresAt, now)),
          sql`(${caseParticipants.role} <> 'specialist' or ${caseParticipants.expiresAt} is not null)`,
        ),
      )
      .limit(1);
    if (!participation) throw new AppError("not_found");
  }
  if (action !== "read" && row.file.versionNumber !== row.document.currentVersionNumber)
    throw new AppError("version_conflict");
  await assertRequestedDocumentAccess(db, session, row.document.id, action);
  return row;
}

export async function targetAccess(db: Executor, session: Session, kind: FileKind, id: string) {
  return kind === "media"
    ? mediaAccess(db, session, id)
    : (await documentAccess(db, session, id, "upload")).file;
}
