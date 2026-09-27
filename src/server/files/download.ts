import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import {
  currentPublications,
  listings,
  localizedRevisions,
  mediaAssets,
  publicationManifests,
  sellerInstructions,
} from "@/db/schema";
import { isDocumentExposable } from "@/domain/document";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { mediaAssetEligible } from "../media/eligibility";
import { currentSellerEvidence } from "../publication/seller-evidence";
import { documentAccess, type FileKind, mediaAccess } from "./access";
import type { FileStorage } from "./storage";
import { digestOf } from "./storage";

export interface FileDownload {
  bytes: Buffer;
  contentType: string;
  fileName: string;
  inline: boolean;
}
async function verified(storage: FileStorage, key: string, digest: string) {
  const bytes = await storage.read(key);
  if (digestOf(bytes) !== digest) throw new AppError("not_found");
  return bytes;
}

export async function privateDownload(
  db: Executor,
  storage: FileStorage,
  session: Session,
  kind: FileKind,
  id: string,
  preview = false,
): Promise<FileDownload> {
  let file: FileDownload;
  if (kind === "media") {
    const asset = await mediaAccess(db, session, id);
    if (
      !asset.sealedKey ||
      !asset.sha256 ||
      asset.scan !== "clean" ||
      asset.scannedSha256 !== asset.sha256 ||
      !asset.scannedAt ||
      !asset.scannerVersion
    )
      throw new AppError("not_found");
    if (preview) {
      if (!asset.derivativeKey || !asset.derivativeSha256 || asset.processing !== "ready")
        throw new AppError("not_found");
      file = {
        bytes: await verified(storage, asset.derivativeKey, asset.derivativeSha256),
        contentType: "image/webp",
        fileName: "preview.webp",
        inline: true,
      };
    } else
      file = {
        bytes: await verified(storage, asset.sealedKey, asset.sha256),
        contentType: asset.contentType,
        fileName: `media-${id}`,
        inline: false,
      };
  } else {
    const { file: version } = await documentAccess(db, session, id);
    if (
      !isDocumentExposable(version.state, version.scan) ||
      !version.sealedKey ||
      !version.sha256 ||
      version.scannedSha256 !== version.sha256 ||
      !version.scannedAt ||
      !version.scannerVersion
    )
      throw new AppError("not_found");
    file = {
      bytes: await verified(storage, version.sealedKey, version.sha256),
      contentType: version.contentType,
      fileName: version.fileName,
      inline: false,
    };
  }
  await recordAudit(db, {
    actor: session.actor,
    action: "file.downloaded",
    recordType: kind,
    recordId: id,
    payload: { rendition: preview ? "safe_preview" : "original" },
  });
  return file;
}

export async function publicMediaDownload(
  db: Executor,
  storage: FileStorage,
  id: string,
  digest: string,
): Promise<FileDownload> {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id));
  if (
    !asset ||
    !mediaAssetEligible(asset) ||
    asset.derivativeSha256 !== digest ||
    !asset.derivativeKey
  )
    throw new AppError("not_found");
  const manifests = await db
    .select({ media: publicationManifests.media })
    .from(currentPublications)
    .innerJoin(
      publicationManifests,
      and(
        eq(publicationManifests.id, currentPublications.manifestId),
        eq(publicationManifests.generation, currentPublications.generation),
      ),
    )
    .innerJoin(
      listings,
      and(
        eq(listings.id, currentPublications.listingId),
        eq(listings.publicationGeneration, currentPublications.generation),
      ),
    )
    .innerJoin(
      sellerInstructions,
      sql`${sellerInstructions.id}::text = ${publicationManifests.decisions}->>'sellerInstruction'`,
    )
    .leftJoin(
      localizedRevisions,
      eq(localizedRevisions.id, publicationManifests.localizedRevisionId),
    )
    .where(
      and(
        eq(currentPublications.state, "active"),
        eq(currentPublications.destination, "website"),
        currentSellerEvidence(undefined, listings.id),
        or(
          isNull(publicationManifests.localizedRevisionId),
          eq(localizedRevisions.state, "approved_for_source"),
        ),
        sql`${publicationManifests.media} @> ${JSON.stringify([{ assetId: id }])}::jsonb`,
      ),
    );
  const included = manifests.some(
    ({ media }) =>
      Array.isArray(media) &&
      media.some(
        (item: Record<string, unknown>) =>
          item.assetId === asset.id &&
          item.sha256 === asset.sha256 &&
          item.derivativeKey === asset.derivativeKey &&
          item.derivativeSha256 === digest &&
          item.derivativeContentType === "image/webp" &&
          item.rightsReference === asset.rightsReference,
      ),
  );
  if (!included) throw new AppError("not_found");
  return {
    bytes: await verified(storage, asset.derivativeKey, digest),
    contentType: "image/webp",
    fileName: `${id}.webp`,
    inline: true,
  };
}

/** Authorization happens before this helper, for every range as well as full requests. */
export function downloadResponse(file: FileDownload, range: string | null): Response {
  const headers = new Headers({
    "content-type": file.contentType,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "accept-ranges": "bytes",
    "content-disposition": `${file.inline ? "inline" : "attachment"}; filename="download"; filename*=UTF-8''${encodeURIComponent(file.fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
  });
  let start = 0;
  let end = file.bytes.length - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: {
          ...Object.fromEntries(headers),
          "content-range": `bytes */${file.bytes.length}`,
        },
      });
    if (!match[1]) start = Math.max(0, file.bytes.length - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= file.bytes.length
    )
      return new Response(null, {
        status: 416,
        headers: {
          ...Object.fromEntries(headers),
          "content-range": `bytes */${file.bytes.length}`,
        },
      });
    headers.set("content-range", `bytes ${start}-${end}/${file.bytes.length}`);
  }
  headers.set("content-length", String(end - start + 1));
  return new Response(new Uint8Array(file.bytes.subarray(start, end + 1)), {
    status: range ? 206 : 200,
    headers,
  });
}
