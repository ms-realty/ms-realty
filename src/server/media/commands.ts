import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, fileUploads, listings, mediaAssets, mediaRelations } from "@/db/schema";
import { mediaModifications, moveRelation } from "@/domain/media";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { can } from "../authz";
import { hashRequest } from "../crypto";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { fileSession, mediaAccess } from "../files/access";
import { imageContentTypes } from "../files/inspect";
import { reserveUpload } from "../files/uploads";
import { runOperation } from "../operations";

const envelope = z.object({
  operationId: z.string().min(8).max(160),
  expectedRevision: z.int().nonnegative(),
});
export function parseFileInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new AppError("validation_failed", {
      fieldErrors: { form: parsed.error.issues.map((issue) => issue.message) },
    });
  return parsed.data;
}
export function expectVersion(actual: number, expected: number) {
  if (actual !== expected) throw new AppError("version_conflict", { current: { version: actual } });
}
async function managedListing(db: Executor, session: Session, reference: string, lock = false) {
  await fileSession(db, session);
  if (session.actor.kind !== "staff") throw new AppError("not_found");
  const query = db.select().from(listings).where(eq(listings.reference, reference.toUpperCase()));
  const [listing] = await (lock ? query.for("update") : query);
  if (
    !listing ||
    !(await can(db, session.actor, "media.manage", {
      type: "listing",
      id: listing.id,
      propertyId: listing.propertyId,
    }))
  )
    throw new AppError("not_found");
  return listing;
}
export interface FileCommand {
  session: Session;
  operationId: string;
  expectedRevision: number;
}

export async function startMediaUpload(
  db: Executor,
  command: FileCommand & { reference: string; input: unknown },
) {
  parseFileInput(envelope, command);
  const input = parseFileInput(
    z.object({
      kind: z.enum(["photo", "floor_plan", "render"]),
      contentType: z.enum(imageContentTypes),
      payloadIdentity: z.string().max(128),
    }),
    command.input,
  );
  await managedListing(db, command.session, command.reference);
  return runOperation(
    db,
    {
      actor: command.session.actor,
      type: "media.upload.start",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        input,
        reference: command.reference,
        expectedRevision: command.expectedRevision,
      }),
    },
    async ({ tx, operationId }) => {
      const listing = await managedListing(tx, command.session, command.reference, true);
      expectVersion(listing.version, command.expectedRevision);
      const stagingKey = `staging/${randomUUID()}`;
      const [asset] = await tx
        .insert(mediaAssets)
        .values({
          propertyId: listing.propertyId,
          purpose: input.kind === "floor_plan" ? "floor_plan" : "listing_gallery",
          kind: input.kind,
          originalKey: stagingKey,
          contentType: input.contentType,
        })
        .returning();
      if (!asset) throw new Error("Asset insert failed");
      const placements = await tx
        .select()
        .from(mediaRelations)
        .where(eq(mediaRelations.listingId, listing.id));
      await tx.insert(mediaRelations).values({
        listingId: listing.id,
        mediaAssetId: asset.id,
        position: Math.max(-1, ...placements.map((row) => row.position)) + 1,
      });
      const uploadId = await reserveUpload(
        tx,
        command.session.actor,
        "media",
        asset.id,
        stagingKey,
      );
      await tx
        .update(listings)
        .set({ version: listing.version + 1 })
        .where(eq(listings.id, listing.id));
      await recordAudit(tx, {
        actor: command.session.actor,
        action: "media.upload.reserved",
        recordType: "media",
        recordId: asset.id,
        operationId,
        payload: { listingId: listing.id },
      });
      return { uploadId, assetId: asset.id };
    },
  );
}

export async function mediaForListing(db: Executor, session: Session, reference: string) {
  const listing = await managedListing(db, session, reference);
  const rows = await db
    .select({ asset: mediaAssets, relation: mediaRelations })
    .from(mediaRelations)
    .innerJoin(mediaAssets, eq(mediaAssets.id, mediaRelations.mediaAssetId))
    .where(and(eq(mediaRelations.listingId, listing.id), isNull(mediaRelations.removedAt)))
    .orderBy(asc(mediaRelations.position));
  const assets = await Promise.all(
    rows.map(async (row) => {
      const [upload] = await db
        .select({
          id: fileUploads.id,
          completedAt: fileUploads.completedAt,
          expiresAt: fileUploads.expiresAt,
        })
        .from(fileUploads)
        .where(and(eq(fileUploads.targetType, "media"), eq(fileUploads.targetId, row.asset.id)));
      return { ...row, upload };
    }),
  );
  return { listing, assets };
}

/**
 * O13ORDERSAVED: the moved relation of an order change this actor saved on this listing.
 * Null for any other operation, including a hide/show placement, so a receipt id from the
 * query string never presents itself as a saved order.
 */
export async function placementReceipt(
  db: Executor,
  session: Session,
  listingId: string,
  operationId: string,
) {
  if (!z.uuid().safeParse(operationId).success) return null;
  const [event] = await db
    .select({ payload: auditEvents.payload })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.operationId, operationId),
        eq(auditEvents.action, "media.placement.changed"),
        eq(auditEvents.recordType, "listing"),
        eq(auditEvents.recordId, listingId),
        eq(auditEvents.actorKind, session.actor.kind),
        eq(auditEvents.actorId, session.actor.id),
      ),
    );
  const payload = event?.payload as { relationId?: unknown; move?: unknown } | undefined;
  return payload?.move && typeof payload.relationId === "string"
    ? { relationId: payload.relationId }
    : null;
}

export async function reviewMedia(
  db: Executor,
  command: FileCommand & { id: string; input: unknown },
) {
  parseFileInput(envelope, command);
  const input = parseFileInput(
    z
      .object({
        decision: z.enum(["approve", "reject"]),
        rightsHolder: z.string().trim().min(1).max(300),
        rightsReference: z.string().trim().min(1).max(1000),
        caption: z.string().trim().max(2000),
        altText: z.string().trim().min(1).max(1000),
        modification: z.enum(mediaModifications),
        modificationDisclosure: z.string().trim().max(2000),
        privacyReviewed: z.literal(true),
        rightsConfirmed: z.literal(true),
      })
      .refine((value) => value.modification === "none" || value.modificationDisclosure.length > 0, {
        message: "Describe the visible modification.",
      }),
    command.input,
  );
  await fileSession(db, command.session, true);
  await mediaAccess(db, command.session, command.id);
  return runOperation(
    db,
    {
      actor: command.session.actor,
      type: "media.review",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        id: command.id,
        input,
        expectedRevision: command.expectedRevision,
      }),
    },
    async ({ tx, operationId }) => {
      await fileSession(tx, command.session, true);
      const [asset] = await tx
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, command.id))
        .for("update");
      if (!asset) throw new AppError("not_found");
      await mediaAccess(tx, command.session, asset.id);
      expectVersion(asset.version, command.expectedRevision);
      if (
        input.decision === "approve" &&
        (!asset.sealedKey ||
          !asset.sha256 ||
          asset.scan !== "clean" ||
          asset.scannedSha256 !== asset.sha256 ||
          !asset.scannedAt ||
          !asset.scannerVersion ||
          asset.processing !== "ready" ||
          !asset.derivativeKey ||
          !asset.derivativeSha256)
      )
        throw new AppError("transition_denied");
      await tx
        .update(mediaAssets)
        .set({
          rights: input.decision === "approve" ? "cleared" : "rejected",
          rightsHolder: input.rightsHolder,
          rightsReference: input.rightsReference,
          caption: input.caption || null,
          altText: input.altText,
          modification: input.modification,
          modificationDisclosure: input.modificationDisclosure || null,
          audience: input.decision === "approve" ? "public_candidate" : "private",
          review: input.decision === "approve" ? "approved" : "rejected",
          reviewedById: command.session.actor.id,
          version: asset.version + 1,
        })
        .where(eq(mediaAssets.id, asset.id));
      await recordAudit(tx, {
        actor: command.session.actor,
        action: "media.reviewed",
        recordType: "media",
        recordId: asset.id,
        operationId,
        payload: {
          decision: input.decision,
          sha256: asset.sha256,
          derivativeSha256: asset.derivativeSha256,
          rightsReference: input.rightsReference,
          privacyReviewed: true,
        },
      });
      return { id: asset.id, version: asset.version + 1 };
    },
  );
}

export async function placeMedia(
  db: Executor,
  command: FileCommand & {
    reference: string;
    relationId: string;
    move?: { before: string } | { after: string };
    hidden?: boolean;
  },
) {
  parseFileInput(envelope, command);
  parseFileInput(
    z
      .object({
        relationId: z.uuid(),
        move: z.union([z.object({ before: z.uuid() }), z.object({ after: z.uuid() })]).optional(),
        hidden: z.boolean().optional(),
      })
      .refine((value) => Boolean(value.move) !== (value.hidden !== undefined)),
    command,
  );
  await managedListing(db, command.session, command.reference);
  return runOperation(
    db,
    {
      actor: command.session.actor,
      type: "media.place",
      idempotencyKey: command.operationId,
      requestHash: hashRequest({
        reference: command.reference,
        relationId: command.relationId,
        move: command.move,
        hidden: command.hidden,
        expectedRevision: command.expectedRevision,
      }),
    },
    async ({ tx, operationId }) => {
      const listing = await managedListing(tx, command.session, command.reference, true);
      expectVersion(listing.version, command.expectedRevision);
      const placements = await tx
        .select()
        .from(mediaRelations)
        .where(and(eq(mediaRelations.listingId, listing.id), isNull(mediaRelations.removedAt)));
      const relation = placements.find((row) => row.id === command.relationId);
      if (!relation) throw new AppError("not_found");
      if (command.move) {
        let moved: ReturnType<typeof moveRelation>;
        try {
          moved = moveRelation(
            placements.map((row) => ({ relationId: row.id, position: row.position })),
            relation.id,
            command.move,
          );
        } catch {
          throw new AppError("validation_failed");
        }
        for (const item of moved)
          await tx
            .update(mediaRelations)
            .set({ position: item.position })
            .where(eq(mediaRelations.id, item.relationId));
      } else
        await tx
          .update(mediaRelations)
          .set({ hidden: command.hidden })
          .where(eq(mediaRelations.id, relation.id));
      await tx
        .update(listings)
        .set({ version: listing.version + 1 })
        .where(eq(listings.id, listing.id));
      await recordAudit(tx, {
        actor: command.session.actor,
        action: "media.placement.changed",
        recordType: "listing",
        recordId: listing.id,
        operationId,
        payload: {
          relationId: relation.id,
          move: command.move ?? null,
          hidden: command.hidden ?? null,
        },
      });
      return { version: listing.version + 1 };
    },
  );
}
