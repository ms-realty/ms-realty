// The listing page's photographs: one large photo and the next few beside it, then "All N
// photos". Without JavaScript that link (and every photo) opens the full gallery section of the
// page, shown by `:target`; with JavaScript the same links open the viewer (photo-viewer.tsx).

import { isRtlLocale } from "@/config/tenant";
import type { PublicLocale } from "@/i18n/config";
import type { PublicMedia } from "@/server/listings/view-models";
import { cx } from "@/ui/cx";
import { CloseIcon, PhotoIcon } from "@/ui/icons";
import { approvedMediaHref, approvedMediaSrcSet } from "./approved-media-href";
import type { DiscoveryCopy } from "./copy";
import { ListingPhoto } from "./listing-photo";
import { PhotoLink, PhotoViewer, type ViewerPhoto } from "./photo-viewer";
import { shownCaption } from "./presentation";

export const gallerySectionId = "photos";
const photoId = (index: number) => `photo-${index + 1}`;

export function PhotoGallery({
  media,
  title,
  locale,
  copy,
}: {
  media: readonly PublicMedia[];
  title: string;
  locale: PublicLocale;
  copy: DiscoveryCopy;
}) {
  const photos = media.filter((item) => approvedMediaHref(item));
  if (!photos.length)
    return (
      <div className="aspect-4/3 overflow-hidden rounded-panel sm:aspect-16/9">
        <ListingPhoto media={null} alt={title} sizes="100vw" unavailable={copy.noPhoto} />
      </div>
    );
  const altOf = (item: PublicMedia, index: number) =>
    item.alt?.trim() ||
    `${title}. ${copy.photoPosition.replace("{n}", String(index + 1)).replace("{total}", String(photos.length))}`;
  const viewer: ViewerPhoto[] = photos.map((item, index) => ({
    src: approvedMediaHref(item) as string,
    srcSet: approvedMediaSrcSet(item),
    alt: altOf(item, index),
    caption: shownCaption(item.caption, title),
    width: item.width,
    height: item.height,
  }));
  const shown = photos.slice(0, 5);
  const layout =
    shown.length >= 5
      ? "sm:grid-cols-4 sm:grid-rows-2"
      : shown.length >= 3
        ? "sm:grid-cols-[2fr_1fr] sm:grid-rows-2"
        : shown.length === 2
          ? "sm:grid-cols-2"
          : "";
  const allLabel = copy.allPhotos.replace("{count}", String(photos.length));
  return (
    <section aria-label={copy.photos} id="listing-photos" className="relative">
      <div
        className={cx(
          "-mx-gutter grid gap-2 overflow-hidden sm:mx-0 sm:rounded-panel sm:h-[min(34rem,62vh)]",
          layout,
        )}
      >
        {shown.map((item, index) => {
          const lead = index === 0;
          return (
            <PhotoLink
              key={item.relationId}
              index={index}
              href={`#${photoId(index)}`}
              className={cx(
                "relative block overflow-hidden bg-subtle",
                lead
                  ? cx(
                      "aspect-4/3 sm:aspect-auto",
                      shown.length >= 5 && "sm:col-span-2 sm:row-span-2",
                      shown.length === 3 || shown.length === 4 ? "sm:row-span-2" : "",
                    )
                  : cx("hidden sm:block", shown.length === 4 && index === 3 && "sm:hidden"),
              )}
            >
              <ListingPhoto
                media={item}
                alt={altOf(item, index)}
                priority={lead}
                unavailable={copy.noPhoto}
                sizes={
                  lead
                    ? "(min-width: 64rem) 44rem, (min-width: 40rem) 60vw, 100vw"
                    : "(min-width: 64rem) 22rem, 30vw"
                }
                className="transition-[filter] hover:brightness-95"
              />
            </PhotoLink>
          );
        })}
      </div>
      {photos.length > 1 ? (
        <PhotoLink
          index={0}
          href={`#${gallerySectionId}`}
          className="absolute bottom-3 end-3 inline-flex min-h-control items-center gap-2 rounded-control border border-border bg-surface px-4 font-semibold text-action shadow-sm hover:border-action"
        >
          <PhotoIcon className="size-5" />
          {allLabel}
        </PhotoLink>
      ) : null}

      {/* The whole set without JavaScript: shown when the address targets it or one photo. */}
      <section
        id={gallerySectionId}
        aria-labelledby="photos-heading"
        className="fixed inset-0 z-50 hidden overflow-y-auto bg-canvas target:block has-[figure:target]:block"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-canvas px-gutter py-2">
          <h2 id="photos-heading" className="text-subheading font-semibold">
            {allLabel}
          </h2>
          <a
            href="#listing-photos"
            className="inline-flex min-h-control items-center gap-2 rounded-control px-3 font-semibold text-action"
          >
            <CloseIcon className="size-5" />
            {copy.closePhotos}
          </a>
        </div>
        <ol className="mx-auto grid max-w-5xl gap-6 px-gutter py-6">
          {photos.map((item, index) => (
            <li key={item.relationId}>
              <figure id={photoId(index)} className="scroll-mt-16 space-y-2">
                <ListingPhoto
                  media={item}
                  alt={altOf(item, index)}
                  sizes="(min-width: 64rem) 64rem, 100vw"
                  unavailable={copy.noPhoto}
                  className="h-auto rounded-panel object-contain"
                />
                {shownCaption(item.caption, title) ? (
                  <figcaption className="text-caption text-text-muted">
                    {shownCaption(item.caption, title)}
                  </figcaption>
                ) : null}
              </figure>
            </li>
          ))}
        </ol>
      </section>

      <PhotoViewer
        photos={viewer}
        rtl={isRtlLocale(locale)}
        labels={{
          position: copy.photoPosition,
          previous: copy.previousPhoto,
          next: copy.nextPhoto,
          close: copy.closePhotos,
          title: copy.photos,
        }}
      />
    </section>
  );
}
