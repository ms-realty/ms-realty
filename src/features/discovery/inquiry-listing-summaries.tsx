import type { PublicLocale } from "@/i18n/config";
import type { ListingCard } from "@/server/listings/view-models";
import { cx } from "@/ui/cx";
import { ApprovedMedia } from "./approved-media";
import type { DiscoveryCopy } from "./copy";
import { Availability, ListingFacts } from "./listing-card";
import { listingHref, locality, priceText } from "./presentation";

/** Only the approved public card projection crosses the inquiry form's client boundary. */
export function inquiryListingSummary(listing: ListingCard): ListingCard {
  return {
    reference: listing.reference,
    manifestId: listing.manifestId,
    slug: listing.slug,
    locale: listing.locale,
    purpose: listing.purpose,
    propertyType: listing.propertyType,
    title: listing.title,
    price: listing.price,
    place: listing.place,
    bedrooms: listing.bedrooms,
    area: listing.area,
    availability: listing.availability,
    cover: listing.cover,
  };
}

export function InquiryListingSummaries({
  listings,
  locale,
  copy,
  stage,
}: {
  listings: readonly ListingCard[];
  locale: PublicLocale;
  copy: DiscoveryCopy;
  stage: "entry" | "review";
}) {
  if (!listings.length) return null;
  return (
    <ol
      className={cx(
        "grid min-w-0 items-start gap-4",
        listings.length > 2
          ? "lg:grid-cols-3"
          : listings.length === 2
            ? "lg:grid-cols-2"
            : "max-w-reading",
      )}
      aria-label={copy.properties}
    >
      {listings.map((listing) => (
        <li
          key={listing.reference}
          className="space-y-4 rounded-panel border border-divider p-4"
          data-review-listing={stage === "review" ? listing.reference : undefined}
          data-entry-listing={stage === "entry" ? listing.reference : undefined}
        >
          <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-start gap-4">
            <ApprovedMedia media={listing.cover} unavailable={copy.noPhoto} />
            <div className="min-w-0 space-y-2">
              <p className="text-dense text-text-muted">
                <bdi>{listing.reference}</bdi>
              </p>
              <p className="text-price font-semibold">{priceText(listing.price, locale, copy)}</p>
              <p className="text-compact">{locality(listing)}</p>
            </div>
          </div>
          <h3 className="text-compact font-semibold">
            <a
              className="text-link underline underline-offset-4"
              href={listingHref(listing, locale)}
            >
              {listing.title || listing.reference}
            </a>
          </h3>
          <ListingFacts listing={listing} locale={locale} copy={copy} />
          <Availability listing={listing} locale={locale} copy={copy} />
        </li>
      ))}
    </ol>
  );
}
