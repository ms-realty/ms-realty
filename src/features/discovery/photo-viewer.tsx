"use client";
// The listing page's photo viewer. Without JavaScript every photo link goes to the full gallery
// section in the page (src/features/discovery/photo-gallery.tsx). With it, the same links open a
// modal viewer: one photo at a time, previous/next by button, arrow keys and swipe, Escape or
// Close to leave. The native modal dialog keeps focus inside; closing returns focus to the link
// that opened it.
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronEndIcon, ChevronStartIcon, CloseIcon } from "@/ui/icons";

export interface ViewerPhoto {
  readonly src: string;
  readonly srcSet?: string;
  readonly alt: string;
  readonly caption: string | null;
  readonly width: number | null;
  readonly height: number | null;
}

const openEvent = "msr-open-photo";

/** A link into the gallery that opens the viewer at `index` when JavaScript runs. */
export function PhotoLink({
  index,
  href,
  className,
  children,
  label,
}: {
  index: number;
  href: string;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <a
      href={href}
      className={className}
      aria-label={label}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent(openEvent, { detail: { index, opener: event.currentTarget } }),
        );
      }}
    >
      {children}
    </a>
  );
}

export function PhotoViewer({
  photos,
  labels,
  rtl,
}: {
  photos: readonly ViewerPhoto[];
  labels: { position: string; previous: string; next: string; close: string; title: string };
  rtl: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const touch = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const total = photos.length;
  const step = useCallback(
    (by: number) => setIndex((current) => (current + by + total) % total),
    [total],
  );

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ index: number; opener: HTMLElement }>).detail;
      opener.current = detail.opener;
      setIndex(Math.min(Math.max(detail.index, 0), total - 1));
      document.documentElement.style.overflow = "hidden";
      dialog.current?.showModal();
    };
    window.addEventListener(openEvent, open);
    return () => window.removeEventListener(openEvent, open);
  }, [total]);

  const photo = photos[index];
  if (!photo) return null;
  return (
    <dialog
      ref={dialog}
      aria-label={labels.title}
      className="m-0 size-full max-h-none max-w-none bg-ink p-0 text-text-inverse backdrop:bg-ink"
      onClose={() => {
        document.documentElement.style.overflow = "";
        opener.current?.focus();
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        // In right-to-left text the next photo is to the left.
        step((event.key === "ArrowRight") !== rtl ? 1 : -1);
      }}
    >
      <div className="flex size-full flex-col">
        <div className="flex items-center justify-between gap-3 px-gutter py-2">
          <p aria-live="polite" className="text-compact">
            {labels.position.replace("{n}", String(index + 1)).replace("{total}", String(total))}
          </p>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="inline-flex min-h-control items-center gap-2 rounded-control px-3 font-semibold"
          >
            <CloseIcon className="size-5" />
            {labels.close}
          </button>
        </div>
        <figure
          className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-gutter pb-4"
          onTouchStart={(event) => {
            touch.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touch.current;
            const end = event.changedTouches[0]?.clientX;
            touch.current = null;
            if (start === null || end === undefined || Math.abs(end - start) < 40) return;
            step(end < start !== rtl ? 1 : -1);
          }}
        >
          {/* biome-ignore lint/performance/noImgElement: sealed responsive sources use the authorized digest route. */}
          <img
            key={photo.src}
            src={photo.src}
            srcSet={photo.srcSet}
            sizes="100vw"
            alt={photo.alt}
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            className="min-h-0 max-w-full flex-1 object-contain"
          />
          {photo.caption ? (
            <figcaption className="text-caption text-text-inverse">{photo.caption}</figcaption>
          ) : null}
        </figure>
        {total > 1 ? (
          <div className="flex justify-center gap-4 px-gutter pb-4">
            <button
              type="button"
              onClick={() => step(-1)}
              className="inline-flex size-control items-center justify-center rounded-full border border-current"
              aria-label={labels.previous}
            >
              <ChevronStartIcon directional className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              className="inline-flex size-control items-center justify-center rounded-full border border-current"
              aria-label={labels.next}
            >
              <ChevronEndIcon directional className="size-5" />
            </button>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
