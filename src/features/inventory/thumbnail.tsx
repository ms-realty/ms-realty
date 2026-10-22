"use client";
import { useState } from "react";
import { cx } from "@/ui/cx";
import { NoPhotoIcon } from "@/ui/icons";

export function PrivateMediaPreview({
  source,
  alt,
  unavailable,
  className,
}: {
  source?: string;
  alt: string;
  unavailable: string;
  className: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return source && failed !== source ? (
    // biome-ignore lint/performance/noImgElement: Authenticated previews must bypass shared optimizers.
    <img
      src={source}
      alt={alt}
      className={cx("w-full rounded-control object-contain", className)}
      ref={(image) => {
        if (image?.complete && !image.naturalWidth) setFailed(source);
      }}
      onError={() => setFailed(source)}
    />
  ) : (
    <span
      role="img"
      aria-label={unavailable}
      className={cx(
        "flex w-full items-center justify-center rounded-control bg-subtle text-text-muted",
        className,
      )}
    >
      <NoPhotoIcon className="size-8" />
    </span>
  );
}

/** Only the server's capability-scoped safe preview is requested; originals stay private. */
export function InventoryThumbnail({ source, label }: { source?: string; label: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="flex aspect-4/3 w-20 shrink-0 items-center justify-center overflow-hidden rounded-control border border-divider bg-subtle text-text-muted sm:w-28">
      {source && failed !== source ? (
        // biome-ignore lint/performance/noImgElement: Authenticated previews must bypass shared optimizers.
        <img
          src={source}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          ref={(image) => {
            if (image?.complete && !image.naturalWidth) setFailed(source);
          }}
          onError={() => setFailed(source)}
        />
      ) : (
        <NoPhotoIcon aria-label={label} className="size-6" />
      )}
    </span>
  );
}
