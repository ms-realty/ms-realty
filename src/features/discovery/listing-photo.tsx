// A listing photograph that fills its frame: the parent fixes the ratio, the image covers it
// (no letterboxing), and the sealed renditions give the browser a responsive `srcset`. Server-
// renderable on purpose: cards and the listing page need no client code to show a photo.

import type { PublicMedia } from "@/server/listings/view-models";
import { cx } from "@/ui/cx";
import { NoPhotoIcon } from "@/ui/icons";
import { approvedMediaHref, approvedMediaSrcSet } from "./approved-media-href";

export function ListingPhoto({
  media,
  alt,
  sizes,
  priority = false,
  unavailable,
  className,
}: {
  media: PublicMedia | null | undefined;
  /** The photo's approved description, else the listing title. */
  alt: string;
  sizes: string;
  /** Above the fold: load eagerly with high priority. */
  priority?: boolean;
  /** Shown in place of a missing photo. */
  unavailable: string;
  className?: string;
}) {
  const source = media ? approvedMediaHref(media) : null;
  if (!media || !source)
    return (
      <div
        className={cx(
          "flex size-full flex-col items-center justify-center gap-2 bg-subtle p-4 text-center text-caption text-text-muted",
          className,
        )}
      >
        <NoPhotoIcon className="size-6" />
        <span>{unavailable}</span>
      </div>
    );
  const srcSet = approvedMediaSrcSet(media);
  return (
    // biome-ignore lint/performance/noImgElement: sealed responsive sources use the authorized digest route; Next's unoptimized Image discards srcset.
    <img
      src={source}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={media.alt?.trim() || alt}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      className={cx("size-full bg-subtle object-cover", className)}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
    />
  );
}
