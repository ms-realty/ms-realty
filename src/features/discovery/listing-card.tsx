// Public search card and the small fact pieces shared by public surfaces. A card answers "is
// this worth a look?" in a glance: the photograph, then the price, the title, the place and at
// most three facts that are actually known. Nothing unknown is printed as a fact.
import type { ReactNode } from "react";
import type { PublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { ListingCard as Listing } from "@/server/listings/view-models";
import { cx } from "@/ui/cx";
import { StatusBadge } from "@/ui/status-badge";
import type { DiscoveryCopy } from "./copy";
import { ListingPhoto } from "./listing-photo";
import { CompareToggle, SaveToggle } from "./local-selection";
import { listingHref, locality, priceText, shownFacts } from "./presentation";

/** The known facts as one line of short items; unknown facts are simply absent. */
export function ListingFacts({
  listing,
  locale,
  copy,
  className,
}: {
  listing: Pick<Listing, "area" | "bedrooms" | "propertyType">;
  locale: PublicLocale;
  copy: DiscoveryCopy;
  className?: string;
}) {
  const facts = shownFacts(listing, locale, copy);
  return (
    <ul
      className={cx("flex flex-wrap gap-x-4 gap-y-1 text-compact text-text-muted", className)}
      data-listing-facts
    >
      {facts.map((fact) => (
        <li
          key={fact.key}
          data-fact={fact.key}
          title={fact.key === "area" ? fact.label : undefined}
        >
          <bdi>{fact.text}</bdi>
          {/* The recorded area basis (living, built, land) stays part of the fact for every reader. */}
          {fact.key === "area" ? <span className="sr-only"> {fact.label}</span> : null}
        </li>
      ))}
    </ul>
  );
}

const availabilityTone = (state: Listing["availability"]["presented"]) =>
  state === "available"
    ? ("positive" as const)
    : state === "sold" || state === "let" || state === "withdrawn"
      ? ("neutral" as const)
      : ("attention" as const);

/** Availability with its last confirmation, where a visitor compares or reviews a selection. */
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
        tone={availabilityTone(state)}
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

/** Availability only when it is not plainly available: reserved, under offer, sold, let. */
export function AvailabilityNote({
  listing,
  copy,
}: {
  listing: Pick<Listing, "availability">;
  copy: DiscoveryCopy;
}) {
  const state = listing.availability.presented;
  if (state === "available") return null;
  return (
    <StatusBadge
      family="availability"
      tone={availabilityTone(state)}
      label={state === "let" ? copy.letStatus : copy[state]}
    />
  );
}

/** One column on phones, two from 40 rem, three from 64 rem (max page 90 rem). */
const cardSizes = "(min-width: 64rem) 28rem, (min-width: 40rem) 46vw, calc(100vw - 2.5rem)";

export function ListingCard({
  listing,
  locale,
  copy,
  actions,
  priority = false,
}: {
  listing: Listing;
  locale: PublicLocale;
  copy: DiscoveryCopy;
  /** Context-specific links under the card (P09: contact). */
  actions?: ReactNode;
  /** The first cards of a page load their photo eagerly. */
  priority?: boolean;
}) {
  const title = listing.title || listing.reference;
  return (
    <article
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-panel border border-border bg-surface has-[a:focus-visible]:outline-[length:var(--focus-width)] has-[a:focus-visible]:outline-offset-[var(--focus-offset)] has-[a:focus-visible]:outline-focus has-[a:focus-visible]:outline-solid"
      data-listing-reference={listing.reference}
    >
      <div className="relative aspect-4/3 overflow-hidden bg-subtle">
        <ListingPhoto
          media={listing.cover}
          alt={title}
          sizes={cardSizes}
          priority={priority}
          unavailable={copy.noPhoto}
          className="transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
        />
        <div className="absolute end-3 top-3 z-10">
          <SaveToggle reference={listing.reference} copy={copy} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="text-price font-semibold" data-price>
          <bdi>{priceText(listing.price, locale, copy)}</bdi>
        </p>
        <h2 className="line-clamp-2 break-words text-body font-semibold">
          <a
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none group-hover:underline"
            href={listingHref(listing, locale)}
          >
            {title}
          </a>
        </h2>
        <p className="text-compact text-text-muted">{locality(listing)}</p>
        <ListingFacts listing={listing} locale={locale} copy={copy} className="mt-1" />
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
          <AvailabilityNote listing={listing} copy={copy} />
          <CompareToggle
            reference={listing.reference}
            copy={copy}
            className="relative z-10 ms-auto"
          />
        </div>
        {actions ? <div className="relative z-10 space-y-3 pt-2">{actions}</div> : null}
      </div>
    </article>
  );
}

export function ListingGrid({
  items,
  locale,
  copy,
  eager = 0,
}: {
  items: readonly Listing[];
  locale: PublicLocale;
  copy: DiscoveryCopy;
  /** How many leading cards are above the fold. */
  eager?: number;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((listing, index) => (
        <ListingCard
          key={listing.reference}
          listing={listing}
          locale={locale}
          copy={copy}
          priority={index < eager}
        />
      ))}
    </div>
  );
}
