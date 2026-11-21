// Facts tier of Butler answers (ADR 0017): deterministic sentences from the published listing,
// no model. Every sentence states a recorded value exactly as the listing page shows it, or
// says that the listing does not give it. Unknown, withheld and conflicting values stay unknown.
import { agency } from "@/config/tenant";
import type { Area, Fact, ListingPurpose, Money, PropertyType } from "@/domain/facts";
import type { PublicLocale } from "@/domain/ids";
import type { CommercialState } from "@/domain/listing";
import type { FactKind, RefusalClass, SourceKey } from "@/domain/public-answer";
import type { PrimaryAction } from "@/domain/publication";
import { discoveryCopy } from "@/features/discovery/copy";
import { formatDate, formatExactArea, formatMoney, formatNumber } from "@/i18n/format";
import { butlerAnswersCopy, butlerAnswerText } from "./public-answer-copy";

/** An approved area guide for the listing's place, in the page locale. */
export interface AreaGuideSource {
  readonly slug: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
}

/**
 * Everything Butler may read about one listing: the active manifest in the page locale (the same
 * read the listing page uses) plus approved area guides for its place. Never a draft, a broker
 * note, an unpublished fact or another locale's text.
 */
export interface PublicAnswerSource {
  readonly listingId: string;
  readonly reference: string;
  readonly manifestId: string;
  readonly locale: PublicLocale;
  readonly purpose: ListingPurpose;
  readonly propertyType: PropertyType;
  readonly title: string | null;
  readonly description: string | null;
  readonly price: Fact<Money>;
  readonly area: Fact<Area>;
  readonly bedrooms: Fact<number>;
  readonly rooms: Fact<number>;
  readonly floor: Fact<number>;
  readonly totalFloors: Fact<number>;
  /** The public place line, at the approved precision; never the exact address. */
  readonly place: string | null;
  /** Published facts by key, for the text tier (`fact.<key>`): only known scalar values. */
  readonly facts: Readonly<Record<string, string>>;
  readonly availability: {
    readonly presented: CommercialState;
    readonly confirmedAt: string | null;
    readonly primaryAction: PrimaryAction;
  };
  readonly areaGuides: readonly AreaGuideSource[];
}

export interface FactsAnswer {
  readonly outcome: "answered" | "unknown";
  readonly text: string;
  readonly sources: readonly SourceKey[];
}

/** Button labels the viewing answer points to; the page's own wording. */
export interface ActionLabels {
  readonly viewing: string;
  readonly ask: string;
}

interface Part {
  readonly known: boolean;
  readonly text: string;
  readonly source: SourceKey | null;
}

/** The inclusions recorded with a known price, if any. */
export function recordedInclusions(source: PublicAnswerSource): readonly string[] | null {
  const price = source.price;
  if (price.state !== "known") return null;
  const items = price.value.inclusions?.filter((item) => item.trim());
  return items?.length ? items : null;
}

const knownNumber = (fact: Fact<number>): number | null =>
  fact.state === "known" && typeof fact.value === "number" && Number.isFinite(fact.value)
    ? fact.value
    : null;

function part(
  locale: PublicLocale,
  kind: FactKind,
  source: PublicAnswerSource,
  labels: ActionLabels,
): Part {
  const say = (key: string, values?: Record<string, string | number>) =>
    butlerAnswerText(locale, `answers.${key}`, values);
  const unknown = (key: string): Part => ({
    known: false,
    text: say(`unknown.${key}`),
    source: null,
  });
  switch (kind) {
    case "price": {
      const price = source.price;
      if (price.state !== "known") return unknown("price");
      const { amountMinor, currency, period, basis } = price.value;
      const amount = formatMoney(locale, amountMinor, currency);
      // The basis is said only when it is not a plain asking price, in the words the listing
      // page shows under the price.
      const sentences = [
        say(period === "month" ? "priceRent" : "priceSale", { price: amount }),
        ...(basis !== "asking" ? [`${discoveryCopy(locale)[basis]}.`] : []),
      ];
      return { known: true, text: sentences.join(" "), source: "fact.price" };
    }
    case "inclusions": {
      // Only a recorded inclusions fact answers; the price sentence never stands in for it.
      const items = recordedInclusions(source);
      if (!items) return unknown("inclusions");
      return {
        known: true,
        text: say("includes", { items: items.join(", ") }),
        source: "fact.price",
      };
    }
    case "area": {
      const area = source.area;
      if (area.state !== "known") return unknown("area");
      const basis = say(`areaBasis.${area.value.basis}`);
      return {
        known: true,
        text: say("area", { basis, area: formatExactArea(locale, area.value.value) }),
        source: `fact.area.${area.value.basis}`,
      };
    }
    case "bedrooms": {
      const bedrooms = knownNumber(source.bedrooms);
      const rooms = knownNumber(source.rooms);
      if (bedrooms === null && rooms === null) return unknown("bedrooms");
      const sentences = [
        ...(bedrooms !== null ? [say("bedrooms", { count: bedrooms })] : []),
        ...(rooms !== null ? [say("rooms", { count: rooms })] : []),
      ];
      return {
        known: true,
        text: sentences.join(" "),
        source: bedrooms !== null ? "fact.bedrooms" : "fact.rooms",
      };
    }
    case "type":
      return {
        known: true,
        text: `${say(`type.${source.propertyType}`)} ${say(`purpose.${source.purpose}`)}`,
        source: "listing.type",
      };
    case "floor": {
      const floor = knownNumber(source.floor);
      if (floor === null) return unknown("floor");
      const total = knownNumber(source.totalFloors);
      return {
        known: true,
        text:
          total !== null
            ? say("floorOf", {
                floor: formatNumber(locale, floor),
                total: formatNumber(locale, total),
              })
            : say("floor", { floor: formatNumber(locale, floor) }),
        source: "fact.feature.floor_number",
      };
    }
    case "place":
      if (!source.place) return unknown("place");
      return { known: true, text: say("place", { place: source.place }), source: "listing.place" };
    case "availability": {
      const { presented, confirmedAt } = source.availability;
      const sentences = [
        say(`availability.${presented}`),
        ...(confirmedAt && presented === "available"
          ? [say("confirmedAt", { date: formatDate(locale, confirmedAt) })]
          : []),
      ];
      return { known: true, text: sentences.join(" "), source: "listing.availability" };
    }
    case "reference":
      return {
        known: true,
        text: say("reference", { reference: source.reference }),
        source: "listing.reference",
      };
    case "viewing": {
      const action = source.availability.primaryAction;
      return {
        known: true,
        text:
          action === "request_viewing"
            ? say("viewing", { action: labels.viewing })
            : action === "ask_question"
              ? say("viewingAsk", { action: labels.ask })
              : say("viewingClosed"),
        source: "listing.availability",
      };
    }
    case "contact":
      return {
        known: true,
        text: say("contact", { agency: agency.name, phone: agency.phone.display }),
        source: "agency.contact",
      };
  }
}

/** Answers the routed fact kinds in the question's order; unknown only when none is known. */
export function answerFromFacts(
  kinds: readonly FactKind[],
  source: PublicAnswerSource,
  labels: ActionLabels,
): FactsAnswer {
  const locale = source.locale;
  const parts = kinds.map((kind) => part(locale, kind, source, labels));
  const anyUnknown = parts.some((p) => !p.known);
  const text = [
    ...parts.map((p) => p.text),
    ...(anyUnknown ? [butlerAnswersCopy(locale).brokerCan] : []),
  ].join(" ");
  return {
    outcome: parts.some((p) => p.known) ? "answered" : "unknown",
    text,
    sources: [...new Set(parts.flatMap((p) => (p.source ? [p.source] : [])))],
  };
}

/** The fixed refusal for a class; no model, no listing text. */
export function refusalText(locale: PublicLocale, refusal: RefusalClass): string {
  return butlerAnswersCopy(locale).refusals[refusal];
}

/** The fixed reply to a question that tries to instruct Butler; the instruction is not followed. */
export function injectionText(locale: PublicLocale): string {
  return butlerAnswersCopy(locale).refusals.injection;
}

/** Up to three suggested questions, each one the facts tier answers for this listing. */
export type SuggestedKind = "price" | "area" | "bedrooms" | "floor" | "viewing" | "place";

export function suggestedQuestions(source: PublicAnswerSource): SuggestedKind[] {
  const has = {
    price: source.price.state === "known",
    area: source.area.state === "known",
    bedrooms: knownNumber(source.bedrooms) !== null,
    floor: knownNumber(source.floor) !== null,
    viewing: source.availability.primaryAction === "request_viewing",
    place: Boolean(source.place),
  };
  const order = ["price", "area", "bedrooms", "floor", "viewing", "place"] as const;
  return order.filter((kind) => has[kind]).slice(0, 3);
}
