import type { Fact, Money } from "@/domain/facts";
import type { PublicLocale } from "@/i18n/config";
import { formatMoney, formatNumber } from "@/i18n/format";
import type { ListingCard } from "@/server/listings/view-models";
import type { DiscoveryCopy } from "./copy";

export const listingHref = (
  listing: Pick<ListingCard, "reference" | "slug">,
  locale: PublicLocale,
) => `/${locale}/properties/${listing.reference}/${listing.slug}`;
export function priceText(price: Fact<Money>, locale: PublicLocale, copy: DiscoveryCopy) {
  if (price.state !== "known") return copy[price.state];
  const { amountMinor, currency, period, basis } = price.value;
  return `${formatMoney(locale, amountMinor, currency)}${period === "month" ? ` ${copy.perMonth}` : ""} · ${copy[basis]}`;
}
export function locality(listing: ListingCard) {
  return (
    [
      listing.place.neighborhood,
      listing.place.settlement?.name,
      listing.place.municipality?.name ?? listing.place.district?.name,
    ]
      .filter((value, index, all) => value && all.indexOf(value) === index)
      .join(", ") || listing.place.country
  );
}
export function scalarFact(fact: Fact<number>, locale: PublicLocale, copy: DiscoveryCopy) {
  return fact.state === "known" ? formatNumber(locale, fact.value) : copy[fact.state];
}
