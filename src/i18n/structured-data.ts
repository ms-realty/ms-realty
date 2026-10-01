import { areaBases } from "@/domain/facts";
import { currencyMinorDigits } from "@/domain/ids";
import type { LegacyPage } from "@/server/legacy/pages";
import type { PublicListingDetail } from "@/server/listings/view-models";
import legacyContent from "../../data/legacy/content.json";

// Escape script delimiters even when approved source text contains HTML-like text.
export function serializeStructuredData(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("Structured data must be JSON-serializable");
  return json
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function organizationStructuredData(origin: URL) {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness", "RealEstateAgent"],
    "@id": new URL("/#organization", origin).toString(),
    name: "MS Realty",
    url: origin.toString(),
    logo: new URL("/brand/logo-ms-realty.png", origin).toString(),
    telephone: legacyContent.brand_contact.phone,
    email: legacyContent.brand_contact.email,
  };
}

export function listingStructuredData(listing: PublicListingDetail, url: string) {
  const origin = new URL(url).origin;
  const state = listing.availability.presented;
  const availability =
    state === "sold" || state === "let"
      ? "https://schema.org/SoldOut"
      : state === "withdrawn"
        ? "https://schema.org/Discontinued"
        : undefined;
  const knownPrice = listing.price.state === "known" ? listing.price.value : null;
  const additionalProperty: Record<string, unknown>[] = [];
  const property: Record<string, unknown> = {
    "@type":
      listing.propertyType === "apartment"
        ? "Apartment"
        : listing.propertyType === "house"
          ? "House"
          : "Place",
    identifier: listing.reference,
    name: listing.title ?? listing.reference,
    address: {
      "@type": "PostalAddress",
      addressCountry: listing.place.country,
      ...(listing.place.settlement ? { addressLocality: listing.place.settlement.name } : {}),
      ...(listing.place.district ? { addressRegion: listing.place.district.name } : {}),
    },
  };
  // Never turn unknown/conflicting facts into zero or expose private address/coordinates.
  const residential = listing.propertyType === "apartment" || listing.propertyType === "house";
  if (listing.bedrooms.state === "known" && isCount(listing.bedrooms.value)) {
    if (residential) property.numberOfBedrooms = listing.bedrooms.value;
    else additionalProperty.push(sourceProperty("bedrooms", listing.bedrooms.value));
  }
  const rooms = listing.facts.find((fact) => fact.key === "rooms")?.fact;
  if (rooms?.state === "known" && isCount(rooms.value)) {
    if (residential) property.numberOfRooms = rooms.value;
    else additionalProperty.push(sourceProperty("rooms", rooms.value));
  }
  const areas = [
    ...(listing.area.state === "known" ? [listing.area.value] : []),
    ...listing.facts.flatMap(({ key, fact }) =>
      key.startsWith("area.") && fact.state === "known" ? [fact.value] : [],
    ),
  ].flatMap((value) => areaProperty(value, "value"));
  for (const area of areas)
    if (
      !additionalProperty.some(
        (existing) => existing.name === area.name && existing.value === area.value,
      )
    )
      additionalProperty.push(area);
  if (additionalProperty.length) property.additionalProperty = additionalProperty;
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${url}#listing`,
    url,
    name: listing.title ?? listing.reference,
    description: listing.description ?? undefined,
    inLanguage: listing.locale,
    datePosted: listing.publishedAt,
    image: listing.media
      .filter((m) => m.kind === "photo")
      .map((m) => `${origin}/api/media/${m.assetId}/${m.digest}`),
    publisher: { "@id": `${origin}/#organization` },
    mainEntity: {
      "@type": "Offer",
      url,
      availability,
      ...(knownPrice
        ? priceProperties(
            knownPrice.amountMinor / 10 ** currencyMinorDigits[knownPrice.currency],
            knownPrice.currency,
            knownPrice.period,
          )
        : {}),
      businessFunction:
        listing.purpose === "sale"
          ? "http://purl.org/goodrelations/v1#Sell"
          : "http://purl.org/goodrelations/v1#LeaseOut",
      itemOffered: property,
    },
  };
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string" && !!value.trim();
const sourceProperty = (name: string, value: string | number) => ({
  "@type": "PropertyValue",
  name,
  value,
});

function priceProperties(amount: number, currency: string | null, period: string | null) {
  const price = { price: amount, ...(currency ? { priceCurrency: currency } : {}) };
  return {
    ...price,
    ...(period === "month"
      ? {
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            ...price,
            referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitText: "month" },
          },
        }
      : {}),
  };
}

function areaProperty(value: unknown, amountKey: "value" | "value_sqm"): Record<string, unknown>[] {
  const area = record(value);
  if (
    !area ||
    !text(area.basis) ||
    !areaBases.includes(area.basis as (typeof areaBases)[number]) ||
    typeof area[amountKey] !== "number" ||
    !Number.isFinite(area[amountKey]) ||
    area[amountKey] <= 0 ||
    !["m2", "sqm"].includes(String(area.unit))
  )
    return [];
  return [{ ...sourceProperty(area.basis, area[amountKey]), unitCode: "MTK" }];
}

function legacyAddress(value: unknown) {
  const location = record(value);
  if (!location) return null;
  const country = record(location.country)?.code;
  const region = record(location.region)?.name;
  // A default area mapping is not evidence for a particular settlement.
  const settlement =
    location.review_status === "legacy_area_only" ? null : record(location.settlement)?.name;
  const fields = {
    ...(text(country) ? { addressCountry: country } : {}),
    ...(text(region) ? { addressRegion: region } : {}),
    ...(text(settlement) ? { addressLocality: settlement } : {}),
  };
  return Object.keys(fields).length ? { "@type": "PostalAddress", ...fields } : null;
}

/** Source facts only: capture/freeze metadata never becomes sale status or publication time. */
export function legacyListingStructuredData(page: LegacyPage, url: string) {
  const listing = page.listing;
  if (!listing) return null;
  const origin = new URL(url).origin;
  const additionalProperty: Record<string, unknown>[] = [];
  if (listing.rooms.recorded && isCount(listing.rooms.count))
    additionalProperty.push(sourceProperty("rooms", listing.rooms.count));
  const bedrooms = record(listing.bedrooms);
  if (
    bedrooms?.recorded === true &&
    isCount(bedrooms.count) &&
    !bedrooms.zero_value_placeholder &&
    !bedrooms.not_applicable &&
    bedrooms.property_verification_state !== "not_applicable" &&
    bedrooms.property_verification_state !== "conflicting" &&
    (!isCount(bedrooms.property_record_count) ||
      bedrooms.property_record_count === bedrooms.count) &&
    (bedrooms.count !== 0 || bedrooms.property_record_count === 0)
  )
    additionalProperty.push(sourceProperty("bedrooms", bedrooms.count));
  const areas = record(listing.areas);
  for (const key of ["recorded_on_listing", "recorded_on_property"])
    if (Array.isArray(areas?.[key]))
      for (const value of areas[key]) additionalProperty.push(...areaProperty(value, "value_sqm"));
  // Literal source labels carry their own meaning; do not translate rooms into bedrooms,
  // guess an area basis or parse a price/period from unqualified live display text.
  for (const field of listing.liveSourceFields ?? [])
    if (text(field.label) && text(field.value))
      additionalProperty.push(sourceProperty(field.label, field.value));
  const address = legacyAddress(listing.location);
  const property = {
    "@type": "Place",
    identifier: listing.reference,
    name: page.title,
    ...(address ? { address } : {}),
    ...(additionalProperty.length ? { additionalProperty } : {}),
  };
  const price = listing.price;
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": `${url}#listing`,
    url,
    name: page.title,
    ...(page.description !== null ? { description: page.description } : {}),
    text: page.bodyText,
    inLanguage: page.locale,
    isBasedOn: page.sourceUrl,
    image: page.media.map((media) => media.url),
    publisher: { "@id": `${origin}/#organization` },
    mainEntity: {
      "@type": "Offer",
      url,
      ...(listing.sold === true && listing.statusParityVerified
        ? { availability: "https://schema.org/SoldOut" }
        : {}),
      ...(!price.on_request &&
      typeof price.amount === "number" &&
      Number.isFinite(price.amount) &&
      price.amount >= 0
        ? priceProperties(price.amount, price.currency, price.period)
        : {}),
      itemOffered: property,
    },
  };
}
