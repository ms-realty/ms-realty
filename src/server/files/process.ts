import "server-only";
import { eq } from "drizzle-orm";
import { scanFirstMediaPolicy } from "@/config/tenant";
import { documents, documentVersions, mediaAssets } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { admissionAccepted } from "@/domain/media";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { assertCan } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { admissionRuleFor, reencodeAdmissionVersion, storeRenditions } from "../media/admission";
import { type FileKind, targetAccess } from "./access";
import type { FileServices } from "./config";
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
    // The brand's rule for this file (ADR 0016): an image may be admitted by re-encoding it,
    // a document always by the scanner. Without a policy the services scan first.
    const policy = services.mediaPolicy ?? scanFirstMediaPolicy;
    const rule = kind === "media" ? admissionRuleFor(file.contentType, policy) : "virus_scan";
    if (
      (kind === "document" || ("admission" in file && admissionAccepted(file, policy))) &&
      file.scan === "clean" &&
      file.scannedSha256 === file.sha256 &&
      file.scannerVersion &&
      file.scannedAt &&
      (kind === "document" || ("processing" in file && file.processing === "ready"))
    )
      return { state: "clean" as const, id };
    if (kind === "media" && "admission" in file && rule === "reencode")
      return admitByReencode(tx, services, actor, file);
    if (!services.scanner) {
      // Seal/receipt is not scan evidence. Keep quarantine and all download/review
      // gates intact, and acknowledge the staging job without repeated offline scans.
      await recordAudit(tx, {
        actor,
        action: "file.scan.deferred",
        recordType: kind,
        recordId: id,
        payload: { reason: "staging_scanner_disabled", sha256: file.sha256 },
      });
      return { state: "unverified" as const, id };
    }
    let scanState: "clean" | "infected" | "failed" = "failed";
    let scannerVersion: string | null = null;
    let scannedAt: Date | null = null;
    let scannedSha256: string | null = null;
    let output: Awaited<ReturnType<typeof storeRenditions>> | undefined;
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
      if (kind === "media" && scanState === "clean")
        output = await storeRenditions(services.storage, id, bytes);
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
          admission: "virus_scan",
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

/**
 * Admits an image by decoding it and writing fresh renditions (ADR 0016). The outcome is recorded
 * in the scan evidence for the exact sealed digest, named as a re-encode by `admission`; a file
 * that does not decode fails and stays quarantined. No scanner is consulted or claimed.
 */
async function admitByReencode(
  tx: Executor,
  services: FileServices,
  actor: Actor,
  file: typeof mediaAssets.$inferSelect,
) {
  let output: Awaited<ReturnType<typeof storeRenditions>> | undefined;
  try {
    if (!file.sealedKey) throw new AppError("transition_denied");
    const bytes = await services.storage.read(file.sealedKey);
    if (digestOf(bytes) !== file.sha256 || bytes.length !== file.byteSize)
      throw new AppError("unavailable");
    output = await storeRenditions(services.storage, file.id, bytes);
  } catch {
    output = undefined;
  }
  const state = output ? ("clean" as const) : ("failed" as const);
  const scannerVersion = reencodeAdmissionVersion();
  await tx
    .update(mediaAssets)
    .set({
      admission: "reencode",
      scan: state,
      scannerVersion,
      scannedAt: new Date(),
      scannedSha256: file.sha256,
      ...(output ?? {}),
      processing: output ? "ready" : "failed",
      review: "pending",
      reviewedById: null,
      version: file.version + 1,
    })
    .where(eq(mediaAssets.id, file.id));
  await recordAudit(tx, {
    actor,
    action: "file.scan.completed",
    recordType: "media",
    recordId: file.id,
    payload: { state, sha256: file.sha256, scannerVersion, admission: "reencode" },
  });
  return { state, id: file.id };
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
