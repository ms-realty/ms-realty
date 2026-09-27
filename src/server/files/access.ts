import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { documents, documentVersions, listings, mediaAssets, mediaRelations } from "@/db/schema";
import { countActivePasskeys, staffPasskeyMinimum } from "../auth/passkeys";
import { requireFreshAuth, requireLiveSession, type Session } from "../auth/sessions";
import { can } from "../authz";
import type { Executor } from "../db";
import { caseDocumentPurposes } from "../documents/purposes";
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
  await fileSession(db, session, true);
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
  if (action !== "read" && row.file.versionNumber !== row.document.currentVersionNumber)
    throw new AppError("version_conflict");
  return row;
}

export async function targetAccess(db: Executor, session: Session, kind: FileKind, id: string) {
  return kind === "media"
    ? mediaAccess(db, session, id)
    : (await documentAccess(db, session, id, "upload")).file;
}
