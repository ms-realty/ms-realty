// Source assembly for Butler answers on a listing page (ADR 0017). The sources are the same
// public reads the listing page uses: the active manifest in the page locale (getPublicListing)
// and the approved area guides bound to the listing's place (readApprovedAreas). Nothing here
// reads a draft, a broker note, an unpublished fact, a private address or another locale's
// unapproved text; a listing that is not publicly offered in the locale has no source at all.
import "server-only";
import { eq } from "drizzle-orm";
import { listings } from "@/db/schema";
import type { Area, Money } from "@/domain/facts";
import type { PublicLocale } from "@/domain/ids";
import { formatExactArea, formatMoney, formatNumber } from "@/i18n/format";
import { readApprovedAreas } from "../content/public";
import type { Executor } from "../db";
import { getPublicListing } from "../listings/detail";
import type { PublicFact, PublicListingDetail } from "../listings/view-models";
import type { AreaGuideSource, PublicAnswerSource } from "./public-answer-facts";

const maxGuides = 2;
const maxFactText = 200;

function isMoney(value: unknown): value is Money {
  const v = value as Money | null;
  return (
    typeof v === "object" &&
    v !== null &&
    Number.isSafeInteger(v.amountMinor) &&
    typeof v.currency === "string" &&
    (v.period === "total" || v.period === "month")
  );
}

function isArea(value: unknown): value is Area {
  const v = value as Area | null;
  return typeof v === "object" && v !== null && typeof v.value === "number" && v.unit === "m2";
}

/** One known published fact as the text tier reads it; null when it has no plain reading. */
export function factSourceText(locale: PublicLocale, fact: PublicFact): string | null {
  if (fact.fact.state !== "known") return null;
  const value: unknown = fact.fact.value;
  if (isMoney(value))
    return `${formatMoney(locale, value.amountMinor, value.currency)}${value.period === "month" ? " per month" : ""}`;
  if (isArea(value)) return formatExactArea(locale, value.value);
  if (typeof value === "number" && Number.isFinite(value)) return formatNumber(locale, value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string" && value.trim() && value.length <= maxFactText) return value.trim();
  return null;
}

const knownNumber = (listing: PublicListingDetail, key: string) => {
  const fact = listing.facts.find((f) => f.key === key)?.fact;
  return fact ?? { state: "unknown" as const };
};

function placeLine(listing: PublicListingDetail): string | null {
  const { place } = listing;
  return (
    [place.neighborhood, place.settlement?.name, place.municipality?.name ?? place.district?.name]
      .filter((value, index, all) => value && all.indexOf(value) === index)
      .join(", ") || null
  );
}

/** Approved area guides bound to the listing's own place chain, in the page locale. */
async function guidesFor(
  db: Executor,
  listing: PublicListingDetail,
  locale: PublicLocale,
): Promise<AreaGuideSource[]> {
  const placeIds = new Set(
    [
      listing.place.settlement?.id,
      listing.place.municipality?.id,
      listing.place.district?.id,
    ].filter((id): id is string => Boolean(id)),
  );
  if (placeIds.size === 0) return [];
  const guides = await readApprovedAreas(db, locale);
  return guides
    .filter((guide) => guide.placeId !== null && placeIds.has(guide.placeId))
    .slice(0, maxGuides)
    .map((guide) => ({
      slug: guide.slug,
      title: guide.title,
      paragraphs: guide.paragraphs.slice(0, 6),
    }));
}

/** Everything Butler may read about the listing, or null when it is not publicly shown here. */
export async function loadPublicAnswerSource(
  db: Executor,
  input: {
    readonly reference: string;
    readonly locale: PublicLocale;
    readonly now?: Date;
  },
): Promise<PublicAnswerSource | null> {
  const result = await getPublicListing(db, {
    reference: input.reference,
    locale: input.locale,
    ...(input.now ? { now: input.now } : {}),
  });
  if (result.status !== "listing") return null;
  const { listing } = result;
  if (listing.availability.primaryAction === "view_similar") return null;
  const facts: Record<string, string> = {};
  for (const fact of listing.facts) {
    const text = factSourceText(input.locale, fact);
    if (text !== null && /^[a-z0-9_.]{1,80}$/.test(fact.key)) facts[fact.key] = text;
  }
  const [row] = await db
    .select({ id: listings.id })
    .from(listings)
    .where(eq(listings.reference, listing.reference));
  if (!row) return null;
  const guides = await guidesFor(db, listing, input.locale).catch(() => []);
  return {
    listingId: row.id,
    reference: listing.reference,
    manifestId: listing.manifestId,
    locale: input.locale,
    purpose: listing.purpose,
    propertyType: listing.propertyType,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    area: listing.area,
    bedrooms: listing.bedrooms,
    rooms: knownNumber(listing, "rooms") as PublicAnswerSource["rooms"],
    floor: knownNumber(listing, "feature.floor_number") as PublicAnswerSource["floor"],
    totalFloors: knownNumber(listing, "feature.total_floors") as PublicAnswerSource["totalFloors"],
    place: placeLine(listing),
    facts,
    availability: {
      presented: listing.availability.presented,
      confirmedAt: listing.availability.confirmedAt,
      primaryAction: listing.availability.primaryAction,
    },
    areaGuides: guides,
  };
}
