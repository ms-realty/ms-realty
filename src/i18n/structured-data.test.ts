import { describe, expect, it } from "vitest";
import { absent, known, money } from "@/domain/facts";
import { type LegacyPage, legacySnapshotPages } from "@/server/legacy/pages";
import type { PublicListingDetail } from "@/server/listings/view-models";
import {
  legacyListingStructuredData,
  listingStructuredData,
  organizationStructuredData,
  serializeStructuredData,
} from "./structured-data";

const provenance = { sourceClass: "source_supplied" } as const;
const url = "https://example.test/bg/properties/MS-unit/ms-unit";
const modern = (): PublicListingDetail => ({
  reference: "MS-unit",
  slug: "ms-unit",
  manifestId: "synthetic-manifest",
  locale: "bg",
  purpose: "sale",
  propertyType: "apartment",
  title: "Exact source title",
  price: known(money(12345678, "BGN", "total"), provenance),
  place: {
    country: "BG",
    district: null,
    municipality: null,
    settlement: null,
    neighborhood: null,
    precision: "region",
  },
  bedrooms: known(2, provenance),
  area: known({ value: 87.5, basis: "built", unit: "m2" }, provenance),
  availability: {
    presented: "confirmation_required",
    freshness: "unknown",
    confirmedAt: null,
    primaryAction: "ask_question",
  },
  cover: null,
  description: "Exact source description",
  facts: [
    {
      key: "rooms",
      group: "space",
      fact: known(3, provenance),
      verification: "owner_supplied",
      reviewed: true,
    },
  ],
  media: [
    {
      relationId: "synthetic-relation",
      assetId: "synthetic-photo",
      digest: "a".repeat(64),
      kind: "photo",
      contentType: "image/jpeg",
      width: null,
      height: null,
      alt: null,
      caption: null,
      modificationDisclosure: null,
      position: 0,
    },
  ],
  toConfirm: [],
  responsibleTeam: { label: "MS Realty" },
  indexable: false,
  publishedAt: "2026-10-01T00:00:00.000Z",
});
const legacy = (): LegacyPage => ({
  id: "a".repeat(24),
  canonicalPath: `/bg/legacy/${"a".repeat(24)}`,
  locale: "bg",
  title: "Source listing title",
  description: null,
  bodyText: "Exact public source body",
  sourceUrl: "https://makler-realty.com/legacy-unit/",
  sourceHost: "makler-realty.com",
  sourcePath: "/legacy-unit/",
  sourceType: "listing",
  sourceHash: "synthetic-hash",
  capturedAt: "2026-10-01T00:00:00.000Z",
  contentScope: "main-content",
  provenance: { kind: "archived", artifact: "synthetic-source" },
  equivalenceReview: { status: "pending", reviewer: null, reviewedAt: null },
  media: [
    {
      id: "synthetic-photo",
      url: "https://makler-realty.com/wp-content/uploads/unit.jpg",
      alt: "Source photo",
      r2Key: null,
      storedImageLoadVerified: false,
    },
  ],
  listing: {
    reference: "MS-legacy-unit",
    sourceLocale: "bg",
    sourceTitle: "Source listing title",
    lifecycleAtFreeze: { state: "archived", active_search_eligible: false },
    sold: null,
    price: { amount: 14000.25, currency: "EUR", period: null, on_request: false },
    areas: {
      recorded_on_listing: [],
      recorded_on_property: [],
      extraction: {
        proposal: { value_sqm: 762, basis: "land" },
        human_decision: {
          action: "assign",
          values: [{ basis: "land", value_sqm: 762, unit: "sqm" }],
        },
        applied_to_listing_record: false,
      },
    },
    rooms: { count: null, recorded: false },
    bedrooms: {
      count: 0,
      recorded: false,
      zero_value_placeholder: true,
      property_record_count: null,
      property_verification_state: "unknown",
    },
    location: {
      country: { code: "BG" },
      region: { name: "Blagoevgrad" },
      settlement: { name: "Hotovo" },
      review_status: "confirmed_settlement",
      coordinates: { value: [41, 23] },
      street_address: "private-street-unit",
    },
    sourceStatedFacts: [],
    statusParityVerified: false,
  },
});
const emitted = (value: unknown) => JSON.parse(serializeStructuredData(value));

it("escapes script termination, HTML comments and JS line separators without changing facts", () => {
  const source = {
    name: '</script><script>alert("unit")</script><!--',
    text: "BG \u2028 RU \u2029 Hebrew עברית",
    value: 0,
  };
  const encoded = serializeStructuredData(source);
  expect(encoded).not.toContain("<");
  expect(encoded).not.toContain("\u2028");
  expect(encoded).not.toContain("\u2029");
  expect(JSON.parse(encoded)).toEqual(source);
});

it("publishes only the organization brand contact and authentic logo location", () => {
  expect(organizationStructuredData(new URL("https://example.test"))).toEqual({
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness", "RealEstateAgent"],
    "@id": "https://example.test/#organization",
    name: "MS Realty",
    url: "https://example.test/",
    logo: "https://example.test/brand/logo-ms-realty.png",
    telephone: "+359879696870",
    email: "ms.realty.bg@gmail.com",
  });
});

describe("authorized public listing facts", () => {
  it("retains source currency, exact known counts, area basis and approved photo route", () => {
    const data = emitted(listingStructuredData(modern(), url));
    expect(data.mainEntity).toMatchObject({
      price: 123456.78,
      priceCurrency: "BGN",
      itemOffered: {
        identifier: "MS-unit",
        numberOfBedrooms: 2,
        numberOfRooms: 3,
        additionalProperty: [
          { "@type": "PropertyValue", name: "built", value: 87.5, unitCode: "MTK" },
        ],
      },
    });
    expect(data.mainEntity.itemOffered.floorSize).toBeUndefined();
    expect(data.mainEntity.availability).toBeUndefined();
    expect(data.image).toEqual([
      `https://example.test/api/media/synthetic-photo/${"a".repeat(64)}`,
    ]);
    expect(data.publisher).toEqual({ "@id": "https://example.test/#organization" });
  });

  it("represents monthly pricing without converting currency or inventing a lease duration", () => {
    const listing = {
      ...modern(),
      purpose: "long_term_rent" as const,
      price: known(money(33000, "EUR", "month"), provenance),
    };
    expect(emitted(listingStructuredData(listing, url)).mainEntity).toMatchObject({
      price: 330,
      priceCurrency: "EUR",
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: 330,
        priceCurrency: "EUR",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitText: "month" },
      },
    });
  });

  it.each(["unknown", "not_supplied", "not_applicable", "withheld"] as const)(
    "omits %s price/bedrooms/area/rooms rather than fabricating zero",
    (state) => {
      const listing = {
        ...modern(),
        price: absent(state),
        bedrooms: absent(state),
        area: absent(state),
        facts: [
          {
            key: "rooms",
            group: "space" as const,
            fact: absent(state),
            verification: "imported" as const,
            reviewed: false,
          },
        ],
      };
      const data = emitted(listingStructuredData(listing, url));
      expect(data.mainEntity.price).toBeUndefined();
      expect(data.mainEntity.priceCurrency).toBeUndefined();
      expect(data.mainEntity.itemOffered.numberOfBedrooms).toBeUndefined();
      expect(data.mainEntity.itemOffered.numberOfRooms).toBeUndefined();
      expect(data.mainEntity.itemOffered.additionalProperty).toBeUndefined();
    },
  );

  it("omits conflicting candidates and provenance/private data while keeping known zero", () => {
    const listing = modern();
    const data = emitted(
      listingStructuredData(
        {
          ...listing,
          price: {
            state: "conflicting",
            candidates: [
              listing.price.state === "known" ? listing.price.value : money(0, "EUR", "total"),
            ],
          },
          bedrooms: known(0, { ...provenance, reviewedBy: "private-staff-unit" }),
          area: { state: "conflicting", candidates: [{ value: 1, unit: "m2", basis: "built" }] },
          facts: [],
        },
        url,
      ),
    );
    expect(data.mainEntity.price).toBeUndefined();
    expect(data.mainEntity.itemOffered.numberOfBedrooms).toBe(0);
    expect(JSON.stringify(data)).not.toContain("private-staff-unit");
    const zero = emitted(
      listingStructuredData(
        { ...modern(), price: known(money(0, "EUR", "total"), provenance) },
        url,
      ),
    );
    expect(zero.mainEntity.price).toBe(0);
  });
});

describe("source-preserved legacy listing facts", () => {
  it("preserves the actual archived/live source snapshots without numeric proposal or status promotion", () => {
    const pages = legacySnapshotPages().filter((page) => page.listing);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const listing = page.listing;
      if (!listing) throw new Error("source listing missing");
      const data = emitted(
        legacyListingStructuredData(page, `https://example.test${page.canonicalPath}`),
      );
      expect(data.text).toBe(page.bodyText);
      expect(data.inLanguage).toBe(page.locale);
      expect(data.image).toEqual(page.media.map((media) => media.url));
      expect(data.mainEntity.itemOffered.identifier).toBe(listing.reference);
      expect(data.datePosted).toBeUndefined();
      if (listing.sold === null || !listing.statusParityVerified)
        expect(data.mainEntity.availability).toBeUndefined();
      if (listing.price.on_request || listing.price.amount === null)
        expect(data.mainEntity.price).toBeUndefined();
      else {
        expect(data.mainEntity.price).toBe(listing.price.amount);
        if (listing.price.currency)
          expect(data.mainEntity.priceCurrency).toBe(listing.price.currency);
      }
      if (listing.price.period === null) expect(data.mainEntity.priceSpecification).toBeUndefined();
      const properties: { name: string; value: unknown }[] =
        data.mainEntity.itemOffered.additionalProperty ?? [];
      for (const field of listing.liveSourceFields ?? [])
        expect(properties).toContainEqual({
          "@type": "PropertyValue",
          name: field.label,
          value: field.value,
        });
      if (!listing.rooms.recorded)
        expect(properties.some((fact) => fact.name === "rooms")).toBe(false);
      // Current normalized snapshots carry no applied areas; literal live labels remain text.
      const areas = listing.areas as {
        recorded_on_listing?: unknown[];
        recorded_on_property?: unknown[];
      } | null;
      if (!areas?.recorded_on_listing?.length && !areas?.recorded_on_property?.length)
        expect(
          properties.some((fact) =>
            ["living", "usable", "built", "gross_floor", "total", "land"].includes(fact.name),
          ),
        ).toBe(false);
    }
  });

  it("keeps source body, price, coarse location and media without treating archive or capture time as sold/publication", () => {
    const page = legacy();
    const data = emitted(legacyListingStructuredData(page, url));
    expect(data).toMatchObject({
      "@type": "RealEstateListing",
      url,
      name: page.title,
      text: page.bodyText,
      inLanguage: "bg",
      isBasedOn: page.sourceUrl,
      image: [page.media[0]?.url],
    });
    expect(data.datePosted).toBeUndefined();
    expect(data.mainEntity).toMatchObject({
      "@type": "Offer",
      price: 14000.25,
      priceCurrency: "EUR",
      itemOffered: {
        "@type": "Place",
        identifier: "MS-legacy-unit",
        address: {
          "@type": "PostalAddress",
          addressCountry: "BG",
          addressRegion: "Blagoevgrad",
          addressLocality: "Hotovo",
        },
      },
    });
    expect(data.mainEntity.availability).toBeUndefined();
    expect(data.mainEntity.businessFunction).toBeUndefined();
    expect(data.mainEntity.priceSpecification).toBeUndefined();
    expect(data.mainEntity.itemOffered.additionalProperty).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("private-street-unit");
    expect(JSON.stringify(data)).not.toContain("coordinates");
  });

  it("emits sold only after an explicit verified source status, never from freeze state", () => {
    const page = legacy();
    if (!page.listing) throw new Error("fixture");
    for (const sold of [null, false, true]) {
      const data = emitted(
        legacyListingStructuredData({ ...page, listing: { ...page.listing, sold } }, url),
      );
      expect(data.mainEntity.availability).toBeUndefined();
    }
    expect(
      emitted(
        legacyListingStructuredData(
          { ...page, listing: { ...page.listing, sold: true, statusParityVerified: true } },
          url,
        ),
      ).mainEntity.availability,
    ).toBe("https://schema.org/SoldOut");
  });

  it("keeps literal live labels without inferring monthly price, floor area or bedrooms", () => {
    const page = legacy();
    if (!page.listing) throw new Error("fixture");
    const listing = {
      ...page.listing,
      price: { amount: null, currency: null, period: null, on_request: false },
      liveSourceFields: [
        { label: "Rooms (include living room):", value: "3" },
        { label: "Price:", value: "330 EUR" },
        { label: "Area:", value: "76 sq m" },
      ],
    };
    const data = emitted(legacyListingStructuredData({ ...page, listing }, url));
    expect(data.mainEntity.price).toBeUndefined();
    expect(data.mainEntity.itemOffered.numberOfBedrooms).toBeUndefined();
    expect(data.mainEntity.itemOffered.floorSize).toBeUndefined();
    expect(data.mainEntity.itemOffered.additionalProperty).toEqual(
      listing.liveSourceFields.map(({ label, value }) => ({
        "@type": "PropertyValue",
        name: label,
        value,
      })),
    );
  });

  it("uses applied recorded areas and unambiguous counts; proposals and conflicting bedroom records stay out", () => {
    const page = legacy();
    if (!page.listing) throw new Error("fixture");
    const listing = {
      ...page.listing,
      rooms: { count: 3, recorded: true },
      bedrooms: {
        count: 2,
        recorded: true,
        property_record_count: 2,
        zero_value_placeholder: false,
        not_applicable: false,
      },
      areas: {
        recorded_on_listing: [{ value_sqm: 87.5, basis: "built", unit: "sqm" }],
        recorded_on_property: [{ value_sqm: 65, basis: "living", unit: "sqm" }],
      },
    };
    const data = emitted(legacyListingStructuredData({ ...page, listing }, url));
    expect(data.mainEntity.itemOffered.additionalProperty).toEqual([
      { "@type": "PropertyValue", name: "rooms", value: 3 },
      { "@type": "PropertyValue", name: "bedrooms", value: 2 },
      { "@type": "PropertyValue", name: "built", value: 87.5, unitCode: "MTK" },
      { "@type": "PropertyValue", name: "living", value: 65, unitCode: "MTK" },
    ]);
    const conflicting = emitted(
      legacyListingStructuredData(
        {
          ...page,
          listing: { ...listing, bedrooms: { ...listing.bedrooms, property_record_count: 1 } },
        },
        url,
      ),
    );
    expect(
      conflicting.mainEntity.itemOffered.additionalProperty.some(
        (fact: { name: string }) => fact.name === "bedrooms",
      ),
    ).toBe(false);
  });

  it("omits price-on-request and numeric unknowns, and returns null for non-listing pages", () => {
    const page = legacy();
    if (!page.listing) throw new Error("fixture");
    const data = emitted(
      legacyListingStructuredData(
        {
          ...page,
          listing: {
            ...page.listing,
            price: { ...page.listing.price, on_request: true },
            location: null,
          },
        },
        url,
      ),
    );
    expect(data.mainEntity.price).toBeUndefined();
    expect(data.mainEntity.priceCurrency).toBeUndefined();
    expect(data.mainEntity.itemOffered.address).toBeUndefined();
    expect(legacyListingStructuredData({ ...page, listing: null }, url)).toBeNull();
  });
});
