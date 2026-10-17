import { discoveryCopy } from "@/features/discovery/copy";
import { ListingFacts } from "@/features/discovery/listing-card";
import { locality, priceText } from "@/features/discovery/presentation";
import { viewingCopy } from "@/features/discovery/viewing-copy";
import type { PublicLocale } from "@/i18n/config";
import type { readAppointmentListing } from "@/server/appointments/listing-context";

export function AppointmentListingContext({
  listing,
  locale,
}: {
  listing: Awaited<ReturnType<typeof readAppointmentListing>>;
  locale: PublicLocale;
}) {
  if (!listing) return null;
  const copy = discoveryCopy(locale);
  return (
    <section
      className="min-w-0 max-w-reading space-y-3 rounded-panel border border-divider p-4 wrap-anywhere"
      aria-label={copy.reference}
    >
      <p className="font-semibold">
        <bdi>{listing.reference}</bdi>
      </p>
      {listing.card && listing.href ? (
        <div className="min-w-0">
          <div className="min-w-0 space-y-3">
            <h2 className="font-semibold">
              <a className="underline" href={listing.href}>
                {listing.card.title || listing.reference}
              </a>
            </h2>
            <p>{locality(listing.card)}</p>
            <p>{priceText(listing.card.price, locale, copy)}</p>
            <ListingFacts listing={listing.card} locale={locale} copy={copy} />
          </div>
        </div>
      ) : (
        <p>{viewingCopy(locale).unavailable}</p>
      )}
    </section>
  );
}
