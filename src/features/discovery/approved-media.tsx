"use client";

import Image from "next/image";
import { useState } from "react";
import type { PublicMedia } from "@/server/listings/view-models";

/** Only the eligibility-checked public route can resolve an approved derivative. */
export function approvedMediaHref(media: PublicMedia): string | null {
  if (!/^[a-f\d-]{36}$/i.test(media.assetId) || !/^[a-f\d]{64}$/i.test(media.digest)) return null;
  if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(media.contentType)) return null;
  return `/api/media/${media.assetId}/${media.digest}`;
}

export function ApprovedMedia({
  media,
  unavailable,
  priority = false,
}: {
  media: PublicMedia | null;
  unavailable: string;
  priority?: boolean;
}) {
  const source = media ? approvedMediaHref(media) : null;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const available = source && source !== failedSource;
  return (
    <figure className="min-w-0 space-y-2">
      <div className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-control bg-subtle text-center text-text-muted">
        {available ? (
          <Image
            src={source}
            alt={media?.alt ?? ""}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-contain"
            unoptimized
            loading={priority ? "eager" : "lazy"}
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
          <ApprovedMedia media={item} unavailable={unavailable} priority={index === 0} />
        </li>
      ))}
    </ul>
  );
}
