"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { PublicLocale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import type { ListingCard } from "@/server/listings/view-models";
import { buttonClass } from "@/ui/button-class";
import { formFields } from "@/ui/form/contract";
import { nativeFormPermalink } from "@/ui/form/form";
import { Notice } from "@/ui/notice";
import type { DiscoveryCopy } from "./copy";
import { Availability, ListingFacts } from "./listing-card";
import { locality, priceText } from "./presentation";
import type { ShareCopy } from "./share-copy";
import { shareReferenceLimit } from "./share-model";
import { type CreateShareAction, type ShareCreateState, shareFields } from "./share-state";

export type SharePanelProps = {
  locale: PublicLocale;
  copy: DiscoveryCopy;
  labels: ShareCopy;
  /** This browser already holds the creator cookie, so it can manage what it creates. */
  ready: boolean;
  /** Public-host entry that issues the creator cookie and returns to this page. */
  entryHref: string;
  action: CreateShareAction;
  initialState: ShareCreateState;
  /** Shareable saved Listings in saved order. The server rechecks each one on creation. */
  listings: readonly ListingCard[];
  /** Saved Listings that are closed or not public here, and so are left out. */
  skipped: number;
};

/** X11: review exactly which public facts a link will carry, then create it. */
export function SharePanel(props: SharePanelProps) {
  return (
    <section
      id="share"
      aria-labelledby="share-heading"
      className="min-w-0 scroll-mt-24 space-y-5 rounded-panel border border-border bg-surface p-5 sm:p-6"
    >
      <h2 id="share-heading" className="text-heading font-semibold">
        {props.labels.shareTitle}
      </h2>
      {props.ready ? <Review {...props} /> : <Entry {...props} />}
    </section>
  );
}

/** The creator cookie must exist before the link does: a plain GET link, no script needed. */
function Entry({ labels, entryHref }: SharePanelProps) {
  return (
    <>
      <p className="max-w-reading">{labels.entryBody}</p>
      <p className="max-w-reading text-compact text-text-muted">{labels.entryCaution}</p>
      <a className={buttonClass("primary", "max-w-full self-start")} href={entryHref}>
        {labels.entryAction}
      </a>
    </>
  );
}

function Review({
  locale,
  copy,
  labels,
  entryHref,
  action,
  initialState,
  listings,
  skipped,
}: SharePanelProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialState,
    nativeFormPermalink(`/${locale}/saved`, "share"),
  );
  const [choice, setChoice] = useState<string[] | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const result = useRef<HTMLDivElement>(null);

  const available = listings.map((listing) => listing.reference);
  // Until the person edits the list, the first twelve shareable saves are included.
  const included = (choice ?? available.slice(0, shareReferenceLimit)).filter((reference) =>
    available.includes(reference),
  );
  const outcome = state.outcome;
  const missing = outcome.kind === "invalid" ? outcome.fields : [];

  // A new link needs a new review: clear the confirmation once one was created.
  useEffect(() => {
    if (state.outcome.kind === "created") setReviewed(false);
  }, [state]);
  // Every response replaces the form's status region, so announce and focus it each time.
  useEffect(() => {
    if (state.outcome.kind !== "idle") result.current?.focus();
  }, [state]);

  const toggle = (reference: string) => {
    const next = included.includes(reference)
      ? included.filter((item) => item !== reference)
      : [...included, reference];
    if (next.length <= shareReferenceLimit) setChoice(next);
  };

  if (listings.length === 0) return <p>{labels.none}</p>;
  return (
    <form
      action={formAction}
      noValidate
      aria-busy={pending}
      // React resets native controls after an action settles; this form keeps its review.
      onReset={(event) => event.preventDefault()}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
      className="min-w-0 space-y-5"
    >
      <input type="hidden" name={formFields.operationId} value={state.operationId} />
      {included.map((reference) => (
        <input key={reference} type="hidden" name={shareFields.reference} value={reference} />
      ))}
      {outcome.kind !== "idle" ? (
        <div ref={result} tabIndex={-1} className="outline-none">
          {outcome.kind === "created" ? (
            <Notice
              tone="success"
              role="status"
              title={labels.created}
              action={
                <a className="font-semibold underline" href={`#share-${outcome.id}`}>
                  {labels.goToLink}
                </a>
              }
            >
              {labels.createdBody}
            </Notice>
          ) : outcome.kind === "unknown" ? (
            <Notice tone="warning" role="alert">
              {labels.createUnknown}
            </Notice>
          ) : outcome.kind === "invalid" ? (
            <Notice tone="error" role="alert">
              <ul className="list-inside list-disc">
                {missing.includes("references") ? <li>{labels.needOne}</li> : null}
                {missing.includes("reviewed") ? <li>{labels.needReview}</li> : null}
              </ul>
            </Notice>
          ) : outcome.kind === "rejected" ? (
            <Notice
              tone="error"
              role="alert"
              action={
                outcome.code === "session_required" ? (
                  <a className="font-semibold underline" href={entryHref}>
                    {labels.entryAction}
                  </a>
                ) : undefined
              }
            >
              {outcome.code === "session_required"
                ? labels.sessionLost
                : outcome.code === "selection_unavailable"
                  ? labels.selectionUnavailable
                  : outcome.code === "rate_limited"
                    ? labels.rateLimited
                    : labels.createFailed}
            </Notice>
          ) : null}
        </div>
      ) : null}
      <p className="max-w-reading">{labels.reviewLead}</p>
      <fieldset className="min-w-0 space-y-4">
        <legend className="font-semibold">{labels.reviewFacts}</legend>
        <ul className="grid min-w-0 gap-4">
          {listings.map((listing) => {
            const on = included.includes(listing.reference);
            return (
              <li
                key={listing.reference}
                data-listing-reference={listing.reference}
                className="min-w-0 space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-8 sm:space-y-0"
              >
                <div className="min-w-0 space-y-3">
                  <div className="min-w-0 space-y-1 wrap-anywhere">
                    <p className="font-semibold">{listing.title || listing.reference}</p>
                    <p className="text-compact text-text-muted">
                      <bdi>{listing.reference}</bdi> · {copy[listing.propertyType]}
                    </p>
                    <p className="text-compact">
                      <bdi>{priceText(listing.price, locale, copy)}</bdi> · {locality(listing)}
                    </p>
                  </div>
                  <div className="max-w-sm">
                    <ListingFacts listing={listing} locale={locale} copy={copy} />
                  </div>
                  <Availability listing={listing} locale={locale} copy={copy} />
                </div>
                <label className="flex min-h-control items-center gap-3 text-compact font-semibold">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-action"
                    aria-label={`${labels.include} ${listing.reference}`}
                    checked={on}
                    disabled={!on && included.length >= shareReferenceLimit}
                    onChange={() => toggle(listing.reference)}
                  />
                  {labels.include}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <p role="status" className="font-semibold">
        {labels.included}:{" "}
        <bdi>
          {formatNumber(locale, included.length)} / {formatNumber(locale, shareReferenceLimit)}
        </bdi>
      </p>
      <ul className="max-w-reading space-y-1 text-compact text-text-muted">
        <li>{labels.limit}</li>
        {skipped > 0 ? <li>{labels.skipped}</li> : null}
        <li>{labels.expiry}</li>
      </ul>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name={shareFields.reviewed}
          value="yes"
          className="mt-0.5 size-5 shrink-0 accent-action"
          checked={reviewed}
          aria-invalid={missing.includes("reviewed") || undefined}
          onChange={(event) => setReviewed(event.target.checked)}
        />
        <span>{labels.reviewed}</span>
      </label>
      <button
        type="submit"
        className={buttonClass("primary", "max-w-full")}
        aria-disabled={pending || undefined}
        data-pending={pending || undefined}
      >
        {pending ? labels.creating : labels.create}
      </button>
    </form>
  );
}
