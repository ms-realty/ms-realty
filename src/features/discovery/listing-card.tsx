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
        tone={
          state === "available"
            ? "positive"
            : state === "sold" || state === "let" || state === "withdrawn"
              ? "neutral"
              : "attention"
        }
        label={state === "let" ? copy.letStatus : copy[state]}
      />
      {listing.availability.confirmedAt ? (
        <p className="text-caption text-text-muted">
          {copy.confirmedAt}:{" "}
          <time dateTime={listing.availability.confirmedAt}>
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
}: {
  listing: Listing;
  locale: PublicLocale;
  copy: DiscoveryCopy;
}) {
  return (
    <article
      className="flex min-w-0 flex-col gap-4 rounded-panel border border-border bg-surface p-5"
      data-listing-reference={listing.reference}
    >
      <ApprovedMedia media={listing.cover} unavailable={copy.noPhoto} />
      <div>
        <p className="text-caption text-text-muted">
          <bdi>{listing.reference}</bdi> · {copy[listing.propertyType]}
        </p>
        <h2 className="mt-1 break-words text-subheading font-semibold">
          <a
            className="underline decoration-border underline-offset-4 hover:decoration-current"
            href={listingHref(listing, locale)}
          >
            {listing.title || listing.reference}
          </a>
        </h2>
        <p className="mt-1 text-compact text-text-muted">{locality(listing)}</p>
      </div>
      <p className="text-price font-semibold">
        <bdi>{priceText(listing.price, locale, copy)}</bdi>
      </p>
      <ListingFacts listing={listing} locale={locale} copy={copy} />
      <Availability listing={listing} locale={locale} copy={copy} />
      <div className="mt-auto">
        <LocalActions reference={listing.reference} copy={copy} />
      </div>
    </article>
  );
}
export function ListingGrid({
  items,
  locale,
  copy,
}: {
  items: readonly Listing[];
  locale: PublicLocale;
  copy: DiscoveryCopy;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((listing) => (
        <ListingCard key={listing.reference} listing={listing} locale={locale} copy={copy} />
      ))}
    </div>
  );
}
