"use client";

import { useState } from "react";
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

export function ApprovedMedia({
  media,
  unavailable,
  priority = false,
  sizes = "auto, 100vw",
}: {
  media: PublicMedia | null;
  unavailable: string;
  priority?: boolean;
  sizes?: string;
}) {
  const source = media ? approvedMediaHref(media) : null;
  const srcSet = media ? approvedMediaSrcSet(media) : undefined;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const available = source && source !== failedSource;
  return (
    <figure className="min-w-0 space-y-2">
      <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-control bg-subtle text-center text-text-muted">
        {available ? (
          // biome-ignore lint/performance/noImgElement: sealed responsive sources use the authorized digest route; Next's unoptimized Image discards srcset.
          <img
            src={source}
            srcSet={srcSet}
            alt={media?.alt ?? ""}
            width={media?.width ?? undefined}
            height={media?.height ?? undefined}
            sizes={srcSet ? (priority ? sizes.replace(/^auto,\s*/, "") : sizes) : undefined}
            className="absolute inset-0 size-full object-contain"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            onError={() => setFailedSource(source)}
          />
        ) : (
          <p className="p-5">{unavailable}</p>
        )}
      </div>
      {media?.caption || media?.modificationDisclosure ? (
        <figcaption className="space-y-1 text-caption text-text-muted">
          {media.caption ? <p>{media.caption}</p> : null}
          {media.modificationDisclosure ? <p>{media.modificationDisclosure}</p> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function ApprovedGallery({
  media,
  unavailable,
}: {
  media: readonly PublicMedia[];
  unavailable: string;
}) {
  if (!media.length) return <ApprovedMedia media={null} unavailable={unavailable} />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {media.map((item, index) => (
        <li key={item.relationId} className={index === 0 ? "sm:col-span-2" : undefined}>
          <ApprovedMedia
            media={item}
            unavailable={unavailable}
            priority={index === 0}
            sizes={
              index === 0
                ? "(min-width: 1440px) 896px, (min-width: 1024px) calc(66.667vw - 4rem), calc(100vw - 2.5rem)"
                : "auto, (min-width: 1440px) 440px, (min-width: 1024px) calc(33.333vw - 2.5rem), (min-width: 640px) calc(50vw - 1.75rem), calc(100vw - 2.5rem)"
            }
          />
        </li>
      ))}
    </ul>
  );
}
