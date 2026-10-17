"use client";

import Image from "next/image";
import { useState } from "react";
import type { PublicMedia } from "@/server/listings/view-models";
import { approvedMediaHref } from "./approved-media";

/** P15's photograph slot: only current eligible listing bytes, with a visible failure state. */
export function AreaPhotograph({
  media,
  unavailable,
}: {
  media: PublicMedia | null;
  unavailable: string;
}) {
  const source = media?.kind === "photo" ? approvedMediaHref(media) : null;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <div className="relative flex h-[220px] items-center justify-center overflow-hidden rounded-panel bg-subtle text-center text-caption text-text-muted lg:h-[320px]">
      {source && source !== failedSource ? (
        <Image
          src={source}
          alt={media?.alt ?? ""}
          fill
          sizes="(min-width: 1440px) 416px, (min-width: 1024px) 33vw, calc(100vw - 40px)"
          className="object-cover"
          unoptimized
          loading="eager"
          onError={() => setFailedSource(source)}
        />
      ) : (
        <p className="p-5">{unavailable}</p>
      )}
    </div>
  );
}
