"use client";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { PublicMapPoint } from "@/domain/public-map";
import {
  type MapBounds,
  mapBoundsSchema,
  parseMapBounds,
  serializeMapBounds,
} from "@/domain/search/map-bounds";
import type { PublicLocale } from "@/i18n/config";
import { announce } from "@/ui/announce";
import { buttonClass } from "@/ui/button-class";
import type { MapCopy } from "./map-copy";
import type { MapController } from "./map-renderer";
import { type Filters, filterUrl } from "./query";

export interface MapListing {
  reference: string;
  href: string;
  label: string;
  price?: string;
  point: PublicMapPoint;
}
export function SearchMap({
  items,
  locale,
  release,
  copy,
  listHref = "#property-results",
  children,
  filters,
}: {
  items: readonly MapListing[];
  locale: PublicLocale;
  release: string | null;
  copy: MapCopy;
  listHref?: string;
  children?: ReactNode;
  filters?: Filters;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const [draftBounds, setDraftBounds] = useState<MapBounds | null>(null);
  const container = useRef<HTMLDivElement>(null),
    region = useRef<HTMLDivElement>(null);
  const controller = useRef<MapController | null>(null),
    selectedRef = useRef(selected);
  const id = useId();
  const boundsValue = filters?.mapBounds ?? "";
  useEffect(() => {
    selectedRef.current = selected;
    controller.current?.select(selected);
    for (const card of region.current?.querySelectorAll<HTMLElement>("[data-listing-reference]") ??
      [])
      card.dataset.mapSelected = String(card.dataset.listingReference === selected);
  }, [selected]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries failed renderer requests.
  useEffect(() => {
    if (!open || !container.current || !release) return;
    const element = container.current;
    let cancelled = false,
      errored = false;
    let rendered: MapController | undefined;
    setState("loading");
    setDraftBounds(null);
    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        errored = true;
        setState("error");
        announce(copy.error);
      }
    }, 15000);
    import("./map-renderer")
      .then(({ renderMap }) => {
        if (cancelled) return;
        rendered = renderMap(
          element,
          items,
          locale,
          release,
          copy,
          () => {
            if (!cancelled && !errored) {
              clearTimeout(timeout);
              setState("ready");
            }
          },
          () => {
            if (!cancelled) {
              clearTimeout(timeout);
              errored = true;
              setState("error");
              announce(copy.error);
            }
          },
          {
            select: (reference) => {
              setSelected(reference);
              announce(`${copy.selected}: ${reference}`);
            },
            moved: (value) => {
              const valid = mapBoundsSchema.safeParse(value);
              if (valid.success) setDraftBounds(valid.data);
            },
            bounds: boundsValue ? parseMapBounds(boundsValue) : null,
          },
        );
        controller.current = rendered;
        rendered.select(selectedRef.current);
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(timeout);
          errored = true;
          setState("error");
          announce(copy.error);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      rendered?.destroy();
      controller.current = null;
    };
  }, [open, attempt, items, locale, release, copy, boundsValue]);
  const goToList = () => {
    setOpen(false);
    requestAnimationFrame(() => {
      const target = listHref.startsWith("#") ? document.getElementById(listHref.slice(1)) : null;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: "start" });
    });
  };
  if (!release) return <>{children}</>;
  if (items.length === 0)
    return (
      <>
        <p className="text-compact text-text-muted">{copy.empty}</p>
        {children}
      </>
    );
  return (
    <div
      ref={region}
      className="min-w-0 space-y-4"
      onFocusCapture={(event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>("[data-listing-reference]")
            : null;
        if (target?.dataset.listingReference) setSelected(target.dataset.listingReference);
      }}
    >
      <div className="flex flex-wrap gap-3" data-print-hide>
        <button
          className={buttonClass("secondary")}
          type="button"
          disabled={!hydrated}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? copy.hide : copy.show}
        </button>
        {open && children ? (
          <button className={buttonClass("tertiary")} type="button" onClick={goToList}>
            {copy.list}
          </button>
        ) : null}
      </div>
      {!hydrated ? <p className="text-compact">{copy.noScript}</p> : null}
      <div
        className={
          open && children
            ? "grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(22rem,1fr)_minmax(24rem,1fr)]"
            : "min-w-0"
        }
      >
        {children ? (
          <div
            className={
              open && state !== "error"
                ? "hidden min-w-0 lg:block lg:[&_[data-listing-grid]]:grid-cols-1 print:block"
                : "min-w-0"
            }
          >
            {children}
          </div>
        ) : null}
        {open ? (
          <section
            id={id}
            className="min-w-0 space-y-3 lg:sticky lg:top-[calc(var(--public-header-height,5rem)+1rem)]"
            aria-label={copy.title}
            data-print-hide
          >
            <p className="text-compact text-text-muted">{copy.precision}</p>
            {!children ? (
              <a href={listHref} className="inline-flex min-h-control items-center underline">
                {copy.list}
              </a>
            ) : null}
            {state === "loading" ? (
              <p role="status">{copy.loading}</p>
            ) : state === "error" ? (
              <div className="space-y-3">
                <p>{copy.error}</p>
                <button
                  className={buttonClass("secondary")}
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  {copy.retry}
                </button>
              </div>
            ) : null}
            {draftBounds && filters && state === "ready" ? (
              <div className="space-y-2 rounded-control border border-divider bg-surface p-3">
                <p className="text-compact">{copy.areaDraft}</p>
                <a
                  className={buttonClass("primary")}
                  href={`${filterUrl(locale, { ...filters, mapBounds: serializeMapBounds(draftBounds) })}#results-heading`}
                >
                  {copy.searchArea}
                </a>
              </div>
            ) : null}
            <div
              ref={container}
              aria-busy={state === "loading"}
              className={
                state === "error"
                  ? "hidden"
                  : "h-[min(65vh,34rem)] min-h-64 w-full overflow-hidden rounded-panel border border-border"
              }
            />
            {state === "error" && children ? (
              <button className={buttonClass("secondary")} type="button" onClick={goToList}>
                {copy.list}
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
