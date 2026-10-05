import type { PublicLocale } from "@/i18n/config";
import type { ListingCard } from "@/server/listings/view-models";
import { ApprovedMedia } from "./approved-media";
import type { DiscoveryCopy } from "./copy";
import { ListingFacts } from "./listing-card";
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
    <ol className="space-y-5" aria-label={copy.properties}>
      {listings.map((listing) => (
        <li
          key={listing.reference}
          className="space-y-4 rounded-panel border border-divider p-4"
          data-review-listing={stage === "review" ? listing.reference : undefined}
          data-entry-listing={stage === "entry" ? listing.reference : undefined}
        >
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <ApprovedMedia media={listing.cover} unavailable={copy.noPhoto} />
            <div className="min-w-0 space-y-3">
              <p className="text-dense text-text-muted">
                <bdi>{listing.reference}</bdi>
              </p>
              <h3 className="font-semibold">
                <a className="underline" href={listingHref(listing, locale)}>
                  {listing.title || listing.reference}
                </a>
              </h3>
              <p>{locality(listing)}</p>
              <p className="font-semibold">{priceText(listing.price, locale, copy)}</p>
              <ListingFacts listing={listing} locale={locale} copy={copy} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
