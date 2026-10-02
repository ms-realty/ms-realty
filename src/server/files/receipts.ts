import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { fileUploads, operations } from "@/db/schema";
import { requireLiveSession, type Session } from "../auth/sessions";
import type { Executor } from "../db";
import { isAppError } from "../errors";
import { type FileKind, targetAccess } from "./access";

export const fileOperationTypes = [
  "media.review",
  "media.place",
  "document.review",
  "file.scan.request",
];
/** Query strings alone never establish a successful save. */
export async function fileReceipt(db: Executor, session: Session, value: unknown) {
  if (!z.uuid().safeParse(value).success) return null;
  await requireLiveSession(db, session);
  const id = value as string;
  const [receipt] = await db
    .select({ id: operations.id })
    .from(operations)
    .where(
      and(
        eq(operations.id, id),
        eq(operations.actorKind, session.actor.kind),
        eq(operations.actorId, session.actor.id),
        eq(operations.status, "succeeded"),
        inArray(operations.operationType, fileOperationTypes),
      ),
    );
  if (receipt) return receipt.id;
  const [upload] = await db
    .select()
    .from(fileUploads)
    .where(
      and(
        eq(fileUploads.id, id),
        eq(fileUploads.actorKind, session.actor.kind),
        eq(fileUploads.actorId, session.actor.id),
      ),
    );
  if (!upload?.completedAt) return null;
  try {
    await targetAccess(db, session, upload.targetType as FileKind, upload.targetId);
    return upload.id;
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") return null;
    throw error;
  }
}
