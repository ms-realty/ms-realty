"use client";

import { useRef, useState } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import type { PublicLocale } from "@/i18n/config";
import type { PublicMedia } from "@/server/listings/view-models";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { closeButtonClass, overlayClass } from "@/ui/dialog";
import { ChevronEndIcon, ChevronStartIcon, CloseIcon, PlusIcon } from "@/ui/icons";
import { useSheet } from "@/ui/sheet";
import type { DiscoveryCopy } from "./copy";

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
  presentation = "preview",
}: {
  media: PublicMedia | null;
  unavailable: string;
  priority?: boolean;
  sizes?: string;
  presentation?: "preview" | "card" | "gallery";
}) {
  return (
    <figure className="min-w-0 space-y-2">
      <div
        className={cx(
          "relative flex items-center justify-center overflow-hidden bg-subtle text-center text-text-muted",
          presentation === "preview" ? "aspect-[16/9] rounded-control" : "aspect-[3/2]",
          presentation === "gallery" && "rounded-panel",
        )}
      >
        <ApprovedImage
          media={media}
          unavailable={unavailable}
          priority={priority}
          sizes={sizes}
          className={cx(
            "absolute inset-0 size-full",
            presentation !== "preview" && media?.kind !== "floor_plan"
              ? "object-cover"
              : "object-contain",
          )}
        />
      </div>
      <MediaCaption media={media} className={presentation === "card" ? "px-5" : undefined} />
    </figure>
  );
}

function MediaCaption({
  media,
  className,
  as: Tag = "figcaption",
}: {
  media: PublicMedia | null;
  className?: string;
  as?: "figcaption" | "div";
}) {
  if (!media?.caption && !media?.modificationDisclosure) return null;
  return (
    <Tag className={cx("space-y-1 break-words text-caption text-text-muted", className)}>
      {media.caption ? <p>{media.caption}</p> : null}
      {media.modificationDisclosure ? <p>{media.modificationDisclosure}</p> : null}
    </Tag>
  );
}

function ApprovedImage({
  media,
  unavailable,
  priority = false,
  sizes = "auto, 100vw",
  className,
}: {
  media: PublicMedia | null;
  unavailable: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const source = media ? approvedMediaHref(media) : null;
  const srcSet = media ? approvedMediaSrcSet(media) : undefined;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const available = source && source !== failedSource;
  return available ? (
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
      className={className}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      onError={() => setFailedSource(source)}
    />
  ) : (
    <p className="m-auto p-5 text-center text-text-muted" role="status">
      {unavailable}
    </p>
  );
}

export function ApprovedGallery({
  media,
  unavailable,
  morePhotos,
  locale,
  copy,
}: {
  media: readonly PublicMedia[];
  unavailable: string;
  morePhotos: string;
  locale: PublicLocale;
  copy: DiscoveryCopy;
}) {
  const viewer = useSheet();
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLElement>(null);
  const select = (next: number) => {
    setIndex(next);
    setZoom(1);
    if (viewport.current) {
      viewport.current.scrollTop = 0;
      viewport.current.scrollLeft = 0;
    }
  };
  if (!media.length) return <ApprovedMedia media={null} unavailable={unavailable} />;
  const [cover, ...remaining] = media;
  if (!cover) return <ApprovedMedia media={null} unavailable={unavailable} />;
  const current = media[index] ?? cover;
  const kind = (item: PublicMedia) =>
    ({
      photo: copy.mediaPhoto,
      floor_plan: copy.mediaFloorPlan,
      render: copy.mediaRender,
      video: copy.mediaVideo,
      virtual_tour: copy.mediaVirtualTour,
    })[item.kind];
  const position = copy.mediaPosition
    .replace("{position}", String(index + 1))
    .replace("{count}", String(media.length));
  const item = (entry: PublicMedia, entryIndex: number, priority = false) => {
    const href = approvedMediaHref(entry);
    const image = (
      <ApprovedMedia
        media={entry}
        unavailable={unavailable}
        priority={priority}
        presentation="gallery"
        sizes={
          priority
            ? "(min-width: 1440px) 896px, (min-width: 1024px) calc(66.667vw - 4rem), calc(100vw - 2.5rem)"
            : "auto, (min-width: 1440px) 440px, (min-width: 1024px) calc(33.333vw - 2.5rem), (min-width: 640px) calc(50vw - 1.75rem), calc(100vw - 2.5rem)"
        }
      />
    );
    if (!href) return image;
    return (
      <a
        href={href}
        aria-label={`${copy.openMedia.replace("{position}", String(entryIndex + 1))} · ${entry.alt || kind(entry)}`}
        aria-haspopup="dialog"
        className="group/media relative block rounded-panel no-underline outline-offset-4"
        onClick={(event) => {
          event.preventDefault();
          // Safari does not focus pointer-clicked links. Give the modal an exact
          // return target before its focus scope records the active element.
          event.currentTarget.focus({ preventScroll: true });
          select(entryIndex);
          viewer.open();
        }}
      >
        {image}
        <span className="pointer-events-none absolute end-3 top-3 inline-flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface/95 px-3 text-caption font-semibold text-action shadow-raised group-hover/media:bg-selected">
          <PlusIcon className="size-4" />
          <bdi>
            {entryIndex + 1} / {media.length}
          </bdi>
        </span>
      </a>
    );
  };
  return (
    <div className="min-w-0 space-y-4">
      {cover ? item(cover, 0, true) : null}
      {remaining.length ? (
        <details>
          <summary className="min-h-control cursor-pointer py-3 text-compact font-semibold text-action underline underline-offset-4">
            {morePhotos.replace("{count}", String(remaining.length))}
          </summary>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {remaining.map((entry, offset) => (
              <li key={entry.relationId} className="min-w-0">
                {item(entry, offset + 1)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <ModalOverlay
        isOpen={viewer.isOpen}
        onOpenChange={(open) => (open ? viewer.open() : viewer.close())}
        isDismissable
        className={cx(overlayClass, "flex items-center justify-center sm:p-4")}
      >
        <Modal className="flex h-dvh w-full max-w-[90rem] flex-col overflow-hidden bg-surface shadow-overlay sm:h-[min(56rem,calc(100dvh-2rem))] sm:rounded-panel forced-colors:border">
          <div
            className="flex h-full min-h-0 flex-col"
            role="presentation"
            onKeyDownCapture={(event) => {
              if (zoom > 1 && event.target === viewport.current) return;
              const previous = locale === "he" ? "ArrowRight" : "ArrowLeft";
              const next = locale === "he" ? "ArrowLeft" : "ArrowRight";
              if (event.key === previous && index > 0) {
                event.preventDefault();
                select(index - 1);
              }
              if (event.key === next && index < media.length - 1) {
                event.preventDefault();
                select(index + 1);
              }
            }}
          >
            <Dialog className="flex h-full min-h-0 flex-col outline-none">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-divider px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
                <Heading slot="title" className="text-subheading font-semibold">
                  {copy.mediaViewer}
                </Heading>
                <Button
                  autoFocus
                  aria-label={copy.close}
                  onPress={viewer.close}
                  className={closeButtonClass}
                >
                  <CloseIcon />
                </Button>
              </div>
              <figure className="flex min-h-0 flex-1 flex-col">
                <section
                  ref={viewport}
                  aria-label={kind(current)}
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: the zoomed image is a labeled keyboard-scrollable pan region.
                  tabIndex={0}
                  className="min-h-24 min-w-0 flex-1 overflow-auto overscroll-contain bg-subtle"
                >
                  <div
                    className="relative flex items-center justify-center"
                    style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
                  >
                    <ApprovedImage
                      key={current.relationId}
                      media={current}
                      unavailable={unavailable}
                      sizes="100vw"
                      priority
                      className="absolute inset-0 size-full object-contain"
                    />
                  </div>
                </section>
                <figcaption
                  className="max-h-[30dvh] shrink-0 space-y-2 overflow-y-auto border-t border-divider px-4 py-3"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <p className="text-caption font-semibold">
                    {kind(current)} · <bdi>{position}</bdi>
                  </p>
                  <MediaCaption media={current} as="div" />
                </figcaption>
              </figure>
              <div
                data-print-hide=""
                className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-divider px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
              >
                <button
                  type="button"
                  aria-disabled={index === 0}
                  data-disabled={index === 0 || undefined}
                  onClick={() => {
                    if (index > 0) select(index - 1);
                  }}
                  aria-label={copy.previousMedia}
                  className={buttonClass("secondary", "px-3")}
                >
                  <ChevronStartIcon directional />
                </button>
                <button
                  type="button"
                  disabled={zoom <= 1}
                  onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
                  className={buttonClass("tertiary", "px-3")}
                >
                  {copy.zoomOut}
                </button>
                <button
                  type="button"
                  disabled={zoom >= 3}
                  onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
                  className={buttonClass("tertiary", "px-3")}
                >
                  {copy.zoomIn}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    if (viewport.current) {
                      viewport.current.scrollTop = 0;
                      viewport.current.scrollLeft = 0;
                    }
                  }}
                  className={buttonClass("tertiary", "px-3")}
                >
                  {copy.fitMedia} <bdi>{Math.round(zoom * 100)}%</bdi>
                </button>
                <button
                  type="button"
                  aria-disabled={index === media.length - 1}
                  data-disabled={index === media.length - 1 || undefined}
                  onClick={() => {
                    if (index < media.length - 1) select(index + 1);
                  }}
                  aria-label={copy.nextMedia}
                  className={buttonClass("secondary", "px-3")}
                >
                  <ChevronEndIcon directional />
                </button>
              </div>
            </Dialog>
          </div>
        </Modal>
      </ModalOverlay>
    </div>
  );
}
