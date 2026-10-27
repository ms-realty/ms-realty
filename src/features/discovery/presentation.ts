import type { Fact, Money } from "@/domain/facts";
import type { PublicLocale } from "@/i18n/config";
import { formatMoney, formatNumber } from "@/i18n/format";
import type { ListingCard } from "@/server/listings/view-models";
import type { DiscoveryCopy } from "./copy";
import { safeSearchReturn } from "./search-return";

export const listingHref = (
  listing: Pick<ListingCard, "reference" | "slug">,
  locale: PublicLocale,
  returnTo?: string,
) => {
  const parent = returnTo ? safeSearchReturn(locale, returnTo) : null;
  const base = `/${locale}/properties/${listing.reference}/${listing.slug}`;
  return parent
    ? `${base}?${new URLSearchParams({ returnTo: `${parent.split("#")[0]}#property-result-${listing.reference}` })}`
    : base;
};
export function priceText(price: Fact<Money>, locale: PublicLocale, copy: DiscoveryCopy) {
  if (price.state === "withheld") return copy.priceWithheld;
  if (price.state === "unknown" || price.state === "not_supplied") return copy.priceUnknown;
  if (price.state === "conflicting") return copy.priceConflicting;
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
