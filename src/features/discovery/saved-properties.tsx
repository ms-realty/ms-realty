"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicLocale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { buttonClass } from "@/ui/button-class";
import { ApprovedMedia } from "./approved-media";
import type { DiscoveryCopy } from "./copy";
import { Availability, ListingFacts } from "./listing-card";
import { useSelection, writeSelection } from "./local-selection";
import { listingHref, locality, priceText } from "./presentation";
import { savedCopy } from "./saved-copy";
import type { LoadSavedProperties, SavedProperty } from "./saved-property-data";

export function SavedProperties({
  locale,
  copy,
  loadAction,
}: {
  locale: PublicLocale;
  copy: DiscoveryCopy;
  loadAction: LoadSavedProperties;
}) {
  const saved = useSelection("saved");
  const comparison = useSelection("compare");
  const labels = savedCopy(locale);
  const references = JSON.stringify(saved.refs);
  const selected = comparison.refs.filter((reference) => saved.refs.includes(reference));
  const [loaded, setLoaded] = useState<{ key: string; items: SavedProperty[] } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [removed, setRemoved] = useState<{
    reference: string;
    index: number;
    comparisonIndex: number;
  } | null>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const loadKey = `${locale}:${references}:${refresh}`;

  useEffect(() => {
    if (!saved.hydrated) return;
    let current = true;
    const refs: string[] = JSON.parse(references);
    if (!refs.length) return;
    loadAction(refs)
      .then((items) => {
        if (current) setLoaded({ key: loadKey, items });
      })
      .catch(() => {
        if (current)
          setLoaded({
            key: loadKey,
            items: refs.map((reference) => ({ reference, status: "error" })),
          });
      });
    return () => {
      current = false;
    };
  }, [loadAction, loadKey, references, saved.hydrated]);

  useEffect(() => {
    // A restored document must recheck publication and availability, not revive old cards.
    const recheck = () => setRefresh((value) => value + 1);
    window.addEventListener("pageshow", recheck);
    return () => window.removeEventListener("pageshow", recheck);
  }, []);
  useEffect(() => {
    if (removed) undoButton.current?.focus();
  }, [removed]);

  const items = loaded?.key === loadKey ? loaded.items : [];
  const byReference = new Map(items.map((item) => [item.reference, item]));
  const eligible = (reference: string) => {
    const item = byReference.get(reference);
    return item?.status === "listing" && item.listing.availability.primaryAction !== "view_similar";
  };
  const ready = selected.length >= 2 && selected.length <= 3 && selected.every(eligible);
  const temporaryOnly = saved.temporaryOnly || comparison.temporaryOnly;

  const toggle = (reference: string) => {
    const next = selected.includes(reference)
      ? selected.filter((item) => item !== reference)
      : [...selected, reference];
    if (next.length > 3) return;
    setNotice(writeSelection("compare", next) ? "" : copy.storageFailed);
  };
  const remove = (reference: string) => {
    setRemoved({
      reference,
      index: saved.refs.indexOf(reference),
      comparisonIndex: comparison.refs.indexOf(reference),
    });
    const savedDurable = writeSelection(
      "saved",
      saved.refs.filter((item) => item !== reference),
    );
    const compareDurable =
      !comparison.refs.includes(reference) ||
      writeSelection(
        "compare",
        comparison.refs.filter((item) => item !== reference),
      );
    setNotice(savedDurable && compareDurable ? "" : copy.storageFailed);
  };
  const undo = () => {
    if (!removed) return;
    if (!saved.refs.includes(removed.reference) && saved.refs.length >= 50) {
      setNotice(labels.saveLimit);
      return;
    }
    const restored = saved.refs.filter((reference) => reference !== removed.reference);
    restored.splice(Math.min(removed.index, restored.length), 0, removed.reference);
    let durable = writeSelection("saved", restored);
    const currentComparison = comparison.refs.filter(
      (reference) => reference !== removed.reference,
    );
    const comparisonFull = removed.comparisonIndex >= 0 && currentComparison.length >= 3;
    if (removed.comparisonIndex >= 0 && !comparisonFull) {
      const restoredComparison = [...currentComparison];
      restoredComparison.splice(
        Math.min(removed.comparisonIndex, currentComparison.length),
        0,
        removed.reference,
      );
      durable = writeSelection("compare", restoredComparison) && durable;
    }
    setNotice(!durable ? copy.storageFailed : comparisonFull ? copy.compareLimit : "");
    setRemoved(null);
  };

  return (
    <section className="min-w-0 space-y-6" aria-label={copy.saved}>
      <p className="max-w-prose text-compact text-text-muted">{copy.localOnly}</p>
      <noscript>
        <p>{copy.noJsSaved}</p>
      </noscript>
      {saved.hydrated ? (
        <>
          <p
            role="status"
            className={notice || temporaryOnly ? "text-compact text-text-muted" : "sr-only"}
          >
            {notice || (temporaryOnly ? copy.storageFailed : "")}
          </p>
          {removed ? (
            <div className="flex flex-wrap items-center gap-3 rounded-control bg-subtle p-4">
              <p role="status">
                {labels.removed}: <bdi>{removed.reference}</bdi>
              </p>
              <button
                ref={undoButton}
                type="button"
                className={buttonClass("secondary")}
                onClick={undo}
              >
                {labels.undo}
              </button>
            </div>
          ) : null}
          {saved.refs.length ? (
            <>
              <div className="flex flex-col items-start gap-3 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <p id="saved-compare-help" className="max-w-prose text-compact">
                    {labels.choose}
                  </p>
                  <p role="status" className="font-semibold">
                    {labels.selected}:{" "}
                    <bdi>
                      {formatNumber(locale, selected.length)} / {formatNumber(locale, 3)}
                    </bdi>
                  </p>
                </div>
                {ready ? (
                  <a
                    className={buttonClass("primary", "max-w-full")}
                    href={`/${locale}/compare?references=${selected.join(",")}`}
                  >
                    {labels.compareSelected}
                  </a>
                ) : (
                  <button
                    type="button"
                    className={buttonClass("primary", "max-w-full")}
                    disabled
                    aria-describedby="saved-compare-help"
                  >
                    {labels.compareSelected}
                  </button>
                )}
              </div>
              <ul className="grid items-start gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
                {saved.refs.map((reference) => {
                  const item = byReference.get(reference);
                  const listing = item?.status === "listing" ? item.listing : null;
                  const checked = selected.includes(reference);
                  const available = eligible(reference);
                  return (
                    <li key={reference} className="min-w-0">
                      <article
                        className="flex min-w-0 flex-col gap-3 wrap-anywhere"
                        data-listing-reference={reference}
                        aria-label={reference}
                      >
                        {listing ? (
                          <>
                            <ApprovedMedia media={listing.cover} unavailable={copy.noPhoto} />
                            <p className="text-price font-semibold">
                              <bdi>{priceText(listing.price, locale, copy)}</bdi>
                            </p>
                            <h2 className="text-subheading font-semibold">
                              <a
                                className="underline decoration-border underline-offset-4 hover:decoration-current"
                                href={listingHref(listing, locale)}
                              >
                                {listing.title || reference}
                              </a>
                            </h2>
                            <p className="text-compact text-text-muted">{locality(listing)}</p>
                          </>
                        ) : null}
                        <a
                          className="self-start text-compact font-semibold underline"
                          href={listingHref({ reference, slug: reference.toLowerCase() }, locale)}
                        >
                          <bdi>{reference}</bdi>
                        </a>
                        {listing ? (
                          <>
                            <ListingFacts listing={listing} locale={locale} copy={copy} />
                            <Availability listing={listing} locale={locale} copy={copy} />
                          </>
                        ) : (
                          <p
                            className="text-compact"
                            role={item?.status === "error" ? "status" : undefined}
                          >
                            {!item
                              ? labels.loading
                              : item.status === "error"
                                ? labels.loadFailed
                                : copy.unavailable}
                          </p>
                        )}
                        {item?.status === "error" ? (
                          <button
                            type="button"
                            className={buttonClass("secondary", "self-start")}
                            onClick={() => setRefresh((value) => value + 1)}
                          >
                            {labels.retry}
                          </button>
                        ) : null}
                        {checked && item && item.status !== "error" && !available ? (
                          <p className="text-compact text-text-muted">{labels.unavailable}</p>
                        ) : null}
                        <div className="flex flex-col items-start gap-1 border-t border-border pt-3">
                          <label className="flex min-h-control w-full items-center gap-3 text-compact font-semibold">
                            <input
                              type="checkbox"
                              className="size-5 shrink-0 accent-action"
                              aria-label={`${labels.select} ${reference}`}
                              aria-describedby="saved-compare-help"
                              checked={checked}
                              disabled={!checked && (!available || selected.length >= 3)}
                              onChange={() => toggle(reference)}
                            />
                            {labels.select}
                          </label>
                          <button
                            type="button"
                            className={buttonClass("tertiary", "max-w-full px-1")}
                            aria-label={`${copy.remove} ${reference}`}
                            onClick={() => remove(reference)}
                          >
                            {copy.remove}
                          </button>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p>{saved.temporaryOnly ? labels.storageUnreadable : copy.emptySaved}</p>
          )}
        </>
      ) : null}
    </section>
  );
}
