// One-time carry-over of the old website's photos (ADR 0016). The legacy import recorded every
// gallery photo as a media asset holding only its legacy key, order and caption; this job brings
// the bytes into the system's own storage and admits them under the brand's media policy:
//
// - read the original from the legacy source by the asset's `original_key` (never written);
// - prove it is a real image by decoding it; store the original under a sealed, content-
//   addressed key and verify it by reading it back;
// - under "reencode": write the public renditions (the re-encode is the admission: only pixels
//   survive) and record the photo as processed, with the basis "carried over from the agency's
//   public site"; under "virus_scan": leave it sealed for the scanner, which admits it or not.
//
// The photo's placement, order (cover = first), caption and the human review stay as they are:
// usage rights are confirmed by the person who publishes (ADR 0012's attestation). A photo that
// is missing at the source, too large, not an image or fails to decode is left out and reported;
// it never blocks its listing. Idempotent and resumable: a finished photo is skipped, keys are
// derived from the asset and digest, and each photo commits in its own transaction.
import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { type MediaPolicy, mediaPolicy } from "@/config/tenant";
import { listings, mediaAssets, mediaRelations } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { admissionAccepted, reencodableContentTypes } from "@/domain/media";
import { recordAudit } from "../audit";
import { requireLiveSession, type Session } from "../auth/sessions";
import { can } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import type { FileServices } from "../files/config";
import { inspectFile } from "../files/inspect";
import { processFileWorker } from "../files/process";
import { digestOf } from "../files/storage";
import {
  admissionRuleFor,
  type Renditions,
  reencodeAdmissionVersion,
  renderRenditions,
  type StoredRenditions,
  writeRenditions,
} from "./admission";
import type { LegacyMediaSource } from "./legacy-source";

/** The recorded basis of every carried-over photo. */
export const carryOverBasis = "carried over from the agency's public site";

export const carryOverActor: Actor = { kind: "system", id: "media-carry-over" };
const scannerActor: Actor = { kind: "system", id: "file-scanner" };

export const carryOverOutcomes = [
  /** Stored, re-encoded and processed: ready for the person who publishes. */
  "admitted",
  /** Stored and sealed; the scanner has not admitted it (scanner-first policy). */
  "sealed_awaiting_scan",
  /** Finished by an earlier run. */
  "already_done",
  "missing_at_source",
  "too_large",
  "not_an_image",
  "decode_failed",
  /** The source or storage could not be reached; the next run tries again. */
  "unavailable",
] as const;
export type CarryOverOutcome = (typeof carryOverOutcomes)[number];

/** Outcomes that leave the photo out for good until its source changes. */
export const leftOutOutcomes: readonly CarryOverOutcome[] = [
  "missing_at_source",
  "too_large",
  "not_an_image",
  "decode_failed",
];

export interface CarryOverOptions {
  /** Only this listing's photos (e.g. `MS-00905`). */
  readonly reference?: string;
  /** At most this many photos that still need work. */
  readonly limit?: number;
  /** Read and decode only; write nothing. */
  readonly dryRun?: boolean;
  /** Photos in flight at once; each holds one original and its renditions in memory. */
  readonly concurrency?: number;
  readonly policy?: MediaPolicy;
  readonly actor?: Actor;
  readonly onPhoto?: (result: CarryOverPhotoResult) => void;
}

export interface CarryOverPhotoResult {
  readonly assetId: string;
  readonly key: string;
  readonly listings: readonly string[];
  readonly outcome: CarryOverOutcome;
  readonly bytesRead: number;
  readonly bytesWritten: number;
}

export interface CarryOverReport {
  readonly dryRun: boolean;
  readonly source: string;
  readonly policy: MediaPolicy["imageAdmission"];
  /** Legacy photos in scope, whatever their state. */
  readonly legacyPhotos: number;
  /** Of those, still waiting for bytes when the run started. */
  readonly candidates: number;
  /** Left for a later run by `limit`. */
  readonly remaining: number;
  readonly outcomes: Readonly<Record<CarryOverOutcome, number>>;
  readonly bytesRead: number;
  /** Originals and renditions written to the system's storage. */
  readonly bytesWritten: number;
  readonly leftOut: readonly {
    readonly key: string;
    readonly listings: readonly string[];
    readonly reason: CarryOverOutcome;
  }[];
  /** Listings in scope with at least one usable photo after the run, and those with none. */
  readonly listingsWithPhotos: number;
  readonly listingsWithoutPhotos: readonly string[];
  readonly wallMs: number;
}

type AssetRow = typeof mediaAssets.$inferSelect;

/** Image signatures the upload pipeline accepts; anything else is not an image here. */
function looksLikeImage(bytes: Buffer): boolean {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return true;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return true;
  return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

/** Legacy assets placed on a (non-removed) gallery relation, with their listing references. */
async function legacyAssets(db: Executor, reference?: string) {
  const rows = await db
    .select({
      id: mediaAssets.id,
      reference: listings.reference,
      position: mediaRelations.position,
    })
    .from(mediaAssets)
    .innerJoin(mediaRelations, eq(mediaRelations.mediaAssetId, mediaAssets.id))
    .innerJoin(listings, eq(listings.id, mediaRelations.listingId))
    .where(
      and(
        isNotNull(mediaAssets.legacyReference),
        isNull(mediaRelations.removedAt),
        reference ? eq(listings.reference, reference.trim().toUpperCase()) : undefined,
      ),
    )
    .orderBy(asc(listings.reference), asc(mediaRelations.position));
  const byAsset = new Map<string, string[]>();
  for (const row of rows) {
    const refs = byAsset.get(row.id) ?? [];
    if (!refs.includes(row.reference)) refs.push(row.reference);
    byAsset.set(row.id, refs);
  }
  return byAsset;
}

/** The asset is in the system's storage and counts under the policy (or awaits the scanner). */
function finished(asset: AssetRow, policy: MediaPolicy): boolean {
  if (!asset.sealedKey || !asset.sha256) return false;
  if (admissionRuleFor(asset.contentType, policy) === "virus_scan") return true;
  return asset.scan === "clean" && asset.processing === "ready" && admissionAccepted(asset, policy);
}

async function markLeftOut(
  db: Executor,
  actor: Actor,
  asset: AssetRow,
  reason: CarryOverOutcome,
  detail: Record<string, unknown> = {},
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, asset.id))
      .for("update");
    if (!row || row.sealedKey) return;
    await tx
      .update(mediaAssets)
      .set({ processing: "failed", version: row.version + 1 })
      .where(eq(mediaAssets.id, row.id));
    await recordAudit(tx, {
      actor,
      action: "media.carry_over.skipped",
      recordType: "media",
      recordId: row.id,
      payload: { reason, legacyKey: row.originalKey, ...detail },
    });
  });
}

async function carryOne(
  db: Executor,
  services: FileServices,
  source: LegacyMediaSource,
  assetId: string,
  options: Required<Pick<CarryOverOptions, "dryRun" | "policy" | "actor">>,
): Promise<{ outcome: CarryOverOutcome; bytesRead: number; bytesWritten: number }> {
  const { policy, actor, dryRun } = options;
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
  if (!asset || finished(asset, policy))
    return { outcome: "already_done", bytesRead: 0, bytesWritten: 0 };
  // A photo sealed earlier (a stopped run, or scanner-first before) keeps its own bytes.
  let read: Awaited<ReturnType<LegacyMediaSource["read"]>>;
  try {
    read = asset.sealedKey
      ? { state: "found", bytes: await services.storage.read(asset.sealedKey) }
      : await source.read(asset.originalKey);
  } catch {
    return { outcome: "unavailable", bytesRead: 0, bytesWritten: 0 };
  }
  if (read.state !== "found") {
    const outcome = read.state === "missing" ? "missing_at_source" : "too_large";
    if (!dryRun)
      await markLeftOut(
        db,
        actor,
        asset,
        outcome,
        read.state === "too_large" ? { byteSize: read.byteSize } : {},
      );
    return { outcome, bytesRead: 0, bytesWritten: 0 };
  }
  const bytes = read.bytes;
  if (!looksLikeImage(bytes)) {
    if (!dryRun) await markLeftOut(db, actor, asset, "not_an_image");
    return { outcome: "not_an_image", bytesRead: bytes.length, bytesWritten: 0 };
  }
  let measured: Awaited<ReturnType<typeof inspectFile>>;
  try {
    measured = await inspectFile(bytes, "media");
    if (!(reencodableContentTypes as readonly string[]).includes(measured.contentType))
      throw new Error("unsupported");
  } catch {
    if (!dryRun) await markLeftOut(db, actor, asset, "decode_failed");
    return { outcome: "decode_failed", bytesRead: bytes.length, bytesWritten: 0 };
  }
  const rule = admissionRuleFor(measured.contentType, policy);
  let variants: Renditions | undefined;
  if (rule === "reencode") {
    try {
      variants = await renderRenditions(bytes);
    } catch {
      if (!dryRun) await markLeftOut(db, actor, asset, "decode_failed");
      return { outcome: "decode_failed", bytesRead: bytes.length, bytesWritten: 0 };
    }
  }
  if (dryRun) {
    return {
      outcome: rule === "reencode" ? "admitted" : "sealed_awaiting_scan",
      bytesRead: bytes.length,
      bytesWritten: 0,
    };
  }

  const sha256 = digestOf(bytes);
  const sealedKey = asset.sealedKey ?? `sealed/${asset.id}/${sha256}`;
  let written = 0;
  let renditions: StoredRenditions | undefined;
  try {
    if (!asset.sealedKey) {
      await services.storage.writeImmutable(sealedKey, bytes, measured.contentType);
      const readback = await services.storage.read(sealedKey);
      if (readback.length !== bytes.length || digestOf(readback) !== sha256)
        return { outcome: "unavailable", bytesRead: bytes.length, bytesWritten: 0 };
      written += bytes.length;
    }
    if (variants) {
      renditions = await writeRenditions(services.storage, asset.id, variants);
      written += renditions.derivativeRenditions.reduce((sum, r) => sum + r.byteSize, 0);
    }
  } catch {
    return { outcome: "unavailable", bytesRead: bytes.length, bytesWritten: written };
  }

  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, asset.id))
      .for("update");
    if (!row || finished(row, policy)) return "already_done" as const;
    if (row.sealedKey && row.sha256 !== sha256) return "unavailable" as const;
    const now = new Date();
    await tx
      .update(mediaAssets)
      .set({
        sealedKey,
        sha256,
        byteSize: bytes.length,
        contentType: measured.contentType,
        width: measured.width,
        height: measured.height,
        ...(renditions
          ? {
              ...renditions,
              admission: "reencode" as const,
              scan: "clean" as const,
              scannerVersion: reencodeAdmissionVersion(),
              scannedAt: now,
              scannedSha256: sha256,
              processing: "ready" as const,
            }
          : {
              admission: "virus_scan" as const,
              scan: "pending" as const,
              scannerVersion: null,
              scannedAt: null,
              scannedSha256: null,
              processing: "pending" as const,
            }),
        // Waiting for the person who publishes: their attestation clears rights and review.
        review: row.review === "rejected" ? "rejected" : "pending",
        reviewedById: row.review === "rejected" ? row.reviewedById : null,
        version: row.version + 1,
      })
      .where(eq(mediaAssets.id, row.id));
    await recordAudit(tx, {
      actor,
      action: "media.carried_over",
      recordType: "media",
      recordId: row.id,
      payload: {
        basis: carryOverBasis,
        legacyKey: row.originalKey,
        legacyReference: row.legacyReference,
        sha256,
        byteSize: bytes.length,
        admission: renditions ? "reencode" : "virus_scan",
        renditions: renditions?.derivativeRenditions.map((r) => r.width) ?? [],
      },
    });
    return renditions ? ("admitted" as const) : ("sealed_awaiting_scan" as const);
  });
  if (outcome === "sealed_awaiting_scan" && services.scanner) {
    // Scanner-first: the scanner decides, exactly as for an upload. A failed scan stays sealed
    // and quarantined; the worker's queue (or the next run) asks again.
    try {
      const scanned = await processFileWorker(db, services, scannerActor, "media", asset.id);
      if (scanned.state === "clean")
        return { outcome: "admitted", bytesRead: bytes.length, bytesWritten: written };
    } catch {
      // Recorded by the scan path; the photo stays sealed and not admitted.
    }
  }
  return { outcome, bytesRead: bytes.length, bytesWritten: written };
}

/** Counts the usable photos per listing in scope after a run. */
async function listingPhotoCounts(db: Executor, policy: MediaPolicy, reference?: string) {
  const rows = await db
    .select({ reference: listings.reference, asset: mediaAssets })
    .from(listings)
    .leftJoin(
      mediaRelations,
      and(
        eq(mediaRelations.listingId, listings.id),
        isNull(mediaRelations.removedAt),
        eq(mediaRelations.hidden, false),
      ),
    )
    .leftJoin(mediaAssets, eq(mediaAssets.id, mediaRelations.mediaAssetId))
    .where(reference ? eq(listings.reference, reference.trim().toUpperCase()) : sql`true`);
  const counts = new Map<string, number>();
  for (const { reference: ref, asset } of rows) {
    const usable =
      asset?.sealedKey &&
      asset.scan === "clean" &&
      asset.processing === "ready" &&
      admissionAccepted(asset, policy) &&
      asset.review !== "rejected";
    counts.set(ref, (counts.get(ref) ?? 0) + (usable ? 1 : 0));
  }
  return counts;
}

export async function carryOverLegacyPhotos(
  db: Executor,
  services: FileServices,
  source: LegacyMediaSource,
  options: CarryOverOptions = {},
): Promise<CarryOverReport> {
  const started = Date.now();
  const policy = options.policy ?? services.mediaPolicy ?? mediaPolicy;
  const actor = options.actor ?? carryOverActor;
  const dryRun = options.dryRun ?? false;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 16));
  const placed = await legacyAssets(db, options.reference);
  const ids = [...placed.keys()];
  const pending = ids.length
    ? await db.select({ asset: mediaAssets }).from(mediaAssets).where(inArray(mediaAssets.id, ids))
    : [];
  const keyOf = new Map(pending.map(({ asset }) => [asset.id, asset.originalKey]));
  const unfinished = pending
    .filter(({ asset }) => !finished(asset, policy))
    .map(({ asset }) => asset.id)
    .sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
  const todo = unfinished.slice(0, options.limit ?? Number.POSITIVE_INFINITY);

  const outcomes = Object.fromEntries(carryOverOutcomes.map((o) => [o, 0])) as Record<
    CarryOverOutcome,
    number
  >;
  outcomes.already_done = ids.length - unfinished.length;
  const leftOut: CarryOverReport["leftOut"][number][] = [];
  let bytesRead = 0;
  let bytesWritten = 0;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const id = todo[next++];
      if (!id) return;
      const result = await carryOne(db, services, source, id, { dryRun, policy, actor });
      outcomes[result.outcome] += 1;
      bytesRead += result.bytesRead;
      bytesWritten += result.bytesWritten;
      const refs = placed.get(id) ?? [];
      const key = keyOf.get(id) ?? id;
      if (leftOutOutcomes.includes(result.outcome))
        leftOut.push({ key, listings: refs, reason: result.outcome });
      options.onPhoto?.({ assetId: id, key, listings: refs, ...result });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));

  const counts = await listingPhotoCounts(db, policy, options.reference);
  return {
    dryRun,
    source: source.label,
    policy: policy.imageAdmission,
    legacyPhotos: ids.length,
    candidates: todo.length,
    remaining: unfinished.length - todo.length,
    outcomes,
    bytesRead,
    bytesWritten,
    leftOut: leftOut.sort((a, b) => a.key.localeCompare(b.key)),
    listingsWithPhotos: [...counts.values()].filter((n) => n > 0).length,
    listingsWithoutPhotos: [...counts]
      .filter(([, n]) => n === 0)
      .map(([ref]) => ref)
      .sort(),
    wallMs: Date.now() - started,
  };
}

/**
 * The Publish screen's one thing to do when a listing's photos were never copied: the same
 * carry-over, limited to that listing, run as the staff member who may manage its media.
 */
export async function carryOverForListing(
  db: Executor,
  services: FileServices,
  source: LegacyMediaSource,
  session: Session,
  reference: string,
): Promise<CarryOverReport> {
  const live = await requireLiveSession(db, session);
  if (live.actor.kind !== "staff") throw new AppError("forbidden");
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.reference, reference.trim().toUpperCase()));
  if (!listing) throw new AppError("not_found");
  const resource = { type: "listing", id: listing.id, propertyId: listing.propertyId };
  if (!(await can(db, live.actor, "media.manage", resource))) throw new AppError("not_found");
  return carryOverLegacyPhotos(db, services, source, {
    reference: listing.reference,
    actor: live.actor,
    concurrency: 2,
  });
}
