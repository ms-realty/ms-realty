"use client";

import { useState } from "react";
import type { PublicMedia } from "@/server/listings/view-models";
import { approvedMediaHref, approvedMediaSrcSet } from "./approved-media";

/** P15's photograph slot: only current eligible listing bytes, with a visible failure state. */
export function AreaPhotograph({
  media,
  unavailable,
}: {
  media: PublicMedia | null;
  unavailable: string;
}) {
  const source = media?.kind === "photo" ? approvedMediaHref(media) : null;
  const srcSet = media ? approvedMediaSrcSet(media) : undefined;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <div className="relative flex h-[220px] items-center justify-center overflow-hidden rounded-panel bg-subtle text-center text-caption text-text-muted lg:h-[320px]">
      {source && source !== failedSource ? (
        // biome-ignore lint/performance/noImgElement: these sizes already have sealed digests; optimizer requests lack gateway identity.
        <img
          src={source}
          srcSet={srcSet}
          alt={media?.alt ?? ""}
          width={media?.width ?? undefined}
          height={media?.height ?? undefined}
          sizes={
            srcSet
              ? "(min-width: 1440px) 416px, (min-width: 1024px) calc(33.333vw - 4rem), calc(100vw - 2.5rem)"
              : undefined
          }
          className="absolute inset-0 size-full object-cover"
          loading="eager"
          decoding="async"
          onError={() => setFailedSource(source)}
        />
      ) : (
        <p className="p-5">{unavailable}</p>
      )}
    </div>
  );
}
