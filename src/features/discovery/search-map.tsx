"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { PublicMapPoint } from "@/domain/public-map";
import type { PublicLocale } from "@/i18n/config";
import { buttonClass } from "@/ui/button-class";
import type { MapCopy } from "./map-copy";

export interface MapListing {
  reference: string;
  href: string;
  label: string;
  point: PublicMapPoint;
}
export function SearchMap({
  items,
  locale,
  release,
  copy,
  listHref = "#property-results",
}: {
  items: readonly MapListing[];
  locale: PublicLocale;
  release: string | null;
  copy: MapCopy;
  listHref?: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const container = useRef<HTMLElement>(null);
  const id = useId();
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries the renderer and its requests.
  useEffect(() => {
    if (!open || !container.current || !release) return;
    const element = container.current;
    let cancelled = false;
    let errored = false;
    let dispose: (() => void) | undefined;
    setState("loading");
    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        errored = true;
        setState("error");
      }
    }, 15000);
    import("./map-renderer")
      .then(({ renderMap }) => {
        if (cancelled) return;
        dispose = renderMap(
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
            }
          },
        );
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(timeout);
          errored = true;
          setState("error");
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      dispose?.();
    };
  }, [open, attempt, items, locale, release, copy]);
  if (!release) return null;
  if (items.length === 0) return <p className="text-compact text-text-muted">{copy.empty}</p>;
  return (
    <section className="space-y-3" aria-label={copy.title}>
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
      {!hydrated && <p className="text-compact">{copy.noScript}</p>}
      {open && (
        <div id={id} className="space-y-3">
          <p className="text-compact text-text-muted">{copy.precision}</p>
          <a href={listHref} className="underline">
            {copy.list}
          </a>
          <div aria-live="polite" role="status">
            {state === "loading" ? copy.loading : state === "error" ? copy.error : null}
          </div>
          {state === "error" && (
            <button
              className={buttonClass("secondary")}
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {copy.retry}
            </button>
          )}
          <section
            ref={container}
            aria-label={copy.title}
            aria-busy={state === "loading"}
            className="h-[min(65vh,34rem)] min-h-64 w-full overflow-hidden rounded-panel border border-border"
          />
        </div>
      )}
    </section>
  );
}
