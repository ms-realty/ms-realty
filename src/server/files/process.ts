import "server-only";
import { eq } from "drizzle-orm";
import { documents, documentVersions, mediaAssets } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { assertCan } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { type FileKind, targetAccess } from "./access";
import type { FileServices } from "./config";
import { derivative } from "./inspect";
import { digestOf } from "./storage";

async function process(
  db: Executor,
  services: FileServices,
  actor: Actor,
  kind: FileKind,
  id: string,
  session?: Session,
) {
  return db.transaction(async (tx) => {
    const [file] =
      kind === "media"
        ? await tx.select().from(mediaAssets).where(eq(mediaAssets.id, id)).for("update")
        : await tx.select().from(documentVersions).where(eq(documentVersions.id, id)).for("update");
    if (!file) throw new AppError("not_found");
    if (session) await targetAccess(tx, session, kind, id);
    else {
      if (actor.kind !== "system" || actor.id !== "file-scanner") throw new AppError("forbidden");
      await assertCan(tx, actor, kind === "media" ? "media.manage" : "document.review", {
        type: kind,
        id,
      });
    }
    if (kind === "document" && "documentId" in file) {
      const [document] = await tx.select().from(documents).where(eq(documents.id, file.documentId));
      if (
        !document ||
        document.currentVersionNumber !== file.versionNumber ||
        (document.expiresAt && document.expiresAt <= new Date())
      )
        throw new AppError("not_found");
    }
    if (!file.sealedKey || !file.sha256) throw new AppError("transition_denied");
    if (
      file.scan === "clean" &&
      file.scannedSha256 === file.sha256 &&
      file.scannerVersion &&
      file.scannedAt &&
      (kind === "document" || ("processing" in file && file.processing === "ready"))
    )
      return { state: "clean" as const, id };
    let scanState: "clean" | "infected" | "failed" = "failed";
    let scannerVersion: string | null = null;
    let scannedAt: Date | null = null;
    let scannedSha256: string | null = null;
    let output:
      | {
          derivativeKey: string;
          derivativeSha256: string;
          derivativeContentType: string;
          width: number;
          height: number;
        }
      | undefined;
    try {
      const bytes = await services.storage.read(file.sealedKey);
      if (digestOf(bytes) !== file.sha256 || bytes.length !== file.byteSize)
        throw new AppError("unavailable");
      const scan = await services.scanner.scan(bytes);
      // The service records only evidence for the exact immutable bytes it measured.
      if (
        scan.sha256 !== file.sha256 ||
        !scan.scannerVersion ||
        Math.abs(Date.now() - scan.scannedAt.getTime()) > 5 * 60_000
      )
        throw new AppError("unavailable");
      scanState = scan.state;
      scannerVersion = scan.scannerVersion;
      scannedAt = scan.scannedAt;
      scannedSha256 = scan.sha256;
      if (kind === "media" && scanState === "clean") {
        const safe = await derivative(bytes);
        const digest = digestOf(safe.bytes);
        const key = `derivatives/${id}/${digest}.webp`;
        await services.storage.writeImmutable(key, safe.bytes, "image/webp");
        if (digestOf(await services.storage.read(key)) !== digest)
          throw new AppError("unavailable");
        output = {
          derivativeKey: key,
          derivativeSha256: digest,
          derivativeContentType: "image/webp",
          width: safe.width,
          height: safe.height,
        };
      }
    } catch {
      scanState = "failed";
    }
    const evidence = {
      scan: scanState,
      scannerVersion,
      scannedAt,
      scannedSha256,
      version: file.version + 1,
    };
    if (kind === "media") {
      await tx
        .update(mediaAssets)
        .set({
          ...evidence,
          ...(output ?? {}),
          processing: scanState === "clean" && output ? "ready" : "failed",
          review: "pending",
          reviewedById: null,
        })
        .where(eq(mediaAssets.id, id));
    } else {
      await tx
        .update(documentVersions)
        .set({
          ...evidence,
          state:
            scanState === "clean"
              ? "ready_for_review"
              : scanState === "infected"
                ? "rejected"
                : "scanning",
          reviewType: null,
          reviewedById: null,
          reviewedAt: null,
        })
        .where(eq(documentVersions.id, id));
    }
    await recordAudit(tx, {
      actor,
      action: "file.scan.completed",
      recordType: kind,
      recordId: id,
      payload: { state: scanState, sha256: file.sha256, scannerVersion },
    });
    return { state: scanState, id };
  });
}

export async function processFile(
  db: Executor,
  services: FileServices,
  session: Session,
  kind: FileKind,
  id: string,
) {
  return process(db, services, session.actor, kind, id, session);
}
export async function processFileWorker(
  db: Executor,
  services: FileServices,
  actor: Actor,
  kind: FileKind,
  id: string,
) {
  const result = await process(db, services, actor, kind, id);
  // Persist the failed scan above, then ask the durable queue to retry the dependency.
  if (result.state === "failed") throw new AppError("unavailable");
  return result;
}
