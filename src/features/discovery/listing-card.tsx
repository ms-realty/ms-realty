import type { ReactNode } from "react";
import type { PublicLocale } from "@/i18n/config";
import { formatDateTime, formatExactArea } from "@/i18n/format";
import type { ListingCard as Listing } from "@/server/listings/view-models";
import { StatusBadge } from "@/ui/status-badge";
import { ApprovedMedia } from "./approved-media";
import type { DiscoveryCopy } from "./copy";
import { LocalActions } from "./local-selection";
import { listingHref, locality, priceText, scalarFact } from "./presentation";

export function ListingFacts({
  listing,
  locale,
  copy,
}: {
  listing: Listing;
  locale: PublicLocale;
  copy: DiscoveryCopy;
}) {
  const area = listing.area;
  return (
    <dl className="grid grid-cols-2 gap-3 text-compact">
      <div>
        <dt className="text-text-muted">{copy.bedrooms}</dt>
        <dd>{scalarFact(listing.bedrooms, locale, copy)}</dd>
      </div>
      <div>
        <dt className="text-text-muted">
          {area.state === "known" ? copy[area.value.basis] : copy.area}
        </dt>
        <dd>
          {area.state === "known" ? formatExactArea(locale, area.value.value) : copy[area.state]}
        </dd>
      </div>
    </dl>
  );
}
export function Availability({
  listing,
  locale,
  copy,
}: {
  listing: Listing;
  locale: PublicLocale;
  copy: DiscoveryCopy;
}) {
  const state = listing.availability.presented;
  return (
    <div className="flex flex-col items-start gap-2">
      <StatusBadge
        family="availability"
        tone={state === "available" ? "positive" : "neutral"}
        label={state === "let" ? copy.letStatus : copy[state]}
      />
      {listing.availability.confirmedAt ? (
        <p className="text-caption text-text-muted">
          {copy.confirmedAt}:{" "}
          {/* Same instant and zone, but ICU builds word date-times differently (Node "5 Oct
              2026, 00:48" vs WebKit "5 Oct 2026 at 00:48"). Inside a hydrated client form,
              keep the server's text instead of failing hydration and re-rendering the form. */}
          <time dateTime={listing.availability.confirmedAt} suppressHydrationWarning>
            {formatDateTime(locale, listing.availability.confirmedAt)}
          </time>
        </p>
      ) : null}
    </div>
  );
}
export function ListingCard({
  listing,
  locale,
  copy,
  actions,
  headingLevel = 2,
}: {
  listing: Listing;
  locale: PublicLocale;
  copy: DiscoveryCopy;
  /** Context-specific links under the local save/compare toggles (P09: contact). */
  actions?: ReactNode;
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article
      className="flex min-w-0 flex-col overflow-hidden rounded-panel border border-divider bg-surface shadow-raised"
      data-listing-reference={listing.reference}
    >
      {/* UI13: approved photos use a full-width 3:2 frame; plans retain their full extent. */}
      <ApprovedMedia
        media={listing.cover}
        presentation="card"
        unavailable={copy.noPhoto}
        sizes="auto, (min-width: 90rem) 27.5rem, (min-width: 80rem) calc(33.333vw - 2.75rem), (min-width: 40rem) calc(50vw - 2rem), calc(100vw - 2.5rem)"
      />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <p className="text-caption text-text-muted">
            <bdi>{listing.reference}</bdi> · {copy[listing.propertyType]}
          </p>
          <Heading className="mt-1 break-words text-subheading font-semibold">
            <a
              className="text-text no-underline hover:underline hover:underline-offset-4"
              href={listingHref(listing, locale)}
            >
              {listing.title || listing.reference}
            </a>
          </Heading>
          <p className="mt-1 text-compact text-text-muted">{locality(listing)}</p>
        </div>
        <p className="text-price font-semibold">
          <bdi>{priceText(listing.price, locale, copy)}</bdi>
        </p>
        <ListingFacts listing={listing} locale={locale} copy={copy} />
        <Availability listing={listing} locale={locale} copy={copy} />
        <div className="mt-auto space-y-3">
          <LocalActions reference={listing.reference} copy={copy} />
          {actions}
        </div>
      </div>
    </article>
  );
}
export function ListingGrid({
  items,
  locale,
  copy,
  headingLevel = 2,
}: {
  items: readonly Listing[];
  locale: PublicLocale;
  copy: DiscoveryCopy;
  headingLevel?: 2 | 3 | 4;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((listing) => (
        <ListingCard
          key={listing.reference}
          listing={listing}
          locale={locale}
          copy={copy}
          headingLevel={headingLevel}
        />
      ))}
    </div>
  );
}
