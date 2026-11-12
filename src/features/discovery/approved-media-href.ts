// Pure helpers shared by server and client photo components.
import type { PublicMedia } from "@/server/listings/view-models";

/** Only the eligibility-checked public route can resolve an approved derivative. */
export function approvedMediaHref(media: PublicMedia): string | null {
  if (!/^[a-f\d-]{36}$/i.test(media.assetId) || !/^[a-f\d]{64}$/i.test(media.digest)) return null;
  if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(media.contentType)) return null;
  return `/api/media/${media.assetId}/${media.digest}`;
}

/** Width descriptors come from sealed publication metadata, never guessed query parameters. */
export function approvedMediaSrcSet(media: PublicMedia): string | undefined {
  if (!media.renditions?.length || !approvedMediaHref(media)) return undefined;
  const widths = new Set<number>();
  const sources: string[] = [];
  for (const rendition of [...media.renditions].sort((a, b) => a.width - b.width)) {
    const href = approvedMediaHref({ ...media, digest: rendition.digest });
    if (
      !href ||
      !Number.isSafeInteger(rendition.width) ||
      rendition.width < 1 ||
      rendition.width > 2400 ||
      !Number.isSafeInteger(rendition.height) ||
      rendition.height < 1 ||
      rendition.height > 2400 ||
      widths.has(rendition.width)
    )
      return undefined;
    widths.add(rendition.width);
    sources.push(`${href} ${rendition.width}w`);
  }
  return sources.join(", ");
}
