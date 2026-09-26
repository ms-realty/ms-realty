// Public media renditions (spec F03, P06, §18.1, A54, AD12). Only an asset in the public
// storage area whose rights are cleared, review approved and any modification disclosed ever
// gets a URL; everything else stays in private staging and is never returned.
import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { listingVersionMedia, mediaAssets } from "@/db/schema";
import {
  isMediaPublishable,
  type MediaKind,
  type MediaModification,
  type MediaReviewState,
  type MediaRightsState,
  type MediaStorageArea,
} from "@/domain/media";
import { getEnv } from "../config/env";
import type { Executor } from "../db";

export interface PublicMedia {
  readonly id: string;
  readonly kind: MediaKind;
  readonly url: string;
  readonly contentType: string;
  /** Null when never recorded; unknown is not zero. */
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string | null;
  readonly caption: string | null;
  readonly modification: MediaModification;
  /** Shown next to modified media (renders, virtual staging, redrawn plans). */
  readonly modificationDisclosure: string | null;
  readonly position: number;
}

export interface MediaEligibility {
  readonly storageArea: MediaStorageArea;
  readonly rights: MediaRightsState;
  readonly review: MediaReviewState;
  readonly modification: MediaModification;
  readonly modificationDisclosure: string | null;
}

export function isPubliclyServable(asset: MediaEligibility): boolean {
  return (
    asset.storageArea === "public" &&
    isMediaPublishable({
      rights: asset.rights,
      review: asset.review,
      modification: asset.modification,
      ...(asset.modificationDisclosure
        ? { modificationDisclosure: asset.modificationDisclosure }
        : {}),
    })
  );
}

/**
 * The public URL of a servable asset's object key, or null when it is not servable or no
 * public base URL is configured.
 */
export function publicMediaUrl(
  asset: MediaEligibility & { readonly r2Key: string },
  baseUrl: string | undefined = getEnv().mediaPublicBaseUrl,
): string | null {
  if (!baseUrl || !isPubliclyServable(asset)) return null;
  const path = asset.r2Key.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return path ? `${baseUrl}/${path}` : null;
}

/** Servable media of each listing version, in gallery order. */
export async function loadPublicMedia(
  db: Executor,
  listingVersionIds: readonly string[],
  baseUrl: string | undefined = getEnv().mediaPublicBaseUrl,
): Promise<Map<string, PublicMedia[]>> {
  const byVersion = new Map<string, PublicMedia[]>();
  if (listingVersionIds.length === 0 || !baseUrl) return byVersion;
  const rows = await db
    .select({
      versionId: listingVersionMedia.listingVersionId,
      position: listingVersionMedia.position,
      asset: mediaAssets,
    })
    .from(listingVersionMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, listingVersionMedia.mediaAssetId))
    .where(
      and(
        inArray(listingVersionMedia.listingVersionId, [...listingVersionIds]),
        eq(mediaAssets.storageArea, "public"),
        eq(mediaAssets.rights, "cleared"),
        eq(mediaAssets.review, "approved"),
      ),
    )
    .orderBy(asc(listingVersionMedia.position));
  for (const { versionId, position, asset } of rows) {
    const url = publicMediaUrl(asset, baseUrl);
    if (!url) continue;
    const list = byVersion.get(versionId) ?? [];
    list.push({
      id: asset.id,
      kind: asset.kind,
      url,
      contentType: asset.contentType,
      width: asset.width,
      height: asset.height,
      alt: asset.altText,
      caption: asset.caption,
      modification: asset.modification,
      modificationDisclosure: asset.modificationDisclosure,
      position,
    });
    byVersion.set(versionId, list);
  }
  return byVersion;
}
