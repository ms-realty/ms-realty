"use client";

import { useState } from "react";
import type { PublicMedia } from "@/server/listings/view-models";
import { approvedMediaHref, approvedMediaSrcSet } from "./approved-media-href";

export { approvedMediaHref, approvedMediaSrcSet };

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
            ref={(image) => {
              if (image?.complete && image.naturalWidth === 0) setFailedSource(source);
            }}
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
  morePhotos,
}: {
  media: readonly PublicMedia[];
  unavailable: string;
  morePhotos: string;
}) {
  if (!media.length) return <ApprovedMedia media={null} unavailable={unavailable} />;
  const [cover, ...remaining] = media;
  return (
    <div className="min-w-0 space-y-4">
      <ApprovedMedia
        media={cover ?? null}
        unavailable={unavailable}
        priority
        sizes="(min-width: 1440px) 896px, (min-width: 1024px) calc(66.667vw - 4rem), calc(100vw - 2.5rem)"
      />
      {remaining.length ? (
        <details>
          <summary className="min-h-control cursor-pointer py-3 font-semibold underline underline-offset-4">
            {morePhotos.replace("{count}", String(remaining.length))}
          </summary>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {remaining.map((item) => (
              <li key={item.relationId} className="min-w-0">
                <ApprovedMedia
                  media={item}
                  unavailable={unavailable}
                  sizes="auto, (min-width: 1440px) 440px, (min-width: 1024px) calc(33.333vw - 2.5rem), (min-width: 640px) calc(50vw - 1.75rem), calc(100vw - 2.5rem)"
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
