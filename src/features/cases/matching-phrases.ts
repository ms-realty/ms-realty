// O07 fact words (design/contracts/o07.md §1 "Criteria keys and their plain words"). A key is
// worded only where the server returned it (`confirmedCriteria[]`, `unconfirmed[]`, `violated[]`).
// Listing values come from the public card; what the client wants is labelled as such and is
// never presented as a listing fact. Nothing here derives a fit.
import type { Money } from "@/domain/facts";
import { isPublicLocale, type PublicLocale } from "@/i18n/config";
import { formatArea, formatMoney } from "@/i18n/format";
import type { ListingCard, SearchCriteria } from "@/server/listings/view-models";
import { fill, joinList, type MatchingCopy } from "./matching-copy";

export type MatchCard = Pick<
  ListingCard,
  | "reference"
  | "title"
  | "purpose"
  | "propertyType"
  | "price"
  | "place"
  | "bedrooms"
  | "area"
  | "cover"
> & { readonly availability: { readonly presented: string } };

type Range = { readonly min?: number; readonly max?: number };

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1);
const humanize = (key: string) => key.replaceAll("_", " ");

export function placeOf(card: Pick<MatchCard, "place">): string | null {
  return (
    card.place.settlement?.name ??
    card.place.municipality?.name ??
    card.place.district?.name ??
    null
  );
}

export function cardPrice(card: Pick<MatchCard, "price">): Money | null {
  return card.price.state === "known" ? card.price.value : null;
}

export function matchingPhrases(
  locale: string,
  c: MatchingCopy,
  criteria: SearchCriteria,
  placeNames: ReadonlyMap<string, string>,
) {
  const pl: PublicLocale = isPublicLocale(locale) ? locale : "en";
  const f = c.fact;
  const money = (amountMinor: number) =>
    formatMoney(pl, amountMinor, criteria.price?.currency ?? "EUR");
  /** «до 130 000 €» · «от 80 000 € до 130 000 €» · «от 80 000 €». */
  const span = (r: Range, word: (value: number) => string) =>
    r.min !== undefined && r.max !== undefined
      ? r.min === r.max
        ? word(r.max)
        : fill(f.between, { min: word(r.min), max: word(r.max) })
      : r.max !== undefined
        ? fill(f.upTo, { value: word(r.max) })
        : r.min !== undefined
          ? fill(f.from, { value: word(r.min) })
          : "";
  /** Counts read better with the noun once: «поне 2 спални», «от 2 до 3 спални». */
  const countSpan = (r: Range, noun: (n: number) => string) => {
    const word = (n: number) => fill(noun(n), { count: n });
    if (r.min !== undefined && r.max !== undefined)
      return r.min === r.max
        ? word(r.max)
        : fill(f.between, { min: String(r.min), max: word(r.max) });
    if (r.max !== undefined) return fill(f.upTo, { value: word(r.max) });
    return r.min !== undefined ? fill(f.atLeast, { value: word(r.min) }) : "";
  };
  const budget = criteria.price ? span(criteria.price, money) : "";
  const bedrooms = criteria.bedrooms ? countSpan(criteria.bedrooms, f.bedroomsCount) : "";
  const rooms = criteria.rooms ? countSpan(criteria.rooms, f.roomsCount) : "";
  const areaName = (basis: string) => fill(f.areaNamed, { basis: f.areaBasis[basis] ?? basis });
  const area = criteria.area
    ? `${areaName(criteria.area.basis)} ${span(criteria.area, (n) => formatArea(pl, n))}`
    : "";
  const types = (criteria.propertyTypes ?? []).map((type) => f.types[type] ?? humanize(type));
  const places = (criteria.placeIds ?? []).flatMap((id) => {
    const name = placeNames.get(id);
    return name ? [name] : [];
  });
  const feature = (key: string) => f.features[key] ?? humanize(key);
  const featureOf = (key: string) => key.slice("feature.".length);
  const status = (card: Pick<MatchCard, "availability">) =>
    f.status[card.availability.presented] ?? humanize(card.availability.presented);

  /** A plain noun: «Не е известно: наличност, асансьор». */
  function name(key: string): string {
    if (key.startsWith("feature.")) return feature(featureOf(key));
    if (key.startsWith("area.")) return areaName(key.slice("area.".length));
    return f.name[key] ?? humanize(key);
  }

  /** In a sentence, as an object («потвърдете цената») or a subject («цената не отговаря»). */
  function definite(key: string, subject = false): string {
    if (key.startsWith("feature."))
      return fill(f.featureQuoted, { label: feature(featureOf(key)) });
    const forms = f.definite[key.startsWith("area.") ? "area" : key];
    return forms ? forms[subject ? 1 : 0] : humanize(key);
  }

  const definites = (keys: readonly string[], subject = false) =>
    joinList(
      locale,
      keys.map((key) => definite(key, subject)),
    );

  /** What the client wants, as recorded: «Покупка · апартамент · Сандански · до 130 000 €». */
  function summary(): string {
    return [
      capitalize(f.purpose[criteria.purpose] ?? criteria.purpose),
      types.join(` ${f.or} `),
      joinList(locale, places),
      budget,
      bedrooms,
      rooms,
      area,
      joinList(locale, (criteria.mustHave ?? []).map(feature)),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  /**
   * The availability status beside the requirement («Наличност: Свободен»), only when the server
   * confirmed it. `confirmation_required` is never shown as known: it is an unknown key.
   */
  function availability(item: {
    readonly confirmedCriteria: readonly string[];
    readonly availability: { readonly presented: string };
  }): string | null {
    if (!item.confirmedCriteria.includes("availability")) return null;
    const presented = item.availability.presented;
    if (presented === "available") return c.availability.available;
    if (presented === "negotiating") return c.availability.negotiating;
    if (presented === "reserved_with_recorded_basis") return c.availability.reserved;
    return null;
  }

  /** One unknown key on the property check («Трябва да се потвърди»). */
  function unknownLine(key: string): string {
    if (key === "availability")
      return criteria.purpose === "long_term_rent"
        ? c.check.unknownAvailabilityRent
        : c.check.unknownAvailabilitySale;
    return fill(c.check.unknownOther, { fact: capitalize(name(key)) });
  }

  /** One violated key («Не отговаря на»): the listing's own value, then why it does not fit. */
  function violation(key: string, card: MatchCard): string {
    const fact = capitalize(name(key));
    const line = (value: string | null, reason: string) =>
      value ? fill(f.line, { fact, value, reason }) : fill(f.lineNoValue, { fact, reason });
    if (key === "price") {
      const price = cardPrice(card);
      const max = criteria.price?.max,
        min = criteria.price?.min;
      const reason =
        price && max !== undefined && price.amountMinor > max
          ? fill(f.overBudget, { range: fill(f.upTo, { value: money(max) }) })
          : price && min !== undefined && price.amountMinor < min
            ? fill(f.underBudget, { range: fill(f.from, { value: money(min) }) })
            : fill(f.wanted, { value: budget });
      return line(price ? formatMoney(pl, price.amountMinor, price.currency) : null, reason);
    }
    if (key === "propertyType")
      return line(
        f.types[card.propertyType] ?? humanize(card.propertyType),
        fill(f.wanted, { value: types.join(` ${f.or} `) }),
      );
    if (key === "place")
      return line(placeOf(card), fill(f.wanted, { value: joinList(locale, places) }));
    if (key === "availability") return line(status(card), f.notOffered);
    if (key === "purpose")
      return line(
        f.purpose[card.purpose] ?? card.purpose,
        fill(f.dealIs, { dealKind: f.purpose[criteria.purpose] ?? criteria.purpose }),
      );
    if (key === "bedrooms")
      return line(
        card.bedrooms.state === "known" ? String(card.bedrooms.value) : null,
        fill(f.wanted, { value: bedrooms }),
      );
    if (key.startsWith("area.")) {
      const basis = key.slice("area.".length);
      const value =
        card.area.state === "known" && card.area.value.basis === basis
          ? formatArea(pl, card.area.value.value)
          : null;
      return line(value, fill(f.wanted, { value: area }));
    }
    // The card carries no room count and no feature values: only the requirement is named.
    if (key === "rooms") return line(null, fill(f.wanted, { value: rooms }));
    if (key.startsWith("feature.")) return line(null, f.required);
    return line(null, f.required);
  }

  return { summary, availability, unknownLine, violation, name, definite, definites, status };
}

export type MatchingPhrases = ReturnType<typeof matchingPhrases>;
