import type { Fact, Money } from "@/domain/facts";
import type { PublicLocale } from "@/i18n/config";
import { formatExactArea, formatMoney, formatNumber } from "@/i18n/format";
import type { ListingCard } from "@/server/listings/view-models";
import type { DiscoveryCopy } from "./copy";

export const listingHref = (
  listing: Pick<ListingCard, "reference" | "slug">,
  locale: PublicLocale,
) => `/${locale}/properties/${listing.reference}/${listing.slug}`;

/**
 * The price as a visitor reads it: the recorded amount, with "per month" for a rent. Anything
 * but a known amount (withheld, unknown, conflicting) reads "Price on request"; the public never
 * sees the record's state words. The price basis (asking, negotiable) is not part of it.
 */
export function priceText(price: Fact<Money>, locale: PublicLocale, copy: DiscoveryCopy) {
  if (price.state !== "known") return copy.priceOnRequest;
  const { amountMinor, currency, period } = price.value;
  return `${formatMoney(locale, amountMinor, currency)}${period === "month" ? ` ${copy.perMonth}` : ""}`;
}

/** The recorded price basis worth saying out loud; an ordinary asking price says nothing. */
export function priceBasisText(price: Fact<Money>, copy: DiscoveryCopy): string | null {
  if (price.state !== "known" || price.value.basis === "asking") return null;
  return copy[price.value.basis];
}

export function locality(listing: Pick<ListingCard, "place">) {
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

/** A known number as text; anything else is not shown at all (an empty string). */
export function scalarFact(fact: Fact<number>, locale: PublicLocale, _copy?: DiscoveryCopy) {
  return fact.state === "known" ? formatNumber(locale, fact.value) : "";
}

/** Counted phrases in the catalog: `<name>_one`, `_two`, `_few`, `_many`, `_other`. */
type Counted = "bedroomCount" | "propertyCount";

/** `{n}` in the locale's plural form for `n` (Intl plural rules; "zero" reads as "other"). */
export function plural(locale: PublicLocale, copy: DiscoveryCopy, name: Counted, n: number) {
  const rule = new Intl.PluralRules(locale).select(n);
  const form = rule === "zero" ? "other" : rule;
  return copy[`${name}_${form}`].replace("{n}", formatNumber(locale, n));
}

export interface ShownFact {
  readonly key: "area" | "bedrooms" | "type";
  /** What a card shows: "68 m²", "2 bedrooms", "Apartment". */
  readonly text: string;
  /** The label on the listing page, where facts sit in a labelled block. */
  readonly label: string;
  /** The value under that label. */
  readonly value: string;
}

/**
 * The facts a visitor sees, at most three, only when they are actually known: area (on its
 * recorded basis), bedrooms, property type. An unknown or not-applicable fact is left out, never
 * printed as "unknown". Values are the recorded ones, formatted for the locale.
 */
export function shownFacts(
  listing: Pick<ListingCard, "area" | "bedrooms" | "propertyType">,
  locale: PublicLocale,
  copy: DiscoveryCopy,
): ShownFact[] {
  const facts: ShownFact[] = [];
  const area = listing.area;
  if (area.state === "known") {
    const value = formatExactArea(locale, area.value.value);
    facts.push({ key: "area", text: value, label: copy[area.value.basis], value });
  }
  if (listing.bedrooms.state === "known")
    facts.push({
      key: "bedrooms",
      text: plural(locale, copy, "bedroomCount", listing.bedrooms.value),
      label: copy.bedrooms,
      value: formatNumber(locale, listing.bedrooms.value),
    });
  facts.push({
    key: "type",
    text: copy[listing.propertyType],
    label: copy.propertyType,
    value: copy[listing.propertyType],
  });
  return facts;
}

/** Folds case, spacing and punctuation so a caption that only repeats the title is dropped. */
const fold = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");

/** A caption worth showing: present and not just the listing title again. */
export function shownCaption(caption: string | null, title: string | null): string | null {
  if (!caption?.trim()) return null;
  return title && fold(caption) === fold(title) ? null : caption;
}

export function propertyCountText(locale: PublicLocale, copy: DiscoveryCopy, n: number) {
  return plural(locale, copy, "propertyCount", n);
}
